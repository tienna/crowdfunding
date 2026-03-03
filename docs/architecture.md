# Kiến trúc dApp CrowdFund

## Tổng quan

```
┌─────────────────────────────────────────────────────┐
│              Cardano Preview Testnet                 │
│                                                     │
│   Địa chỉ Script (Plutus V3 không có tham số)       │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐         │
│   │  UTxO 1  │  │  UTxO 2  │  │  UTxO N  │  ...    │
│   │ Chiến    │  │ Chiến    │  │ Chiến    │         │
│   │ dịch 1   │  │ dịch 2   │  │ dịch N   │         │
│   └──────────┘  └──────────┘  └──────────┘         │
└─────────────────────────────────────────────────────┘
          ▲                    ▲
          │ Blockfrost API     │ Gửi giao dịch
          │                   │
┌─────────────────────────────────────────────────────┐
│              Off-chain / Frontend                   │
│                                                     │
│  ┌───────────────────────────────────────────────┐  │
│  │  Next.js App (app/page.tsx)                   │  │
│  │  - CampaignList: lấy tất cả UTxO tại địa chỉ │  │
│  │  - CreateCampaign: khóa UTxO mới với datum    │  │
│  │  - DonateForm: spend + re-lock với datum mới  │  │
│  │  - WithdrawPanel: spend → địa chỉ beneficiary │  │
│  │  - ReclaimPanel: spend + re-lock phần còn lại │  │
│  └───────────────────────────────────────────────┘  │
│                       │                             │
│  ┌────────────────┐   │  ┌────────────────────────┐ │
│  │ BrowserWallet  │   │  │   BlockfrostProvider   │ │
│  │ (Eternl/Nami)  │   │  │   (Preview Testnet)    │ │
│  └────────────────┘   │  └────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

## Lớp On-chain

**File:** `onchain/validators/crowdfund.ak`

- **Validator:** `p2p_clowdfund` — không có tham số (non-parameterized)
- **Tất cả chiến dịch dùng chung một địa chỉ script** — mỗi chiến dịch là một UTxO
- **Datum (`CampaignDatum`):**
  ```
  beneficiary   : VerificationKeyHash   -- PKH của người nhận quỹ
  goal          : Int                   -- Mục tiêu (Lovelace)
  deadline      : Int                   -- Thời hạn (POSIX milliseconds)
  contributions : Pairs<PKH, Int>       -- [(pkh_người_đóng_góp, số_tiền)]
  ```
- **Redeemer:**

  | Redeemer | Người thực hiện | Điều kiện |
  |----------|-----------------|-----------|
  | `Donate` | Bất kỳ ai | Chưa hết deadline; re-lock với datum cập nhật; delta lovelace == delta đóng góp |
  | `Withdraw` | Beneficiary | **Tổng đóng góp >= mục tiêu** + beneficiary ký (không cần deadline) |
  | `Reclaim` | Người đóng góp | Đã qua deadline + tổng < mục tiêu + người đóng góp ký + trả lại đúng số tiền |

- **Biên dịch với:** Aiken v1.1.2, stdlib v2.1.0, Plutus V3
- **Script hash:** `74c12c90a16a81859e0398f78c1b93ba6b565cf58964e0d16ff490b1`
- **Địa chỉ script (Preview):** `addr_test1wp6vztys594grpv7qwv00rqmjwaxk4ju7kykfcx3dl6fpvgg9cflw`

## Lớp Off-chain

**Files:** `offchain/contract.ts`, `offchain/CrowdFund_Functions.ts`

### Các quyết định thiết kế quan trọng

**Double-CBOR wrapping (yêu cầu của Conway era):**
```typescript
// Raw compiledCode từ plutus.json = single-CBOR
// Node Conway yêu cầu double-CBOR
const SCRIPT_CBOR = applyParamsToScript(SCRIPT_CBOR_SINGLE, [], "JSON");
```

**Mã hóa Datum dạng Plutus map:**
```typescript
// Trường Contributions → mã hóa dạng { map: [{ k: { bytes: pkh }, v: { int: amount } }] }
// Phải dùng Pairs<k,v> on-chain (KHÔNG dùng Dict — Dict là opaque và không thể cast từ Data)
```

**Chuyển đổi Slot ↔ POSIX (Preview Testnet):**
```
genesis = 1666656000 Unix seconds
slot = posixMs/1000 - genesis
```

### Các hàm chính

| Hàm | Mô tả |
|-----|-------|
| `createCampaign(wallet, beneficiary, goal, deadline, initial)` | Khóa ADA ban đầu vào script với datum mới |
| `donate(wallet, utxo, amount)` | Spend + re-lock UTxO với datum cập nhật (tăng phần đóng góp) |
| `withdraw(wallet, utxo)` | Spend → gửi toàn bộ cho beneficiary (đã đạt mục tiêu, không cần deadline) |
| `reclaim(wallet, utxo)` | Spend + re-lock phần còn lại (sau deadline, chưa đạt mục tiêu) |

## Lớp Frontend

**File:** `frontend/app/`

- **Framework:** Next.js 16 (App Router, Turbopack)
- **Wallet:** MeshJS `BrowserWallet` — hỗ trợ Eternl, Nami, Flint, Typhon, v.v.
- **Giao diện:** Tailwind CSS v4 + font Space Grotesk, theme tối theo phong cách blockchain

### Cấu trúc Component

```
app/page.tsx
├── WalletConnect      (header — kết nối/ngắt kết nối ví)
├── CampaignList       (lấy tất cả UTxO, render thẻ chiến dịch)
│   └── [mỗi thẻ chiến dịch]
│       ├── DonateForm     (chiến dịch đang hoạt động)
│       ├── WithdrawPanel  (đã đạt mục tiêu + là beneficiary)
│       └── ReclaimPanel   (hết hạn + chưa đạt mục tiêu + có đóng góp)
└── CreateCampaign     (modal/tab — tạo chiến dịch mới)
```

### Luồng trạng thái

```
hook useWallet
  └─ wallet: BrowserWallet | null
  └─ address: string (bech32)
  └─ pkh: string (payment key hash)
       │
       ▼
Các hàm trong crowdfund.ts
  └─ wallet.getChangeAddress()     → địa chỉ người gửi
  └─ wallet.getUtxos()             → UTxO sẵn có để trả phí
  └─ wallet.getCollateral()        → UTxO thế chấp (script tx)
  └─ wallet.signTx(unsignedTx)     → tx đã ký (returnFullTx=true)
  └─ wallet.submitTx(signedTx)     → txHash
```
