"use client";

import { useState, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { getTransactionsByPool } from "@noirwire/db";

interface Transaction {
  id: string;
  signature: string;
  type: string;
  status: string;
  amount?: bigint;
  createdAt: Date;
}

export function TransactionHistory() {
  const { publicKey } = useWallet();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get pool address from environment
  const poolAddress = process.env.NEXT_PUBLIC_SHIELDED_POOL_PROGRAM || "";

  useEffect(() => {
    if (publicKey && poolAddress) {
      loadTransactions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicKey, poolAddress]);

  const loadTransactions = async () => {
    if (!poolAddress) return;

    setLoading(true);
    setError(null);

    try {
      const txs = await getTransactionsByPool(poolAddress);
      setTransactions(txs);
    } catch (err) {
      console.error("Failed to load transactions:", err);
      setError("Failed to load transaction history");
    } finally {
      setLoading(false);
    }
  };

  const formatAmount = (amount?: bigint) => {
    if (!amount) return "—";
    return `${(Number(amount) / 1e9).toFixed(4)} SOL`;
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatSignature = (sig: string) => {
    return `${sig.substring(0, 8)}...${sig.substring(sig.length - 8)}`;
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "deposit":
        return (
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
              clipRule="evenodd"
            />
          </svg>
        );
      case "withdraw":
        return (
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <path d="M10 2a5 5 0 00-5 5v2a2 2 0 00-2 2v5a2 2 0 002 2h10a2 2 0 002-2v-5a2 2 0 00-2-2H7V7a3 3 0 015.905-.75 1 1 0 001.937-.5A5.002 5.002 0 0010 2z" />
          </svg>
        );
      case "transfer":
        return (
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <path d="M8 5a1 1 0 100 2h5.586l-1.293 1.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L13.586 5H8zM12 15a1 1 0 100-2H6.414l1.293-1.293a1 1 0 10-1.414-1.414l-3 3a1 1 0 000 1.414l3 3a1 1 0 001.414-1.414L6.414 15H12z" />
          </svg>
        );
      default:
        return null;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "deposit":
        return "Deposit";
      case "withdraw":
        return "Withdraw";
      case "transfer":
        return "Transfer";
      default:
        return type;
    }
  };

  if (!publicKey) {
    return (
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">
            <span aria-hidden="true">📜</span> Transaction History
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
            <span>Please connect your wallet to view transaction history</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">
          <span aria-hidden="true">📜</span> Transaction History
        </h2>
        <button
          onClick={loadTransactions}
          disabled={loading}
          className="btn btn-sm btn-secondary"
          aria-label="Refresh transactions"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 20 20"
            fill="currentColor"
            className={loading ? "animate-spin" : ""}
          >
            <path
              fillRule="evenodd"
              d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z"
              clipRule="evenodd"
            />
          </svg>
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      <div className="card-content">
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

        {loading && transactions.length === 0 ? (
          <div className="empty-state">
            <span className="loading-spinner" style={{ width: 40, height: 40 }} />
            <p>Loading transactions...</p>
          </div>
        ) : transactions.length === 0 ? (
          <div className="empty-state">
            <svg width="48" height="48" viewBox="0 0 20 20" fill="currentColor" opacity="0.3">
              <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
              <path
                fillRule="evenodd"
                d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z"
                clipRule="evenodd"
              />
            </svg>
            <p>No transactions yet</p>
            <span className="empty-hint">Your transaction history will appear here</span>
          </div>
        ) : (
          <div className="transactions">
            {transactions.map((tx) => (
              <div key={tx.id} className="transaction">
                <div className="tx-header">
                  <div className="tx-type">
                    <span className="tx-icon">{getTypeIcon(tx.type)}</span>
                    <span className="tx-type-label">{getTypeLabel(tx.type)}</span>
                  </div>
                  <span
                    className={`badge badge-${tx.status === "confirmed" ? "success" : tx.status === "pending" ? "warning" : "danger"}`}
                  >
                    {tx.status}
                  </span>
                </div>
                <div className="tx-details">
                  <div className="tx-row">
                    <span className="tx-label">Amount</span>
                    <span className="tx-value tx-amount">{formatAmount(tx.amount)}</span>
                  </div>
                  <div className="tx-row">
                    <span className="tx-label">Signature</span>
                    <a
                      href={`https://explorer.solana.com/tx/${tx.signature}?cluster=devnet`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="tx-link"
                    >
                      {formatSignature(tx.signature)}
                      <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                        <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
                      </svg>
                    </a>
                  </div>
                  <div className="tx-row">
                    <span className="tx-label">Date</span>
                    <span className="tx-value">{formatDate(tx.createdAt)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <style jsx>{`
        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: var(--space-12) var(--space-4);
          text-align: center;
          color: var(--text-tertiary);
          gap: var(--space-3);
        }

        .empty-state p {
          margin: 0;
          color: var(--text-secondary);
          font-size: var(--font-size-base);
          font-weight: var(--font-weight-medium);
        }

        .empty-hint {
          font-size: var(--font-size-sm);
          color: var(--text-tertiary);
        }

        .transactions {
          display: flex;
          flex-direction: column;
          gap: var(--space-3);
        }

        .transaction {
          background: var(--bg-tertiary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
          padding: var(--space-4);
          transition: all var(--duration-base) var(--ease-in-out);
        }

        .transaction:hover {
          border-color: var(--color-primary-400);
          transform: translateX(2px);
        }

        @media (prefers-color-scheme: dark) {
          .transaction:hover {
            border-color: var(--color-primary-600);
          }
        }

        .tx-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: var(--space-3);
        }

        .tx-type {
          display: flex;
          align-items: center;
          gap: var(--space-2);
        }

        .tx-icon {
          display: flex;
          align-items: center;
          color: var(--color-primary-500);
        }

        .tx-type-label {
          font-size: var(--font-size-base);
          font-weight: var(--font-weight-semibold);
          color: var(--text-primary);
        }

        .tx-details {
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }

        .tx-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: var(--font-size-sm);
          gap: var(--space-4);
        }

        .tx-label {
          color: var(--text-tertiary);
          font-weight: var(--font-weight-medium);
        }

        .tx-value {
          color: var(--text-primary);
          text-align: right;
        }

        .tx-amount {
          font-weight: var(--font-weight-semibold);
          font-family: var(--font-family-mono);
        }

        .tx-link {
          display: flex;
          align-items: center;
          gap: var(--space-1);
          color: var(--color-info-600);
          text-decoration: none;
          font-family: var(--font-family-mono);
          font-size: var(--font-size-xs);
          transition: color var(--duration-base) var(--ease-in-out);
        }

        .tx-link:hover {
          color: var(--color-info-700);
          text-decoration: underline;
        }

        .tx-link svg {
          flex-shrink: 0;
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
