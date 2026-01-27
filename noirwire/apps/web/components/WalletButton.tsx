"use client";

import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

export function WalletButton() {
  return (
    <div className="wallet-button-wrapper">
      <WalletMultiButton className="wallet-multi-button" />
      <style jsx global>{`
        .wallet-button-wrapper {
          position: relative;
        }

        .wallet-multi-button {
          background: linear-gradient(
            135deg,
            var(--color-primary-600) 0%,
            var(--color-secondary-600) 100%
          ) !important;
          height: var(--size-button-height) !important;
          font-size: var(--font-size-base) !important;
          font-weight: var(--font-weight-semibold) !important;
          border-radius: var(--radius-lg) !important;
          padding: var(--space-3) var(--space-6) !important;
          border: none !important;
          box-shadow: var(--shadow-md) !important;
          transition: all var(--duration-base) var(--ease-in-out) !important;
          font-family: var(--font-family-sans) !important;
          white-space: nowrap !important;
        }

        .wallet-multi-button:hover:not(:disabled) {
          background: linear-gradient(
            135deg,
            var(--color-primary-700) 0%,
            var(--color-secondary-700) 100%
          ) !important;
          transform: translateY(-2px) !important;
          box-shadow: var(--shadow-lg) !important;
        }

        .wallet-multi-button:active:not(:disabled) {
          transform: translateY(0) !important;
          box-shadow: var(--shadow-md) !important;
        }

        .wallet-multi-button:focus-visible {
          outline: 2px solid var(--color-primary-500) !important;
          outline-offset: 2px !important;
        }

        .wallet-adapter-button-trigger {
          background: transparent !important;
        }

        @media (max-width: 768px) {
          .wallet-multi-button {
            font-size: var(--font-size-sm) !important;
            padding: var(--space-2) var(--space-4) !important;
            height: var(--size-button-height-sm) !important;
          }
        }
      `}</style>
    </div>
  );
}
