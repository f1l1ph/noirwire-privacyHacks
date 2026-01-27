"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useMemo, useState, useCallback } from "react";
import { NoirWireClient, NoirWireWallet, type NoirWireClientConfig } from "@noirwire/sdk";
import { PublicKey } from "@solana/web3.js";

export function useNoirWire() {
  const { publicKey } = useWallet();
  const [noirWallet, setNoirWallet] = useState<NoirWireWallet | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get token mint from environment
  const tokenMint = useMemo(() => {
    const mintAddress = process.env.NEXT_PUBLIC_TOKEN_MINT || process.env.NEXT_PUBLIC_USDC_MINT;
    if (!mintAddress) {
      console.warn("No token mint configured, using SOL native mint");
      return new PublicKey("So11111111111111111111111111111111111111112"); // Native SOL
    }
    return new PublicKey(mintAddress);
  }, []);

  // Get verification key from environment
  const verificationKey = useMemo(() => {
    const vkAddress = process.env.NEXT_PUBLIC_VERIFICATION_KEY;
    if (!vkAddress) {
      throw new Error("NEXT_PUBLIC_VERIFICATION_KEY environment variable is required");
    }
    return new PublicKey(vkAddress);
  }, []);

  // Initialize NoirWire client
  const client = useMemo(() => {
    if (!publicKey) return null;

    const config: NoirWireClientConfig = {
      network: "devnet",
      rpcUrl: process.env.NEXT_PUBLIC_SOLANA_RPC,
      tokenMint,
      verificationKey,
      vaultId: 0n, // Default to solo mode
    };

    return new NoirWireClient(config);
  }, [publicKey, tokenMint, verificationKey]);

  // Create a new NoirWire wallet
  const createWallet = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const newWallet = NoirWireWallet.generate({ network: "devnet" });
      setNoirWallet(newWallet);

      // Save to localStorage
      if (typeof window !== "undefined") {
        localStorage.setItem(
          "noirwire_wallet_secret",
          Buffer.from(newWallet.exportSecretKey()).toString("hex"),
        );
      }

      return newWallet;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to create wallet";
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load NoirWire wallet from localStorage
  const loadWallet = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (typeof window === "undefined") return null;

      const secretHex = localStorage.getItem("noirwire_wallet_secret");
      if (!secretHex) {
        return null;
      }

      const secretKey = new Uint8Array(Buffer.from(secretHex, "hex"));
      const wallet = NoirWireWallet.fromSecretKey(secretKey, { network: "devnet" });
      setNoirWallet(wallet);

      return wallet;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to load wallet";
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Delete NoirWire wallet
  const deleteWallet = useCallback(() => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("noirwire_wallet_secret");
    }
    setNoirWallet(null);
  }, []);

  // Make a deposit
  const deposit = useCallback(
    async (amount: bigint) => {
      if (!client) throw new Error("Client not initialized");
      if (!noirWallet) throw new Error("NoirWire wallet not loaded");

      setIsLoading(true);
      setError(null);
      try {
        await client.connect(noirWallet);
        const signature = await client.deposit(amount);
        return signature;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Deposit failed";
        setError(errorMessage);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [client, noirWallet],
  );

  // Make a withdrawal
  const withdraw = useCallback(
    async (amount: bigint, recipient: PublicKey) => {
      if (!client) throw new Error("Client not initialized");
      if (!noirWallet) throw new Error("NoirWire wallet not loaded");

      setIsLoading(true);
      setError(null);
      try {
        await client.connect(noirWallet);
        const signature = await client.withdraw(amount, recipient);
        return signature;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Withdrawal failed";
        setError(errorMessage);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [client, noirWallet],
  );

  // Get balance
  const getBalance = useCallback(async () => {
    if (!client) throw new Error("Client not initialized");
    if (!noirWallet) throw new Error("NoirWire wallet not loaded");

    try {
      await client.connect(noirWallet);
      return client.getBalance();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to get balance";
      setError(errorMessage);
      return 0n;
    }
  }, [client, noirWallet]);

  return {
    client,
    noirWallet,
    isConnected: !!publicKey,
    isLoading,
    error,
    createWallet,
    loadWallet,
    deleteWallet,
    deposit,
    withdraw,
    getBalance,
  };
}
