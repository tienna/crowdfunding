import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CrowdFund — Cardano Decentralized Crowdfunding",
  description: "Decentralized crowdfunding on Cardano Preview Testnet powered by Aiken smart contracts",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased relative z-10">{children}</body>
    </html>
  );
}
