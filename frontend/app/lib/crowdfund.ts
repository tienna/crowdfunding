/**
 * crowdfund.ts — Frontend offchain functions (Browser Wallet)
 * All functions run client-side only.
 */

import type { UTxO } from "@meshsdk/common";
import { MeshTxBuilder } from "@meshsdk/transaction";
import { BlockfrostProvider } from "@meshsdk/core";
import type { BrowserWallet } from "@meshsdk/wallet";
import { applyParamsToScript, resolvePlutusScriptAddress, resolvePaymentKeyHash, parseDatumCbor } from "@meshsdk/core-cst";
import { resolveSlotNo } from "@meshsdk/common";

import {
  SCRIPT_CBOR_SINGLE,
  encodeDatum,
  encodeRedeemer,
  decodeDatum,
  posixMsToSlot,
  type CampaignDatum,
  type Contribution,
} from "./contract";

// ============================================================
// LAZY INIT (client-side only)
// ============================================================

let _scriptCbor: string | null = null;
let _scriptAddress: string | null = null;

function getScriptCbor(): string {
  if (!_scriptCbor) {
    _scriptCbor = applyParamsToScript(SCRIPT_CBOR_SINGLE, [], "JSON");
  }
  return _scriptCbor;
}

export function getScriptAddress(): string {
  if (!_scriptAddress) {
    _scriptAddress = resolvePlutusScriptAddress(
      { code: getScriptCbor(), version: "V3" },
      0 // Preview testnet
    );
  }
  return _scriptAddress;
}

// ============================================================
// BLOCKFROST PROVIDER
// ============================================================

let _provider: BlockfrostProvider | null = null;

export function getProvider(): BlockfrostProvider {
  if (!_provider) {
    const apiKey = process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY ?? "";
    _provider = new BlockfrostProvider(apiKey);
  }
  return _provider;
}

// ============================================================
// HELPERS
// ============================================================

function getLovelace(utxo: UTxO): bigint {
  const entry = utxo.output.amount.find((a) => a.unit === "lovelace");
  return BigInt(entry?.quantity ?? "0");
}

function nowSlotWithBuffer(): number {
  return Number(resolveSlotNo("preview", Date.now())) - 200;
}

function newTxBuilder(): MeshTxBuilder {
  const provider = getProvider();
  return new MeshTxBuilder({ fetcher: provider, submitter: provider, evaluator: provider });
}

export function parseCampaignDatum(cborHex: string): CampaignDatum {
  const raw = parseDatumCbor(cborHex);
  return decodeDatum(raw as any);
}

// ============================================================
// FETCH CAMPAIGNS
// ============================================================

export async function fetchCampaigns(): Promise<{ utxo: UTxO; datum: CampaignDatum }[]> {
  const provider = getProvider();
  const utxos = await provider.fetchAddressUTxOs(getScriptAddress());
  const results: { utxo: UTxO; datum: CampaignDatum }[] = [];
  for (const utxo of utxos) {
    if (!utxo.output.plutusData) continue;
    try {
      const datum = parseCampaignDatum(utxo.output.plutusData);
      results.push({ utxo, datum });
    } catch {
      // Skip UTxOs with invalid/missing datum
    }
  }
  return results;
}

// ============================================================
// 1. CREATE CAMPAIGN
// ============================================================

export async function createCampaign(
  wallet: BrowserWallet,
  beneficiaryBech32: string,
  goalLovelace: bigint,
  deadlinePosixMs: number,
  initialLovelace: bigint
): Promise<string> {
  const changeAddress = await wallet.getChangeAddress();
  const utxos = await wallet.getUtxos();
  const creatorPkh = resolvePaymentKeyHash(changeAddress);
  const beneficiaryPkh = resolvePaymentKeyHash(beneficiaryBech32);

  const datum: CampaignDatum = {
    beneficiary: beneficiaryPkh,
    goal: goalLovelace,
    deadline: deadlinePosixMs,
    contributions: [{ pkh: creatorPkh, amount: initialLovelace }],
  };

  const txBuilder = newTxBuilder();
  const unsignedTx = await txBuilder
    .txOut(getScriptAddress(), [{ unit: "lovelace", quantity: initialLovelace.toString() }])
    .txOutInlineDatumValue(encodeDatum(datum), "JSON")
    .changeAddress(changeAddress)
    .selectUtxosFrom(utxos)
    .complete();

  const signedTx = await wallet.signTx(unsignedTx);
  return wallet.submitTx(signedTx);
}

// ============================================================
// 2. DONATE
// ============================================================

