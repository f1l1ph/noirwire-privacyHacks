"use client";

import { useState, useEffect } from "react";
import { useNoirWire } from "../hooks/useNoirWire";

export function DepositForm() {
  const { isConnected, noirWallet, isLoading, error, createWallet, loadWallet, deposit } =
    useNoirWire();

  const [amount, setAmount] = useState("");
  const [depositStatus, setDepositStatus] = useState<string>("");
  const [depositLoading, setDepositLoading] = useState(false);

  // Load wallet on mount
  useEffect(() => {
    if (isConnected) {
      loadWallet();
    }
  }, [isConnected, loadWallet]);

  const handleCreateWallet = async () => {
    try {
      await createWallet();
      setDepositStatus("NoirWire wallet created successfully!");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setDepositStatus(`Failed to create wallet: ${errorMessage}`);
    }
  };

  const handleDeposit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!amount || parseFloat(amount) <= 0) {
      setDepositStatus("Please enter a valid amount");
      return;
    }

    if (!noirWallet) {
      setDepositStatus("Please create a NoirWire wallet first");
      return;
    }

    setDepositLoading(true);
    setDepositStatus("Generating proof... (this may take 10-15 seconds)");

    try {
      // Convert amount to lamports (assuming SOL, 9 decimals)
      const amountLamports = BigInt(Math.floor(parseFloat(amount) * 1e9));

      const signature = await deposit(amountLamports);
      setDepositStatus(`✅ Deposit successful! Tx: ${signature.substring(0, 16)}...`);
      setAmount("");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setDepositStatus(`❌ Deposit failed: ${errorMessage}`);
    } finally {
      setDepositLoading(false);
    }
  };

  if (!isConnected) {
    return (
      <div className="card">
        <h2>Deposit</h2>
        <p>Please connect your wallet to make deposits</p>
      </div>
    );
  }

  return (
    <div className="card">
      <h2>Deposit (Shield)</h2>

      {!noirWallet ? (
        <div className="wallet-setup">
          <p>You need a NoirWire wallet to make private deposits</p>
          <button onClick={handleCreateWallet} disabled={isLoading} className="btn-primary">
            {isLoading ? "Creating..." : "Create NoirWire Wallet"}
          </button>
        </div>
      ) : (
        <>
          <div className="wallet-info">
            <p>NoirWire Wallet: {noirWallet.getPublicKeyHex().substring(0, 16)}...</p>
          </div>

          <form onSubmit={handleDeposit} className="form">
            <div className="form-group">
              <label htmlFor="deposit-amount">Amount (SOL)</label>
              <input
                id="deposit-amount"
                type="number"
                step="0.001"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.1"
                disabled={depositLoading}
                className="input"
              />
            </div>

            <button type="submit" disabled={depositLoading || !amount} className="btn-primary">
              {depositLoading ? "Generating Proof..." : "Deposit"}
            </button>
          </form>

          {depositStatus && (
            <div
              className={`status ${depositStatus.includes("✅") ? "success" : depositStatus.includes("❌") ? "error" : "info"}`}
            >
              {depositStatus}
            </div>
          )}

          {error && <div className="status error">{error}</div>}
        </>
      )}

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

        .wallet-setup {
          text-align: center;
          padding: 24px 0;
        }

        .wallet-setup p {
          margin-bottom: 16px;
          color: #aaa;
        }

        .wallet-info {
          padding: 12px;
          background: #252525;
          border-radius: 8px;
          margin-bottom: 16px;
        }

        .wallet-info p {
          margin: 0;
          font-size: 14px;
          color: #aaa;
          font-family: monospace;
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

        .input {
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
