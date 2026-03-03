"use client";

import { useState } from "react";
import type { UTxO } from "@meshsdk/common";
import type { BrowserWallet } from "@meshsdk/wallet";
import type { CampaignDatum } from "../lib/contract";

interface Props {
  wallet: BrowserWallet;
  walletPkh: string;
  campaignUtxo: UTxO;
  datum: CampaignDatum;
  onSuccess: (txHash: string) => void;
}

export default function WithdrawPanel({ wallet, walletPkh, campaignUtxo, datum, onSuccess }: Props) {
  const [loading, setLoading] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const total = datum.contributions.reduce((s, c) => s + c.amount, 0n);
  const isExpired = Date.now() > datum.deadline;
  const goalMet = total >= datum.goal;
  const isBeneficiary = walletPkh === datum.beneficiary;
  // Withdraw chỉ cần goal đạt, không cần deadline
  const canWithdraw = goalMet && isBeneficiary;

  async function handleWithdraw() {
    setLoading(true);
    setError(null);
    setTxHash(null);
    try {
      const { withdraw } = await import("../lib/crowdfund");
      const hash = await withdraw(wallet, campaignUtxo);
      setTxHash(hash);
      onSuccess(hash);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="p-4 bg-gray-800/50 rounded-lg space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-400">Total Raised</span>
          <span className="text-white font-semibold">{(Number(total) / 1e6).toFixed(2)} ADA</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Goal</span>
          <span className={goalMet ? "text-green-400" : "text-yellow-400"}>
            {(Number(datum.goal) / 1e6).toFixed(2)} ADA {goalMet ? "✓" : "(not met)"}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Deadline</span>
          <span className={isExpired ? "text-red-400" : "text-blue-400"}>
            {new Date(datum.deadline).toLocaleString()} {isExpired ? "(passed)" : "(upcoming)"}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Your Role</span>
          <span className={isBeneficiary ? "text-teal-400" : "text-gray-500"}>
            {isBeneficiary ? "Beneficiary ✓" : "Not beneficiary"}
          </span>
        </div>
      </div>

      {!isBeneficiary && (
        <div className="p-3 bg-yellow-900/30 border border-yellow-600/40 rounded-lg">
          <p className="text-yellow-400 text-sm">
            Only the beneficiary ({datum.beneficiary.slice(0, 16)}...) can withdraw.
          </p>
        </div>
      )}

      {!goalMet && isBeneficiary && (
        <div className="p-3 bg-orange-900/30 border border-orange-600/40 rounded-lg">
          <p className="text-orange-400 text-sm">
            Goal not met yet. Need {(Number(datum.goal - total) / 1e6).toFixed(2)} more ADA.
          </p>
        </div>
      )}

      <button
        onClick={handleWithdraw}
        disabled={loading || !canWithdraw}
        className="w-full py-3 bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white font-semibold rounded-lg transition-colors"
      >
        {loading
          ? "Withdrawing..."
          : !isBeneficiary
          ? "Not Beneficiary"
          : !goalMet
          ? "Goal Not Met"
          : `Withdraw ${(Number(total) / 1e6).toFixed(2)} ADA`}
      </button>

      {txHash && (
        <div className="p-3 bg-green-900/30 border border-green-600/40 rounded-lg">
          <p className="text-green-400 text-sm font-semibold">✓ Withdrawal Successful!</p>
          <p className="text-xs text-gray-400 mt-1 font-mono break-all">TxHash: {txHash}</p>
        </div>
      )}
      {error && (
        <div className="p-3 bg-red-900/30 border border-red-600/40 rounded-lg">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}
    </div>
  );
}
