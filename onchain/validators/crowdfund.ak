use aiken/collection/list
use aiken/collection/pairs
use aiken/crypto.{VerificationKeyHash}
use aiken/interval.{Finite}
use cardano/address.{VerificationKey}
use cardano/assets.{lovelace_of}
use cardano/transaction.{InlineDatum, Output, OutputReference, Transaction}

// ============================================================
// TYPES
// ============================================================

/// Contributions: danh sách (contributor_pkh, amount_lovelace)
/// Dùng Pairs thay vì Dict để tránh opaque-type restriction khi cast datum
pub type Contributions =
  Pairs<VerificationKeyHash, Int>

/// Datum lưu trạng thái một chiến dịch crowdfunding.
/// Tất cả campaigns dùng chung một script address — mỗi UTxO là một campaign.
pub type CampaignDatum {
  /// Người thụ hưởng sẽ nhận tiền nếu goal đạt
  beneficiary: VerificationKeyHash,
  /// Mục tiêu gây quỹ (Lovelace)
  goal: Int,
  /// Deadline POSIX milliseconds — sau thời điểm này campaign kết thúc
  deadline: Int,
  /// Danh sách (contributor_pkh, amount) đã được đóng góp
  contributions: Contributions,
}

/// Hành động có thể thực hiện với script
pub type CrowdFundRedeemer {
  /// Donate thêm; datum cập nhật tương ứng
  Donate
  /// Beneficiary rút toàn bộ sau deadline nếu goal đạt
  Withdraw
  /// Contributor lấy lại tiền sau deadline nếu goal không đạt
  Reclaim
}

// ============================================================
// VALIDATOR (không tham số)
// ============================================================

/// Crowdfunding validator — mọi campaign là một UTxO riêng biệt
/// tại cùng một script address. Frontend query UTxOs tại address để liệt kê.
validator p2p_clowdfund {
  spend(
    datum: Option<CampaignDatum>,
    redeemer: CrowdFundRedeemer,
    output_reference: OutputReference,
    tx: Transaction,
  ) {
    expect Some(campaign) = datum
    when redeemer is {
      Donate -> validate_donate(campaign, output_reference, tx)
      Withdraw -> validate_withdraw(campaign, tx)
      Reclaim -> validate_reclaim(campaign, output_reference, tx)
    }
  }

  else(_) {
    fail
  }
}

// ============================================================
// VALIDATION FUNCTIONS
// ============================================================

/// DONATE: Bất kỳ ai cũng có thể donate.
/// - Lovelace tăng đúng bằng tổng contributions mới trong datum
/// - beneficiary, goal, deadline không thay đổi
/// - Không contributor nào bị giảm contribution
fn validate_donate(
  campaign: CampaignDatum,
  output_reference: OutputReference,
  tx: Transaction,
) -> Bool {
  expect Some(self_input) =
    list.find(tx.inputs, fn(i) { i.output_reference == output_reference })
  let script_address = self_input.output.address
  let old_lovelace = lovelace_of(self_input.output.value)

  expect Some(out) =
    list.find(tx.outputs, fn(o) { o.address == script_address })

  expect InlineDatum(raw) = out.datum
  expect new_campaign: CampaignDatum = raw

  let new_lovelace = lovelace_of(out.value)
  let lovelace_delta = new_lovelace - old_lovelace
  let old_total = total_contributions(campaign.contributions)
  let new_total = total_contributions(new_campaign.contributions)

  and {
    lovelace_delta > 0,
    new_total - old_total == lovelace_delta,
    no_existing_decrease(campaign.contributions, new_campaign.contributions),
    new_campaign.beneficiary == campaign.beneficiary,
    new_campaign.goal == campaign.goal,
    new_campaign.deadline == campaign.deadline,
  }
}

/// WITHDRAW: Beneficiary rút toàn bộ khi goal đạt (không cần chờ deadline).
fn validate_withdraw(campaign: CampaignDatum, tx: Transaction) -> Bool {
  and {
    total_contributions(campaign.contributions) >= campaign.goal,
    list.has(tx.extra_signatories, campaign.beneficiary),
  }
}

