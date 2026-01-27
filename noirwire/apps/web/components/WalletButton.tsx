"use client";

import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

export function WalletButton() {
  return (
    <WalletMultiButton
      style={{
        backgroundColor: "#512DA8",
        height: "48px",
        fontSize: "16px",
        borderRadius: "8px",
      }}
    />
  );
}
