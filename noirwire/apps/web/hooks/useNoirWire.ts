"use client";

import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { useMemo, useState, useCallback, useEffect } from "react";
import { PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import type { NoirWireClient, NoirWireWallet, NoirWireClientConfig } from "@noirwire/sdk";

export function useNoirWire() {
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const [noirWallet, setNoirWallet] = useState<NoirWireWallet | null>(null);
  const [noirWalletBalance, setNoirWalletBalance] = useState<number>(0);
  const [phantomBalance, setPhantomBalance] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [client, setClient] = useState<NoirWireClient | null>(null);

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

  // Dynamically initialize NoirWire client (client-side only)
  useEffect(() => {
    if (!publicKey || typeof window === "undefined") return;

    let cancelled = false;

    (async () => {
      try {
        const { NoirWireClient: ClientClass } = await import("@noirwire/sdk");

        if (cancelled) return;

        const config: NoirWireClientConfig = {
          network: "devnet",
          rpcUrl: process.env.NEXT_PUBLIC_SOLANA_RPC,
          tokenMint,
          verificationKey,
          vaultId: 0n, // Default to solo mode
        };

        setClient(new ClientClass(config));
      } catch (err) {
        console.error("Failed to initialize NoirWire client:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [publicKey, tokenMint, verificationKey]);

  // Create a new NoirWire wallet
  const createWallet = useCallback(async () => {
    if (typeof window === "undefined") return;

    setIsLoading(true);
    setError(null);
    try {
      const { NoirWireWallet: WalletClass } = await import("@noirwire/sdk");
      const newWallet = WalletClass.generate({ network: "devnet" });
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
    if (typeof window === "undefined") return null;

    setIsLoading(true);
    setError(null);
    try {
      const secretHex = localStorage.getItem("noirwire_wallet_secret");
      if (!secretHex) {
        return null;
      }

      const { NoirWireWallet: WalletClass } = await import("@noirwire/sdk");
      const secretKey = new Uint8Array(Buffer.from(secretHex, "hex"));
      const wallet = WalletClass.fromSecretKey(secretKey, { network: "devnet" });
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
    setNoirWalletBalance(0);
  }, []);

  // Refresh Phantom (browser) wallet SOL balance
  const refreshPhantomBalance = useCallback(async () => {
    if (!publicKey || !connection) {
      return 0;
    }
    try {
      const balance = await connection.getBalance(publicKey);
      const solBalance = balance / LAMPORTS_PER_SOL;
      console.log("Phantom wallet balance:", solBalance, "SOL", "address:", publicKey.toBase58());
      setPhantomBalance(solBalance);
      return solBalance;
    } catch (err) {
      console.error("Failed to fetch Phantom balance:", err);
      return 0;
    }
  }, [publicKey, connection]);

  // Refresh NoirWire wallet SOL balance
  const refreshWalletBalance = useCallback(async () => {
    if (!noirWallet || !connection) {
      console.log("refreshWalletBalance: wallet or connection not ready", {
        noirWallet: !!noirWallet,
        connection: !!connection,
      });
      return 0;
    }
    try {
      const pubkey = noirWallet.getSolanaPublicKey();
      console.log("Fetching balance for NoirWire wallet:", pubkey.toBase58());
      const balance = await connection.getBalance(pubkey);
      const solBalance = balance / LAMPORTS_PER_SOL;
      console.log("NoirWire wallet balance:", solBalance, "SOL");
      setNoirWalletBalance(solBalance);
      return solBalance;
    } catch (err) {
      console.error("Failed to fetch wallet balance:", err);
      return 0;
    }
  }, [noirWallet, connection]);

  // Auto-refresh Phantom balance when connected
  useEffect(() => {
    if (publicKey && connection) {
      refreshPhantomBalance();
    }
  }, [publicKey, connection, refreshPhantomBalance]);

  // Auto-refresh NoirWire balance when wallet changes
  useEffect(() => {
    if (noirWallet) {
      refreshWalletBalance();
    }
  }, [noirWallet, refreshWalletBalance]);

  // Fund the NoirWire wallet from the connected browser wallet
  const fundWallet = useCallback(
    async (amountSol: number) => {
      if (!publicKey || !noirWallet || !sendTransaction || !connection) {
        throw new Error("Wallet not connected or NoirWire wallet not created");
      }

      setIsLoading(true);
      setError(null);
      try {
        const lamports = Math.floor(amountSol * LAMPORTS_PER_SOL);
        const noirWalletPubkey = noirWallet.getSolanaPublicKey();

        const transaction = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: publicKey,
            toPubkey: noirWalletPubkey,
            lamports,
          }),
        );

        const signature = await sendTransaction(transaction, connection);
        await connection.confirmTransaction(signature, "confirmed");

        // Refresh balance after funding
        await refreshWalletBalance();

        return signature;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Failed to fund wallet";
        setError(errorMessage);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [publicKey, noirWallet, sendTransaction, connection, refreshWalletBalance],
  );

  // Make a deposit using Phantom wallet for signing and fee payment
  const deposit = useCallback(
    async (amount: bigint) => {
      if (!client) throw new Error("Client not initialized");
      if (!noirWallet) throw new Error("NoirWire wallet not loaded");
      if (!publicKey) throw new Error("Wallet not connected");
      if (!sendTransaction) throw new Error("sendTransaction not available");

      setIsLoading(true);
      setError(null);
      try {
        // Connect the NoirWire wallet (for ZK proof generation)
        await client.connect(noirWallet);

        // Prepare the deposit transaction (Phantom will sign)
        console.log("[useNoirWire] Preparing deposit with Phantom as payer:", publicKey.toBase58());
        const { transaction, commitmentData } = await client.prepareDeposit(amount, publicKey);

        // Send transaction using Phantom wallet
        console.log("[useNoirWire] Sending transaction via Phantom...");
        const signature = await sendTransaction(transaction, connection);

        // Wait for confirmation
        console.log("[useNoirWire] Waiting for confirmation...");
        await connection.confirmTransaction(signature, "confirmed");

        // Record the deposit in local state
        await client.recordDeposit(commitmentData, signature);

        console.log("[useNoirWire] Deposit successful:", signature);
        return signature;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Deposit failed";
        setError(errorMessage);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [client, noirWallet, publicKey, sendTransaction, connection],
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
    noirWalletBalance,
    phantomBalance,
    isConnected: !!publicKey,
    isLoading,
    error,
    createWallet,
    loadWallet,
    deleteWallet,
    fundWallet,
    refreshWalletBalance,
    refreshPhantomBalance,
    deposit,
    withdraw,
    getBalance,
  };
}
