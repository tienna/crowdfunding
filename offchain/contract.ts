/**
 * contract.ts — CrowdFund on-chain artifact helpers
 *
 * Xuất CBOR của validator và các helper để tính script address,
 * encode/decode datum & redeemer cho Plutus V3 trên Preview Testnet.
 *
 * ⚠️ Conway era yêu cầu double-CBOR. Raw compiledCode từ Aiken plutus.json
 *    là single-CBOR → phải wrap thành double-CBOR bằng applyParamsToScript.
 */

import { applyParamsToScript, resolvePlutusScriptAddress, parseDatumCbor } from "@meshsdk/core-cst";

// ============================================================
// COMPILED SCRIPT CBOR (từ onchain/plutus.json)
// ============================================================

/** Single-CBOR — raw output từ Aiken build (không dùng trực tiếp với Conway node) */
const SCRIPT_CBOR_SINGLE =
  "5908c601010032323232323232253330023232323232533233008300130093754004264646464646464a66601e60060022a66602460226ea8028540085854ccc03cc02000454ccc048c044dd50050a8010b0a99980798020008a99980918089baa00a150021616300f37540122a66601a6002601c6ea800c4c8c8c8c8c8c8c8c8c8c8c8c8c94ccc068c0380304c94ccc06cc03cc070dd5000899191919299980f980998101baa0011323253330213016302237540022646601c0022646464a66604a66e212000003153330253370e66e0400400800c54ccc094cc88cc03c0088cdc49bad302a001325333029301d302a375400226eb4c0b8c0acdd50008a40006601e0046eb8c0a4004dd5980a98139baa0183756602a604e6ea801054ccc094cdc79bae300f302737540086eb8c03cc09cdd500c0a99981299b87375a6020604e6ea8010dd6980818139baa01813370e6eb4c048c09cdd50021bad30123027375403029405280a5014a02940c054dd5980a18131baa003301437566026604a6ea8058cdc098059bab300d3024375400600a604c60466ea800458c034c088dd5000981218109baa001163300c3758601660406ea806c8cdd7980498109baa001003300637566010603e6ea8c020c07cdd50011803180f1baa3007301e37540026040603a6ea800458cc020dd61802180e1baa01723375e600a603a6ea80040484c94ccc06cc05003454ccc06ccdc49bad3006301d375401c60186eacc02cc074dd50070999119198008008019129998110008a5013253330203371e6eb8c09400801052889980180180098128009bac3001301d37540306eb8c014c074dd50070a501323232323232325333022301b3023375400226464646464a66604e603660506ea80044c8c8c8c8c8c94ccc0b4cdc49bad301a302f37540400162a66605a66e20028dd6980c18179baa0201533302d33710900018070048a99981680088010a5014a029405281980600411991191980080080191299981a0008a501325333032323253330343028303537540022a66606866e3cdd7181c981b1baa00100813371200c603a6eacc07cc0d8dd50010a5014a0603a606a6ea8c074c0d4dd5000981b8010a51133003003001303700137586034605e6ea80a8c94ccc0b8c088c0bcdd500089bad303330303754002290001980a1bab301d302f3754040002a666056603e00229444c94ccc0b0c080c0b4dd5000899192999817181198179baa0011323301b0011533302f3370e60246eacc07cc0c4dd50008028a9998179980780591998181980a9bab302030323754004002941288a9998179980b9bab301f30313754002464a666062604a60646ea80044cdc39bad3033002375a606c60666ea80045281980b9bab3020303237540466eb8c0c400454ccc0bccdc79bae3019303137540026eb8c064c0c4dd50110a99981799b87375a603460626ea8004dd6980d18189baa0221533302f3370e6eb4c070c0c4dd50009bad301c30313754044266e1cc060dd5980d18189baa00300614a029405280a5014a02940c0ccc0c0dd50008b180d18179baa0013031302e37540022c660326eb0c060c0b4dd5014119baf3016302e375400200866e04c034dd5980d18161baa01d300b0063370260246eacc050c0acdd5180a18159baa0020043012302a3754602660546ea8004c0b0c0a4dd50008b1980a1bac301030283754046466ebcc044c0a4dd500080f1919980080080124000444a66605600420022666006006605c00464a666052603a60546ea80044cdc00011bad302e302b375400220046601e6eacc060c0a8dd500d9bae302d002323300100137586016604e6ea8088894ccc0a400452f5c026464a6660506601a6eacc060c0a8dd500d8010998161ba900233004004001133004004001302d002375c605600260286eacc04cc094dd500b1bad3027302437540022c601660466ea8c02cc08cdd51813181398139813981398139813981398119baa01e22323300100100322533302700114a2264a66604a60086eb8c0a80084cc00c00c004528181500098008009129998118008a4000266e01200233002002302600130010012253330210011480004cdc02400466004004604800244646600200200644a66604400229404c94ccc080cdc78021bae3021302500214a2266006006002604a002460406042604260426042604260426042604200244646600200200644a6660400022980103d87a8000132323253330203371e00c6eb8c08400c4c03ccc090dd4000a5eb804cc014014008dd698108011812001181100091191980080080191299980f8008a51132533301d3004302200213300300300114a06044002464a666032602460346ea8004520001375a603c60366ea8004c94ccc064c048c068dd50008a60103d87a8000132330010013756603e60386ea8008894ccc078004530103d87a8000132323232533301f33722911000021533301f3371e9101000021300e33023375000297ae014c0103d87a8000133006006003375a60400066eb8c078008c088008c080004c8cc004004008894ccc0740045300103d87a8000132323232533301e33722911000021533301e3371e9101000021300d33022374c00297ae014c0103d87a80001330060060033756603e0066eb8c074008c084008c07c0048c0700048c06cc070004894ccc058c028c05cdd5001099191919191919192999810981200109919800800801111929998120010a8060991919180218150029bad3025002375c6046002604c00460040042c6eacc088004c088008dd6981000098100011bad301e001301e002375c603800260306ea8008588c064c068c06800488c8cc00400400c894ccc0640045300103d87a80001323253330183005002130073301c0024bd70099802002000980e801180d8009ba5480008c058c05cc05cc05c0048c8ccc004004009200022253330160021001132333004004301a00332337000066eb4c05c008dd7180a800980c00118079baa0093012300f37540062c6e1d2000370e900218079808001180700098051baa002370e90010b1805980600118050009805001180400098021baa00114984d9595cd2ab9d5573caae7d5d02ba157441";

