# Tab Explorer - Chrome Extension

Extension lấy toàn bộ tab title và URL đang mở trong Chrome.

## Cách cài đặt

1. Mở Chrome → vào địa chỉ `chrome://extensions/`
2. Bật **Developer mode** (góc trên bên phải)
3. Click **Load unpacked**
4. Chọn thư mục `Chrome Extension Tabs Explore` này
5. Extension sẽ xuất hiện trên thanh công cụ Chrome

## Tính năng

- **Hiển thị tất cả tabs** từ mọi cửa sổ Chrome, nhóm theo cửa sổ
- **Tìm kiếm** tab theo title hoặc URL
- **Copy tất cả** dạng text có đánh số
- **Copy JSON** — mảng `[{title, url}]`
- **Copy Markdown** — dạng `- [title](url)`
- **Xuất CSV** — file có thể mở trong Excel
- **Copy từng tab** — click icon 📋 trên mỗi tab
- **Chuyển sang tab** — click ↗ để focus vào tab đó

## Cấu trúc file

```
Chrome Extension Tabs Explore/
├── manifest.json     # Cấu hình extension (Manifest V3)
├── popup.html        # Giao diện popup
├── popup.js          # Logic xử lý
├── popup.css         # Styling
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```
