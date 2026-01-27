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
      setWithdrawStatus(`Withdrawal successful! Tx: ${signature.substring(0, 16)}...`);
      setAmount("");
      setRecipient("");

      // Refresh balance
      await loadBalance();
      setTimeout(() => setWithdrawStatus(""), 8000);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setWithdrawStatus(`Withdrawal failed: ${errorMessage}`);
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
        <div className="card-header">
          <h2 className="card-title">
            <span aria-hidden="true">🔓</span> Withdraw
          </h2>
        </div>
        <div className="card-content">
          <div className="alert alert-info">
            <svg
              className="alert-icon"
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                clipRule="evenodd"
              />
            </svg>
            <span>Please connect your wallet to make withdrawals</span>
          </div>
        </div>
      </div>
    );
  }

  if (!noirWallet) {
    return (
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">
            <span aria-hidden="true">🔓</span> Withdraw (Unshield)
          </h2>
        </div>
        <div className="card-content">
          <div className="alert alert-warning">
            <svg
              className="alert-icon"
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            <span>Please create a NoirWire wallet first to make withdrawals</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">
          <span aria-hidden="true">🔓</span> Withdraw (Unshield)
        </h2>
        <p className="card-subtitle">Move funds from your private balance</p>
      </div>

      <div className="card-content">
        <div className="balance-display">
          <div className="balance-info">
            <div className="balance-label">Private Balance</div>
            <div className="balance-value">
              {balanceLoading ? (
                <span className="loading-spinner" />
              ) : balance !== null ? (
                <>{(Number(balance) / 1e9).toFixed(4)} SOL</>
              ) : (
                "—"
              )}
            </div>
          </div>
          <button
            onClick={loadBalance}
            disabled={balanceLoading}
            className="btn btn-icon btn-secondary"
            aria-label="Refresh balance"
            title="Refresh balance"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="currentColor"
              className={balanceLoading ? "animate-spin" : ""}
            >
              <path
                fillRule="evenodd"
                d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>

        <form onSubmit={handleWithdraw} className="form">
          <div className="form-group">
            <label htmlFor="withdraw-amount" className="form-label">
              Amount (SOL)
            </label>
            <input
              id="withdraw-amount"
              type="number"
              step="0.001"
              min="0"
              max={balance !== null ? (Number(balance) / 1e9).toString() : undefined}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.1"
              disabled={withdrawLoading}
              className="input"
              aria-describedby="withdraw-hint"
            />
            <span id="withdraw-hint" className="form-hint">
              Available: {balance !== null ? (Number(balance) / 1e9).toFixed(4) : "0"} SOL
            </span>
          </div>

          <div className="form-group">
            <label htmlFor="recipient" className="form-label">
              Recipient Address
            </label>
            <div className="input-group">
              <input
                id="recipient"
                type="text"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="Solana address"
                disabled={withdrawLoading}
                className="input input-group-input"
              />
              <button
                type="button"
                onClick={fillMyAddress}
                className="btn btn-sm btn-secondary"
                disabled={withdrawLoading || !publicKey}
                title="Use my wallet address"
              >
                My Address
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={withdrawLoading || !amount || !recipient}
            className="btn btn-base btn-primary"
          >
            {withdrawLoading ? (
              <>
                <span className="loading-spinner" />
                Generating Proof...
              </>
            ) : (
              <>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M10 2a5 5 0 00-5 5v2a2 2 0 00-2 2v5a2 2 0 002 2h10a2 2 0 002-2v-5a2 2 0 00-2-2H7V7a3 3 0 015.905-.75 1 1 0 001.937-.5A5.002 5.002 0 0010 2z" />
                </svg>
                Withdraw & Unshield
              </>
            )}
          </button>
        </form>

        {withdrawStatus && (
          <div
            className={`alert ${
              withdrawStatus.includes("successful")
                ? "alert-success"
                : withdrawStatus.includes("failed") || withdrawStatus.includes("Invalid")
                  ? "alert-danger"
                  : "alert-info"
            }`}
          >
            <svg
              className="alert-icon"
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              {withdrawStatus.includes("successful") ? (
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              ) : withdrawStatus.includes("failed") || withdrawStatus.includes("Invalid") ? (
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              ) : (
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                  clipRule="evenodd"
                />
              )}
            </svg>
            <span>{withdrawStatus}</span>
          </div>
        )}

        {error && (
          <div className="alert alert-danger">
            <svg
              className="alert-icon"
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
            <span>{error}</span>
          </div>
        )}
      </div>

      <style jsx>{`
        .balance-display {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--space-6);
          background: linear-gradient(
            135deg,
            var(--color-primary-900) 0%,
            var(--color-secondary-900) 100%
          );
          border-radius: var(--radius-lg);
          border: 1px solid var(--color-primary-700);
          margin-bottom: var(--space-4);
        }

        @media (prefers-color-scheme: light) {
          .balance-display {
            background: linear-gradient(
              135deg,
              var(--color-primary-50) 0%,
              var(--color-secondary-50) 100%
            );
            border-color: var(--color-primary-200);
          }
        }

        .balance-info {
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }

        .balance-label {
          font-size: var(--font-size-sm);
          font-weight: var(--font-weight-medium);
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .balance-value {
          font-size: var(--font-size-3xl);
          font-weight: var(--font-weight-bold);
          color: var(--text-primary);
          display: flex;
          align-items: center;
          gap: var(--space-2);
        }

        .input-group {
          display: flex;
          gap: var(--space-2);
          align-items: stretch;
        }

        .input-group-input {
          flex: 1;
        }

        .alert-icon {
          flex-shrink: 0;
          width: 20px;
          height: 20px;
        }

        svg {
          flex-shrink: 0;
        }
      `}</style>
    </div>
  );
}
