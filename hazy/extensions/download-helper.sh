#!/bin/bash
read -r request_line
while IFS= read -r line; do
    line="${line%$'\r'}"
    [ -z "$line" ] && break
done

trackId=$(echo "$request_line" | sed 's/.*[?&]id=\([^& ]*\).*/\1/')

printf "HTTP/1.1 200 OK\r\nAccess-Control-Allow-Origin: *\r\nContent-Length: 2\r\nConnection: close\r\n\r\nOK"

(
    downloadFolder=$(osascript -e 'POSIX path of (choose folder with prompt "Select download location")' 2>/dev/null)
    if [ -n "$downloadFolder" ]; then
        SPOTDL="$HOME/.local/share/spotify-remastered/spotdl"
        FFMPEG="$HOME/.spotdl/ffmpeg"
        if [ ! -f "$FFMPEG" ]; then
            "$SPOTDL" --download-ffmpeg >/dev/null 2>&1
        fi
        "$SPOTDL" download \
            "https://open.spotify.com/track/$trackId" \
            --output "$downloadFolder" \
            --ffmpeg "$FFMPEG" \
            >/dev/null 2>&1
        osascript -e 'display notification "Download complete!" with title "Spotify Remastered"'
    fi
) </dev/null >/dev/null 2>/dev/null &
