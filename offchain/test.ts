/**
 * test.ts — Test headless với Alice (tạo campaign), Bob (donate), Charlie (withdraw/reclaim)
 *
 * Chạy: node --loader ts-node/esm test.ts
 *
 * Mnemonic và Blockfrost API key đọc từ ../.env
 */

import "dotenv/config";
import { BlockfrostProvider } from "@meshsdk/core";
import type { UTxO } from "@meshsdk/common";
import {
  createCampaign,
  donate,
  withdraw,
  reclaim,
  loadWallet,
} from "./CrowdFund_Functions.js";
import { SCRIPT_ADDRESS, decodeDatum } from "./contract.js";

// ============================================================
// CONFIG
// ============================================================

const BLOCKFROST_API_KEY = process.env.BLOCKFROST_API_KEY ?? "";
const ALICE_MNEMONIC = process.env.ALICE_MNEMONIC ?? "";
const BOB_MNEMONIC = process.env.BOB_MNEMONIC ?? "";
const CHARLE_MNEMONIC = process.env.CHARLE_MNEMONIC ?? "";

if (!BLOCKFROST_API_KEY || !ALICE_MNEMONIC || !BOB_MNEMONIC || !CHARLE_MNEMONIC) {
  throw new Error("Missing env vars. Check .env file.");
}

const provider = new BlockfrostProvider(BLOCKFROST_API_KEY);

// ============================================================
// HELPERS
// ============================================================

/** Lấy tất cả UTxO của campaign tại script address */
async function getCampaignUtxos(): Promise<UTxO[]> {
  return provider.fetchAddressUTxOs(SCRIPT_ADDRESS);
}

