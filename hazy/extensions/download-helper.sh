#!/bin/bash
read -r request_line
content_length=0
while IFS= read -r line; do
    line="${line%$'\r'}"
    [ -z "$line" ] && break
    case "$line" in
        [Cc]ontent-[Ll]ength:*) content_length=$(echo "$line" | awk '{print $2}') ;;
    esac
done

path=$(echo "$request_line" | awk '{print $2}')
route=$(echo "$path" | cut -d'?' -f1)
query=$(echo "$path" | cut -d'?' -s -f2)
trackId=$(echo "$query" | sed -n 's/.*id=\([^& ]*\).*/\1/p')

if [[ "$route" == /link-* ]]; then
    exec python3 "$HOME/.local/share/spotify-remastered/scripts/link-helper.py" "$route" "$query" "$content_length"
fi

if [[ "$route" == /playlist* ]] || [[ "$request_line" == OPTIONS* ]] || [[ "$route" == /open-folder && "$query" == *kind=playlist* ]]; then
    if command -v python3 >/dev/null 2>&1; then
        [[ "$request_line" == OPTIONS* ]] && route=OPTIONS
        exec python3 "$HOME/.local/share/spotify-remastered/scripts/download-playlist.py" "$route" "$query" "$content_length"
    fi
    body='{"status":"error","message":"Python 3 is required for playlist downloads. Please install Python 3."}'
    printf 'HTTP/1.1 200 OK\r\nAccess-Control-Allow-Origin: *\r\nContent-Type: application/json\r\nContent-Length: %d\r\nConnection: close\r\n\r\n%s' "${#body}" "$body"
    exit 0
fi

respond() {
    local body="$1"
    local len=${#body}
    printf "HTTP/1.1 200 OK\r\nAccess-Control-Allow-Origin: *\r\nContent-Type: application/json\r\nContent-Length: %d\r\nConnection: close\r\n\r\n%s" "$len" "$body"
}

case "$route" in
    /open-folder)
        if [[ ! "$trackId" =~ ^[a-zA-Z0-9]{22}$ ]]; then
            respond '{"status":"error","message":"Invalid Spotify track ID."}'
            exit 0
        fi
        folder=$(cat "/tmp/spotdl-folder-${trackId}.txt" 2>/dev/null)
        if [ -d "$folder" ] && open "$folder"; then
            respond '{"status":"opened"}'
        else
            respond '{"status":"error","message":"The download folder is no longer available."}'
        fi
        ;;
    /download)
        if [[ ! "$trackId" =~ ^[a-zA-Z0-9]{22}$ ]]; then
            respond '{"status":"error"}'
            exit 0
        fi

        STATUS_FILE="/tmp/spotdl-status-${trackId}.txt"
        PID_FILE="/tmp/spotdl-pid-${trackId}.txt"

        if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
            respond '{"status":"already_downloading"}'
            exit 0
        fi

        downloadFolder=$(osascript -e 'POSIX path of (choose folder with prompt "Select download location")' 2>/dev/null)

        if [ -z "$downloadFolder" ]; then
            respond '{"status":"no_folder"}'
            exit 0
        fi
        printf '%s' "$downloadFolder" > "/tmp/spotdl-folder-${trackId}.txt"

        SPOTDL="$HOME/.local/share/spotify-remastered/dependencies/spotdl"
        FFMPEG="$HOME/.local/share/spotify-remastered/dependencies/ffmpeg"
        if [ ! -f "$FFMPEG" ]; then
            EXISTING_FFMPEG=$(command -v ffmpeg || true)
            [ -z "$EXISTING_FFMPEG" ] && EXISTING_FFMPEG="$HOME/.spotdl/ffmpeg"
            if [ -f "$EXISTING_FFMPEG" ]; then
                cp "$EXISTING_FFMPEG" "$FFMPEG.pending"
            else
                FFMPEG_ARCH=x64
                [[ "$(uname -m)" == arm64 ]] && FFMPEG_ARCH=arm64
                curl -fL --max-time 120 -o "$FFMPEG.pending" "https://github.com/eugeneware/ffmpeg-static/releases/download/b4.4/darwin-$FFMPEG_ARCH"
            fi
            chmod +x "$FFMPEG.pending"
            if "$FFMPEG.pending" -hide_banner -encoders 2>&1 | grep -q libmp3lame; then
                mv "$FFMPEG.pending" "$FFMPEG"
            else
                respond '{"status":"error","message":"FFmpeg setup failed."}'
                exit 0
            fi
        fi

        echo "downloading" > "$STATUS_FILE"

        DOWNLOAD_COMMAND=("$SPOTDL")
        RUNNER_PYTHON="$HOME/.local/share/spotify-remastered/dependencies/downloader/bin/python"
        RUNNER_SCRIPT="$HOME/.local/share/spotify-remastered/scripts/download-runner.py"
        if [ -x "$RUNNER_PYTHON" ] && [ -f "$RUNNER_SCRIPT" ]; then
            DOWNLOAD_COMMAND=("$RUNNER_PYTHON" "$RUNNER_SCRIPT" "--client")
        fi
        "${DOWNLOAD_COMMAND[@]}" download \
            "https://open.spotify.com/track/$trackId" \
            --output "$downloadFolder/{title}.{output-ext}" \
            --ffmpeg "$FFMPEG" \
            >/dev/null 2>&1 &
        SPOTDL_PID=$!
        echo "$SPOTDL_PID" > "$PID_FILE"
        disown "$SPOTDL_PID"

        ( while kill -0 "$SPOTDL_PID" 2>/dev/null; do sleep 1; done; echo "done" > "$STATUS_FILE"; rm -f "$PID_FILE"; sleep 30; rm -f "$STATUS_FILE" ) &
        disown $!

        respond '{"status":"started"}'
        ;;

    /status)
        if [ -z "$trackId" ]; then
            respond '{"status":"idle"}'
            exit 0
        fi
        STATUS_FILE="/tmp/spotdl-status-${trackId}.txt"
        status=$(cat "$STATUS_FILE" 2>/dev/null || echo "idle")
        respond "{\"status\":\"$status\"}"
        ;;

    /cancel)
        if [ -z "$trackId" ]; then
            respond '{"status":"cancelled"}'
            exit 0
        fi
        PID_FILE="/tmp/spotdl-pid-${trackId}.txt"
        STATUS_FILE="/tmp/spotdl-status-${trackId}.txt"
        if [ -f "$PID_FILE" ]; then
            PID=$(cat "$PID_FILE")
            pkill -P "$PID" 2>/dev/null || true
            kill "$PID" 2>/dev/null || true
            rm -f "$PID_FILE" "$STATUS_FILE"
        fi
        respond '{"status":"cancelled"}'
        ;;

    *)
        printf "HTTP/1.1 404 Not Found\r\nContent-Length: 9\r\nConnection: close\r\n\r\nNot Found"
        ;;
esac
