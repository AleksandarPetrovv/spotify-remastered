import configparser
import hashlib
import json
import os
import shutil
import signal
import subprocess
import sys
from pathlib import Path


EXTENSIONS = ['download.js', 'link-import.js', 'lyrics-plus-button.js']
ASSETS = ['Themes/Hazy', 'CustomApps/lyrics-plus'] + ['Extensions/' + name for name in EXTENSIONS]
SETTINGS = ['inject_css', 'replace_colors', 'overwrite_assets', 'inject_theme_js', 'current_theme']


def read_config(path):
    config = configparser.RawConfigParser(strict=False)
    config.read(path, encoding='utf-8-sig')
    return config


def save(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(data, indent=2), encoding='utf-8')
    temporary.replace(path)


def remove_asset(cfg, relative):
    path = cfg / relative
    if path.is_symlink() or not path.resolve().is_relative_to(cfg.resolve()):
        raise RuntimeError('Refusing to remove an asset outside its installation directory.')
    if path.is_dir():
        shutil.rmtree(path)
    else:
        path.unlink(missing_ok=True)


def capture(root, cfg, existed):
    state_path = root / 'data/install-state.json'
    new_cycle = False
    if state_path.exists():
        previous = json.loads(state_path.read_text())
        if previous.get('active', True):
            return
        new_cycle = True
    legacy = root / 'data/spicetify-status.txt'
    if not legacy.exists():
        legacy = root / 'spicetify-status.txt'
    upgrading = legacy.exists() and not new_cycle
    if upgrading:
        existed = 'spicetify-existed-before=false' not in legacy.read_text(encoding='utf-8-sig').lower()
    config = read_config(cfg / 'config-xpui.ini')
    settings = {key: config.get('Setting', key, fallback=None) for key in SETTINGS}
    extensions = config.get('AdditionalOptions', 'extensions', fallback='').split('|')
    apps = config.get('AdditionalOptions', 'custom_apps', fallback='').split('|')
    if upgrading:
        previous = root / 'data/prev-theme.txt'
        if not previous.exists():
            previous = root / 'prev-theme.txt'
        settings = {'current_theme': previous.read_text(encoding='utf-8-sig').strip() if previous.exists() else ''}
        if not settings['current_theme']:
            settings['inject_theme_js'] = '0'
        extensions = [item for item in extensions if item not in EXTENSIONS]
        apps = [item for item in apps if item != 'lyrics-plus']
    saved = []
    if not upgrading:
        for relative in ASSETS:
            source = cfg / relative
            target = root / 'data/previous-assets' / relative
            if source.exists():
                target.parent.mkdir(parents=True, exist_ok=True)
                if source.is_dir():
                    shutil.copytree(source, target, dirs_exist_ok=True)
                else:
                    shutil.copy2(source, target)
                saved.append(relative)
    save(state_path, dict(existed=existed, config=str(cfg), settings=settings,
                         extensions=extensions, apps=apps, assets=saved, legacy=upgrading, active=True))
    if new_cycle:
        (root/'data/spotx-state.json').unlink(missing_ok=True)


def restore(root, cfg):
    state_path = root / 'data/install-state.json'
    if not state_path.exists():
        capture(root, cfg, True)
    state = json.loads(state_path.read_text())
    if Path(state['config']).resolve() != cfg.resolve():
        raise RuntimeError('Saved configuration belongs to another Spicetify installation.')
    config = read_config(cfg / 'config-xpui.ini')
    for section in ['Setting', 'AdditionalOptions']:
        if not config.has_section(section):
            config.add_section(section)
    for key, value in state['settings'].items():
        if value is None:
            config.remove_option('Setting', key)
        else:
            config.set('Setting', key, value)
    for key, owned, previous in [('extensions', EXTENSIONS, state['extensions']), ('custom_apps', ['lyrics-plus'], state['apps'])]:
        current = config.get('AdditionalOptions', key, fallback='').split('|')
        values = [value for value in current if value and value not in owned]
        for value in previous:
            if value and value not in values:
                values.append(value)
        config.set('AdditionalOptions', key, '|'.join(values))
    path = cfg / 'config-xpui.ini'
    with path.open('w', encoding='utf-8') as output:
        config.write(output)
    for relative in ASSETS:
        remove_asset(cfg, relative)
        if relative in state['assets']:
            source = root / 'data/previous-assets' / relative
            destination = cfg / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            if source.is_dir():
                shutil.copytree(source, destination)
            else:
                shutil.copy2(source, destination)


