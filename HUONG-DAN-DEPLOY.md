# Đưa Kem lên mạng bằng GitHub Pages (miễn phí)

Sau khi làm xong, bạn sẽ có một đường link dạng `https://ten-cua-ban.github.io/kem/`, mở được trên máy tính, điện thoại, ở bất cứ đâu.

## Bước 1: Tạo tài khoản GitHub
Vào https://github.com, bấm **Sign up** và làm theo hướng dẫn. Nếu đã có tài khoản thì bỏ qua bước này.

## Bước 2: Tạo kho chứa (repository)
1. Đăng nhập, bấm dấu **+** ở góc phải trên, chọn **New repository**.
2. **Repository name**: gõ `kem` (tên này sẽ nằm trong đường link).
3. Chọn **Public**. Bản miễn phí chỉ chạy GitHub Pages với kho Public.
4. Bấm **Create repository**.

## Bước 3: Tải file lên
1. Trong trang kho vừa tạo, bấm dòng chữ **uploading an existing file**.
2. Mở thư mục `D:\Hoc\Claude\pixel-desk` trên máy, chọn **tất cả** các mục bên trong rồi kéo thả vào trang GitHub:
   - `index.html`, `app.js`, `style.css`, `y2k.css`, `night.css`
   - thư mục `assets` (có `logo.png`)
3. Không cần tải file hướng dẫn này lên. **Không tải file sao lưu `.json`** lên (vì đó là dữ liệu riêng của bạn).
4. Kéo xuống dưới, bấm **Commit changes**.

> Lưu ý: kéo **những thứ bên trong** thư mục `pixel-desk`, không kéo cả thư mục `pixel-desk`. Như vậy `index.html` mới nằm ở ngoài cùng.

## Bước 4: Bật GitHub Pages
1. Trong kho, vào **Settings**, cột trái chọn **Pages**.
2. Mục **Source** chọn **Deploy from a branch**.
3. Mục **Branch** chọn **main**, thư mục **/ (root)**, rồi bấm **Save**.
4. Đợi khoảng 1–2 phút, tải lại trang. Link web sẽ hiện ở trên cùng, dạng `https://ten-cua-ban.github.io/kem/`.

## Bước 5: Chuyển dữ liệu từ máy sang web
Dữ liệu được lưu **trong từng trình duyệt, theo từng địa chỉ**. Vì vậy web trên mạng ban đầu sẽ trống. Để chuyển dữ liệu sang:
1. Mở bản trên máy (file `index.html`), vào **Cài đặt → Tải file sao lưu**.
2. Mở link GitHub, vào **Cài đặt → Khôi phục từ file**, rồi chọn file vừa tải.

## Khi sửa web sau này
Vào kho trên GitHub, chọn **Add file → Upload files**, kéo file mới vào để thay file cũ, rồi bấm **Commit changes**. Khoảng 1 phút sau web sẽ cập nhật.

## Có an toàn không?
- **Code và ảnh `logo.png` là công khai**: ai có link cũng xem được web và mã nguồn.
- **Dữ liệu của bạn (job, tiền, ghi chú...) KHÔNG nằm trên GitHub.** Nó chỉ nằm trong trình duyệt của bạn. Người khác mở link sẽ thấy một bản Kem trống của riêng họ.
- Nhớ **sao lưu thường xuyên**, vì nếu xóa dữ liệu trình duyệt thì dữ liệu sẽ mất.
