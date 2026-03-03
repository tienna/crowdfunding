# Kiến trúc ứng dụng CrowdFund

## Tổng quan

CrowdFund là dApp gây quỹ cộng đồng phi tập trung trên Cardano Preview Testnet. Ứng dụng không có backend server riêng — toàn bộ logic nghiệp vụ nằm trong **smart contract on-chain** (Aiken/Plutus V3) và **frontend Next.js** giao tiếp trực tiếp với blockchain qua Blockfrost API.

```
+------------------------------------------------------------------+
|                        Nguoi dung (Browser)                      |
|                                                                  |
|  +------------------------------------------------------------+  |
|  |                 Next.js Frontend (Vercel)                  |  |
|  |                                                            |  |
|  |  app/page.tsx          <- Entry point, tab navigation      |  |
|  |  +-- WalletConnect     <- Ket noi vi Cardano (Eternl/Nami) |  |
|  |  +-- CampaignList      <- Hien thi tat ca UTxO campaigns   |  |
|  |  +-- CreateCampaign    <- Form tao chien dich moi          |  |
|  |  +-- DonateForm        <- Donate vao campaign              |  |
|  |  +-- WithdrawPanel     <- Rut tien (beneficiary)           |  |
|  |  +-- ReclaimPanel      <- Lay lai tien (contributor)       |  |
|  |                                                            |  |
|  |  hooks/useWallet.ts    <- Quan ly trang thai vi            |  |
|  |  lib/contract.ts       <- CBOR, datum/redeemer helpers     |  |
|  |  lib/crowdfund.ts      <- 4 ham giao dich chinh            |  |
|  +------------------------------------------------------------+  |
|                         |                                        |
|           +-------------+-------------+                          |
|           v                           v                          |
|  +--------------------+    +----------------------+              |
|  |  Cardano Browser   |    |   Blockfrost API     |              |
|  |  Wallet Extension  |    |   (Preview Testnet)  |              |
|  |  (Eternl, Nami...) |    |   blockfrost.io      |              |
|  +--------------------+    +----------------------+              |
|           |                           |                          |
+-----------|---------------------------|--------------------------|+
            |                           |
            v                           v
+------------------------------------------------------------------+
|                    Cardano Preview Testnet                        |
|                                                                  |
|   Script Address: addr_test1wp6vztys594grp...                    |
|   +----------+  +----------+  +----------+                       |
|   | Campaign |  | Campaign |  | Campaign |  ...                  |
|   |  UTxO 1  |  |  UTxO 2  |  |  UTxO N  |                      |
|   |  (datum) |  |  (datum) |  |  (datum) |                      |
|   +----------+  +----------+  +----------+                       |
+------------------------------------------------------------------+
```

---

## Cau truc thu muc Frontend

```
frontend/
+-- app/
|   +-- layout.tsx              <- Root layout, metadata SEO
|   +-- page.tsx                <- Trang chinh, dieu phoi tab
|   +-- globals.css             <- CSS toan cuc, Tailwind, font
|   +-- components/
|   |   +-- WalletConnect.tsx   <- Picker chon vi + hien thi dia chi
|   |   +-- CampaignList.tsx    <- Grid cac the campaign
|   |   +-- CreateCampaign.tsx  <- Form tao campaign moi
|   |   +-- DonateForm.tsx      <- Form donate vao campaign
|   |   +-- WithdrawPanel.tsx   <- Panel rut tien cho beneficiary
|   |   +-- ReclaimPanel.tsx    <- Panel lay lai tien cho contributor
|   +-- hooks/
|   |   +-- useWallet.ts        <- Custom hook quan ly trang thai vi
|   +-- lib/
|       +-- contract.ts         <- CBOR script, encode/decode datum
|       +-- crowdfund.ts        <- createCampaign, donate, withdraw, reclaim
+-- next.config.ts              <- Cau hinh Next.js + webpack WASM
+-- package.json
+-- tsconfig.json
```

---

## Cac lop kien truc

### 1. Lop Quan ly Vi — `hooks/useWallet.ts`

Custom hook React quan ly toan bo vong doi ket noi vi.

```
useWallet() -> WalletState
  +-- wallet: BrowserWallet | null     <- Instance vi MeshJS
  +-- address: string | null           <- Dia chi bech32
  +-- pkh: string | null               <- Payment Key Hash (hex)
  +-- isConnected: boolean
  +-- isConnecting: boolean
  +-- error: string | null
  +-- connect(walletName) -> Promise   <- Goi BrowserWallet.enable()
  +-- disconnect()                     <- Reset state
```

**Luong ket noi vi:**
1. User click "Connect Wallet" → `WalletConnect` goi `BrowserWallet.getInstalledWallets()` tai thoi diem click (khong phai luc mount, vi extension inject sau)
2. User chon vi → goi `connect(walletName)`
3. `BrowserWallet.enable(name)` → yeu cau quyen tu extension
4. Lay `changeAddress` → `resolvePaymentKeyHash()` → luu `pkh`

### 2. Lop Contract Helpers — `lib/contract.ts`

Khong co side effect, pure TypeScript functions:

| Export | Mo ta |
|--------|-------|
| `SCRIPT_CBOR_SINGLE` | Raw CBOR tu `plutus.json` (single-wrapped) |
| `SCRIPT_ADDRESS` | Dia chi script Preview Testnet |
| `CampaignDatum` | Interface TypeScript cho datum |
| `encodeDatum(datum)` | Chuyen datum → Cardano JSON schema de gui len chain |
| `decodeDatum(raw)` | Parse datum tu Blockfrost UTxO response |
| `encodeRedeemer(action)` | Chuyen "Donate"/"Withdraw"/"Reclaim" → JSON schema |
| `posixMsToSlot(ms)` | Chuyen POSIX ms → slot number (Preview genesis) |

