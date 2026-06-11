#!/bin/bash
set -e

get_spicetify_config_dir() {
    if [ -n "$SPICETIFY_CONFIG" ] && [ -d "$SPICETIFY_CONFIG" ]; then echo "$SPICETIFY_CONFIG"; return; fi
    local p
    p=$(spicetify path userdata 2>/dev/null | tail -1)
    p=$(echo "$p" | xargs)
    if [ -n "$p" ] && [ -d "$p" ]; then echo "$p"; return; fi
    local candidates=("$HOME/.config/spicetify" "$HOME/.spicetify")
    for c in "${candidates[@]}"; do
        if [ -f "$c/config-xpui.ini" ]; then echo "$c"; return; fi
    done
    for c in "${candidates[@]}"; do
        if [ -d "$c" ]; then echo "$c"; return; fi
    done
    echo ""
}

pkill -9 -xi spotify >/dev/null 2>&1 || true

(while true; do 
    pkill -9 -xi spotify >/dev/null 2>&1 || true
    sleep 0.1
done) </dev/null >/dev/null 2>&1 &
KILL_PID=$!

cleanup() {
    kill "$KILL_PID" >/dev/null 2>&1 || true
}
trap cleanup EXIT

CUSTOM_DIR="$HOME/.local/share/spotify-remastered"
STATUS_FILE="$CUSTOM_DIR/spicetify-status.txt"
FULL_WIPE=false
if [ -f "$STATUS_FILE" ]; then
    if grep -qi 'spicetify-existed-before=false' "$STATUS_FILE"; then
        FULL_WIPE=true
    fi
fi
PREV_THEME_FILE="$CUSTOM_DIR/prev-theme.txt"
PREV_THEME=""
if [ -f "$PREV_THEME_FILE" ]; then
    PREV_THEME=$(cat "$PREV_THEME_FILE" | xargs)
fi

PLIST_NAME="com.spotify-remastered.updater"
PLIST_PATH="$HOME/Library/LaunchAgents/$PLIST_NAME.plist"
launchctl unload "$PLIST_PATH" 2>/dev/null || true
rm -f "$PLIST_PATH"
rm -rf "$CUSTOM_DIR"

if command -v spicetify &>/dev/null; then
    spicetify restore
    CFG=$(get_spicetify_config_dir)
    if [ -n "$CFG" ]; then
        rm -rf "$CFG/Themes/Hazy"
        rm -rf "$CFG/CustomApps/lyrics-plus"
    fi
    spicetify config custom_apps lyrics-plus-
    if [ -n "$PREV_THEME" ]; then
        spicetify config current_theme "$PREV_THEME"
    else
        spicetify config current_theme " "
        spicetify config inject_theme_js 0
    fi
    spicetify apply

    if [ "$FULL_WIPE" = true ]; then
        spicetify restore backup 2>/dev/null || true
        rm -rf "$HOME/.config/spicetify"
        rm -rf "$HOME/.spicetify"
        rm -rf "$HOME/.local/share/spicetify"

        SPICE_BIN=$(command -v spicetify 2>/dev/null)
        if [ -n "$SPICE_BIN" ]; then rm -f "$SPICE_BIN"; fi

        CLEANED_PATH=$(echo "$PATH" | tr ':' '\n' | grep -iv spicetify | paste -sd ':' -)
        export PATH="$CLEANED_PATH"
        if [ -f "$HOME/.zshrc" ]; then
            sed -i '' '/spicetify/d' "$HOME/.zshrc" 2>/dev/null || true
        fi
        if [ -f "$HOME/.bashrc" ]; then
            sed -i '' '/spicetify/d' "$HOME/.bashrc" 2>/dev/null || true
        fi
        if [ -f "$HOME/.bash_profile" ]; then
            sed -i '' '/spicetify/d' "$HOME/.bash_profile" 2>/dev/null || true
        fi
    fi
fi

kill "$KILL_PID" >/dev/null 2>&1 || true
wait "$KILL_PID" >/dev/null 2>&1 || true
pkill -9 -xi spotify >/dev/null 2>&1 || true

sleep 3
osascript -e 'tell application "Terminal" to close front window' 2>/dev/null || true
exit 0