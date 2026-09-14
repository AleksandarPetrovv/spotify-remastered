import configparser
import base64
import ctypes
import hashlib
import json
import os
import re
import shutil
import signal
import subprocess
import sys
import uuid
from pathlib import Path


EXTENSIONS = ['download.js', 'link-import.js', 'lyrics-plus-button.js']
ASSETS = ['Themes/Hazy', 'CustomApps/lyrics-plus'] + ['Extensions/' + name for name in EXTENSIONS]
SETTINGS = ['inject_css', 'replace_colors', 'overwrite_assets', 'inject_theme_js', 'current_theme']
_darwin_attributes = None


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


def backup_directory(root, state, key, fallback):
    relative = Path(state.get(key, fallback))
    parent = 'data/asset-backups' if key == 'assets_backup' else 'data/spotx-backups'
    if relative != Path(fallback) and (relative.parent != Path(parent) or not re.fullmatch(r'[a-f0-9]{32}', relative.name)):
        raise RuntimeError('Invalid recovery backup directory.')
    path = root / relative
    if (root / 'data').is_symlink() or path.is_symlink() or not path.resolve().is_relative_to((root / 'data').resolve()):
        raise RuntimeError('Invalid recovery backup directory.')
    return path


def capture(root, cfg, existed):
    state_path = root / 'data/install-state.json'
    new_cycle = False
    previous_state = None
    if state_path.exists():
        previous = json.loads(state_path.read_text())
        previous_state = previous
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
    snapshot = root / 'data/asset-backups' / uuid.uuid4().hex
    if not upgrading:
        try:
            snapshot.mkdir(parents=True)
            for relative in ASSETS:
                source = cfg / relative
                target = snapshot / relative
                if source.is_symlink():
                    raise RuntimeError('Cannot snapshot a linked installation asset.')
                if source.exists():
                    target.parent.mkdir(parents=True, exist_ok=True)
                    if source.is_dir():
                        shutil.copytree(source, target)
                    else:
                        shutil.copy2(source, target)
                    saved.append(relative)
        except BaseException:
            if snapshot.exists():
                shutil.rmtree(snapshot)
            raise
    save(state_path, dict(existed=existed, config=str(cfg), settings=settings,
                         extensions=extensions, apps=apps, assets=saved, legacy=upgrading, active=True,
                         assets_backup=str(snapshot.relative_to(root))))
    if previous_state is not None:
        old_backup = backup_directory(root, previous_state, 'assets_backup', 'data/previous-assets')
        if old_backup.exists() and old_backup != snapshot:
            shutil.rmtree(old_backup, ignore_errors=True)
    if new_cycle:
        (root/'data/spotx-state.json').unlink(missing_ok=True)


def restore(root, cfg):
    state_path = root / 'data/install-state.json'
    if not state_path.exists():
        capture(root, cfg, True)
    state = json.loads(state_path.read_text())
    if Path(state['config']).resolve() != cfg.resolve():
        raise RuntimeError('Saved configuration belongs to another Spicetify installation.')
    asset_backup = backup_directory(root, state, 'assets_backup', 'data/previous-assets')
    for relative in state['assets']:
        source = asset_backup / relative
        if relative not in ASSETS or source.is_symlink() or not source.exists() or not source.resolve().is_relative_to(asset_backup.resolve()):
            raise RuntimeError('An original installation asset is missing; current assets and recovery records were retained.')
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
            source = asset_backup / relative
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


def darwin_attributes():
    global _darwin_attributes
    if _darwin_attributes is None:
        library = ctypes.CDLL('/usr/lib/libSystem.B.dylib', use_errno=True)
        library.listxattr.argtypes = [ctypes.c_char_p, ctypes.c_void_p, ctypes.c_size_t, ctypes.c_int]
        library.listxattr.restype = ctypes.c_ssize_t
        arguments = [ctypes.c_char_p, ctypes.c_char_p, ctypes.c_void_p, ctypes.c_size_t, ctypes.c_uint32, ctypes.c_int]
        library.getxattr.argtypes = arguments
        library.getxattr.restype = ctypes.c_ssize_t
        library.setxattr.argtypes = arguments
        library.setxattr.restype = ctypes.c_int
        library.removexattr.argtypes = [ctypes.c_char_p, ctypes.c_char_p, ctypes.c_int]
        library.removexattr.restype = ctypes.c_int
        _darwin_attributes = library
    return _darwin_attributes


def attribute_result(result, path):
    if result < 0:
        error = ctypes.get_errno()
        raise OSError(error, os.strerror(error), str(path))
    return result


def read_attributes(path):
    if sys.platform != 'darwin':
        if hasattr(os, 'listxattr'):
            return {name: base64.b64encode(os.getxattr(path, name, follow_symlinks=False)).decode('ascii')
                    for name in os.listxattr(path, follow_symlinks=False)}
        return {}
    library = darwin_attributes()
    encoded = os.fsencode(path)
    length = attribute_result(library.listxattr(encoded, None, 0, 1), path)
    names = ctypes.create_string_buffer(length)
    length = attribute_result(library.listxattr(encoded, names, length, 1), path)
    attributes = {}
    for name in names.raw[:length].split(b'\0'):
        if not name:
            continue
        size = attribute_result(library.getxattr(encoded, name, None, 0, 0, 1), path)
        value = ctypes.create_string_buffer(size)
        size = attribute_result(library.getxattr(encoded, name, value, size, 0, 1), path)
        attributes[os.fsdecode(name)] = base64.b64encode(value.raw[:size]).decode('ascii')
    return attributes


