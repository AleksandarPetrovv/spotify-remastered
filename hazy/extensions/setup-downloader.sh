#!/bin/bash
set -euo pipefail
root="${1:-$HOME/.local/share/spotify-remastered}"
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
mkdir -p "$root/dependencies" "$root/data"
python=""
for candidate in "$root/dependencies/downloader/bin/python" "$root/dependencies/python"/*/bin/python3 /opt/homebrew/bin/python3 /usr/local/bin/python3 "$(command -v python3 || true)"; do
    if [ -x "$candidate" ] && "$candidate" -c 'import sys,venv; sys.exit(not ((3,11) <= sys.version_info[:2] <= (3,13)))' 2>/dev/null; then python="$candidate"; break; fi
done
if [ -z "$python" ]; then
    uv="$root/dependencies/uv/uv"
    if [ ! -x "$uv" ]; then
        arch=x86_64
        [ "$(uname -m)" = arm64 ] && arch=aarch64
        archive="$root/dependencies/uv.tar.gz"
        curl -fL --retry 2 "https://github.com/astral-sh/uv/releases/latest/download/uv-$arch-apple-darwin.tar.gz" -o "$archive"
        mkdir -p "$root/dependencies/uv"
        tar -xzf "$archive" -C "$root/dependencies/uv" --strip-components=1
        rm -f "$archive"
    fi
    export UV_PYTHON_INSTALL_DIR="$root/dependencies/python"
    "$uv" python install 3.12
    python=$("$uv" python find --managed-python 3.12)
fi
"$python" "$script_dir/setup-downloader.py" "$root"
