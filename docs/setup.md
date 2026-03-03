# Hướng dẫn cài đặt

## Yêu cầu

| Công cụ | Phiên bản | Cài đặt |
|---------|-----------|---------|
| Node.js | >= 20 | https://nodejs.org |
| Aiken CLI | v1.1.2 | https://aiken-lang.org/installation-instructions |
| Git | bất kỳ | https://git-scm.com |

## Cấu trúc dự án

```
01CrowdFund/
├── onchain/          ← Smart contract Aiken
│   ├── aiken.toml
│   ├── plutus.json   ← sinh ra bởi aiken build
│   └── validators/
│       └── crowdfund.ak
├── offchain/         ← Scripts kiểm thử TypeScript headless
│   ├── package.json
│   ├── contract.ts   ← CBOR + helpers cho datum
│   ├── CrowdFund_Functions.ts
│   └── test.ts
├── frontend/         ← dApp Next.js
│   ├── package.json
│   ├── .env.local    ← Blockfrost API key
│   └── app/
├── docs/
└── README.md
```

## 1. Smart Contract

```bash
cd onchain
aiken build        # biên dịch → plutus.json
aiken check        # chạy unit test (nếu có)
```

CBOR đã biên dịch trong `plutus.json` được nhúng sẵn vào `offchain/contract.ts` và `frontend/app/lib/contract.ts`. Chỉ cần nhúng lại nếu bạn sửa validator.

## 2. Biến môi trường

Tạo file `.env` tại thư mục gốc (dành cho kiểm thử offchain):

```env
BLOCKFROST_API_KEY=previewXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
ALICE_MNEMONIC=từ1 từ2 từ3 ... từ24
BOB_MNEMONIC=từ1 từ2 từ3 ... từ24
CHARLE_MNEMONIC=từ1 từ2 từ3 ... từ24
```

Lấy Blockfrost API key miễn phí tại https://blockfrost.io — chọn mạng **Preview**.

Tạo file `frontend/.env.local` cho frontend:

```env
NEXT_PUBLIC_BLOCKFROST_API_KEY=previewXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

## 3. Offchain (Kiểm thử Headless)

```bash
cd offchain
npm install
node --loader ts-node/esm test.ts
```

Script kiểm thử chạy hai kịch bản:
- **Kịch bản 1:** Alice tạo chiến dịch → Bob donate → Charlie rút tiền (ngay khi đạt mục tiêu, không cần deadline)
- **Kịch bản 2:** Alice tạo chiến dịch → Bob donate → Bob reclaim (sau deadline, mục tiêu KHÔNG đạt)

Các ví cần có ít nhất 20 tADA trên Preview testnet.
Lấy tADA tại https://docs.cardano.org/cardano-testnets/tools/faucet/

## 4. Frontend

```bash
cd frontend
npm install
npm run dev     # server phát triển tại http://localhost:3000
npm run build   # build production
```

### Cài đặt ví

Cài đặt ví Cardano trên trình duyệt (khuyến nghị Eternl cho testnet):
1. Cài extension [Eternl](https://eternl.io)
2. Chuyển mạng sang **Preview Testnet**
3. Nạp tADA từ faucet
4. Đặt collateral (5 ADA) trong cài đặt ví — bắt buộc cho giao dịch script

### Sử dụng dApp

1. Mở http://localhost:3000
2. Click nút ví ở header để kết nối
3. **Tạo chiến dịch:** Điền địa chỉ beneficiary, mục tiêu ADA, deadline, khoản donate ban đầu
4. **Donate:** Click vào thẻ chiến dịch đang hoạt động, nhập số tiền, click Donate
5. **Withdraw:** Khả dụng với beneficiary ngay khi đạt mục tiêu (không cần chờ deadline)
6. **Reclaim:** Khả dụng với người đóng góp sau deadline nếu mục tiêu KHÔNG đạt

## 5. Biên dịch lại Contract

Nếu bạn sửa `crowdfund.ak`:

```bash
cd onchain
aiken build
```

Sau đó copy `compiledCode` mới từ `onchain/plutus.json` vào:
- `offchain/contract.ts` → hằng số `SCRIPT_CBOR_SINGLE`
- `frontend/app/lib/contract.ts` → hằng số `SCRIPT_CBOR_SINGLE`

Và cập nhật `SCRIPT_HASH` với hash mới từ `plutus.json`.

## Xử lý sự cố

**"No collateral UTxO"** — Đặt 5 ADA làm collateral trong cài đặt ví (Eternl: Settings → Collateral)

**"Module not found: @meshsdk/..."** — Chạy `npm install` trong thư mục tương ứng

**Giao dịch thất bại** — Kiểm tra Blockfrost dashboard để xem chi tiết lỗi; đảm bảo ví đang ở mạng Preview testnet

**"Goal chưa đạt"** — Với Withdraw: tổng đóng góp phải đạt mục tiêu trước

**"Deadline chưa đến"** — Với Reclaim: phải chờ đến sau deadline mới có thể reclaim
