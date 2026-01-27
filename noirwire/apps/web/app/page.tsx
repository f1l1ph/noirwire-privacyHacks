"use client";

import { WalletButton } from "../components/WalletButton";
import { DepositForm } from "../components/DepositForm";
import { WithdrawForm } from "../components/WithdrawForm";
import { TransactionHistory } from "../components/TransactionHistory";

export default function Home() {
  return (
    <div className="page-wrapper">
      <header className="header">
        <div className="header-content">
          <div className="logo-section">
            <h1 className="title">NoirWire</h1>
            <p className="subtitle">Private Payments on Solana</p>
          </div>
          <WalletButton />
        </div>
      </header>

      <main className="main">
        <div className="hero">
          <h2 className="hero-title">Privacy-Preserving Payments</h2>
          <p className="hero-description">
            Deposit tokens into the shielded pool and withdraw privately using zero-knowledge
            proofs. Your balance and transaction history remain confidential.
          </p>
        </div>

        <div className="grid">
          <div className="column">
            <DepositForm />
            <WithdrawForm />
          </div>
          <div className="column">
            <TransactionHistory />
          </div>
        </div>
      </main>

      <footer className="footer">
        <p>
          Built with{" "}
          <a href="https://github.com/noir-lang/noir" target="_blank" rel="noopener noreferrer">
            Noir
          </a>{" "}
          and{" "}
          <a href="https://magicblock.gg" target="_blank" rel="noopener noreferrer">
            MagicBlock PER
          </a>
        </p>
      </footer>
    </div>
  );
}
