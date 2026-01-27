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
      setTimeout(() => setDepositStatus(""), 5000);
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
      setDepositStatus(`Deposit successful! Tx: ${signature.substring(0, 16)}...`);
      setAmount("");
      setTimeout(() => setDepositStatus(""), 8000);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setDepositStatus(`Deposit failed: ${errorMessage}`);
    } finally {
      setDepositLoading(false);
    }
  };

  if (!isConnected) {
    return (
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">
            <span aria-hidden="true">🔒</span> Deposit
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
            <span>Please connect your wallet to make deposits</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">
          <span aria-hidden="true">🔒</span> Deposit (Shield)
        </h2>
        <p className="card-subtitle">Add funds to your private balance</p>
      </div>

      <div className="card-content">
        {!noirWallet ? (
          <div className="wallet-setup">
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
              <div>
                <div className="alert-title">NoirWire Wallet Required</div>
                <div className="alert-message">
                  Create a private wallet to enable shielded deposits and withdrawals
                </div>
              </div>
            </div>
            <button
              onClick={handleCreateWallet}
              disabled={isLoading}
              className="btn btn-base btn-primary"
            >
              {isLoading ? (
                <>
                  <span className="loading-spinner" />
                  Creating...
                </>
              ) : (
                "Create NoirWire Wallet"
              )}
            </button>
          </div>
        ) : (
          <>
            <div className="wallet-info">
              <div className="wallet-info-label">NoirWire Wallet</div>
              <div className="wallet-info-value tx-hash">
                {noirWallet.getPublicKeyHex().substring(0, 32)}...
              </div>
            </div>

            <form onSubmit={handleDeposit} className="form">
              <div className="form-group">
                <label htmlFor="deposit-amount" className="form-label">
                  Amount (SOL)
                </label>
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
                  aria-describedby="deposit-hint"
                />
                <span id="deposit-hint" className="form-hint">
                  Minimum deposit: 0.001 SOL
                </span>
              </div>

              <button
                type="submit"
                disabled={depositLoading || !amount}
                className="btn btn-base btn-primary"
              >
                {depositLoading ? (
                  <>
                    <span className="loading-spinner" />
                    Generating Proof...
                  </>
                ) : (
                  <>
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                      <path
                        fillRule="evenodd"
                        d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                    Deposit & Shield
                  </>
                )}
              </button>
            </form>

            {depositStatus && (
              <div
                className={`alert ${
                  depositStatus.includes("successful")
                    ? "alert-success"
                    : depositStatus.includes("failed")
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
                  {depositStatus.includes("successful") ? (
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  ) : depositStatus.includes("failed") ? (
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
                <span>{depositStatus}</span>
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
          </>
        )}
      </div>

      <style jsx>{`
        .wallet-setup {
          display: flex;
          flex-direction: column;
          gap: var(--space-4);
        }

        .wallet-info {
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
          padding: var(--space-4);
          background: var(--bg-tertiary);
          border-radius: var(--radius-md);
          border: 1px solid var(--border-color);
        }

        .wallet-info-label {
          font-size: var(--font-size-xs);
          font-weight: var(--font-weight-medium);
          color: var(--text-tertiary);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .wallet-info-value {
          font-size: var(--font-size-sm);
          color: var(--text-primary);
          word-break: break-all;
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
