"use client";

import { useState, useEffect } from "react";
import { useNoirWire } from "../hooks/useNoirWire";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";

export function WithdrawForm() {
  const { publicKey } = useWallet();
  const { isConnected, noirWallet, error, withdraw, getBalance } = useNoirWire();

  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [balance, setBalance] = useState<bigint | null>(null);
  const [withdrawStatus, setWithdrawStatus] = useState<string>("");
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [balanceLoading, setBalanceLoading] = useState(false);

  // Load balance when wallet is connected
  useEffect(() => {
    if (noirWallet) {
      loadBalance();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noirWallet]);

  const loadBalance = async () => {
    setBalanceLoading(true);
    try {
      const bal = await getBalance();
      setBalance(bal);
    } catch (err) {
      console.error("Failed to load balance:", err);
    } finally {
      setBalanceLoading(false);
    }
  };

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!amount || parseFloat(amount) <= 0) {
      setWithdrawStatus("Please enter a valid amount");
      return;
    }

    if (!recipient) {
      setWithdrawStatus("Please enter a recipient address");
      return;
    }

    if (!noirWallet) {
      setWithdrawStatus("NoirWire wallet not loaded");
      return;
    }

    // Validate recipient address
    let recipientPubkey: PublicKey;
    try {
      recipientPubkey = new PublicKey(recipient);
    } catch {
      setWithdrawStatus("Invalid recipient address");
      return;
    }

    // Convert amount to lamports
    const amountLamports = BigInt(Math.floor(parseFloat(amount) * 1e9));

    // Check balance
    if (balance !== null && amountLamports > balance) {
      setWithdrawStatus("Insufficient balance");
      return;
    }

    setWithdrawLoading(true);
    setWithdrawStatus("Generating proof... (this may take 10-15 seconds)");

    try {
      const signature = await withdraw(amountLamports, recipientPubkey);
      setWithdrawStatus(`✅ Withdrawal successful! Tx: ${signature.substring(0, 16)}...`);
      setAmount("");
      setRecipient("");

      // Refresh balance
      await loadBalance();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setWithdrawStatus(`❌ Withdrawal failed: ${errorMessage}`);
    } finally {
      setWithdrawLoading(false);
    }
  };

  const fillMyAddress = () => {
    if (publicKey) {
      setRecipient(publicKey.toBase58());
    }
  };

  if (!isConnected) {
    return (
      <div className="card">
        <h2>Withdraw</h2>
        <p>Please connect your wallet to make withdrawals</p>
      </div>
    );
  }

  if (!noirWallet) {
    return (
      <div className="card">
        <h2>Withdraw (Unshield)</h2>
        <p>Please create a NoirWire wallet first to make withdrawals</p>
      </div>
    );
  }

  return (
    <div className="card">
      <h2>Withdraw (Unshield)</h2>

      <div className="balance-section">
        <div className="balance-info">
          <span className="balance-label">Private Balance:</span>
          {balanceLoading ? (
            <span className="balance-value">Loading...</span>
          ) : balance !== null ? (
            <span className="balance-value">{(Number(balance) / 1e9).toFixed(4)} SOL</span>
          ) : (
            <span className="balance-value">—</span>
          )}
        </div>
        <button onClick={loadBalance} disabled={balanceLoading} className="btn-secondary">
          Refresh
        </button>
      </div>

      <form onSubmit={handleWithdraw} className="form">
        <div className="form-group">
          <label htmlFor="withdraw-amount">Amount (SOL)</label>
          <input
            id="withdraw-amount"
            type="number"
            step="0.001"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.1"
            disabled={withdrawLoading}
            className="input"
          />
        </div>

        <div className="form-group">
          <label htmlFor="recipient">Recipient Address</label>
          <div className="input-with-button">
            <input
              id="recipient"
              type="text"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="Solana address"
              disabled={withdrawLoading}
              className="input"
            />
            <button
              type="button"
              onClick={fillMyAddress}
              className="btn-secondary small"
              disabled={withdrawLoading || !publicKey}
            >
              My Address
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={withdrawLoading || !amount || !recipient}
          className="btn-primary"
        >
          {withdrawLoading ? "Generating Proof..." : "Withdraw"}
        </button>
      </form>

      {withdrawStatus && (
        <div
          className={`status ${withdrawStatus.includes("✅") ? "success" : withdrawStatus.includes("❌") ? "error" : "info"}`}
        >
          {withdrawStatus}
        </div>
      )}

      {error && <div className="status error">{error}</div>}

      <style jsx>{`
        .card {
          background: #1a1a1a;
          border: 1px solid #333;
          border-radius: 12px;
          padding: 24px;
          margin-bottom: 24px;
        }

        h2 {
          margin: 0 0 16px 0;
          font-size: 24px;
          color: #fff;
        }

        .balance-section {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px;
          background: #252525;
          border-radius: 8px;
          margin-bottom: 16px;
        }

        .balance-info {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .balance-label {
          font-size: 14px;
          color: #aaa;
        }

        .balance-value {
          font-size: 24px;
          font-weight: 700;
          color: #fff;
        }

        .form {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        label {
          font-size: 14px;
          font-weight: 500;
          color: #ddd;
        }

        .input-with-button {
          display: flex;
          gap: 8px;
        }

        .input {
          flex: 1;
          padding: 12px;
          border: 1px solid #333;
          border-radius: 8px;
          background: #252525;
          color: #fff;
          font-size: 16px;
        }

        .input:focus {
          outline: none;
          border-color: #512da8;
        }

        .btn-primary {
          padding: 12px 24px;
          background: #512da8;
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s;
        }

        .btn-primary:hover:not(:disabled) {
          background: #6a3cc7;
        }

        .btn-primary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .btn-secondary {
          padding: 8px 16px;
          background: #333;
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.2s;
        }

        .btn-secondary:hover:not(:disabled) {
          background: #444;
        }

        .btn-secondary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .btn-secondary.small {
          padding: 8px 12px;
          font-size: 13px;
        }

        .status {
          margin-top: 16px;
          padding: 12px;
          border-radius: 8px;
          font-size: 14px;
        }

        .status.success {
          background: #1a4d2e;
          color: #4ade80;
        }

        .status.error {
          background: #4d1a1a;
          color: #f87171;
        }

        .status.info {
          background: #1a3a4d;
          color: #60a5fa;
        }
      `}</style>
    </div>
  );
}
