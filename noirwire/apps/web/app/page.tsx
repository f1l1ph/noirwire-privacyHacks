"use client";

import { WalletButton } from "../components/WalletButton";
import { DepositForm } from "../components/DepositForm";
import { WithdrawForm } from "../components/WithdrawForm";
import { TransactionHistory } from "../components/TransactionHistory";

export default function Home() {
  return (
    <div className="container">
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

      <style jsx>{`
        .container {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          background: #0a0a0a;
          color: #fff;
        }

        .header {
          border-bottom: 1px solid #333;
          background: #0f0f0f;
        }

        .header-content {
          max-width: 1200px;
          margin: 0 auto;
          padding: 24px 32px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .logo-section {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .title {
          margin: 0;
          font-size: 32px;
          font-weight: 700;
          background: linear-gradient(135deg, #512da8 0%, #6a3cc7 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .subtitle {
          margin: 0;
          font-size: 14px;
          color: #aaa;
        }

        .main {
          flex: 1;
          max-width: 1200px;
          margin: 0 auto;
          padding: 48px 32px;
          width: 100%;
        }

        .hero {
          text-align: center;
          margin-bottom: 48px;
        }

        .hero-title {
          margin: 0 0 16px 0;
          font-size: 48px;
          font-weight: 700;
          background: linear-gradient(135deg, #fff 0%, #aaa 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .hero-description {
          margin: 0 auto;
          max-width: 600px;
          font-size: 18px;
          line-height: 1.6;
          color: #aaa;
        }

        .grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 32px;
        }

        @media (max-width: 768px) {
          .grid {
            grid-template-columns: 1fr;
          }

          .header-content {
            flex-direction: column;
            gap: 16px;
          }

          .hero-title {
            font-size: 32px;
          }

          .hero-description {
            font-size: 16px;
          }
        }

        .column {
          display: flex;
          flex-direction: column;
        }

        .footer {
          border-top: 1px solid #333;
          padding: 24px 32px;
          text-align: center;
          background: #0f0f0f;
        }

        .footer p {
          margin: 0;
          font-size: 14px;
          color: #aaa;
        }

        .footer a {
          color: #512da8;
          text-decoration: none;
          font-weight: 500;
        }

        .footer a:hover {
          text-decoration: underline;
        }
      `}</style>
    </div>
  );
}
