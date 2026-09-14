#!/bin/bash
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.spicetify:$PATH"
root="$HOME/.local/share/spotify-remastered"
python="$root/dependencies/downloader/bin/python"
state="$root/scripts/install-state.py"
if [ ! -x "$python" ] || [ ! -f "$state" ]; then
    echo 'The restoration tools are missing. Repair setup before uninstalling; no user files were deleted.' >&2
    exit 1
fi
if [ "${1:-}" = --prepare ]; then
    echo 'SR_STAGE:0:Checking restoration tools'
    spice=$(command -v spicetify)
    config=$("$spice" -c)
    echo 'SR_STAGE:1:Checking saved configuration and recovery files'
    "$python" "$state" check "$root" "$(dirname "$config")"
    echo 'SR_STAGE:2:Ready to finish uninstall'
    exit 0
fi
echo 'SR_STAGE:3:Stopping background helpers and closing Spotify'
for agent in com.spotify-remastered.updater com.spotify-remastered.download-helper; do
    if launchctl print "gui/$(id -u)/$agent" >/dev/null 2>&1; then launchctl bootout "gui/$(id -u)/$agent"; fi
    rm -f "$HOME/Library/LaunchAgents/$agent.plist"
done
"$python" "$state" stop "$root"
if ! spice=$(command -v spicetify) || ! config=$("$spice" -c) || [ ! -f "$config" ]; then
    echo 'Background helpers and login entries were removed. Spicetify is unavailable; repair it to finish restoring Spotify. User files and recovery records were retained.' >&2
    exit 1
fi
cfg=$(dirname "$config")
"$python" "$state" capture "$root" "$cfg" true
pkill -x Spotify 2>/dev/null || true
spotify=$("$python" - "$config" <<'PY'
import configparser, sys
c=configparser.RawConfigParser(); c.read(sys.argv[1]); print(c.get('Setting','spotify_path'))
PY
)
echo 'SR_STAGE:4:Restoring Spotify and previous configuration'
restore_state="$state"
if ! grep -q 'def restore_spicetify(' "$state"; then
    mkdir -p "$root/cache"
    restore_state="$root/cache/uninstall-install-state.py"
    curl -fL --retry 2 https://raw.githubusercontent.com/AleksandarPetrovv/spotify-remastered/cli/hazy/extensions/install-state.py -o "$restore_state"
fi
if ! grep -q 'def restore_spicetify(' "$restore_state"; then
    echo 'The updated recovery helper is not available yet. Recovery files were retained.' >&2
    exit 1
fi
if ! "$python" "$restore_state" spicetify-restore "$root" "$cfg" "$spice"; then
    echo 'Restoration could not finish. Recovery files were retained. Repair Spotify and rerun uninstall.' >&2
    exit 1
fi
pkill -x Spotify 2>/dev/null || true
"$python" "$state" restore "$root" "$cfg"
"$python" "$root/scripts/repair-spicetify.py" --restore
"$python" "$state" spotx-restore "$root" "$spotify"
existed=$("$python" -c 'import json,sys; print(json.load(open(sys.argv[1]))["existed"])' "$root/data/install-state.json")
if [ "$existed" = True ]; then
    "$spice" backup apply -n
else
    "$python" - "$spice" "$cfg" "$root" <<'PY'
import collections, json, shutil, sys
from pathlib import Path
binary=Path(sys.argv[1]).resolve().parent; cfg=Path(sys.argv[2]).resolve()
allowed=[Path.home()/'.spicetify',Path.home()/'.local/share/spicetify']
if binary not in allowed: raise RuntimeError('Custom CLI installation retained; Spotify has been restored.')
for path in dict.fromkeys([cfg,binary]):
    if path not in [*allowed,Path.home()/'.config/spicetify']: raise RuntimeError('Custom configuration retained for manual cleanup.')
    if path.exists(): shutil.rmtree(path)
record=Path(sys.argv[3])/'data/spicetify-profile-lines.json'
if record.exists():
    for name, additions in json.loads(record.read_text()).items():
        if name not in ['.zshrc','.bashrc','.bash_profile','.profile']: continue
        path=Path.home()/name
        if not path.exists(): continue
        remaining=collections.Counter(additions); lines=[]
        for line in path.read_text().splitlines(keepends=True):
            key=line.rstrip('\r\n')
            if remaining[key]: remaining[key]-=1
            else: lines.append(line)
        path.write_text(''.join(lines))
PY
fi
echo 'SR_STAGE:5:Finishing cleanup'
"$python" "$state" complete "$root"
"$python" - "$root" <<'PY'
import os,shutil,sys
from pathlib import Path
root=Path(sys.argv[1]).absolute()
if root.is_symlink() or root != Path.home()/'.local/share/spotify-remastered': raise RuntimeError('Invalid support directory')
owned=['dependencies','cache','data','backups','scripts','about-this-folder.txt','spotdl','ffmpeg','yt-dlp','deno']
if os.environ.get('SR_DELETE_LOCAL_SONGS') == '1': owned.append('local songs')
owned += [p.name for p in root.iterdir() if p.name.startswith(('lyrics-plus-backup-','theme-backup-','settings-uninstall-backup-'))]
for name in owned:
    path=root/name
    if path.is_symlink() or not path.resolve().is_relative_to(root.resolve()): raise RuntimeError('Invalid managed directory')
for name in owned:
    path=root/name
    if path.is_dir(): shutil.rmtree(path)
    else: path.unlink(missing_ok=True)
if not any(root.iterdir()): root.rmdir()
PY
echo 'Spotify Remastered removed.'
