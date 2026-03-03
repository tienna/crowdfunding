# Kiến trúc Smart Contract CrowdFund

## Tổng quan

Smart contract được viết bằng **Aiken v1.1.2** (ngôn ngữ lập trình chức năng cho Cardano), biên dịch ra **Plutus V3** (Conway era). Validator không có tham số — tất cả chiến dịch đều dùng chung một địa chỉ script, mỗi chiến dịch là một UTxO riêng biệt.

```
File: onchain/validators/crowdfund.ak

validator p2p_clowdfund {
  spend(datum, redeemer, output_reference, tx) {
    when redeemer is {
      Donate   -> validate_donate(...)
      Withdraw -> validate_withdraw(...)
      Reclaim  -> validate_reclaim(...)
    }
  }
}
```

---

## Thông tin biên dịch

| Thuộc tính | Giá trị |
|------------|---------|
| Ngôn ngữ | Aiken v1.1.2 |
| Standard Library | stdlib v2.1.0 |
| Plutus Version | V3 (Conway era) |
| Script Hash | `74c12c90a16a81859e0398f78c1b93ba6b565cf58964e0d16ff490b1` |
| Script Address (Preview) | `addr_test1wp6vztys594grpv7qwv00rqmjwaxk4ju7kykfcx3dl6fpvgg9cflw` |
| File nguồn | `onchain/validators/crowdfund.ak` |
| File biên dịch | `onchain/plutus.json` |

---

## Cấu trúc Datum — `CampaignDatum`

Mỗi UTxO campaign lưu datum inline với cấu trúc:

```aiken
pub type CampaignDatum {
  beneficiary: VerificationKeyHash,   -- PKH người nhận quỹ
  goal: Int,                          -- Mục tiêu (Lovelace)
  deadline: Int,                      -- Deadline (POSIX milliseconds)
  contributions: Contributions,       -- Danh sách đóng góp
}

pub type Contributions =
  Pairs<VerificationKeyHash, Int>     -- [(pkh_contributor, so_tien)]
```

**Lý do dùng `Pairs` thay vì `Dict`:**
- `Dict` trong Aiken là kiểu opaque — không thể cast từ `Data` sang `Dict` trong validator
- `Pairs<k, v>` là kiểu trong suốt, có thể pattern-match trực tiếp

**Mã hóa trên chain (Cardano JSON Schema):**
```json
{
  "constructor": 0,
  "fields": [
    { "bytes": "abcd1234..." },
    { "int": 10000000 },
    { "int": 1750000000000 },
    {
      "map": [
        { "k": { "bytes": "pkh1..." }, "v": { "int": 5000000 } },
        { "k": { "bytes": "pkh2..." }, "v": { "int": 3000000 } }
      ]
    }
  ]
}
```

---

## Redeemer

```aiken
pub type CrowdFundRedeemer {
  Donate    -- constructor index 0
  Withdraw  -- constructor index 1
  Reclaim   -- constructor index 2
}
```

---

## Ba hành động Validator

### 1. DONATE

**Ai có thể thực hiện:** Bất kỳ ai
**Điều kiện cần:**
- Chưa quá deadline (kiểm tra off-chain, validator không enforce)
- Lovelace tăng đúng bằng delta contributions trong datum mới
- Không contributor nào bị giảm contribution trong datum mới
- `beneficiary`, `goal`, `deadline` không thay đổi

```aiken
fn validate_donate(campaign, output_reference, tx) -> Bool {
  -- Tìm UTxO script input (self)
  -- Tìm output về cùng địa chỉ script
  -- Parse datum mới từ output

  and {
    lovelace_delta > 0,
    new_total - old_total == lovelace_delta,   -- Lovelace khớp với contributions
    no_existing_decrease(old_contribs, new_contribs),
    new_campaign.beneficiary == campaign.beneficiary,
    new_campaign.goal == campaign.goal,
    new_campaign.deadline == campaign.deadline,
  }
}
```

**Sơ đồ giao dịch Donate:**
```
INPUT                        OUTPUT
+------------------+         +------------------+
| Script UTxO      |   -->   | Script UTxO      |
| 5 ADA            |         | 8 ADA            |
| datum: {         |         | datum: {         |
|   contributions: |         |   contributions: |
|   [(pkh_A, 5)]  |         |   [(pkh_A, 5),   |
| }                |         |    (pkh_B, 3)]   |
+------------------+         | }                |
                             +------------------+
+ 3 ADA tu vi Bob  -->  du trong hoa don cua Bob
```

---

### 2. WITHDRAW

**Ai có thể thực hiện:** Beneficiary (người thụ hưởng)
**Điều kiện cần:**
- Tổng contributions >= goal
- Beneficiary ký giao dịch (`extra_signatories` có PKH của beneficiary)
- **Không cần deadline** — beneficiary có thể rút bất cứ lúc nào sau khi đạt mục tiêu

```aiken
fn validate_withdraw(campaign, tx) -> Bool {
  and {
    total_contributions(campaign.contributions) >= campaign.goal,
    list.has(tx.extra_signatories, campaign.beneficiary),
  }
}
```

**Sơ đồ giao dịch Withdraw:**
```
INPUT                        OUTPUT
+------------------+         +------------------+
| Script UTxO      |   -->   | Beneficiary Addr |
| 10 ADA           |         | ~9.8 ADA         |
| datum: {...}     |         | (sau khi tru phi)|
+------------------+         +------------------+
```

---

### 3. RECLAIM

