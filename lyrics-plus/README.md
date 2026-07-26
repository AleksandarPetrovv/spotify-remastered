# Lyric Plus Translate

**Language / 言語 / 언어 / Ngôn ngữ / 语言:**
[English](README.md) | [Tiếng Việt](README_VI.md) | [한국어](assets/readme/README_KO.md) | [日本語](assets/readme/README_JA.md) | [中文（简体）](assets/readme/README_ZH.md)

[![Ko-fi](https://img.shields.io/badge/Donate-Ko--fi-F16061?style=flat-square&logo=ko-fi&logoColor=white)](https://ko-fi.com/gunjoutuna)



> A personalized version of **Lyrics Plus** for Spicetify, rebuilt around high-quality **offline romanization**. No AI, no API keys, no accounts — everything runs locally on your machine. Read along in Romaji, Furigana, Romaja, or Pinyin, with lyric sources and community translations from multiple providers.

<img width="800" height="800" alt="image" src="https://github.com/user-attachments/assets/32e85501-567d-4896-a7e4-bb4b098a30a6" />

---

## Key Features

### 1. Offline Romanization

Convert lyrics into readable pronunciation entirely on-device — no network calls, no keys, no waiting. Powered by Kuroshiro/Kuromoji, Aromanize, and OpenCC + pinyin-pro.

- **Japanese** — Romaji, Furigana (inline `<ruby>` kanji readings), Hiragana, Katakana.
- **Korean** — Romaja.
- **Chinese** — Pinyin, plus Simplified ⇄ Traditional conversion.
- **Two simultaneous display modes** — show the original alongside a romanized reading, ideal for language learning.
- **Fast & private** — conversions happen locally and are cached, so lines appear instantly on replay.

| Japanese → Romaji | Korean → Romaja | Chinese → Pinyin |
| ----------------- | --------------- | ---------------- |
|<img width="1919" height="1019" alt="image" src="https://github.com/user-attachments/assets/e9b7f1f5-0c3c-474d-8fe1-8e2e37552bfb" />|<img width="1919" height="1018" alt="image" src="https://github.com/user-attachments/assets/e8b56a5e-621e-420f-be68-ffc69e3236c1" />|<img width="1919" height="1019" alt="image" src="https://github.com/user-attachments/assets/a9e36436-9027-4fbe-a31d-2ffc27d97574" />|

### 2. Multiple Lyric Sources & Provider Translations

Pulls synced lyrics from several providers, with Spotify forced first: **Spotify**, **Musixmatch**, **lrclib**, **NetEase** (JP/KR/CN with romanization), **Genius**, and **local files**.

- **Bundled provider translations** — where a source supplies them, NetEase / lrclib `tlyric` and Musixmatch translations (including Vietnamese) are fetched and displayed. These are human/community translations shipped with the lyrics, not generated.
- **Manual NetEase search** — search and pick the right track by hand when auto-matching misses.
- **Local file lyrics** — load `.lrc` / `.txt` files for tracks that have no online lyrics.
- **Cache to IndexedDB** — save chosen lyrics locally so they reload instantly.

### 3. Mini Lyrics in Picture-in-Picture

Inject synchronized lyrics directly into Spotify's native Picture-in-Picture mini player so you can read along while working in any other app. Toggle from the PiP settings panel or with `Ctrl+Shift+M`.

### 4. Video Background

Animated YouTube music-video backdrops for the lyrics page. Adjustable scale, dim, and blur — pairs nicely with the transparent mode and any Spicetify theme.

<img width="1919" height="958" alt="image" src="https://github.com/user-attachments/assets/51520969-7a8f-44e5-bf70-3262e9d658c7" />

### 5. Modern Interface & Optimized Experience

- **Transparent background** — harmonizes with any Spicetify theme.
- **Auto-hiding controls** — setting buttons only appear on hover, maximizing display space.
- **Smooth transitions** — optimized animations for seamless line transitions.
- **Full multi-language UI** — complete localization in English, Tiếng Việt 🇻🇳, 한국어, 日本語, and 中文（简体）.

---

## Installation

> **Requirement:** [Spotify](https://download.scdn.co/SpotifySetup.exe) installed from web, NOT from Microsoft Store.

Install Spicetify:

```powershell
iwr -useb https://raw.githubusercontent.com/spicetify/cli/main/install.ps1 | iex
```

### - Quick Install (Recommended)

Open **PowerShell** and run:

```powershell
iwr -useb https://raw.githubusercontent.com/Tuna285/custom-of-lyrics-plus/main/install.ps1 | iex
```

This will automatically download and configure the app for you.

### Uninstall

```powershell
iwr -useb https://raw.githubusercontent.com/Tuna285/custom-of-lyrics-plus/main/uninstall.ps1 | iex
```

### - Manual Installation

1. Download and extract this repository
  Download
2. Copy the `lyrics-plus` folder to Spicetify's CustomApps directory:
  - **Windows:** `%LocalAppData%\spicetify\CustomApps`
  - **MacOS/Linux:** `~/.config/spicetify/CustomApps`
  - 
<img width="498" height="367" alt="image" src="https://github.com/user-attachments/assets/31a5b810-ee06-447d-91f4-1e463a601dee" />

3. Run in terminal:
  ```bash
   spicetify config custom_apps lyrics-plus
   spicetify apply
  ```

---

## Configuration

Everything works out of the box — there are no keys or accounts to set up.

1. Open Spotify, click on your avatar → **Lyric Plus Translate config** to adjust appearance, display modes, and provider ordering.
2. Hover over the lyrics and click the display icon (⇄) to pick your romanization / display modes (e.g. Romaji + Furigana for Japanese, Romaja for Korean, Pinyin for Chinese).
3. Where a provider ships a translation (NetEase / lrclib `tlyric`, Musixmatch), it appears automatically alongside the lyrics.
4. *(Optional)* Press `Ctrl+Shift+M` while a track is playing to toggle Mini Lyrics in Picture-in-Picture.

---

## Supported Languages

### Offline Modes (Kuromoji, Aromanize, OpenCC — all local)

| Source Language | Display Mode 1                            | Display Mode 2                    |
| --------------- | ----------------------------------------- | --------------------------------- |
| Japanese (日本語)  | Romaji, Furigana, Hiragana, Katakana      | Original                          |
| Korean (한국어)    | Romaja                                    | Original                          |
| Chinese (中文)    | Pinyin, Simplified, Traditional           | Original                          |

### Provider Translations (fetched, not generated)

| Source                      | Translation                                             |
| --------------------------- | ------------------------------------------------------- |
| NetEase / lrclib (`tlyric`) | Bundled translations shipped with the lyrics (incl. Vietnamese where available) |
| Musixmatch                  | Musixmatch translations where available                 |

---

## Credits

- Original [lyrics-plus](https://github.com/spicetify/cli/tree/main/CustomApps/lyrics-plus) by the Spicetify team
- Based on [Tuna285's Lyric Plus Translate fork](https://github.com/Tuna285/custom-of-lyrics-plus)
- Romanization: [Kuroshiro](https://github.com/hexenq/kuroshiro), [Aromanize](https://github.com/fujaru/aromanize-js), [OpenCC](https://github.com/BYVoid/OpenCC)

---

<p align="center">
  <a href="https://ko-fi.com/gunjoutuna" target="_blank">
    <img src="https://storage.ko-fi.com/cdn/brandasset/kofi_bg_tag_dark.png" alt="Buy Me a Coffee at ko-fi.com" height="50" style="height: 50px !important; border-radius: 8px;">
  </a>
</p>

---

## License

[LGPL-2.1](LICENSE)

---

*This project is under active development. Please report any issues!*