/** In thông tin campaign */
function printCampaign(utxo: UTxO): void {
  if (!utxo.output.plutusData) {
    console.log(`  UTxO ${utxo.input.txHash.slice(0, 12)}...: no datum`);
    return;
  }
  try {
    const datum = decodeDatum(JSON.parse(utxo.output.plutusData));
    const total = datum.contributions.reduce((s, c) => s + c.amount, 0n);
    console.log(`  UTxO: ${utxo.input.txHash.slice(0, 16)}...#${utxo.input.outputIndex}`);
    console.log(`    Beneficiary: ${datum.beneficiary.slice(0, 16)}...`);
    console.log(`    Goal:        ${datum.goal.toLocaleString()} lovelace`);
    console.log(`    Deadline:    ${new Date(datum.deadline).toISOString()}`);
    console.log(`    Total:       ${total.toLocaleString()} / ${datum.goal.toLocaleString()}`);
    console.log(`    Contributors (${datum.contributions.length}):`);
    datum.contributions.forEach((c) =>
      console.log(`      ${c.pkh.slice(0, 12)}... → ${c.amount.toLocaleString()} lovelace`)
    );
  } catch {
    console.log(`  UTxO ${utxo.input.txHash.slice(0, 12)}...: invalid datum`);
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================
// TEST SCENARIOS
// ============================================================

async function testScenario1_WithdrawSuccess(): Promise<void> {
  console.log("\n========================================");
  console.log("SCENARIO 1: Create → Donate → Withdraw");
  console.log("========================================");

  const alice = await loadWallet(ALICE_MNEMONIC, provider);
  const bob = await loadWallet(BOB_MNEMONIC, provider);
  const charlie = await loadWallet(CHARLE_MNEMONIC, provider);

  const aliceAddr = await alice.getChangeAddressBech32();
  const charlieAddr = await charlie.getChangeAddressBech32();
  console.log(`Alice:   ${aliceAddr.slice(0, 20)}...`);
  console.log(`Charlie: ${charlieAddr.slice(0, 20)}...`);

  // Deadline: 2 phút từ bây giờ (để test nhanh)
  const deadline = Date.now() + 2 * 60 * 1000;
  const goal = 10_000_000n; // 10 ADA

  // Step 1: Alice tạo campaign, donate 5 ADA ban đầu
  console.log("\n[1] Alice tạo campaign (5 ADA)...");
  const createTxHash = await createCampaign(
    alice,
    provider,
    charlieAddr,
    goal,
    deadline,
    5_000_000n
  );
  console.log(`    ✓ TxHash: ${createTxHash}`);

  // Chờ tx được confirm
  console.log("    Chờ tx confirm (30s)...");
  await sleep(30_000);

  // Step 2: Bob donate 6 ADA
  console.log("\n[2] Bob donate 6 ADA...");
  const utxos = await getCampaignUtxos();
  const campaignUtxo = utxos.find(
    (u) => u.input.txHash === createTxHash
  ) ?? utxos[utxos.length - 1];
  printCampaign(campaignUtxo);

  const bobAddr = await bob.getChangeAddressBech32();
  const donateTxHash = await donate(bob, provider, campaignUtxo, bobAddr, 6_000_000n);
  console.log(`    ✓ TxHash: ${donateTxHash}`);

  console.log("    Chờ tx confirm (30s)...");
  await sleep(30_000);

  // Step 3: Chờ deadline
  console.log(`\n[3] Chờ deadline (${new Date(deadline).toISOString()})...`);
  const timeUntilDeadline = deadline - Date.now();
  if (timeUntilDeadline > 0) {
    console.log(`    Chờ ${Math.ceil(timeUntilDeadline / 1000)}s...`);
    await sleep(timeUntilDeadline + 5_000); // thêm 5s buffer
  }

  // Step 4: Charlie withdraw
  console.log("\n[4] Charlie withdraw...");
  const utxosAfter = await getCampaignUtxos();
  const campaignAfterDonate = utxosAfter.find(
    (u) => u.input.txHash === donateTxHash
  ) ?? utxosAfter[utxosAfter.length - 1];
  printCampaign(campaignAfterDonate);

  const withdrawTxHash = await withdraw(charlie, provider, campaignAfterDonate);
  console.log(`    ✓ TxHash: ${withdrawTxHash}`);
  console.log("\n✅ SCENARIO 1 PASSED");
}

async function testScenario2_ReclaimFailed(): Promise<void> {
  console.log("\n=======================================");
  console.log("SCENARIO 2: Create → Donate → Reclaim");
  console.log("=======================================");

  const alice = await loadWallet(ALICE_MNEMONIC, provider);
  const bob = await loadWallet(BOB_MNEMONIC, provider);
  const charlieAddr = await (await loadWallet(CHARLE_MNEMONIC, provider)).getChangeAddressBech32();

  // Deadline: 2 phút từ bây giờ
  const deadline = Date.now() + 2 * 60 * 1000;
  const goal = 50_000_000n; // 50 ADA (sẽ không đạt)

  // Step 1: Alice tạo campaign với goal cao (50 ADA)
  console.log("\n[1] Alice tạo campaign với goal 50 ADA (sẽ không đạt)...");
  const createTxHash = await createCampaign(
    alice,
    provider,
    charlieAddr,
    goal,
    deadline,
    3_000_000n // 3 ADA ban đầu
  );
  console.log(`    ✓ TxHash: ${createTxHash}`);
  await sleep(30_000);

  // Step 2: Bob donate 5 ADA (tổng = 8 ADA < 50 ADA)
  console.log("\n[2] Bob donate 5 ADA...");
  const utxos = await getCampaignUtxos();
  const campaignUtxo = utxos.find((u) => u.input.txHash === createTxHash) ?? utxos[0];
  printCampaign(campaignUtxo);

  const bobAddr = await bob.getChangeAddressBech32();
  const donateTxHash = await donate(bob, provider, campaignUtxo, bobAddr, 5_000_000n);
  console.log(`    ✓ TxHash: ${donateTxHash}`);
  await sleep(30_000);

  // Step 3: Chờ deadline
  const timeUntilDeadline = deadline - Date.now();
  if (timeUntilDeadline > 0) {
    console.log(`\n[3] Chờ deadline (${Math.ceil(timeUntilDeadline / 1000)}s)...`);
    await sleep(timeUntilDeadline + 5_000);
  }

  // Step 4: Bob reclaim
  console.log("\n[4] Bob reclaim...");
  const utxosAfter = await getCampaignUtxos();
  const campaignAfter = utxosAfter.find((u) => u.input.txHash === donateTxHash) ?? utxosAfter[0];
  printCampaign(campaignAfter);

  const reclaimTxHash = await reclaim(bob, provider, campaignAfter);
  console.log(`    ✓ TxHash: ${reclaimTxHash}`);
  console.log("\n✅ SCENARIO 2 PASSED");
}

// ============================================================
// MAIN
// ============================================================

async function main(): Promise<void> {
  console.log(`Script Address: ${SCRIPT_ADDRESS}`);
  console.log("\nListing current campaigns:");
  const utxos = await getCampaignUtxos();
  if (utxos.length === 0) {
    console.log("  (no campaigns yet)");
  } else {
    utxos.forEach(printCampaign);
  }

  // Chọn scenario để chạy:
  // await testScenario1_WithdrawSuccess();
  await testScenario2_ReclaimFailed();
}

main().catch(console.error);
