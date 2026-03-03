# CrowdFund on Cardano

A decentralized crowdfunding dApp on Cardano Preview Testnet. Built with Aiken (Plutus V3) and MeshJS.

## How it works

- Each campaign is a **UTxO** locked at a shared script address
- Campaign state (beneficiary, goal, deadline, contributions) lives in the **inline datum**
- Three on-chain actions:
  - **Donate** — anyone can contribute; datum updates atomically with funds
  - **Withdraw** — beneficiary claims all funds as soon as goal is met (no deadline needed)
  - **Reclaim** — contributors reclaim their share after deadline if goal is NOT met

## Quick Start

```bash
# 1. Smart contract (already compiled in plutus.json)
cd onchain && aiken build

# 2. Headless tests (Alice/Bob/Charlie)
cd offchain && npm install
# set up .env with mnemonics + Blockfrost key
node --loader ts-node/esm test.ts

# 3. Frontend
cd frontend && npm install
# set up .env.local with NEXT_PUBLIC_BLOCKFROST_API_KEY
npm run dev
```

Full setup instructions: [docs/setup.md](docs/setup.md)

## Architecture

```
onchain/    ← Aiken validator (Plutus V3, no parameters)
offchain/   ← TypeScript headless scripts (MeshJS)
frontend/   ← Next.js 16 dApp (BrowserWallet, Turbopack)
docs/       ← Architecture + setup guide
```

See [docs/architecture.md](docs/architecture.md) for detailed design.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Smart Contract | Aiken v1.1.2, stdlib v2.1.0, Plutus V3 |
| Off-chain | TypeScript, MeshJS v1.9.0-beta.101 |
| Frontend | Next.js 16, Tailwind CSS v4, Space Grotesk |
| Network | Cardano Preview Testnet via Blockfrost |

## Script Address (Preview Testnet)

`addr_test1wp6vztys594grpv7qwv00rqmjwaxk4ju7kykfcx3dl6fpvgg9cflw`

Hash: `74c12c90a16a81859e0398f78c1b93ba6b565cf58964e0d16ff490b1`
