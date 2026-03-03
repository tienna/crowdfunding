"use client";

import { useState, useRef, useEffect } from "react";
import type { WalletState } from "../hooks/useWallet";

interface Props {
  walletState: WalletState;
}

export default function WalletConnect({ walletState }: Props) {
  const { isConnected, isConnecting, address, error, connect, disconnect } = walletState;
  const [open, setOpen] = useState(false);
  const [wallets, setWallets] = useState<{ id: string; name: string; icon?: string }[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Detect installed wallets only when dropdown is opened (extensions may not be injected at mount)
  async function openPicker() {
    const { BrowserWallet } = await import("@meshsdk/wallet");
    const installed = BrowserWallet.getInstalledWallets();
    setWallets(installed.map((w: any) => ({ id: w.id, name: w.name, icon: w.icon })));
    setOpen(true);
  }

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  async function handleSelect(id: string) {
    setOpen(false);
    await connect(id);
  }

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 bg-green-900/30 border border-green-500/40 rounded-lg px-4 py-2">
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-sm text-green-300 font-mono">
            {address.slice(0, 14)}...{address.slice(-6)}
          </span>
        </div>
        <button
          onClick={disconnect}
          className="px-3 py-2 text-sm text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 rounded-lg transition-colors"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col items-end gap-1" ref={dropdownRef}>
      <button
        onClick={openPicker}
        disabled={isConnecting}
        className="px-4 py-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
      >
        {isConnecting ? "Connecting..." : "Connect Wallet"}
      </button>

      {open && (
        <div className="absolute top-full mt-2 right-0 z-50 min-w-[180px] bg-gray-900 border border-gray-700 rounded-xl shadow-xl overflow-hidden">
          {wallets.length === 0 ? (
            <div className="px-4 py-3 text-sm text-gray-400">
              No wallet extension found.
              <br />
              <span className="text-xs text-gray-500">Install Eternl or Nami.</span>
            </div>
          ) : (
            wallets.map((w) => (
              <button
                key={w.id}
                onClick={() => handleSelect(w.id)}
                className="flex items-center gap-3 w-full px-4 py-3 text-sm text-gray-200 hover:bg-gray-800 transition-colors text-left"
              >
                {w.icon && (
                  <img src={w.icon} alt={w.name} className="w-5 h-5 rounded" />
                )}
                {w.name}
              </button>
            ))
          )}
        </div>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
