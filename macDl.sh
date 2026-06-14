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
    echo "Could not locate Spicetify config directory." >&2; exit 1
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

TEMP_ZIP="/tmp/spotify-remastered.zip"
TEMP_EXTRACT="/tmp/spotify-remastered"

curl -L -o "$TEMP_ZIP" "https://github.com/AleksandarPetrovv/spotify-remastered/archive/refs/heads/cli.zip"

if [ ! -f "$TEMP_ZIP" ]; then echo "Download failed."; exit 1; fi
rm -rf "$TEMP_EXTRACT"
mkdir -p "$TEMP_EXTRACT"
unzip -q "$TEMP_ZIP" -d "$TEMP_EXTRACT"
INNER=$(find "$TEMP_EXTRACT" -mindepth 1 -maxdepth 1 -type d | head -1)
mv "$INNER" "$TEMP_EXTRACT/repository"
REPO="$TEMP_EXTRACT/repository"
if [ ! -d "$REPO" ]; then echo "Extracted repo folder not found at $REPO."; exit 1; fi

SPICETIFY_EXISTED_BEFORE=true
if ! command -v spicetify &>/dev/null; then
    curl -fsSL https://raw.githubusercontent.com/spicetify/cli/main/install.sh -o /tmp/spicetify-install.sh
    sed -i '' '/Do you want to install spicetify Marketplace/,/spicetify-marketplace/d' /tmp/spicetify-install.sh
    sh /tmp/spicetify-install.sh
    rm -f /tmp/spicetify-install.sh
    rm -f install.log
    sleep 2
    export PATH="$HOME/.spicetify:$PATH"
    SPICETIFY_EXISTED_BEFORE=false
fi

spicetify >/dev/null 2>&1 || true
CFG=$(get_spicetify_config_dir)
THEMES_DIR="$CFG/Themes"
APPS_DIR="$CFG/CustomApps"
mkdir -p "$THEMES_DIR"
mkdir -p "$APPS_DIR"
HAZY_DEST="$THEMES_DIR/Hazy"
LP_DEST="$APPS_DIR/lyrics-plus"

rm -rf "$HAZY_DEST"
cp -r "$REPO/hazy" "$HAZY_DEST"
rm -rf "$LP_DEST"
cp -r "$REPO/lyrics-plus" "$LP_DEST"

PREV_THEME=$(spicetify config current_theme 2>/dev/null | xargs)
CUSTOM_DIR="$HOME/.local/share/spotify-remastered"
mkdir -p "$CUSTOM_DIR"
PREV_THEME_FILE="$CUSTOM_DIR/prev-theme.txt"
if [ -n "$PREV_THEME" ] && [ "$PREV_THEME" != "Hazy" ] && [ ! -f "$PREV_THEME_FILE" ]; then
    echo "$PREV_THEME" > "$PREV_THEME_FILE"
fi

cat > "$CUSTOM_DIR/spicetify-status.txt" << 'STATUSEOF'
spicetify-existed-before=PLACEHOLDER

this file tells the uninstall script whether spicetify was already on your mac before you installed spotify remastered.
if the value above is false, the uninstall script will fully remove spicetify from your system.
if the value above is true, the uninstall script will only remove the hazy theme and lyrics-plus custom app, keeping your spicetify installation intact.
STATUSEOF
sed -i '' "s/spicetify-existed-before=PLACEHOLDER/spicetify-existed-before=$SPICETIFY_EXISTED_BEFORE/" "$CUSTOM_DIR/spicetify-status.txt"

cat > "$CUSTOM_DIR/about-this-folder.txt" << 'EOF'
this folder is used by spotify remastered. please do not delete it or any of its files while spotify remastered is installed.

here is what each file does:

- com.spotify-remastered.updater.plist: launchd agent that runs on login to keep spicetify applied after spotify updates itself.
- spotify-remastered-updater.sh: the actual updater script run by the launchd agent.
- spicetify-status.txt: stores whether spicetify was already on your mac before you installed spotify remastered. the uninstall script reads this to know whether to fully remove spicetify or just remove the theme and custom app.
- prev-theme.txt: if this file exists it stores the name of your previous spicetify theme so it can be restored when you uninstall spotify remastered.
- about-this-folder.txt: this file.
EOF

spicetify config inject_css 1
spicetify config replace_colors 1
spicetify config overwrite_assets 1
spicetify config inject_theme_js 1
spicetify config current_theme Hazy
spicetify config custom_apps lyrics-plus
spicetify backup apply
spicetify apply

LAUNCH_ANSWER=$(osascript -e 'tell application "System Events" to button returned of (display dialog "Do you want Spotify to launch every time you log in?" buttons {"No", "Yes"} default button "No" with title "Spotify Remastered Setup")' 2>/dev/null || echo "No")

HELPER_SCRIPT="$CUSTOM_DIR/spotify-remastered-updater.sh"
cat > "$HELPER_SCRIPT" << 'HELPEREOF'
#!/bin/bash
sleep 10
SPICE=$(command -v spicetify 2>/dev/null)
if [ -n "$SPICE" ]; then
    "$SPICE" upgrade &
    UPGRADE_PID=$!
    ( sleep 60; kill "$UPGRADE_PID" 2>/dev/null ) &
    TIMER_PID=$!
    wait "$UPGRADE_PID" 2>/dev/null || true
    kill "$TIMER_PID" 2>/dev/null || true
fi
pkill -9 -xi spotify >/dev/null 2>&1 || true
spicetify backup apply
sleep 5
HELPEREOF

if [ "$LAUNCH_ANSWER" != "Yes" ]; then
    echo 'pkill -9 -xi spotify >/dev/null 2>&1 || true' >> "$HELPER_SCRIPT"
fi

chmod +x "$HELPER_SCRIPT"

PLIST_NAME="com.spotify-remastered.updater"
PLIST_PATH="$HOME/Library/LaunchAgents/$PLIST_NAME.plist"
mkdir -p "$HOME/Library/LaunchAgents"

launchctl bootout "gui/$(id -u)/$PLIST_NAME" 2>/dev/null || launchctl unload "$PLIST_PATH" 2>/dev/null || true
cat > "$PLIST_PATH" << PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>$PLIST_NAME</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>$HELPER_SCRIPT</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/spotify-remastered-updater.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/spotify-remastered-updater.log</string>
</dict>
</plist>
PLISTEOF
launchctl bootstrap "gui/$(id -u)" "$PLIST_PATH" 2>/dev/null || launchctl load "$PLIST_PATH" 2>/dev/null || true

rm -f "$TEMP_ZIP"
rm -rf "$TEMP_EXTRACT"

spicetify apply

kill "$KILL_PID" >/dev/null 2>&1 || true
wait "$KILL_PID" >/dev/null 2>&1 || true

open -a Spotify

sleep 3
osascript -e 'tell application "Terminal" to close front window' 2>/dev/null || true
exit 0