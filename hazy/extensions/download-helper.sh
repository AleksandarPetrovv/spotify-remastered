#!/bin/bash
set -euo pipefail
root="$HOME/.local/share/spotify-remastered"
python="${SR_PYTHON:-$root/dependencies/downloader/bin/python}"
read -r request_line
content_length=0
while IFS= read -r line; do
    line="${line%$'\r'}"
    [ -z "$line" ] && break
    case "$line" in
        [Cc]ontent-[Ll]ength:*) content_length=${line#*:}; content_length=${content_length//[[:space:]]/} ;;
    esac
done
read -r method path protocol <<< "$request_line"
route=${path%%\?*}
query=""
[[ "$path" == *\?* ]] && query=${path#*\?}
if [[ ! "$content_length" =~ ^[0-9]+$ ]]; then content_length=0; fi
if [ "$method" = OPTIONS ]; then route=OPTIONS; fi
if [[ "$route" == /link-* ]]; then
    exec "$python" "$root/scripts/link-helper.py" "$route" "$query" "$content_length"
fi
exec "$python" "$root/scripts/download-playlist.py" "$route" "$query" "$content_length"