/**
 * Double-CBOR wrapped script — dùng với Conway node (Plutus V3).
 * applyParamsToScript(cbor, []) tự động thêm outer CBOR wrapper.
 */
export const SCRIPT_CBOR = applyParamsToScript(SCRIPT_CBOR_SINGLE, [], "JSON");

/** Script hash (từ plutus.json) */
export const SCRIPT_HASH = "74c12c90a16a81859e0398f78c1b93ba6b565cf58964e0d16ff490b1";

/** Script address trên Preview Testnet (networkId = 0) */
export const SCRIPT_ADDRESS = resolvePlutusScriptAddress(
  { code: SCRIPT_CBOR, version: "V3" },
  0
);

// ============================================================
// SLOT ↔ POSIX CONVERSION (Preview Testnet)
// Preview genesis = 1666656000 Unix seconds, 1 slot = 1 second
// ============================================================

export const PREVIEW_GENESIS_UNIX_S = 1666656000;

export function slotToPosixMs(slot: number): number {
  return (PREVIEW_GENESIS_UNIX_S + slot) * 1000;
}

export function posixMsToSlot(posixMs: number): number {
  return Math.floor(posixMs / 1000) - PREVIEW_GENESIS_UNIX_S;
}

// ============================================================
// DATUM / REDEEMER TYPES
// ============================================================

/** Một entry đóng góp: [contributor_pkh_hex, amount_lovelace] */
export interface Contribution {
  pkh: string;
  amount: bigint;
}

/** Datum on-chain của một campaign */
export interface CampaignDatum {
  beneficiary: string;       // PKH hex
  goal: bigint;              // Lovelace
  deadline: number;          // POSIX ms
  contributions: Contribution[];
}

/** Redeemer actions */
export type CrowdFundRedeemer = "Donate" | "Withdraw" | "Reclaim";

// ============================================================
// DATUM ENCODING HELPERS (Mesh Data format)
// ============================================================

/**
 * Encode CampaignDatum thành Mesh Data để dùng với txOutInlineDatumValue.
 * Contributions được encode thành Plutus map (sorted by pkh).
 */
export function encodeDatum(datum: CampaignDatum): object {
  const sortedContributions = [...datum.contributions].sort((a, b) =>
    a.pkh.localeCompare(b.pkh)
  );

  return {
    constructor: 0,
    fields: [
      { bytes: datum.beneficiary },
      { int: Number(datum.goal) },
      { int: datum.deadline },
      {
        map: sortedContributions.map(({ pkh, amount }) => ({
          k: { bytes: pkh },
          v: { int: Number(amount) },
        })),
      },
    ],
  };
}

/**
 * Parse datum từ CBOR hex (định dạng Blockfrost trả về) thành CampaignDatum.
 */
export function parseCampaignDatum(cborHex: string): CampaignDatum {
  const data = parseDatumCbor(cborHex);
  return decodeDatum(data);
}

/**
 * Decode Plutus Data (Mesh format) thành CampaignDatum.
 * Dùng khi đọc datum từ UTxO.
 */
export function decodeDatum(data: any): CampaignDatum {
  const fields = data.fields ?? data.constructor?.fields;
  if (!fields || fields.length < 4) throw new Error("Invalid CampaignDatum");

  const beneficiary: string = fields[0].bytes;
  const goal: bigint = BigInt(fields[1].int ?? fields[1]);
  const deadline: number = Number(fields[2].int ?? fields[2]);

  const mapEntries: any[] = fields[3].map ?? [];
  const contributions: Contribution[] = mapEntries.map((entry: any) => ({
    pkh: entry.k.bytes,
    amount: BigInt(entry.v.int ?? entry.v),
  }));

  return { beneficiary, goal, deadline, contributions };
}

/**
 * Encode redeemer thành Mesh Data.
 * Donate = constructor 0, Withdraw = constructor 1, Reclaim = constructor 2
 */
export function encodeRedeemer(action: CrowdFundRedeemer): object {
  const index = action === "Donate" ? 0 : action === "Withdraw" ? 1 : 2;
  return { constructor: index, fields: [] };
}
