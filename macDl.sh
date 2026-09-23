#!/bin/bash
set -euo pipefail

temporary=$(mktemp -d "${TMPDIR:-/tmp}/spotify-remastered.XXXXXX")
runtime_stopped=false
install_succeeded=false
loaded_agents=""
agents_dir="$HOME/Library/LaunchAgents"
rollback() {
    result=$?
    rollback_failed=false
    trap - EXIT
    if [ "$install_succeeded" != true ] && [ -n "${root:-}" ]; then
        if [ "$runtime_stopped" = true ]; then
            for agent in com.spotify-remastered.updater com.spotify-remastered.download-helper; do
                launchctl bootout "gui/$(id -u)/$agent" >/dev/null 2>&1 || true
            done
            "$python" "$root/scripts/install-state.py" stop "$root" || true
        fi
        if [ -d "$temporary/previous-scripts" ]; then
            if [ "$runtime_stopped" = true ]; then rm -rf "$root/scripts"; fi
            mkdir -p "$root/scripts"
            cp -R "$temporary/previous-scripts/." "$root/scripts/" || { echo 'Could not restore previous helper scripts.' >&2; rollback_failed=true; }
        fi
        if [ "$runtime_stopped" = true ]; then
            for agent in com.spotify-remastered.updater com.spotify-remastered.download-helper; do
                plist="$agents_dir/$agent.plist"
                if [ -f "$temporary/$agent.plist" ]; then
                    cp "$temporary/$agent.plist" "$plist" || rollback_failed=true
                else
                    rm -f "$plist"
                fi
            done
            for agent in $loaded_agents; do
                launchctl bootstrap "gui/$(id -u)" "$agents_dir/$agent.plist" || { echo "Could not restore $agent; recovery records were retained." >&2; rollback_failed=true; }
            done
        fi
    fi
    if [ "$rollback_failed" = true ]; then echo "Previous runtime backup retained at $temporary." >&2; else rm -rf "$temporary"; fi
    exit "$result"
}
trap rollback EXIT
curl -fL --retry 2 -o "$temporary/source.zip" "https://github.com/AleksandarPetrovv/spotify-remastered/archive/refs/tags/v1.9.zip"
unzip -q "$temporary/source.zip" -d "$temporary/source"
sources=("$temporary/source"/*)
if [ "${#sources[@]}" -ne 1 ] || [ ! -d "${sources[0]}" ]; then echo 'Invalid release archive.' >&2; exit 1; fi
repo="${sources[0]}"
for file in setup-downloader.sh setup-downloader.py downloader-requirements.txt install-state.py update-spicetify.py link-helper.py download-playlist.py about-this-folder.txt; do
    if [ ! -f "$repo/hazy/extensions/$file" ]; then echo "Missing installation file: $file" >&2; exit 1; fi
done
root="$HOME/.local/share/spotify-remastered"
if [ -L "$root" ] || [ -L "$root/scripts" ]; then echo 'Linked support directories are not supported.' >&2; exit 1; fi
mkdir -p "$root/dependencies" "$root/data" "$root/cache" "$root/scripts"
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.spicetify:$PATH"
if [ -d "$root/scripts" ]; then cp -R "$root/scripts" "$temporary/previous-scripts"; fi
for agent in com.spotify-remastered.updater com.spotify-remastered.download-helper; do
    plist="$agents_dir/$agent.plist"
    if [ -f "$plist" ]; then cp "$plist" "$temporary/$agent.plist"; fi
    if launchctl print "gui/$(id -u)/$agent" >/dev/null 2>&1; then loaded_agents="$loaded_agents $agent"; fi
done
for file in setup-downloader.sh setup-downloader.py downloader-requirements.txt install-state.py; do cp "$repo/hazy/extensions/$file" "$root/scripts/$file"; done
bash "$root/scripts/setup-downloader.sh" "$root"
python="$root/dependencies/downloader/bin/python"
existed=true
if ! command -v spicetify >/dev/null 2>&1; then
    curl -fL --retry 2 https://raw.githubusercontent.com/spicetify/cli/main/install.sh -o "$temporary/spicetify-install.sh"
    sed -i '' '/Do you want to install spicetify Marketplace/,/spicetify-marketplace/d' "$temporary/spicetify-install.sh"
    "$python" "$repo/hazy/extensions/install-spicetify-mac.py" "$root" "$temporary/spicetify-install.sh"
    existed=false
fi
spice=$(command -v spicetify)
"$spice" >/dev/null
"$spice" upgrade
config=$("$spice" -c)
cfg=$(dirname "$config")
"$python" -c 'import runpy,sys; runpy.run_path(sys.argv[1])["managed_ffmpeg"]()' "$repo/hazy/extensions/download-playlist.py"
"$python" "$repo/hazy/extensions/setup-link-tools.py"
runtime_stopped=true
for agent in $loaded_agents; do launchctl bootout "gui/$(id -u)/$agent"; done
"$python" "$root/scripts/install-state.py" stop "$root"
pkill -x Spotify 2>/dev/null || true
"$python" "$root/scripts/install-state.py" capture "$root" "$cfg" "$existed"
if [ ! -f "$root/data/spicetify-status.txt" ]; then printf 'spicetify-existed-before=%s\n' "$existed" > "$root/data/spicetify-status.txt"; fi
"$python" - "$cfg" "$repo" <<'PY'
import shutil, sys
from pathlib import Path
cfg, repo = map(Path, sys.argv[1:])
for relative, source in [('Themes/Hazy', repo/'hazy'), ('CustomApps/lyrics-plus', repo/'lyrics-plus')]:
    target = cfg/relative
    if target.is_symlink() or not target.resolve().is_relative_to(cfg.resolve()): raise RuntimeError('Invalid installation destination')
    if target.exists(): shutil.rmtree(target)
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(source, target)
(cfg/'Extensions').mkdir(exist_ok=True)
for name in ['download.js','link-import.js']: shutil.copy2(repo/'hazy/extensions'/name, cfg/'Extensions'/name)
shutil.copy2(repo/'lyrics-plus/components/PlaybarButton.js', cfg/'Extensions/lyrics-plus-button.js')
PY
cp "$repo/macDel.sh" "$root/scripts/macDel.sh"
if [ -f "$repo/hazy/extensions/collection_metadata.py" ]; then cp "$repo/hazy/extensions/collection_metadata.py" "$root/scripts/collection_metadata.py"; fi
if [ -f "$repo/hazy/extensions/uninstall-helper.py" ]; then cp "$repo/hazy/extensions/uninstall-helper.py" "$root/scripts/uninstall-helper.py"; fi
for file in download-helper.sh download-playlist.py download-runner.py link-helper.py setup-link-tools.py repair-spicetify.py update-spicetify.py; do
    cp "$repo/hazy/extensions/$file" "$root/scripts/$file"
done
# keep the login repair current even when the bundle archive is pinned.
cat > "$root/scripts/update-spicetify.py" <<'REMASTERED_UPDATER'
import os
import fcntl
import logging
from logging.handlers import RotatingFileHandler
import signal
import subprocess
import sys
import time
from pathlib import Path


root = Path(__file__).resolve().parent.parent
spice = sys.argv[1]
cache = root / 'cache'
cache.mkdir(parents=True, exist_ok=True)
lock = (cache / 'startup.lock').open('a')
try:
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
except BlockingIOError:
    sys.exit(0)
logger = logging.getLogger('startup')
logger.setLevel(logging.INFO)
handler = RotatingFileHandler(cache / 'startup.log', maxBytes=262144, backupCount=1)
handler.setFormatter(logging.Formatter('%(asctime)s %(message)s'))
logger.addHandler(handler)
os.environ['PATH'] = str(Path(spice).parent) + os.pathsep + os.environ.get('PATH', '')


def run(arguments):
    with subprocess.Popen(arguments, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                          text=True, errors='replace', start_new_session=True) as process:
        try:
            output, _ = process.communicate(timeout=180)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            process.communicate()
            raise RuntimeError(f'{arguments[1:]} timed out')
        logger.info('%s: %s', arguments[1:], output[-8192:])
        if process.returncode:
            raise RuntimeError(f'{arguments[1:]} exited with code {process.returncode}')


try:
    upgraded = applied = False
    for attempt in range(3):
        if attempt:
            time.sleep(15 * attempt)
        if not upgraded:
            try:
                run([spice, 'upgrade'])
                upgraded = True
            except (OSError, RuntimeError) as error:
                logger.warning('upgrade attempt %s failed: %s', attempt + 1, error)
        if not applied or upgraded:
            try:
                subprocess.run(['pkill', '-x', 'Spotify'], check=False)
                run([sys.executable, str(root / 'scripts/repair-spicetify.py')])
                run([spice, 'backup', 'apply', '-n'])
                applied = True
            except (OSError, RuntimeError) as error:
                applied = False
                logger.warning('apply attempt %s failed: %s', attempt + 1, error)
        if upgraded and applied:
            break
    if not applied:
        raise RuntimeError('customization could not be applied after three attempts')
    if sys.argv[2] == 'yes':
        run(['open', '-a', 'Spotify'])
    logger.info('startup finished; upgrade successful: %s; customization applied: %s', upgraded, applied)
except Exception:
    logger.exception('startup failed')
    sys.exit(1)
REMASTERED_UPDATER
spotify=$("$python" - "$config" <<'PY'
import configparser, sys
c=configparser.RawConfigParser(); c.read(sys.argv[1]); print(c.get('Setting','spotify_path'))
PY
)
if grep -Eq '^version[[:space:]]*=[[:space:]]*[^[:space:]]' "$config"; then "$spice" restore backup; fi
"$python" "$root/scripts/install-state.py" spotx-before "$root" "$spotify"
premium=$(osascript -e 'tell application "System Events" to button returned of (display dialog "Do you have Spotify Premium?" buttons {"Yes", "No"} default button "Yes" with title "Spotify Remastered Setup")')
flags=(-h)
[ "$premium" = Yes ] && flags+=(-p)
curl -fL --retry 2 https://spotx-official.github.io/run.sh -o "$temporary/spotx.sh"
bash "$temporary/spotx.sh" -f "${flags[@]}"
"$python" "$root/scripts/install-state.py" spotx-after "$root" "$spotify"
for key in inject_css replace_colors overwrite_assets inject_theme_js; do "$spice" config "$key" 1; done
"$spice" config current_theme Hazy
"$spice" config custom_apps lyrics-plus
for extension in download.js link-import.js lyrics-plus-button.js; do "$spice" config extensions "$extension"; done
"$python" "$root/scripts/repair-spicetify.py"
"$spice" backup apply
launch=$(osascript -e 'tell application "System Events" to button returned of (display dialog "Do you want Spotify to launch every time you log in?" buttons {"Yes", "No"} default button "Yes" with title "Spotify Remastered Setup")')
"$python" - "$root" "$spice" "$launch" "$PATH" <<'PY'
import plistlib, sys
from pathlib import Path
root=Path(sys.argv[1]); python=str(root/'dependencies/downloader/bin/python')
agents=Path.home()/'Library/LaunchAgents'; agents.mkdir(parents=True,exist_ok=True)
env={'PATH':sys.argv[4], 'SR_PYTHON':python}
items=[{'Label':'com.spotify-remastered.download-helper','ProgramArguments':['/bin/bash',str(root/'scripts/download-helper.sh')],
        'EnvironmentVariables':env,'inetdCompatibility':{'Wait':False},
        'Sockets':{'Listeners':{'SockNodeName':'127.0.0.1','SockServiceName':'27382','SockType':'stream'}}},
       {'Label':'com.spotify-remastered.updater','ProgramArguments':[python,str(root/'scripts/update-spicetify.py'),sys.argv[2],sys.argv[3].lower()],
        'EnvironmentVariables':env,'RunAtLoad':False,'StartInterval':86400}]
for item in items:
    with (agents/(item['Label']+'.plist')).open('wb') as output: plistlib.dump(item,output)
PY
for agent in com.spotify-remastered.download-helper com.spotify-remastered.updater; do
    plist="$agents_dir/$agent.plist"
    plutil -lint "$plist" >/dev/null
    launchctl bootstrap "gui/$(id -u)" "$plist"
done
"$python" - "$agents_dir/com.spotify-remastered.updater.plist" <<'PY'
import plistlib,sys
# the loaded job stays idle during setup; the next login loads runatload.
path=sys.argv[1]
with open(path,'rb') as source: settings=plistlib.load(source)
settings['RunAtLoad']=True
settings.pop('StartInterval',None)
with open(path,'wb') as output: plistlib.dump(settings,output)
PY
"$python" - <<'PY'
import json,time
from urllib.request import urlopen
for attempt in range(20):
    try:
        with urlopen('http://127.0.0.1:27382/health',timeout=2) as response:
            if json.load(response).get('service')=='spotify-remastered': break
    except OSError: pass
    time.sleep(.5)
else: raise RuntimeError('The download listener did not start; installation records were kept for repair.')
PY
cp "$repo/hazy/extensions/about-this-folder.txt" "$root/about-this-folder.txt"
open -a Spotify
install_succeeded=true
echo 'Spotify Remastered installed successfully.'
