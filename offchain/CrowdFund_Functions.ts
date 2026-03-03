/**
 * CrowdFund_Functions.ts
 *
 * Offchain functions cho CrowdFund dApp trên Cardano Preview Testnet.
 * Sử dụng MeshJS (@meshsdk/transaction, @meshsdk/wallet, @meshsdk/core-cst).
 *
 * 4 hàm chính:
 *  - createCampaign: Lock ADA vào script address với datum ban đầu
 *  - donate:         Spend + re-lock UTxO với datum cập nhật
 *  - withdraw:       Beneficiary rút toàn bộ sau deadline (goal đạt)
 *  - reclaim:        Contributor lấy lại tiền sau deadline (goal không đạt)
 */

import { MeshTxBuilder } from "@meshsdk/transaction";
import { BlockfrostProvider } from "@meshsdk/core";
import { MeshCardanoHeadlessWallet } from "@meshsdk/wallet";
import { resolvePaymentKeyHash } from "@meshsdk/core-cst";
import { resolveSlotNo } from "@meshsdk/common";
import type { UTxO } from "@meshsdk/common";

import {
  SCRIPT_CBOR,
  SCRIPT_ADDRESS,
  posixMsToSlot,
  encodeDatum,
  encodeRedeemer,
  parseCampaignDatum,
  type CampaignDatum,
  type Contribution,
} from "./contract.js";

// ============================================================
// HELPERS
// ============================================================

/** Tính tổng Lovelace hiện tại của một UTxO */
function getLovelace(utxo: UTxO): bigint {
  const entry = utxo.output.amount.find((a) => a.unit === "lovelace");
  return BigInt(entry?.quantity ?? "0");
}

/** Lấy current slot - 200 (buffer để tránh OutsideValidityIntervalUTxO) */
function nowSlotWithBuffer(): number {
  return Number(resolveSlotNo("preview", Date.now())) - 200;
}

/**
 * Tạo MeshTxBuilder kết nối với Blockfrost Provider.
 * evaluator = provider để Mesh tự tính execution units.
 */
function newTxBuilder(provider: BlockfrostProvider): MeshTxBuilder {
  return new MeshTxBuilder({
    fetcher: provider,
    submitter: provider,
    evaluator: provider,
  });
}

// ============================================================
// 1. CREATE CAMPAIGN
// ============================================================

/**
 * Tạo một chiến dịch crowdfunding mới bằng cách lock ADA vào script address.
 * KHÔNG gọi validator (đây là tx thường, không spend script).
 *
 * @param wallet         Ví của người tạo chiến dịch (Alice)
 * @param provider       BlockfrostProvider
 * @param beneficiaryBech32  Bech32 address của beneficiary (Charlie)
 * @param goalLovelace   Mục tiêu (Lovelace)
 * @param deadlinePosixMs  Deadline (POSIX ms)
 * @param initialLovelace  Số ADA donate ban đầu (tối thiểu 2 ADA = 2_000_000)
 * @returns txHash
 */
export async function createCampaign(
  wallet: MeshCardanoHeadlessWallet,
  provider: BlockfrostProvider,
  beneficiaryBech32: string,
  goalLovelace: bigint,
  deadlinePosixMs: number,
  initialLovelace: bigint
): Promise<string> {
  const changeAddress = await wallet.getChangeAddressBech32();
  const utxos = await wallet.getUtxosMesh();
  const creatorPkh = resolvePaymentKeyHash(changeAddress);
  const beneficiaryPkh = resolvePaymentKeyHash(beneficiaryBech32);

  const datum: CampaignDatum = {
    beneficiary: beneficiaryPkh,
    goal: goalLovelace,
    deadline: deadlinePosixMs,
    contributions: [{ pkh: creatorPkh, amount: initialLovelace }],
  };

  const txBuilder = newTxBuilder(provider);
  const unsignedTx = await txBuilder
    .txOut(SCRIPT_ADDRESS, [{ unit: "lovelace", quantity: initialLovelace.toString() }])
    .txOutInlineDatumValue(encodeDatum(datum), "JSON")
    .changeAddress(changeAddress)
    .selectUtxosFrom(utxos)
    .complete();

  const signedTx = await wallet.signTxReturnFullTx(unsignedTx);
  return wallet.submitTx(signedTx);
}

// ============================================================
// 2. DONATE
// ============================================================

/**
 * Donate thêm vào một campaign đang diễn ra.
 * Spend UTxO cũ + re-lock với datum cập nhật và giá trị tăng.
 *
 * @param wallet         Ví của người donate (Bob)
 * @param provider       BlockfrostProvider
 * @param campaignUtxo   UTxO của campaign tại script address
 * @param donorBech32    Bech32 address của donor (để lấy PKH)
 * @param donationLovelace  Số ADA muốn donate
 * @returns txHash
 */