def set_attribute(path, name, value):
    if sys.platform != 'darwin':
        os.setxattr(path, name, value, follow_symlinks=False)
    else:
        data = ctypes.create_string_buffer(value)
        attribute_result(darwin_attributes().setxattr(os.fsencode(path), os.fsencode(name), data, len(value), 0, 1), path)


def remove_attribute(path, name):
    if sys.platform != 'darwin':
        os.removexattr(path, name, follow_symlinks=False)
    else:
        attribute_result(darwin_attributes().removexattr(os.fsencode(path), os.fsencode(name), 1), path)


def bundle_attributes(spotify):
    return {str(path.relative_to(spotify)): attributes
            for path in [spotify, *spotify.rglob('*')] if not path.is_symlink()
            for attributes in [read_attributes(path)] if attributes}


def spotx(root, spotify, action):
    mac = sys.platform == 'darwin'
    if mac and spotify.name == 'Resources' and spotify.parent.name == 'Contents':
        spotify = spotify.parent.parent
    state_path = root / 'data/spotx-state.json'
    def candidates():
        if mac:
            # deep signing changes nested binaries as well as signature files.
            return [file for file in spotify.rglob('*') if file.is_file() and not file.is_symlink()]
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
        backup = root / 'data/spotx-backups' / uuid.uuid4().hex
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
        save(state_path, {'spotify': str(spotify), 'files': records, 'finalized': False,
                          'backup': str(backup.relative_to(root)), 'bundle_snapshot': mac,
                          'attributes': bundle_attributes(spotify) if mac else {}})
    elif state_path.exists():
        state = json.loads(state_path.read_text())
        backup = backup_directory(root, state, 'backup', 'data/spotx-original')
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
            if mac:
                before = state.get('attributes', {})
                after = bundle_attributes(spotify)
                state['attributes'] = {relative: {'before': before.get(relative, {}), 'after': after.get(relative, {})}
                                       for relative in before.keys() | after.keys() if before.get(relative, {}) != after.get(relative, {})}
            save(state_path, state)
        elif action == 'restore':
            if not state.get('finalized'):
                raise RuntimeError('SpotX setup did not finish; original files were retained for recovery.')
            if mac and not state.get('bundle_snapshot'):
                raise RuntimeError('This older recovery record does not cover app signing. Reinstall the matching stock Spotify build; original files were retained.')
            pending = []
            for relative, record in state['files'].items():
                file = spotify / relative
                current = digest(file) if file.is_file() else None
                if current == record['before']:
                    continue
                if current != record.get('after'):
                    raise RuntimeError('Spotify changed since patching; original files retained for recovery.')
                pending.append((relative, record))
            if mac:
                for relative, attributes in state.get('attributes', {}).items():
                    path = spotify / relative
                    current = read_attributes(path) if path.exists() else {}
                    if current not in (attributes['before'], attributes['after']):
                        raise RuntimeError('Spotify security attributes changed since patching; recovery records retained.')
            for relative, record in pending:
                file = spotify / relative
                if record['before'] is None:
                    file.unlink(missing_ok=True)
                    continue
                file.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(backup / relative, file)
            if mac:
                for relative, attributes in state.get('attributes', {}).items():
                    path = spotify / relative
                    if not path.exists():
                        continue
                    current = read_attributes(path)
                    for name in attributes['after'].keys() - attributes['before'].keys():
                        if name in current:
                            remove_attribute(path, name)
                    for name, value in attributes['before'].items():
                        set_attribute(path, name, base64.b64decode(value))
        elif action == 'reset':
            for relative, record in state['files'].items():
                file = spotify / relative
                if (digest(file) if file.is_file() else None) != record['before']:
                    raise RuntimeError('Restore the previous patch before starting a new installation cycle.')
            if backup.exists():
                shutil.rmtree(backup)
            state_path.unlink()


def check_restore(root, cfg):
    state = json.loads((root / 'data/install-state.json').read_text(encoding='utf-8-sig'))
    if Path(state['config']).resolve() != cfg.resolve():
        raise RuntimeError('Saved configuration belongs to another installation.')
    backup = backup_directory(root, state, 'assets_backup', 'data/previous-assets')
    for relative in state['assets']:
        source = backup / relative
        if relative not in ASSETS or source.is_symlink() or not source.exists() or not source.resolve().is_relative_to(backup.resolve()):
            raise RuntimeError('An original installation asset is missing.')
    record = root / 'data/spotx-state.json'
    if record.exists():
        patch = json.loads(record.read_text(encoding='utf-8-sig'))
        if sys.platform == 'darwin' and not patch.get('bundle_snapshot'):
            raise RuntimeError('This older recovery record does not cover app signing. Repair the Spotify installation before uninstalling.')
        if not patch.get('finalized'):
            raise RuntimeError('SpotX setup did not finish; repair setup before uninstalling.')
        backup = backup_directory(root, patch, 'backup', 'data/spotx-original')
        for relative, info in patch['files'].items():
            source = backup / relative
            if not source.resolve().is_relative_to(backup.resolve()):
                raise RuntimeError('Invalid recovery file path.')
            if info['before'] is not None and (not source.is_file() or digest(source) != info['before']):
                raise RuntimeError('An original Spotify recovery file is missing or damaged.')


if __name__ == '__main__':
    action, directory = sys.argv[1:3]
    root = Path(directory).resolve()
    if action == 'capture':
        capture(root, Path(sys.argv[3]).resolve(), sys.argv[4].lower() == 'true')
    elif action == 'check':
        check_restore(root, Path(sys.argv[3]).resolve())
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
