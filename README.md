# Spotify Remastered

its literally a spotify mod but just better in every way

## Features

- download songs, playlists and albums as mp3, wav, ogg or flac
- add songs, playlists and albums from youtube or soundcloud to your spotify playlists
- synced lyrics, translations and romanization
- more lyrics from multiple sources
- adblock
- automatically reapplies your setup after spotify updates
- edit song titles and artists before importing
- add your local songs to playlists
- hide podcasts and video content
- redesigned interface with album art colors
- performance and ram optimizations
- **uninstall from inside spotify — open settings (top left) → installation → uninstall**

## Storage

approximate space on windows, excluding spotify, downloaded songs and recovery backups:

| component                                        |        space |
| ------------------------------------------------ | -----------: |
| theme, lyrics and scripts                        |        12 mb |
| ffmpeg — audio conversion                        |       187 mb |
| spotdl, yt-dlp and python packages — downloading |       131 mb |
| deno — youtube support                           |       117 mb |
| python runtime and setup tools                   |       150 mb |
| spicetify — applies the customization            |        24 mb |
| *dependencies total*                             |     *620 mb* |
| **total including our files**                    | **\~630 mb** |

existing compatible tools are reused where possible.

## Install

**Windows** — run in powershell:

```powershell
irm https://raw.githubusercontent.com/AleksandarPetrovv/spotify-remastered/cli/winDl.ps1 | iex
```

**Mac** — run in terminal:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/AleksandarPetrovv/spotify-remastered/cli/macDl.sh)
```

## Credits

- theme based on [hazy](https://github.com/Astromations/Hazy) by astromations
- lyrics based on [custom-of-lyrics-plus](https://github.com/Tuna285/custom-of-lyrics-plus) by tuna285
