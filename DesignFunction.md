# Crowdfund dApp trên Cardano

crowdfunding mechanism with three possible actions: DONATE, WITHDRAW, and RECLAIM. Donations are tracked in a datum mapping contributor keys to their contributions, and funds can only be withdrawn by the beneficiary if the funding goal is met after the deadline. If the goal is not met, contributors can reclaim their donations after the deadline, either fully (if claiming all funds) or partially (with checks to prevent donor data manipulation). The contract ensures safety through deadline validation, correct fund tracking, and signature verification.

## Cách thức hoạt động của hợp đồng thông minh

Trình xác thực (validator) được tham số hóa bởi ba giá trị:

- ✅ beneficiary: Tên VerificationKeyHashcủa cá nhân hoặc tổ chức sẽ nhận được tiền nếu chiến dịch thành công.
- ✅ goal: An Intbiểu thị số tiền mục tiêu trong Lovelace.
- ✅ deadline: IntĐại diện cho dấu thời gian POSIX, sau đó chiến dịch sẽ kết thúc.
  Trạng thái trên chuỗi được quản lý thông qua một hệ thống datum, hệ thống này theo dõi mã băm ví của tất cả người quyên góp và số tiền họ đã quyên góp tương ứng.

## Các tính năng chính

### 1. Tạo chiến dịch

- ✅ Bất kỳ ai cũng có thể tạo chiến dịch với các thông tin cụ thể (beneficiary, goal, deadline)
- ✅ Người tạo chiến dịch được sẽ donate một khoản ADA tùy chọn.

### 2. Donate thêm

Bất kỳ ai cũng có thể gửi tiền đến địa chỉ liên hệ. Hành động này xác nhận rằng:

- ✅ Lượng Lovelace tại địa chỉ smart contract tăng lên.
- ✅ Dữ liệu trên chuỗi được cập nhật chính xác để bao gồm số tiền quyên góp mới vào tổng số.

### 3. Withdraw

Hành động này cho phép người thụ hưởng thụ toàn bộ số tiền từ hợp đồng. Điều này chỉ khả thi nếu:

- ✅ Đã deadlinequa rồi.
- ✅ Tổng số tiền đóng góp lớn hơn hoặc bằng goal...
- ✅ Giao dịch được ký bởi beneficiary.

### 4. Reclaim

Nếu chiến dịch không đạt được mục tiêu đề ra goaltrước thời hạn deadline, các nhà tài trợ có thể lấy lại tiền của mình. Hành động này đảm bảo rằng:

- ✅ Đã deadlinequa rồi.
- ✅ Tổng số tiền đóng góp ít hơn số tiền quy định goal.
- ✅ Giao dịch được ký bởi (những) nhà tài trợ đang yêu cầu hoàn trả tiền của họ.
- ✅ Người quyên góp chỉ có thể nhận lại chính xác số tiền họ đã đóng góp. Dữ liệu trên chuỗi được cập nhật để phản ánh việc rút tiền.

## Kiến trúc

### Smart Contract (On-chain)

- **Ngôn ngữ**: Aiken
- **Plutus Version**: V3
- **Validator**: `p2p_clowdfund`

### Off-chain

- **Framework**: TypeScript
- **SDK**: MeshJS (@meshsdk/transaction, @meshsdk/wallet, @meshsdk/core-cst)
- **Network**: Cardano Preview Testnet
- **Provider**: Blockfrost

## Cấu hình môi trường

File `.env` đã được tạo sẵn với:

- `ALICE_MNEMONIC`: Mnemonic Ví của Alice, sử dụng cho việc test với vai trò người tạo chiến dịch
- `BOB_MNEMONIC`: Mnemonic Ví của Bob, sử dụng cho việc test với vai trò người quyên góp
- `CHARLE_MNEMONIC`: Mnemonic là ví người thụ hưởng
- `BLOCKFROST_API_KEY`: API key của Blockfrost

## Yêu cầu viết code

- Các chức năng offchain được viết thành các hàm riêng biệt, để chung vào một file là CrowdFund_Functions.ts

- Sử dụng Ví của Alice(Người tạo chiến dịch) và Bob (người quyên góp) test trước các hàm này
- Xây dựng một landing page có các chức năng:
  - cho phép người dùng kết nối ví (sử dụng Mesh skill) tạo khoản quyên góp
  - cho phép người dùng kết nối ví (sử dụng Mesh skill) xem khoản quyên góp và quyên góp thêm
  - cho phép người dùng kết nối ví (sử dụng Mesh skill) xem khoản quyên góp và rút toàn bộ số tiền từ hợp đồng.
  - cho phép người dùng kết nối ví (sử dụng Mesh skill) Txem khoản quyên góp và lấy lại tiền nếu chiến dịch không đạt mục tiêu

- code offchain sẽ lưu vào thư mục `offchain`
- code frontend sẽ lưu vào thư mục `frontend`
- Tài liệu kiến trúc, hướng dẫn cài đặt sẽ lưu vào thư mục `docs`
- file README.md ngoài thư mục gốc sẽ là bản giới thiệu tổng thể về dự án
