#!/bin/bash
read -r request_line
while IFS= read -r line; do
    line="${line%$'\r'}"
    [ -z "$line" ] && break
done

path=$(echo "$request_line" | awk '{print $2}')
route=$(echo "$path" | cut -d'?' -f1)
query=$(echo "$path" | cut -d'?' -s -f2)
trackId=$(echo "$query" | sed -n 's/.*id=\([^& ]*\).*/\1/p')

respond() {
    local body="$1"
    local len=${#body}
    printf "HTTP/1.1 200 OK\r\nAccess-Control-Allow-Origin: *\r\nContent-Type: application/json\r\nContent-Length: %d\r\nConnection: close\r\n\r\n%s" "$len" "$body"
}

case "$route" in
    /download)
        if [ -z "$trackId" ]; then
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

        SPOTDL="$HOME/.local/share/spotify-remastered/spotdl"
        FFMPEG="$HOME/.spotdl/ffmpeg"
        if [ ! -f "$FFMPEG" ]; then
            "$SPOTDL" --download-ffmpeg >/dev/null 2>&1
        fi

        echo "downloading" > "$STATUS_FILE"

        "$SPOTDL" download \
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
