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
spice=$(command -v spicetify)
config=$("$spice" -c)
cfg=$(dirname "$config")
"$python" "$state" capture "$root" "$cfg" true
for agent in com.spotify-remastered.updater com.spotify-remastered.download-helper; do
    if launchctl print "gui/$(id -u)/$agent" >/dev/null 2>&1; then launchctl bootout "gui/$(id -u)/$agent"; fi
    rm -f "$HOME/Library/LaunchAgents/$agent.plist"
done
"$python" "$state" stop "$root"
pkill -x Spotify 2>/dev/null || true
spotify=$("$python" - "$config" <<'PY'
import configparser, sys
c=configparser.RawConfigParser(); c.read(sys.argv[1]); print(c.get('Setting','spotify_path'))
PY
)
"$spice" restore
"$python" "$state" restore "$root" "$cfg"
"$python" "$root/scripts/repair-spicetify.py" --restore
"$python" "$state" spotx-restore "$root" "$spotify"
existed=$("$python" -c 'import json,sys; print(json.load(open(sys.argv[1]))["existed"])' "$root/data/install-state.json")
if [ "$existed" = True ]; then
    "$spice" backup apply
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
"$python" "$state" complete "$root"
"$python" - "$root" <<'PY'
import shutil,sys
from pathlib import Path
root=Path(sys.argv[1]).resolve(); scripts=root/'scripts'
if scripts.is_symlink() or not scripts.resolve().is_relative_to(root): raise RuntimeError('Invalid script directory')
shutil.rmtree(scripts)
PY
echo 'Spotify Remastered removed. local songs, indexes, reusable dependencies and recovery records were preserved.'
