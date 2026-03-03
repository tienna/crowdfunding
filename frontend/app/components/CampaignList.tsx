"use client";

import { useEffect, useState } from "react";
import type { UTxO } from "@meshsdk/common";
import type { CampaignDatum } from "../lib/contract";

interface Campaign {
  utxo: UTxO;
  datum: CampaignDatum;
}

interface Props {
  userPkh: string | null;
  onSelectCampaign: (campaign: Campaign) => void;
  selectedUtxoId: string | null;
  refreshTrigger: number;
}

function progressPercent(datum: CampaignDatum): number {
  const total = datum.contributions.reduce((s, c) => s + c.amount, 0n);
  if (datum.goal === 0n) return 0;
  return Math.min(100, Number((total * 100n) / datum.goal));
}

function formatADA(lovelace: bigint): string {
  return (Number(lovelace) / 1_000_000).toFixed(2);
}

export default function CampaignList({ userPkh, onSelectCampaign, selectedUtxoId, refreshTrigger }: Props) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    import("../lib/crowdfund").then(({ fetchCampaigns }) =>
      fetchCampaigns()
        .then(setCampaigns)
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false))
    );
  }, [refreshTrigger]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return <p className="text-red-400 text-sm text-center py-8">{error}</p>;
  }

  if (campaigns.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p className="text-lg mb-2">No campaigns yet</p>
        <p className="text-sm">Create the first campaign to get started.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {campaigns.map(({ utxo, datum }) => {
        const utxoId = `${utxo.input.txHash}#${utxo.input.outputIndex}`;
        const total = datum.contributions.reduce((s, c) => s + c.amount, 0n);
        const progress = progressPercent(datum);
        const isExpired = Date.now() > datum.deadline;
        const goalMet = total >= datum.goal;
        const myContrib = userPkh ? datum.contributions.find((c) => c.pkh === userPkh) : null;
        const isSelected = utxoId === selectedUtxoId;

        return (
          <div
            key={utxoId}
            onClick={() => onSelectCampaign({ utxo, datum })}
            className={`relative rounded-xl border p-5 cursor-pointer transition-all ${
              isSelected
                ? "border-teal-400 bg-teal-900/20"
                : "border-gray-700 bg-gray-900/50 hover:border-gray-500"
            }`}
          >
            {/* Status badge */}
            <div className="absolute top-4 right-4">
              {goalMet ? (
                <span className="px-2 py-0.5 text-xs rounded-full bg-green-900/50 text-green-400 border border-green-600/40">
                  Goal Met ✓
                </span>
              ) : isExpired ? (
                <span className="px-2 py-0.5 text-xs rounded-full bg-red-900/50 text-red-400 border border-red-600/40">
                  Expired
                </span>
              ) : (
                <span className="px-2 py-0.5 text-xs rounded-full bg-blue-900/50 text-blue-400 border border-blue-600/40">
                  Active
                </span>
              )}
            </div>

            {/* Beneficiary */}
            <p className="text-xs text-gray-500 mb-1 font-mono">
              Beneficiary: {datum.beneficiary.slice(0, 20)}...
            </p>

            {/* Progress bar */}
            <div className="mt-3 mb-2">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-white font-semibold">{formatADA(total)} ADA</span>
                <span className="text-gray-400">Goal: {formatADA(datum.goal)} ADA</span>
              </div>
              <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-teal-500 to-cyan-400 rounded-full transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-right text-xs text-gray-500 mt-1">{progress}%</p>
            </div>

            {/* Deadline */}
            <p className="text-xs text-gray-500">
              Deadline: {new Date(datum.deadline).toLocaleString()}
            </p>

            {/* My contribution */}
            {myContrib && (
              <p className="mt-2 text-xs text-teal-400">
                My contribution: {formatADA(myContrib.amount)} ADA
              </p>
            )}

            {/* Contributors count */}
            <p className="text-xs text-gray-600 mt-1">
              {datum.contributions.length} contributor{datum.contributions.length !== 1 ? "s" : ""}
            </p>
          </div>
        );
      })}
    </div>
  );
}
