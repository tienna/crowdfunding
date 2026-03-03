"use client";

import { useState } from "react";
import type { UTxO } from "@meshsdk/common";
import type { BrowserWallet } from "@meshsdk/wallet";
import type { CampaignDatum } from "../lib/contract";

interface Props {
  wallet: BrowserWallet;
  campaignUtxo: UTxO;
  datum: CampaignDatum;
  onSuccess: (txHash: string) => void;
}

export default function DonateForm({ wallet, campaignUtxo, datum, onSuccess }: Props) {
  const [amountAda, setAmountAda] = useState("5");
  const [loading, setLoading] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const total = datum.contributions.reduce((s, c) => s + c.amount, 0n);
  const isExpired = Date.now() > datum.deadline;
  const goalMet = total >= datum.goal;

  async function handleDonate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setTxHash(null);
    try {
      if (isExpired) throw new Error("Campaign đã kết thúc.");
      if (goalMet) throw new Error("Goal đã đạt rồi.");
      const { donate } = await import("../lib/crowdfund");
      const donationLovelace = BigInt(Math.floor(parseFloat(amountAda) * 1_000_000));
      if (donationLovelace < 1_000_000n) throw new Error("Minimum donation: 1 ADA");
      const hash = await donate(wallet, campaignUtxo, donationLovelace);
      setTxHash(hash);
      onSuccess(hash);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleDonate} className="space-y-4">
      <div className="p-3 bg-gray-800/50 rounded-lg text-sm space-y-1">
        <p className="text-gray-400">
          Raised: <span className="text-white">{(Number(total) / 1e6).toFixed(2)} ADA</span>
          {" / "}
          <span className="text-gray-300">{(Number(datum.goal) / 1e6).toFixed(2)} ADA</span>
        </p>
        <p className="text-gray-400">
          Deadline: <span className="text-white">{new Date(datum.deadline).toLocaleString()}</span>
        </p>
        <p className="text-gray-400">
          Status:{" "}
          {isExpired ? (
            <span className="text-red-400">Expired</span>
          ) : goalMet ? (
            <span className="text-green-400">Goal Met</span>
          ) : (
            <span className="text-blue-400">Active</span>
          )}
        </p>
      </div>

      <div>
        <label className="block text-sm text-gray-400 mb-1">Donation Amount (ADA)</label>
        <input
          type="number"
          value={amountAda}
          onChange={(e) => setAmountAda(e.target.value)}
          min="1"
          step="0.5"
          required
          disabled={isExpired || goalMet}
          className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-teal-500 disabled:opacity-50"
        />
      </div>

      <button
        type="submit"
        disabled={loading || isExpired || goalMet}
        className="w-full py-3 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white font-semibold rounded-lg transition-colors"
      >
        {loading ? "Donating..." : isExpired ? "Campaign Ended" : goalMet ? "Goal Already Met" : "Donate"}
      </button>

      {txHash && (
        <div className="p-3 bg-green-900/30 border border-green-600/40 rounded-lg">
          <p className="text-green-400 text-sm font-semibold">✓ Donation Successful!</p>
          <p className="text-xs text-gray-400 mt-1 font-mono break-all">TxHash: {txHash}</p>
        </div>
      )}
      {error && (
        <div className="p-3 bg-red-900/30 border border-red-600/40 rounded-lg">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}
    </form>
  );
}