export async function donate(
  wallet: BrowserWallet,
  campaignUtxo: UTxO,
  donationLovelace: bigint
): Promise<string> {
  const changeAddress = await wallet.getChangeAddress();
  const utxos = await wallet.getUtxos();
  const collateral = await wallet.getCollateral();
  const [collUTxO] = collateral;
  if (!collUTxO) throw new Error("No collateral UTxO. Fund wallet with >= 5 ADA.");

  const currentDatum = parseCampaignDatum(campaignUtxo.output.plutusData!);
  const donorPkh = resolvePaymentKeyHash(changeAddress);
  const oldLovelace = getLovelace(campaignUtxo);
  const newLovelace = oldLovelace + donationLovelace;

  const existingIndex = currentDatum.contributions.findIndex((c) => c.pkh === donorPkh);
  let newContributions: Contribution[];
  if (existingIndex >= 0) {
    newContributions = currentDatum.contributions.map((c, i) =>
      i === existingIndex ? { ...c, amount: c.amount + donationLovelace } : c
    );
  } else {
    newContributions = [...currentDatum.contributions, { pkh: donorPkh, amount: donationLovelace }];
  }

  const newDatum: CampaignDatum = { ...currentDatum, contributions: newContributions };
  const scriptCbor = getScriptCbor();

  const txBuilder = newTxBuilder();
  const unsignedTx = await txBuilder
    .spendingPlutusScriptV3()
    .txIn(campaignUtxo.input.txHash, campaignUtxo.input.outputIndex, campaignUtxo.output.amount, campaignUtxo.output.address)
    .txInInlineDatumPresent()
    .txInRedeemerValue(encodeRedeemer("Donate"), "JSON")
    .txInScript(scriptCbor)
    .txOut(getScriptAddress(), [{ unit: "lovelace", quantity: newLovelace.toString() }])
    .txOutInlineDatumValue(encodeDatum(newDatum), "JSON")
    .invalidBefore(nowSlotWithBuffer())
    .changeAddress(changeAddress)
    .txInCollateral(collUTxO.input.txHash, collUTxO.input.outputIndex, collUTxO.output.amount, collUTxO.output.address)
    .selectUtxosFrom(utxos)
    .complete();

  const signedTx = await wallet.signTx(unsignedTx);
  return wallet.submitTx(signedTx);
}

// ============================================================
// 3. WITHDRAW
// ============================================================

export async function withdraw(
  wallet: BrowserWallet,
  campaignUtxo: UTxO
): Promise<string> {
  const changeAddress = await wallet.getChangeAddress();
  const utxos = await wallet.getUtxos();
  const [collUTxO] = await wallet.getCollateral();
  if (!collUTxO) throw new Error("No collateral UTxO.");

  const datum = parseCampaignDatum(campaignUtxo.output.plutusData!);
  const total = datum.contributions.reduce((s, c) => s + c.amount, 0n);

  // Chỉ cần goal đạt, không cần chờ deadline
  if (total < datum.goal) throw new Error("Goal chưa đạt.");

  const walletPkh = resolvePaymentKeyHash(changeAddress);
  if (walletPkh !== datum.beneficiary) throw new Error("Chỉ beneficiary mới có thể withdraw.");

  const scriptCbor = getScriptCbor();

  const txBuilder = newTxBuilder();
  const unsignedTx = await txBuilder
    .spendingPlutusScriptV3()
    .txIn(campaignUtxo.input.txHash, campaignUtxo.input.outputIndex, campaignUtxo.output.amount, campaignUtxo.output.address)
    .txInInlineDatumPresent()
    .txInRedeemerValue(encodeRedeemer("Withdraw"), "JSON")
    .txInScript(scriptCbor)
    .requiredSignerHash(datum.beneficiary)
    .invalidBefore(nowSlotWithBuffer())
    .changeAddress(changeAddress)
    .txInCollateral(collUTxO.input.txHash, collUTxO.input.outputIndex, collUTxO.output.amount, collUTxO.output.address)
    .selectUtxosFrom(utxos)
    .complete();

  const signedTx = await wallet.signTx(unsignedTx);
  return wallet.submitTx(signedTx);
}

// ============================================================
// 4. RECLAIM
// ============================================================

export async function reclaim(
  wallet: BrowserWallet,
  campaignUtxo: UTxO
): Promise<string> {
  const changeAddress = await wallet.getChangeAddress();
  const utxos = await wallet.getUtxos();
  const [collUTxO] = await wallet.getCollateral();
  if (!collUTxO) throw new Error("No collateral UTxO.");

  const datum = parseCampaignDatum(campaignUtxo.output.plutusData!);
  const total = datum.contributions.reduce((s, c) => s + c.amount, 0n);
  const reclaimerPkh = resolvePaymentKeyHash(changeAddress);

  if (Date.now() < datum.deadline) throw new Error("Deadline chưa đến.");
  if (total >= datum.goal) throw new Error("Goal đã đạt. Hãy chờ beneficiary withdraw.");

  const myContrib = datum.contributions.find((c) => c.pkh === reclaimerPkh);
  if (!myContrib) throw new Error("Ví này không có contribution.");

  const oldLovelace = getLovelace(campaignUtxo);
  const remainingLovelace = oldLovelace - myContrib.amount;
  const remainingContribs = datum.contributions.filter((c) => c.pkh !== reclaimerPkh);
  const newDatum: CampaignDatum = { ...datum, contributions: remainingContribs };

  const deadlineSlot = posixMsToSlot(datum.deadline);
  const scriptCbor = getScriptCbor();

  const txBuilder = newTxBuilder();
  txBuilder
    .spendingPlutusScriptV3()
    .txIn(campaignUtxo.input.txHash, campaignUtxo.input.outputIndex, campaignUtxo.output.amount, campaignUtxo.output.address)
    .txInInlineDatumPresent()
    .txInRedeemerValue(encodeRedeemer("Reclaim"), "JSON")
    .txInScript(scriptCbor)
    .requiredSignerHash(reclaimerPkh)
    .invalidBefore(deadlineSlot + 1);

  if (remainingContribs.length > 0 && remainingLovelace > 0n) {
    txBuilder
      .txOut(getScriptAddress(), [{ unit: "lovelace", quantity: remainingLovelace.toString() }])
      .txOutInlineDatumValue(encodeDatum(newDatum), "JSON");
  }

  const unsignedTx = await txBuilder
    .changeAddress(changeAddress)
    .txInCollateral(collUTxO.input.txHash, collUTxO.input.outputIndex, collUTxO.output.amount, collUTxO.output.address)
    .selectUtxosFrom(utxos)
    .complete();

  const signedTx = await wallet.signTx(unsignedTx);
  return wallet.submitTx(signedTx);
}
