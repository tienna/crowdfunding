"use client";

import { useState } from "react";
import type { UTxO } from "@meshsdk/common";
import type { CampaignDatum } from "./lib/contract";
import { useWallet } from "./hooks/useWallet";
import WalletConnect from "./components/WalletConnect";
import CampaignList from "./components/CampaignList";
import dynamic from "next/dynamic";

// Dynamic imports — prevent SSR for MeshJS-dependent components
const CreateCampaign = dynamic(() => import("./components/CreateCampaign"), { ssr: false });
const DonateForm = dynamic(() => import("./components/DonateForm"), { ssr: false });
const WithdrawPanel = dynamic(() => import("./components/WithdrawPanel"), { ssr: false });
const ReclaimPanel = dynamic(() => import("./components/ReclaimPanel"), { ssr: false });

type Tab = "campaigns" | "create" | "donate" | "withdraw" | "reclaim";

interface SelectedCampaign {
  utxo: UTxO;
  datum: CampaignDatum;
}

export default function Home() {
  const walletState = useWallet();
  const [activeTab, setActiveTab] = useState<Tab>("campaigns");
  const [selected, setSelected] = useState<SelectedCampaign | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  function handleTxSuccess(_txHash: string) {
    setRefreshTrigger((n) => n + 1);
    setTimeout(() => setActiveTab("campaigns"), 2000);
  }

  function handleSelectCampaign(campaign: SelectedCampaign) {
    setSelected(campaign);
    setActiveTab("donate");
  }

  const tabs: { id: Tab; label: string; requiresWallet?: boolean; requiresSelection?: boolean }[] = [
    { id: "campaigns", label: "Campaigns" },
    { id: "create", label: "Create", requiresWallet: true },
    { id: "donate", label: "Donate", requiresWallet: true, requiresSelection: true },
    { id: "withdraw", label: "Withdraw", requiresWallet: true, requiresSelection: true },
    { id: "reclaim", label: "Reclaim", requiresWallet: true, requiresSelection: true },
  ];

  return (
    <main className="min-h-screen">
      {/* Header */}
      <header className="border-b border-gray-800 bg-black/40 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-400 to-cyan-600 flex items-center justify-center">
              <span className="text-black font-bold text-sm">₳</span>
            </div>
            <div>
              <h1 className="font-semibold text-white text-lg leading-none">CrowdFund</h1>
              <p className="text-xs text-gray-500 leading-none mt-0.5">Cardano Preview Testnet</p>
            </div>
          </div>
          <WalletConnect walletState={walletState} />
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Hero */}
        <div className="text-center mb-10">
          <h2 className="text-4xl font-bold text-white mb-3">
            Decentralized{" "}
            <span className="bg-gradient-to-r from-teal-400 to-cyan-300 bg-clip-text text-transparent">
              Crowdfunding
            </span>
          </h2>
          <p className="text-gray-400 max-w-xl mx-auto">
            Fund your projects on-chain. No intermediaries. Powered by Aiken smart contracts on Cardano.
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-1 mb-6 bg-gray-900/60 p-1 rounded-xl border border-gray-800 w-fit mx-auto">
          {tabs.map((tab) => {
            const disabled =
              (tab.requiresWallet && !walletState.isConnected) ||
              (tab.requiresSelection && !selected);
            return (
              <button
                key={tab.id}
                onClick={() => !disabled && setActiveTab(tab.id)}
                disabled={disabled}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  activeTab === tab.id
                    ? "bg-teal-600 text-white shadow-sm"
                    : disabled
                    ? "text-gray-600 cursor-not-allowed"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Wallet prompt */}
        {!walletState.isConnected && activeTab !== "campaigns" && (
          <div className="text-center py-12 text-gray-500">
            <p className="mb-3">Connect your wallet to continue</p>
            <WalletConnect walletState={walletState} />
          </div>
        )}

        {/* Selected campaign info bar */}
        {selected && (
          <div className="mb-4 p-3 bg-teal-900/20 border border-teal-700/40 rounded-lg flex items-center justify-between text-sm max-w-2xl mx-auto">
            <span className="text-teal-300">
              Selected: <span className="font-mono">{selected.utxo.input.txHash.slice(0, 16)}...</span>
            </span>
            <button
              onClick={() => setSelected(null)}
              className="text-gray-500 hover:text-gray-300 text-xs"
            >
              Clear ×
            </button>
          </div>
        )}

        {/* Tab Content */}
        <div className="max-w-2xl mx-auto">
          {/* CAMPAIGNS */}
          {activeTab === "campaigns" && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">All Campaigns</h3>
                <button
                  onClick={() => setRefreshTrigger((n) => n + 1)}
                  className="text-sm text-gray-400 hover:text-teal-400 transition-colors"
                >
                  ↻ Refresh
                </button>
              </div>
              <CampaignList
                userPkh={walletState.pkh}
                onSelectCampaign={handleSelectCampaign}
                selectedUtxoId={
                  selected
                    ? `${selected.utxo.input.txHash}#${selected.utxo.input.outputIndex}`
                    : null
                }
                refreshTrigger={refreshTrigger}
              />
            </div>
          )}

          {/* CREATE */}
          {activeTab === "create" && walletState.wallet && (
            <div>
              <h3 className="text-lg font-semibold text-white mb-4">Create Campaign</h3>
              <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-6">
                <CreateCampaign wallet={walletState.wallet} onSuccess={handleTxSuccess} />
              </div>
            </div>
          )}

          {/* DONATE */}
          {activeTab === "donate" && walletState.wallet && selected && (
            <div>
              <h3 className="text-lg font-semibold text-white mb-4">Donate to Campaign</h3>
              <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-6">
                <DonateForm
                  wallet={walletState.wallet}
                  campaignUtxo={selected.utxo}
                  datum={selected.datum}
                  onSuccess={handleTxSuccess}
                />
              </div>
            </div>
          )}

          {/* WITHDRAW */}
          {activeTab === "withdraw" && walletState.wallet && walletState.pkh && selected && (
            <div>
              <h3 className="text-lg font-semibold text-white mb-4">Withdraw Funds</h3>
              <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-6">
                <WithdrawPanel
                  wallet={walletState.wallet}
                  walletPkh={walletState.pkh}
                  campaignUtxo={selected.utxo}
                  datum={selected.datum}
                  onSuccess={handleTxSuccess}
                />
              </div>
            </div>
          )}

          {/* RECLAIM */}
          {activeTab === "reclaim" && walletState.wallet && walletState.pkh && selected && (
            <div>
              <h3 className="text-lg font-semibold text-white mb-4">Reclaim Contribution</h3>
              <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-6">
                <ReclaimPanel
                  wallet={walletState.wallet}
                  walletPkh={walletState.pkh}
                  campaignUtxo={selected.utxo}
                  datum={selected.datum}
                  onSuccess={handleTxSuccess}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-800 mt-16 py-6 text-center text-white text-sm">
        <p>
          Built with{" "}
          <span className="text-teal-400">Aiken</span> +{" "}
          <span className="text-teal-400">MeshJS</span> on Cardano Preview Testnet with love &lt;3 from{" "}
          <span className="text-teal-400">Cardano2vn</span>
        </p>
      </footer>
    </main>
  );
}
