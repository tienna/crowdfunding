"use client";

import { useState, useCallback } from "react";
import type { BrowserWallet } from "@meshsdk/wallet";

export interface WalletState {
  wallet: BrowserWallet | null;
  address: string | null;
  pkh: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  connect: (walletName: string) => Promise<void>;
  disconnect: () => void;
}

export function useWallet(): WalletState {
  const [wallet, setWallet] = useState<BrowserWallet | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [pkh, setPkh] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async (walletName: string) => {
    setIsConnecting(true);
    setError(null);
    try {
      const { BrowserWallet } = await import("@meshsdk/wallet");
      const { resolvePaymentKeyHash } = await import("@meshsdk/core-cst");
      const w = await BrowserWallet.enable(walletName);
      const addr = await w.getChangeAddress();
      const keyHash = resolvePaymentKeyHash(addr);
      setWallet(w);
      setAddress(addr);
      setPkh(keyHash);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect wallet");
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setWallet(null);
    setAddress(null);
    setPkh(null);
    setError(null);
  }, []);

  return {
    wallet,
    address,
    pkh,
    isConnected: !!wallet,
    isConnecting,
    error,
    connect,
    disconnect,
  };
}
