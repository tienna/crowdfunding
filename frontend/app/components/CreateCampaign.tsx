"use client";

import { useState } from "react";
import type { BrowserWallet } from "@meshsdk/wallet";

interface Props {
  wallet: BrowserWallet;
  onSuccess: (txHash: string) => void;
}

export default function CreateCampaign({ wallet, onSuccess }: Props) {
  const [beneficiary, setBeneficiary] = useState("");
  const [goalAda, setGoalAda] = useState("");
  const [deadlineDate, setDeadlineDate] = useState("");
  const [initialAda, setInitialAda] = useState("2");
  const [loading, setLoading] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setTxHash(null);
    try {
      const { createCampaign } = await import("../lib/crowdfund");
      const goalLovelace = BigInt(Math.floor(parseFloat(goalAda) * 1_000_000));
      const deadlinePosixMs = new Date(deadlineDate).getTime();
      const initialLovelace = BigInt(Math.floor(parseFloat(initialAda) * 1_000_000));

      if (goalLovelace <= 0n) throw new Error("Goal must be > 0 ADA");
      if (deadlinePosixMs <= Date.now()) throw new Error("Deadline must be in the future");
      if (initialLovelace < 2_000_000n) throw new Error("Initial donation must be >= 2 ADA");

      const hash = await createCampaign(wallet, beneficiary, goalLovelace, deadlinePosixMs, initialLovelace);
      setTxHash(hash);
      onSuccess(hash);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleCreate} className="space-y-4">
      <div>
        <label className="block text-sm text-gray-400 mb-1">Beneficiary Address (bech32)</label>
        <input
          value={beneficiary}
          onChange={(e) => setBeneficiary(e.target.value)}
          placeholder="addr_test1..."
          required
          className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-teal-500"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm text-gray-400 mb-1">Goal (ADA)</label>
          <input
            type="number"
            value={goalAda}
            onChange={(e) => setGoalAda(e.target.value)}
            placeholder="100"
            min="1"
            step="1"
            required
            className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-teal-500"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">Initial Donation (ADA)</label>
          <input
            type="number"
            value={initialAda}
            onChange={(e) => setInitialAda(e.target.value)}
            placeholder="2"
            min="2"
            step="0.5"
            required
            className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-teal-500"
          />
        </div>
      </div>
      <div>
        <label className="block text-sm text-gray-400 mb-1">Deadline</label>
        <input
          type="datetime-local"
          value={deadlineDate}
          onChange={(e) => setDeadlineDate(e.target.value)}
          required
          className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-teal-500"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full py-3 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white font-semibold rounded-lg transition-colors"
      >
        {loading ? "Creating Campaign..." : "Create Campaign"}
      </button>

      {txHash && (
        <div className="p-3 bg-green-900/30 border border-green-600/40 rounded-lg">
          <p className="text-green-400 text-sm font-semibold">✓ Campaign Created!</p>
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
