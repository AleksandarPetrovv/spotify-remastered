import json
import platform
import re
import shutil
import subprocess
import zipfile
from pathlib import Path
from urllib.request import urlopen

root = Path.home() / '.local/share/spotify-remastered'
dependencies = root / 'dependencies'
dependencies.mkdir(parents=True, exist_ok=True)
(root / 'data').mkdir(exist_ok=True)


def download(url, target):
    with urlopen(url, timeout=120) as source, target.open('wb') as dest:
        shutil.copyfileobj(source, dest)
    target.chmod(0o755)


def version(path):
    try:
        return subprocess.check_output([str(path), '--version'], timeout=15, text=True).strip()
    except (OSError, subprocess.SubprocessError):
        return ''


ytdlp = next((path for path in (dependencies / 'yt-dlp', shutil.which('yt-dlp'), dependencies / 'downloader/bin/yt-dlp') if path and re.match(r'^202[6-9]\.', version(path))), None)
if not ytdlp:
    ytdlp = dependencies / 'yt-dlp'
    download('https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos', ytdlp)
    if not version(ytdlp):
        raise RuntimeError('The link downloader could not be installed.')
runtime = None
for name in ('deno', 'node'):
    path = shutil.which(name)
    if path and re.match(r'deno [2-9]|v(2[0-9]|[3-9][0-9])\.', version(path)):
        runtime = name + ':' + path
        break
if not runtime:
    deno = dependencies / 'deno'
    if not deno.is_file():
        arch = 'aarch64' if platform.machine() == 'arm64' else 'x86_64'
        archive = dependencies / 'deno.zip'
        try:
            download('https://github.com/denoland/deno/releases/latest/download/deno-' + arch + '-apple-darwin.zip', archive)
            with zipfile.ZipFile(archive) as package, package.open('deno') as source, deno.open('wb') as dest:
                shutil.copyfileobj(source, dest)
            deno.chmod(0o755)
        finally:
            archive.unlink(missing_ok=True)
    runtime = 'deno:' + str(deno)
(root / 'data/download-tools.json').write_text(json.dumps({'ytdlp':str(ytdlp), 'runtime':runtime}), encoding='utf-8')