def stop_helpers(root):
    if os.name == 'nt':
        return
    rows = subprocess.check_output(['ps', '-axo', 'pid=,ppid=,command='], text=True).splitlines()
    processes = {}
    for row in rows:
        fields = row.strip().split(None, 2)
        if len(fields) == 3:
            processes[int(fields[0])] = (int(fields[1]), fields[2])
    names = ['download-helper.sh', 'download-runner.py', 'download-playlist.py', 'link-helper.py', 'spotify-remastered-updater.sh', 'update-spicetify.py']
    selected = {pid for pid, (_, command) in processes.items() if pid != os.getpid() and any(str(root / 'scripts' / name) in command for name in names)}
    while True:
        expanded = selected | {pid for pid, (parent, _) in processes.items() if parent in selected}
        if expanded == selected:
            break
        selected = expanded
    for pid in sorted(selected, reverse=True):
        try:
            os.kill(pid, signal.SIGKILL)
        except ProcessLookupError:
            pass


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def spotx(root, spotify, action):
    if os.name != 'nt' and spotify.name == 'Resources' and spotify.parent.name == 'Contents':
        spotify = spotify.parent.parent
    state_path = root / 'data/spotx-state.json'
    backup = root / 'data/spotx-original'
    def candidates():
        folders = [spotify / 'Apps'] if os.name == 'nt' else [spotify / 'Contents/Resources/Apps']
        files = [spotify / name for name in ['Spotify.exe', 'Spotify.dll', 'chrome_elf.dll']] if os.name == 'nt' else [spotify / 'Contents/MacOS/Spotify']
        if os.name == 'nt':
            files.extend(spotify.glob('*.bak'))
        for folder in folders:
            if folder.exists():
                files.extend(file for file in folder.rglob('*') if file.is_file())
        return [file for file in files if file.is_file() and not file.is_symlink()]
    if action == 'before':
        if state_path.exists():
            return
        files = candidates()
        records = {}
        for file in files:
            if not file.is_file() or file.is_symlink():
                continue
            relative = str(file.relative_to(spotify))
            target = backup / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(file, target)
            records[relative] = {'before': digest(file)}
        save(state_path, {'spotify': str(spotify), 'files': records, 'finalized': False})
    elif state_path.exists():
        state = json.loads(state_path.read_text())
        if Path(state['spotify']).resolve() != spotify.resolve():
            raise RuntimeError('Spotify installation path changed; original patch backup retained.')
        if action == 'after':
            if state['finalized']:
                return
            for file in candidates():
                state['files'].setdefault(str(file.relative_to(spotify)), {'before': None})
            for relative in list(state['files']):
                file = spotify / relative
                after = digest(file) if file.is_file() else None
                if after == state['files'][relative]['before']:
                    (backup / relative).unlink(missing_ok=True)
                    del state['files'][relative]
                else:
                    state['files'][relative]['after'] = after
            state['finalized'] = True
            save(state_path, state)
        elif action == 'restore':
            pending = []
            for relative, record in state['files'].items():
                file = spotify / relative
                current = digest(file) if file.is_file() else None
                if current == record['before']:
                    continue
                if current != record.get('after'):
                    raise RuntimeError('Spotify changed since patching; original files retained for recovery.')
                pending.append((relative, record))
            for relative, record in pending:
                file = spotify / relative
                if record['before'] is None:
                    file.unlink(missing_ok=True)
                    continue
                file.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(backup / relative, file)


if __name__ == '__main__':
    action, directory = sys.argv[1:3]
    root = Path(directory).resolve()
    if action == 'capture':
        capture(root, Path(sys.argv[3]).resolve(), sys.argv[4].lower() == 'true')
    elif action == 'restore':
        restore(root, Path(sys.argv[3]).resolve())
    elif action == 'stop':
        stop_helpers(root)
    elif action.startswith('spotx-'):
        spotx(root, Path(sys.argv[3]).resolve(), action[6:])
    elif action == 'complete':
        path = root/'data/install-state.json'
        state = json.loads(path.read_text())
        state['active'] = False
        save(path, state)