**Dinh dang datum tren chain (Cardano JSON Schema):**
```json
{
  "constructor": 0,
  "fields": [
    { "bytes": "<beneficiary_pkh_hex>" },
    { "int": 10000000 },
    { "int": 1750000000000 },
    { "map": [
      { "k": { "bytes": "<pkh>" }, "v": { "int": 5000000 } }
    ]}
  ]
}
```

### 3. Lop Giao dich — `lib/crowdfund.ts`

4 ham chinh xay dung va submit giao dich Cardano:

```
fetchCampaigns()
  -> BlockfrostProvider.fetchAddressUTxOs(SCRIPT_ADDRESS)
  -> filter UTxOs co plutusData
  -> decodeDatum() cho moi UTxO
  -> tra ve Campaign[]

createCampaign(wallet, beneficiaryBech32, goalLovelace, deadlinePosixMs, initialLovelace)
  -> MeshTxBuilder
      .txOut(SCRIPT_ADDRESS, [lovelace])
      .txOutInlineDatumValue(encodeDatum(datum), "JSON")
      -> lock tien vao script (giao dich thuong, khong goi validator)

donate(wallet, campaignUtxo, donationLovelace)
  -> MeshTxBuilder
      .spendingPlutusScriptV3()
      .txIn(campaignUtxo) + redeemer Donate
      .txOut(SCRIPT_ADDRESS, [newLovelace])
      .txOutInlineDatumValue(encodeDatum(newDatum), "JSON")
      -> spend + re-lock voi datum cap nhat

withdraw(wallet, campaignUtxo)
  -> MeshTxBuilder
      .spendingPlutusScriptV3()
      .txIn(campaignUtxo) + redeemer Withdraw
      .requiredSignerHash(datum.beneficiary)
      -> spend toan bo, tien ve changeAddress (beneficiary)

reclaim(wallet, campaignUtxo)
  -> MeshTxBuilder
      .spendingPlutusScriptV3()
      .txIn(campaignUtxo) + redeemer Reclaim
      .requiredSignerHash(reclaimerPkh)
      .invalidBefore(deadlineSlot + 1)
      [.txOut(SCRIPT_ADDRESS, remaining) neu con contributor khac]
      -> partial reclaim
```

### 4. Lop UI — Components

| Component | Vai tro | SSR |
|-----------|---------|-----|
| `WalletConnect` | Dropdown chon vi, hien thi dia chi khi ket noi | Client |
| `CampaignList` | Fetch + render grid the campaign, progress bar | Client |
| `CreateCampaign` | Form nhap goal/deadline/initial, goi createCampaign | Dynamic (no SSR) |
| `DonateForm` | Nhap so ADA donate, goi donate | Dynamic (no SSR) |
| `WithdrawPanel` | Kiem tra dieu kien, goi withdraw | Dynamic (no SSR) |
| `ReclaimPanel` | Kiem tra dieu kien, goi reclaim | Dynamic (no SSR) |

`CreateCampaign`, `DonateForm`, `WithdrawPanel`, `ReclaimPanel` duoc import bang `next/dynamic` voi `{ ssr: false }` vi MeshJS su dung Web APIs (`window.cardano`) khong co tren server.

---

## Luong du lieu

### Xem danh sach campaign

```
CampaignList mount
  -> fetchCampaigns()
  -> Blockfrost API: GET /addresses/{addr}/utxos
  -> parse plutusData cua moi UTxO
  -> decodeDatum() -> CampaignDatum[]
  -> render the campaign voi progress bar, status badge
```

### Tao giao dich (Create / Donate / Withdraw / Reclaim)

```
User click Submit
  -> build tx bang MeshTxBuilder (lib/crowdfund.ts)
  -> Blockfrost evaluate execution units (chi script tx)
  -> wallet.signTx(unsignedTx, true)     <- extension hien popup xac nhan
  -> wallet.submitTx(signedTx)           <- submit qua Blockfrost
  -> tra ve txHash
  -> onSuccess(txHash) -> refresh CampaignList
```

---

## Trien khai tren Vercel

### Yeu cau bien moi truong

Tao trong Vercel Dashboard → Project Settings → Environment Variables:

```
NEXT_PUBLIC_BLOCKFROST_API_KEY=previewXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

### Cau hinh quan trong

File `next.config.ts` duoc cau hinh webpack de xu ly **WebAssembly** cua MeshJS (`@emurgo/cardano-serialization-lib-browser`):

```typescript
webpack: (config) => {
  config.experiments = { ...config.experiments, asyncWebAssembly: true };
  config.resolve.fallback = { fs: false, net: false, tls: false };
  return config;
}
```

### Buoc deploy len Vercel

1. Vao [vercel.com](https://vercel.com) → Import Git Repository
2. Chon repo `tienna/crowdfunding`
3. **Root Directory**: dat la `frontend`
4. Them bien moi truong `NEXT_PUBLIC_BLOCKFROST_API_KEY`
5. Click **Deploy**

Moi lan push len GitHub, Vercel se tu dong deploy lai.

---

## Cong nghe su dung

| Lop | Cong nghe | Phien ban |
|-----|-----------|-----------|
| Framework | Next.js (App Router) | 16.1.6 |
| UI Runtime | React | 19.2.3 |
| Styling | Tailwind CSS | v4 |
| Wallet SDK | MeshJS BrowserWallet | 1.9.0-beta.101 |
| Tx Builder | MeshJS MeshTxBuilder | 1.9.0-beta.101 |
| Blockchain Data | Blockfrost Provider | 1.9.0-beta.101 |
| Ngon ngu | TypeScript | 5.x |
| Deploy | Vercel | - |
