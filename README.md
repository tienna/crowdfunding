# CrowdFund trên Cardano

Ứng dụng gây quỹ cộng đồng phi tập trung (dApp) trên Cardano Preview Testnet. Xây dựng bằng Aiken (Plutus V3) và MeshJS.

## Cách hoạt động

- Mỗi chiến dịch là một **UTxO** được khóa tại địa chỉ script chung
- Trạng thái chiến dịch (beneficiary, mục tiêu, thời hạn, đóng góp) lưu trong **inline datum**
- Ba hành động trên chuỗi:
  - **Donate** — Bất kỳ ai cũng có thể đóng góp; datum cập nhật nguyên tử cùng với số tiền
  - **Withdraw** — Beneficiary rút toàn bộ tiền ngay khi đạt mục tiêu (không cần chờ deadline)
  - **Reclaim** — Người đóng góp lấy lại phần của mình sau deadline nếu mục tiêu KHÔNG đạt

## Khởi động nhanh

```bash
# 1. Smart contract (đã được biên dịch sẵn trong plutus.json)
cd onchain && aiken build

# 2. Kiểm thử headless (Alice/Bob/Charlie)
cd offchain && npm install
# Cấu hình .env với mnemonics + Blockfrost key
node --loader ts-node/esm test.ts

# 3. Giao diện Frontend
cd frontend && npm install
# Cấu hình .env.local với NEXT_PUBLIC_BLOCKFROST_API_KEY
npm run dev
```

Hướng dẫn cài đặt đầy đủ: [docs/setup.md](docs/setup.md)

## Kiến trúc

```
onchain/    ← Aiken validator (Plutus V3, không có tham số)
offchain/   ← TypeScript headless scripts (MeshJS)
frontend/   ← Next.js 16 dApp (BrowserWallet, Turbopack)
docs/       ← Kiến trúc + Hướng dẫn cài đặt
```

Xem [docs/architecture.md](docs/architecture.md) để biết chi tiết thiết kế.

## Công nghệ sử dụng

| Lớp | Công nghệ |
|-----|-----------|
| Smart Contract | Aiken v1.1.2, stdlib v2.1.0, Plutus V3 |
| Off-chain | TypeScript, MeshJS v1.9.0-beta.101 |
| Frontend | Next.js 16, Tailwind CSS v4, Space Grotesk |
| Mạng lưới | Cardano Preview Testnet qua Blockfrost |

## Địa chỉ Script (Preview Testnet)

`addr_test1wp6vztys594grpv7qwv00rqmjwaxk4ju7kykfcx3dl6fpvgg9cflw`

Hash: `74c12c90a16a81859e0398f78c1b93ba6b565cf58964e0d16ff490b1`