**Ai có thể thực hiện:** Contributor (người đã đóng góp)
**Điều kiện cần:**
- Đã qua deadline (`lower_bound >= campaign.deadline`)
- Tổng contributions < goal (chưa đạt mục tiêu)
- Reclaimer đã ký và có contribution trong datum
- Mỗi reclaimer được nhận đúng số tiền đã đóng góp
- Nếu còn contributor khác: re-lock phần còn lại với datum cập nhật (đã xóa reclaimer)

```aiken
fn validate_reclaim(campaign, output_reference, tx) -> Bool {
  -- Kiểm tra deadline qua validity_range.lower_bound
  -- Tìm tất cả signatories có contribution
  -- Tính tổng hoàn trả
  -- Kiểm tra mỗi reclaimer nhận đúng số tiền
  -- Nếu còn contributor: re-lock phần còn lại với datum đúng

  and {
    lower_bound >= campaign.deadline,
    total < campaign.goal,
    list.length(reclaimers) > 0,
    reclaimers_paid,       -- Mỗi reclaimer nhận đúng
    continuing_check,      -- Re-lock phần còn lại (nếu có)
  }
}
```

**Sơ đồ giao dịch Reclaim (partial — còn contributor khác):**
```
INPUT                        OUTPUT
+------------------+         +------------------+
| Script UTxO      |   -->   | Script UTxO      |
| 8 ADA            |         | 5 ADA            |
| datum: {         |         | datum: {         |
|   [(pkh_A, 5),  |         |   [(pkh_A, 5)]  |
|    (pkh_B, 3)]  |         | }                |
| }                |         +------------------+
+------------------+         +------------------+
                             | Bob Addr         |
                             | 3 ADA            |
                             +------------------+
```

**Sơ đồ giao dịch Reclaim (full — người cuối cùng):**
```
INPUT                        OUTPUT
+------------------+         +------------------+
| Script UTxO      |   -->   | Alice Addr       |
| 5 ADA            |         | ~4.8 ADA         |
| datum: {         |         | (sau khi tru phi)|
|   [(pkh_A, 5)]  |         +------------------+
| }                |
+------------------+
```

---

## Các hàm trợ giúp

```aiken
-- Tong tat ca contributions
fn total_contributions(contributions: Contributions) -> Int {
  pairs.foldl(contributions, 0, fn(_k, v, acc) { acc + v })
}

-- Kiem tra khong ai bi giam contribution (dung trong Donate)
fn no_existing_decrease(old: Contributions, new: Contributions) -> Bool {
  list.all(old, fn(p) {
    let new_amount = when pairs.get_first(new, p.1st) is {
      Some(a) -> a
      None -> 0
    }
    new_amount >= p.2nd
  })
}

-- Kiem tra co output gui du tien den PKH khong (dung trong Reclaim)
fn payment_to_pkh(outputs, pkh, amount) -> Bool {
  list.any(outputs, fn(output) {
    when output.address.payment_credential is {
      VerificationKey(cred_pkh) ->
        cred_pkh == pkh && lovelace_of(output.value) >= amount
      _ -> False
    }
  })
}
```

---

## Ma trận điều kiện

| | Donate | Withdraw | Reclaim |
|-|--------|----------|---------|
| Ai thực hiện | Bất kỳ ai | Beneficiary | Contributor |
| Cần ký | Không bắt buộc | Beneficiary | Contributor |
| Cần deadline chưa qua | Kiểm tra off-chain | Không | Không (cần ĐÃ qua) |
| Cần deadline đã qua | Không | Không | **Bắt buộc** |
| Cần goal đạt | Không | **Bắt buộc** | Không (cần CHƯA đạt) |
| Re-lock output | Bắt buộc | Không | Nếu còn contributor |
| Datum cập nhật | Thêm/tăng contribution | Không có datum mới | Xóa reclaimer |

---

## Mô hình bảo mật

### Tài sản được bảo vệ bởi Validator

1. **Chỉ beneficiary mới rút được** — `extra_signatories` bắt buộc có `beneficiary PKH`
2. **Contributor chỉ lấy lại đúng số mình đã đóng** — kiểm tra qua `payment_to_pkh()`
3. **Datum không thể giả mạo** — `InlineDatum` được kiểm tra trong từng action
4. **Không thể rút trước khi đạt goal** — `total_contributions >= goal`
5. **Không thể reclaim trước deadline** — `lower_bound >= campaign.deadline` với slot number

### Giới hạn (Trade-offs)

- **Reclaim nhiều người cùng lúc**: Validator hỗ trợ nhiều reclaimer trong một giao dịch (dùng `list.filter` trên signatories)
- **Không giới hạn số contributor**: `Pairs` có thể dài tùy ý, nhưng transaction size có giới hạn (~16KB)
- **Không có phí nền tảng**: Toàn bộ tiền đến beneficiary hoặc trả lại contributor

---

## Cách cập nhật Contract

Nếu sửa `crowdfund.ak`:

```bash
cd onchain
aiken build          # Sinh plutus.json moi
aiken check          # Chay unit tests
```

Sau do lay `compiledCode` tu `plutus.json` va cap nhat:
- `offchain/contract.ts` → hang so `SCRIPT_CBOR_SINGLE`
- `frontend/app/lib/contract.ts` → hang so `SCRIPT_CBOR_SINGLE`

Va cap nhat `SCRIPT_HASH` + `SCRIPT_ADDRESS` tuong ung.

> **Luu y:** Moi lan sua contract tao ra script hash moi → dia chi moi → cac campaign cu tren chain cu se o tren dia chi cu.
