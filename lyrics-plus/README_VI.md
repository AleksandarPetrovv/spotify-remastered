# Lyric Plus Translate

**Language / 言語 / 언어 / Ngôn ngữ / 语言:**
[English](README.md) | [Tiếng Việt](README_VI.md) | [한국어](assets/readme/README_KO.md) | [日本語](assets/readme/README_JA.md) | [中文（简体）](assets/readme/README_ZH.md)

[![Ko-fi](https://img.shields.io/badge/Donate-Ko--fi-F16061?style=flat-square&logo=ko-fi&logoColor=white)](https://ko-fi.com/gunjoutuna)



> Phiên bản tùy chỉnh của **Lyrics Plus** dành cho Spicetify, tập trung vào **phiên âm offline** chất lượng cao. Không AI, không API key, không cần tài khoản — mọi thứ chạy hoàn toàn cục bộ trên máy bạn. Đọc lời theo Romaji, Furigana, Romaja hoặc Pinyin, kèm nhiều nguồn lời và bản dịch cộng đồng từ các provider.

<img width="800" height="800" alt="image" src="https://github.com/user-attachments/assets/32e85501-567d-4896-a7e4-bb4b098a30a6" />

---

## Tính năng chính

### 1. Phiên âm offline

Chuyển lời bài hát thành cách đọc dễ hiểu, hoàn toàn trên máy — không gọi mạng, không key, không phải chờ. Dùng Kuroshiro/Kuromoji, Aromanize và OpenCC + pinyin-pro.

- **Tiếng Nhật** — Romaji, Furigana (chú âm kanji inline bằng `<ruby>`), Hiragana, Katakana.
- **Tiếng Hàn** — Romaja.
- **Tiếng Trung** — Pinyin, kèm chuyển đổi Giản thể ⇄ Phồn thể.
- **Hai chế độ hiển thị đồng thời** — hiện lời gốc cạnh phần phiên âm, lý tưởng cho việc học ngoại ngữ.
- **Nhanh & riêng tư** — phiên âm chạy cục bộ và được cache, nên các dòng hiện lên tức thì khi nghe lại.

| Tiếng Nhật → Romaji | Tiếng Hàn → Romaja | Tiếng Trung → Pinyin |
| ------------------- | ------------------ | -------------------- |
|<img width="1919" height="1019" alt="image" src="https://github.com/user-attachments/assets/e9b7f1f5-0c3c-474d-8fe1-8e2e37552bfb" />|<img width="1919" height="1018" alt="image" src="https://github.com/user-attachments/assets/e8b56a5e-621e-420f-be68-ffc69e3236c1" />|<img width="1919" height="1019" alt="image" src="https://github.com/user-attachments/assets/a9e36436-9027-4fbe-a31d-2ffc27d97574" />|

### 2. Nhiều nguồn lời & bản dịch từ provider

Lấy lời đồng bộ từ nhiều provider, với Spotify được ưu tiên đầu tiên: **Spotify**, **Musixmatch**, **lrclib**, **NetEase** (JP/KR/CN kèm phiên âm), **Genius**, và **file cục bộ**.

- **Bản dịch đi kèm từ provider** — nơi nguồn có sẵn, bản dịch `tlyric` của NetEase / lrclib và bản dịch Musixmatch (kể cả tiếng Việt) được tải về và hiển thị. Đây là bản dịch của con người/cộng đồng đi kèm lời bài hát, không phải do AI tạo ra.
- **Tìm NetEase thủ công** — tự tìm và chọn đúng bài khi khớp tự động sai.
- **Lời từ file cục bộ** — nạp file `.lrc` / `.txt` cho các bài không có lời online.
- **Cache vào IndexedDB** — lưu lời đã chọn cục bộ để nạp lại tức thì.

### 3. Mini Lyrics trong Picture-in-Picture

Inject lời bài hát đồng bộ trực tiếp vào mini player Picture-in-Picture gốc của Spotify, đọc lyric trong khi làm việc khác. Bật/tắt qua panel cài đặt PiP hoặc phím tắt `Ctrl+Shift+M`.

### 4. Nền video động

Tự động lấy MV YouTube làm nền động cho trang lyrics. Tùy chỉnh scale, dim, blur — kết hợp đẹp với chế độ trong suốt và mọi theme Spicetify.

<img width="1919" height="958" alt="image" src="https://github.com/user-attachments/assets/51520969-7a8f-44e5-bf70-3262e9d658c7" />

### 5. Giao diện hiện đại & Trải nghiệm tối ưu

- **Nền trong suốt** — hài hòa với mọi theme Spicetify.
- **Tự động ẩn điều khiển** — nút cài đặt chỉ xuất hiện khi di chuột vào, tối đa hóa không gian hiển thị.
- **Chuyển cảnh mượt mà** — hoạt ảnh tối ưu cho việc chuyển đổi dòng lời liền mạch.
- **Giao diện đa ngôn ngữ đầy đủ** — đã localize hoàn chỉnh: English, Tiếng Việt 🇻🇳, 한국어, 日本語, và 中文（简体）.

---

## Cài đặt

> **Yêu cầu:** [Spotify](https://download.scdn.co/SpotifySetup.exe) được cài đặt từ web, KHÔNG phải từ Microsoft Store.

Cài đặt Spicetify:

```powershell
iwr -useb https://raw.githubusercontent.com/spicetify/cli/main/install.ps1 | iex
```

### - Cài đặt nhanh (Khuyên dùng)

Mở **PowerShell** và chạy lệnh:

```powershell
iwr -useb https://raw.githubusercontent.com/Tuna285/custom-of-lyrics-plus/main/install.ps1 | iex
```

### Gỡ cài đặt

```powershell
iwr -useb https://raw.githubusercontent.com/Tuna285/custom-of-lyrics-plus/main/uninstall.ps1 | iex
```

### - Cài đặt thủ công

1. Tải xuống và giải nén file .zip này
  Download
2. Sao chép thư mục `lyrics-plus` vào thư mục CustomApps của Spicetify:
  - **Windows:** `%LocalAppData%\spicetify\CustomApps`
  - **MacOS/Linux:** `~/.config/spicetify/CustomApps`
  - 
3. Mở terminal:
  ```bash
   spicetify config custom_apps lyrics-plus
   spicetify apply
  ```

---

## Cấu hình

Mọi thứ hoạt động ngay từ đầu — không có key hay tài khoản nào cần thiết lập.

1. Mở Spotify, nhấp vào avatar của bạn → **Lyric Plus Translate config** để chỉnh giao diện, chế độ hiển thị và thứ tự provider.
2. Di chuột qua lời bài hát và nhấp icon hiển thị (⇄) để chọn chế độ phiên âm / hiển thị (ví dụ Romaji + Furigana cho tiếng Nhật, Romaja cho tiếng Hàn, Pinyin cho tiếng Trung).
3. Nơi provider có sẵn bản dịch (NetEase / lrclib `tlyric`, Musixmatch), nó sẽ tự động hiện cạnh lời bài hát.
4. *(Tùy chọn)* Nhấn `Ctrl+Shift+M` khi đang phát nhạc để bật/tắt Mini Lyrics trong Picture-in-Picture.

---

## Ngôn ngữ hỗ trợ

### Chế độ offline (Kuromoji, Aromanize, OpenCC — hoàn toàn cục bộ)

| Ngôn ngữ nguồn   | Chế độ hiển thị 1                     | Chế độ hiển thị 2 |
| ---------------- | ------------------------------------- | ----------------- |
| Tiếng Nhật (日本語) | Romaji, Furigana, Hiragana, Katakana  | Gốc               |
| Tiếng Hàn (한국어)  | Romaja                                | Gốc               |
| Tiếng Trung (中文) | Pinyin, Giản thể, Phồn thể            | Gốc               |

### Bản dịch từ provider (tải về, không phải do AI tạo)

| Nguồn                       | Bản dịch                                                |
| --------------------------- | ------------------------------------------------------- |
| NetEase / lrclib (`tlyric`) | Bản dịch đi kèm lời bài hát (gồm cả tiếng Việt nếu có)   |
| Musixmatch                  | Bản dịch Musixmatch nếu có                               |

---

## Credits

- Bản gốc [lyrics-plus](https://github.com/spicetify/cli/tree/main/CustomApps/lyrics-plus) bởi nhóm Spicetify
- Dựa trên [bản fork Lyric Plus Translate của Tuna285](https://github.com/Tuna285/custom-of-lyrics-plus)
- Phiên âm: [Kuroshiro](https://github.com/hexenq/kuroshiro), [Aromanize](https://github.com/fujaru/aromanize-js), [OpenCC](https://github.com/BYVoid/OpenCC)

---

<p align="center">
  <a href="https://ko-fi.com/gunjoutuna" target="_blank">
    <img src="https://storage.ko-fi.com/cdn/brandasset/kofi_bg_tag_dark.png" alt="Buy Me a Coffee at ko-fi.com" height="50" style="height: 50px !important; border-radius: 8px;">
  </a>
</p>

---

## Giấy phép

[LGPL-2.1](LICENSE)

---

*Dự án này đang được phát triển. Vui lòng báo cáo bất kỳ lỗi cũng như đề xuất tính năng và vấn đề nào!*
