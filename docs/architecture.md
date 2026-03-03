# CrowdFund dApp — Architecture

## Overview

```
┌─────────────────────────────────────────────────────┐
│                   Cardano Preview Testnet            │
│                                                     │
│   Script Address (non-parameterized Plutus V3)      │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐         │
│   │  UTxO 1  │  │  UTxO 2  │  │  UTxO N  │  ...    │
│   │ Campaign │  │ Campaign │  │ Campaign │         │
│   │  Datum   │  │  Datum   │  │  Datum   │         │
│   └──────────┘  └──────────┘  └──────────┘         │
└─────────────────────────────────────────────────────┘
          ▲                    ▲
          │ Blockfrost API     │ Submit Tx
          │                   │
┌─────────────────────────────────────────────────────┐
│              Off-chain / Frontend                   │
│                                                     │
│  ┌───────────────────────────────────────────────┐  │
│  │  Next.js App (app/page.tsx)                   │  │
│  │  - CampaignList: fetch all UTxOs at address   │  │
│  │  - CreateCampaign: lock new UTxO with datum   │  │
│  │  - DonateForm: spend + re-lock with new datum │  │
│  │  - WithdrawPanel: spend → beneficiary addr    │  │
│  │  - ReclaimPanel: spend + partial re-lock      │  │
│  └───────────────────────────────────────────────┘  │
│                       │                             │
│  ┌────────────────┐   │  ┌────────────────────────┐ │
│  │ BrowserWallet  │   │  │   BlockfrostProvider   │ │
│  │ (Eternl/Nami)  │   │  │   (Preview Testnet)    │ │
│  └────────────────┘   │  └────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

## On-chain Layer

**File:** `onchain/validators/crowdfund.ak`

- **Validator:** `p2p_clowdfund` — non-parameterized (no constructor arguments)
- **All campaigns share one script address** — each campaign is one UTxO
- **Datum (`CampaignDatum`):**
  ```
  beneficiary : VerificationKeyHash   -- PKH of fund recipient
  goal        : Int                   -- Lovelace target
  deadline    : Int                   -- POSIX milliseconds
  contributions : Pairs<PKH, Int>     -- [(contributor_pkh, amount)]
  ```
- **Redeemers:**
  | Redeemer | Actor | Conditions |
  |----------|-------|------------|
  | `Donate` | Anyone | deadline not passed; re-lock with updated datum; lovelace delta == contribution delta |
  | `Withdraw` | Beneficiary | **total >= goal** + signed by beneficiary (no deadline required) |
  | `Reclaim` | Contributor | deadline passed + total < goal + signed by contributor + paid back exact amount |

- **Compiled with:** Aiken v1.1.2, stdlib v2.1.0, Plutus V3
- **Script hash:** `74c12c90a16a81859e0398f78c1b93ba6b565cf58964e0d16ff490b1`
- **Script address (Preview):** `addr_test1wp6vztys594grpv7qwv00rqmjwaxk4ju7kykfcx3dl6fpvgg9cflw`

## Off-chain Layer

**Files:** `offchain/contract.ts`, `offchain/CrowdFund_Functions.ts`

### Key Design Decisions

**Double-CBOR wrapping (Conway era requirement):**
```typescript
// Raw compiledCode from plutus.json = single-CBOR
// Conway node requires double-CBOR
const SCRIPT_CBOR = applyParamsToScript(SCRIPT_CBOR_SINGLE, [], "JSON");
```

**Datum encoding as Plutus map:**
```typescript
// Contributions field → encoded as { map: [{ k: { bytes: pkh }, v: { int: amount } }] }
// Must use Pairs<k,v> on-chain (NOT Dict — Dict is opaque and cannot be cast from Data)
```

**Slot ↔ POSIX conversion (Preview Testnet):**
```
genesis = 1666656000 Unix seconds
slot = posixMs/1000 - genesis
```

### Functions
| Function | Description |
|----------|-------------|
| `createCampaign(wallet, beneficiary, goal, deadline, initial)` | Lock initial ADA to script with new datum |
| `donate(wallet, utxo, amount)` | Spend + re-lock UTxO with updated datum (increment contributor entry) |
| `withdraw(wallet, utxo)` | Spend → send all funds to beneficiary (goal met, no deadline needed) |
| `reclaim(wallet, utxo)` | Spend + optional re-lock remainder (after deadline, goal not met) |

## Frontend Layer

**File:** `frontend/app/`

- **Framework:** Next.js 16 (App Router, Turbopack)
- **Wallet:** MeshJS `BrowserWallet` — supports Eternl, Nami, Flint, Typhon, etc.
- **Styling:** Tailwind CSS v4 + Space Grotesk font, dark blockchain aesthetic

### Component Hierarchy
```
app/page.tsx
├── WalletConnect      (header — connect/disconnect wallet)
├── CampaignList       (fetch all UTxOs, render campaign cards)
│   └── [per campaign card]
│       ├── DonateForm     (active campaigns)
│       ├── WithdrawPanel  (goal met + is beneficiary)
│       └── ReclaimPanel   (expired + goal not met + has contribution)
└── CreateCampaign     (modal/tab — create new campaign)
```

### State Flow
```
useWallet hook
  └─ wallet: BrowserWallet | null
  └─ address: string (bech32)
  └─ pkh: string (payment key hash)
       │
       ▼
crowdfund.ts functions
  └─ wallet.getChangeAddress()     → sender address
  └─ wallet.getUtxos()             → available UTxOs for fee
  └─ wallet.getCollateral()        → collateral UTxO (script tx)
  └─ wallet.signTx(unsignedTx)     → signed tx (returnFullTx=true)
  └─ wallet.submitTx(signedTx)     → txHash
```