export async function donate(
  wallet: MeshCardanoHeadlessWallet,
  provider: BlockfrostProvider,
  campaignUtxo: UTxO,
  donorBech32: string,
  donationLovelace: bigint
): Promise<string> {
  const changeAddress = await wallet.getChangeAddressBech32();
  const utxos = await wallet.getUtxosMesh();
  const [collateral] = await wallet.getCollateralMesh();
  if (!collateral) throw new Error("No collateral UTxO available");

  // Decode datum hiện tại
  const currentDatum = parseCampaignDatum(campaignUtxo.output.plutusData!);
  const donorPkh = resolvePaymentKeyHash(donorBech32);
  const oldLovelace = getLovelace(campaignUtxo);
  const newLovelace = oldLovelace + donationLovelace;

  // Cập nhật contributions: thêm hoặc tăng donation của donor
  const existingIndex = currentDatum.contributions.findIndex((c) => c.pkh === donorPkh);
  let newContributions: Contribution[];
  if (existingIndex >= 0) {
    newContributions = currentDatum.contributions.map((c, i) =>
      i === existingIndex ? { ...c, amount: c.amount + donationLovelace } : c
    );
  } else {
    newContributions = [
      ...currentDatum.contributions,
      { pkh: donorPkh, amount: donationLovelace },
    ];
  }

  const newDatum: CampaignDatum = {
    ...currentDatum,
    contributions: newContributions,
  };

  const txBuilder = newTxBuilder(provider);
  const unsignedTx = await txBuilder
    // Script input: phải gọi spendingPlutusScriptV3 TRƯỚC txIn
    .spendingPlutusScriptV3()
    .txIn(
      campaignUtxo.input.txHash,
      campaignUtxo.input.outputIndex,
      campaignUtxo.output.amount,
      campaignUtxo.output.address
    )
    .txInInlineDatumPresent()
    .txInRedeemerValue(encodeRedeemer("Donate"), "JSON")
    .txInScript(SCRIPT_CBOR)
    // Re-lock output với datum mới
    .txOut(SCRIPT_ADDRESS, [{ unit: "lovelace", quantity: newLovelace.toString() }])
    .txOutInlineDatumValue(encodeDatum(newDatum), "JSON")
    // Standard tx settings
    .invalidBefore(nowSlotWithBuffer())
    .changeAddress(changeAddress)
    .txInCollateral(
      collateral.input.txHash,
      collateral.input.outputIndex,
      collateral.output.amount,
      collateral.output.address
    )
    .selectUtxosFrom(utxos)
    .complete();

  const signedTx = await wallet.signTxReturnFullTx(unsignedTx);
  return wallet.submitTx(signedTx);
}

// ============================================================
// 3. WITHDRAW
// ============================================================

/**
 * Beneficiary rút toàn bộ tiền từ campaign sau deadline nếu goal đạt.
 *
 * @param wallet         Ví của beneficiary (Charlie)
 * @param provider       BlockfrostProvider
 * @param campaignUtxo   UTxO của campaign tại script address
 * @returns txHash
 */
export async function withdraw(
  wallet: MeshCardanoHeadlessWallet,
  provider: BlockfrostProvider,
  campaignUtxo: UTxO
): Promise<string> {
  const changeAddress = await wallet.getChangeAddressBech32();
  const utxos = await wallet.getUtxosMesh();
  const [collateral] = await wallet.getCollateralMesh();
  if (!collateral) throw new Error("No collateral UTxO available");

  const datum = parseCampaignDatum(campaignUtxo.output.plutusData!);

  // Kiểm tra off-chain: chỉ cần goal đạt, không cần deadline
  const totalContributions = datum.contributions.reduce((s, c) => s + c.amount, 0n);
  if (totalContributions < datum.goal) {
    throw new Error(`Goal chưa đạt: ${totalContributions} / ${datum.goal} Lovelace`);
  }

  const txBuilder = newTxBuilder(provider);
  const unsignedTx = await txBuilder
    .spendingPlutusScriptV3()
    .txIn(
      campaignUtxo.input.txHash,
      campaignUtxo.input.outputIndex,
      campaignUtxo.output.amount,
      campaignUtxo.output.address
    )
    .txInInlineDatumPresent()
    .txInRedeemerValue(encodeRedeemer("Withdraw"), "JSON")
    .txInScript(SCRIPT_CBOR)
    // Beneficiary phải ký
    .requiredSignerHash(datum.beneficiary)
    .invalidBefore(nowSlotWithBuffer())
    .changeAddress(changeAddress)
    .txInCollateral(
      collateral.input.txHash,
      collateral.input.outputIndex,
      collateral.output.amount,
      collateral.output.address
    )
    .selectUtxosFrom(utxos)
    .complete();

  const signedTx = await wallet.signTxReturnFullTx(unsignedTx);
  return wallet.submitTx(signedTx);
}