/// RECLAIM: Contributors lấy lại tiền sau deadline nếu goal không đạt.
fn validate_reclaim(
  campaign: CampaignDatum,
  output_reference: OutputReference,
  tx: Transaction,
) -> Bool {
  expect Finite(lower_bound) = tx.validity_range.lower_bound.bound_type
  let total = total_contributions(campaign.contributions)

  // Tìm tất cả signatories có contribution hợp lệ
  let reclaimers =
    list.filter(
      tx.extra_signatories,
      fn(pkh) { pairs.has_key(campaign.contributions, pkh) },
    )

  // Tổng tiền hoàn trả
  let reclaim_total =
    list.foldl(
      reclaimers,
      0,
      fn(pkh, acc) {
        when pairs.get_first(campaign.contributions, pkh) is {
          Some(a) -> acc + a
          None -> acc
        }
      },
    )

  expect Some(self_input) =
    list.find(tx.inputs, fn(i) { i.output_reference == output_reference })
  let script_address = self_input.output.address
  let old_lovelace = lovelace_of(self_input.output.value)
  let remaining_lovelace = old_lovelace - reclaim_total
  let remaining_contrib_count =
    list.length(campaign.contributions) - list.length(reclaimers)

  let continuing_check =
    if remaining_contrib_count == 0 {
      // Không còn ai → không cần continuing output
      True
    } else {
      expect Some(cont_out) =
        list.find(tx.outputs, fn(o) { o.address == script_address })
      expect InlineDatum(raw) = cont_out.datum
      expect cont_campaign: CampaignDatum = raw

      and {
        // Số lượng contributors trong datum mới đúng
        list.length(cont_campaign.contributions) == remaining_contrib_count,
        // Reclaimers không còn trong datum mới
        list.all(
          reclaimers,
          fn(pkh) { !pairs.has_key(cont_campaign.contributions, pkh) },
        ),
        // Mọi entry trong datum mới phải đến từ datum cũ với cùng amount
        list.all(
          cont_campaign.contributions,
          fn(p) {
            when pairs.get_first(campaign.contributions, p.1st) is {
              Some(old_amt) -> p.2nd == old_amt
              None -> False
            }
          },
        ),
        // Campaign info không thay đổi
        cont_campaign.beneficiary == campaign.beneficiary,
        cont_campaign.goal == campaign.goal,
        cont_campaign.deadline == campaign.deadline,
        // Value đúng
        lovelace_of(cont_out.value) == remaining_lovelace,
      }
    }

  // Kiểm tra mỗi reclaimer nhận đúng số tiền
  let reclaimers_paid =
    list.all(
      reclaimers,
      fn(pkh) {
        let amount =
          when pairs.get_first(campaign.contributions, pkh) is {
            Some(a) -> a
            None -> 0
          }
        payment_to_pkh(tx.outputs, pkh, amount)
      },
    )

  and {
    lower_bound >= campaign.deadline,
    total < campaign.goal,
    list.length(reclaimers) > 0,
    reclaimers_paid,
    continuing_check,
  }
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

fn total_contributions(contributions: Contributions) -> Int {
  pairs.foldl(contributions, 0, fn(_k, v, acc) { acc + v })
}

/// Kiểm tra không có contributor nào trong `old` bị giảm amount trong `new`
fn no_existing_decrease(old: Contributions, new: Contributions) -> Bool {
  list.all(
    old,
    fn(p) {
      let old_amount = p.2nd
      let new_amount =
        when pairs.get_first(new, p.1st) is {
          Some(a) -> a
          None -> 0
        }
      new_amount >= old_amount
    },
  )
}

/// Kiểm tra có output nào gửi ít nhất `amount` Lovelace đến PKH `pkh` không
fn payment_to_pkh(
  outputs: List<Output>,
  pkh: VerificationKeyHash,
  amount: Int,
) -> Bool {
  list.any(
    outputs,
    fn(output) {
      when output.address.payment_credential is {
        VerificationKey(cred_pkh) ->
          and {
            cred_pkh == pkh,
            lovelace_of(output.value) >= amount,
          }
        _ -> False
      }
    },
  )
}
