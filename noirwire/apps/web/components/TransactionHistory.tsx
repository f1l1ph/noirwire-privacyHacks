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
    return new Date(date).toLocaleString();
  };

  const formatSignature = (sig: string) => {
    return `${sig.substring(0, 8)}...${sig.substring(sig.length - 8)}`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "confirmed":
        return "#4ade80";
      case "pending":
        return "#60a5fa";
      case "failed":
        return "#f87171";
      default:
        return "#aaa";
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "deposit":
        return "🔒 Deposit";
      case "withdraw":
        return "🔓 Withdraw";
      case "transfer":
        return "↔️ Transfer";
      default:
        return type;
    }
  };

  if (!publicKey) {
    return (
      <div className="card">
        <h2>Transaction History</h2>
        <p>Please connect your wallet to view transaction history</p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="header">
        <h2>Transaction History</h2>
        <button onClick={loadTransactions} disabled={loading} className="btn-secondary">
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      {loading && transactions.length === 0 ? (
        <div className="loading">Loading transactions...</div>
      ) : transactions.length === 0 ? (
        <div className="empty">No transactions yet</div>
      ) : (
        <div className="transactions">
          {transactions.map((tx) => (
            <div key={tx.id} className="transaction">
              <div className="tx-header">
                <span className="tx-type">{getTypeLabel(tx.type)}</span>
                <span className="tx-status" style={{ color: getStatusColor(tx.status) }}>
                  {tx.status}
                </span>
              </div>
              <div className="tx-details">
                <div className="tx-row">
                  <span className="label">Amount:</span>
                  <span className="value">{formatAmount(tx.amount)}</span>
                </div>
                <div className="tx-row">
                  <span className="label">Signature:</span>
                  <a
                    href={`https://explorer.solana.com/tx/${tx.signature}?cluster=devnet`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="tx-link"
                  >
                    {formatSignature(tx.signature)}
                  </a>
                </div>
                <div className="tx-row">
                  <span className="label">Date:</span>
                  <span className="value">{formatDate(tx.createdAt)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <style jsx>{`
        .card {
          background: #1a1a1a;
          border: 1px solid #333;
          border-radius: 12px;
          padding: 24px;
          margin-bottom: 24px;
        }

        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 16px;
        }

        h2 {
          margin: 0;
          font-size: 24px;
          color: #fff;
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

        .loading,
        .empty,
        .error {
          text-align: center;
          padding: 32px;
          color: #aaa;
        }

        .error {
          color: #f87171;
        }

        .transactions {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .transaction {
          background: #252525;
          border: 1px solid #333;
          border-radius: 8px;
          padding: 16px;
          transition: border-color 0.2s;
        }

        .transaction:hover {
          border-color: #444;
        }

        .tx-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 12px;
        }

        .tx-type {
          font-size: 16px;
          font-weight: 600;
          color: #fff;
        }

        .tx-status {
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
        }

        .tx-details {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .tx-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 14px;
        }

        .label {
          color: #aaa;
        }

        .value {
          color: #fff;
        }

        .tx-link {
          color: #60a5fa;
          text-decoration: none;
          font-family: monospace;
        }

        .tx-link:hover {
          text-decoration: underline;
        }
      `}</style>
    </div>
  );
}