// ============================================================
// 4. RECLAIM
// ============================================================

/**
 * Contributor lấy lại đúng số tiền đã đóng góp sau deadline nếu goal không đạt.
 * Hỗ trợ partial reclaim (nếu còn contributor khác → re-lock phần còn lại).
 *
 * @param wallet         Ví của contributor (Bob)
 * @param provider       BlockfrostProvider
 * @param campaignUtxo   UTxO của campaign tại script address
 * @returns txHash
 */
export async function reclaim(
  wallet: MeshCardanoHeadlessWallet,
  provider: BlockfrostProvider,
  campaignUtxo: UTxO
): Promise<string> {
  const changeAddress = await wallet.getChangeAddressBech32();
  const utxos = await wallet.getUtxosMesh();
  const [collateral] = await wallet.getCollateralMesh();
  if (!collateral) throw new Error("No collateral UTxO available");

  const datum = parseCampaignDatum(campaignUtxo.output.plutusData!);
  const reclaimerPkh = resolvePaymentKeyHash(changeAddress);

  // Kiểm tra off-chain
  const now = Date.now();
  if (now < datum.deadline) {
    throw new Error(`Campaign chưa kết thúc. Deadline: ${new Date(datum.deadline).toISOString()}`);
  }
  const totalContributions = datum.contributions.reduce((s, c) => s + c.amount, 0n);
  if (totalContributions >= datum.goal) {
    throw new Error("Goal đã đạt, không thể reclaim. Hãy chờ beneficiary withdraw.");
  }
  const myContribution = datum.contributions.find((c) => c.pkh === reclaimerPkh);
  if (!myContribution) {
    throw new Error("Ví này không có contribution trong campaign này.");
  }

  const oldLovelace = getLovelace(campaignUtxo);
  const reclaimAmount = myContribution.amount;
  const remainingLovelace = oldLovelace - reclaimAmount;

  // Datum mới: xóa reclaimer
  const remainingContributions = datum.contributions.filter(
    (c) => c.pkh !== reclaimerPkh
  );
  const newDatum: CampaignDatum = {
    ...datum,
    contributions: remainingContributions,
  };

  const deadlineSlot = posixMsToSlot(datum.deadline);

  const txBuilder = newTxBuilder(provider);
  txBuilder
    .spendingPlutusScriptV3()
    .txIn(
      campaignUtxo.input.txHash,
      campaignUtxo.input.outputIndex,
      campaignUtxo.output.amount,
      campaignUtxo.output.address
    )
    .txInInlineDatumPresent()
    .txInRedeemerValue(encodeRedeemer("Reclaim"), "JSON")
    .txInScript(SCRIPT_CBOR)
    // Reclaimer phải ký
    .requiredSignerHash(reclaimerPkh)
    // Validity: bắt đầu từ sau deadline
    .invalidBefore(deadlineSlot + 1);

  // Nếu còn contributor khác → re-lock phần còn lại
  if (remainingContributions.length > 0 && remainingLovelace > 0n) {
    txBuilder
      .txOut(SCRIPT_ADDRESS, [{ unit: "lovelace", quantity: remainingLovelace.toString() }])
      .txOutInlineDatumValue(encodeDatum(newDatum), "JSON");
  }

  const unsignedTx = await txBuilder
    .changeAddress(changeAddress)
    .txInCollateral(
      collateral.input.txHash,
      collateral.input.outputIndex,
      collateral.output.amount,
      collateral.output.address
    )
    .selectUtxosFrom(utxos)
    .complete();

  const signedTx = await wallet.signTxReturnFullTx(unsignedTx);
  return wallet.submitTx(signedTx);
}

// ============================================================
// UTILITY: Load headless wallets từ .env mnemonics
// ============================================================

/**
 * Tạo headless wallet từ mnemonic string (space-separated words).
 */
export async function loadWallet(
  mnemonic: string,
  provider: BlockfrostProvider
): Promise<MeshCardanoHeadlessWallet> {
  return MeshCardanoHeadlessWallet.fromMnemonic({
    mnemonic: mnemonic.trim().split(/\s+/),
    networkId: 0, // Preview testnet
    walletAddressType: "Base",
    fetcher: provider,
    submitter: provider,
  });
}
