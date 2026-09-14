import json
import hashlib
import os
import re
import shutil
import signal
import subprocess
import sys
import time
import uuid
from pathlib import Path
from urllib.parse import parse_qs
from urllib.request import urlopen
import platform


ROOT = Path.home() / '.local/share/spotify-remastered'
JOBS = ROOT / 'cache/playlist-jobs'


def managed_ffmpeg():
    (ROOT / 'dependencies').mkdir(parents=True, exist_ok=True)
    target = ROOT / 'dependencies/ffmpeg'
    if target.is_file():
        return str(target)
    existing = shutil.which('ffmpeg') or str(Path.home() / '.spotdl/ffmpeg')
    temporary = ROOT / 'dependencies' / ('ffmpeg-' + uuid.uuid4().hex + '.pending')
    try:
        if Path(existing).is_file():
            shutil.copy2(existing, temporary)
        else:
            arch = 'arm64' if platform.machine() == 'arm64' else 'x64'
            with urlopen('https://github.com/eugeneware/ffmpeg-static/releases/download/b4.4/darwin-' + arch, timeout=120) as source, temporary.open('wb') as dest:
                shutil.copyfileobj(source, dest)
        temporary.chmod(0o755)
        result = subprocess.run([str(temporary), '-hide_banner', '-encoders'], capture_output=True, text=True, timeout=15)
        if result.returncode or 'libmp3lame' not in result.stdout:
            raise RuntimeError('FFmpeg is not compatible with MP3 downloads.')
        temporary.replace(target)
    finally:
        temporary.unlink(missing_ok=True)
    return str(target)


def safe_name(name):
    name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', '_', str(name)).strip().rstrip('.')[:80]
    return name or 'Playlist'


def write_json(path, value):
    temp = path.with_suffix('.tmp')
    temp.write_text(json.dumps(value), encoding='utf-8')
    temp.replace(path)


def terminate(process):
    if process.poll() is None:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        process.wait()


def worker(job):
    config = json.loads((job / 'request.json').read_text())
    state = {'status': 'downloading', 'saved': 0, 'skipped': 0, 'failed': [],
             'total': len(config['tracks']), 'folder': config['folder'], 'current': []}
    folder = Path(config['folder'])
    queue = []
    seen = set()
    active = []
    index_path = JOBS / (hashlib.sha256(str(folder).encode('utf-8')).hexdigest() + '.files.json')
    try:
        index = json.loads(index_path.read_text())
        index = {key: value for key, value in index.items() if Path(value).name == value}
    except (OSError, ValueError):
        index = {}
    reserved = {value: key for key, value in index.items()}
    try:
        for track in config['tracks']:
            base = safe_name(track['name'])
            name = index.get(track['id'], base + '.mp3')
            suffix = 2
            while name in reserved and reserved[name] != track['id']:
                name = base + ' (' + str(suffix) + ').mp3'
                suffix += 1
            reserved[name] = track['id']
            target = folder / name
            if track['id'] in seen or (target.is_file() and target.stat().st_size > 0):
                state['skipped'] += 1
            else:
                queue.append((track, target))
            seen.add(track['id'])
        ffmpeg = managed_ffmpeg() if any(not track['id'].startswith('spotify:local:') for track, target in queue) else None
        while queue or active:
            if (job / 'cancel').exists():
                state['status'] = 'cancelled'
                break
            while queue and len(active) < 1:
                track, target = queue.pop(0)
                if track['id'].startswith('spotify:local:'):
                    state['current'] = [track['name']]
                    state['currentIds'] = [track['id']]
                    write_json(job / 'status.json', state)
                    created = False
                    copied = False
                    try:
                        name = track.get('localFile', '')
                        root = ROOT / 'local songs'
                        source = root / name
                        if not name or Path(name).name != name or source.suffix.lower() != '.mp3' or source.is_symlink() or source.resolve().parent != root.resolve() or not source.is_file() or not source.stat().st_size:
                            raise RuntimeError('The song could not be uniquely found in local songs.')
                        with source.open('rb') as incoming, target.open('xb') as outgoing:
                            created = True
                            shutil.copyfileobj(incoming, outgoing)
                        copied = True
                        state['saved'] += 1
                        index[track['id']] = target.name
                        try:
                            write_json(index_path, index)
                        except OSError:
                            pass
                    except Exception:
                        state['failed'].append(dict(track, message='Could not copy this song from local songs. Check that its MP3 still exists and the destination is writable.'))
                    finally:
                        if created and not copied:
                            target.unlink(missing_ok=True)
                    continue
                work = job / track['id']
                work.mkdir()
                try:
                    with (work / 'stdout.log').open('wb') as out, (work / 'stderr.log').open('wb') as err:
                        runner_python = ROOT / 'dependencies/downloader/bin/python'
                        runner = ROOT / 'scripts/download-runner.py'
                        command = [str(runner_python), str(runner), '--client'] if runner_python.is_file() and runner.is_file() else [str(ROOT / 'dependencies/spotdl')]
                        process = subprocess.Popen(command + ['download',
                            'https://open.spotify.com/track/' + track['id'], '--output', '{title}.{output-ext}',
                            '--ffmpeg', ffmpeg, '--format', 'mp3', '--audio', 'youtube-music', 'youtube',
                            '--max-retries', '2'], cwd=work, stdout=out, stderr=err, start_new_session=True)
                    active.append((track, target, work, process, time.monotonic()))
                except Exception as error:
                    state['failed'].append(dict(track, message=str(error)))
            for entry in active[:]:
                track, target, work, process, started = entry
                code = process.poll()
                if (work / 'worker-started').exists():
                    started = (work / 'worker-started').stat().st_mtime
                    elapsed = time.time() - started
                elif (ROOT / 'dependencies/downloader/bin/python').is_file() and (ROOT / 'scripts/download-runner.py').is_file():
                    elapsed = 0
                else:
                    elapsed = time.monotonic() - started
                if code is None and elapsed < 600:
                    continue
                try:
                    if code is None:
                        terminate(process)
                        raise RuntimeError('Download timed out after 10 minutes.')
                    files = [file for file in work.glob('*.mp3') if file.stat().st_size > 0]
                    if code != 0 or len(files) != 1:
                        raise RuntimeError('The song could not be downloaded. Details are in the download logs.')
                    shutil.move(str(files[0]), str(target))
                    state['saved'] += 1
                    index[track['id']] = target.name
                    try:
                        write_json(index_path, index)
                    except OSError:
                        pass
                except Exception as error:
                    state['failed'].append(dict(track, message=str(error)))
                active.remove(entry)
            state['current'] = [entry[0]['name'] for entry in active]
            state['currentIds'] = [entry[0]['id'] for entry in active]
            write_json(job / 'status.json', state)
            time.sleep(0.5)
        if state['status'] != 'cancelled':
            state['status'] = 'done'
    except Exception as error:
        state['failed'].extend(dict(track, message=str(error)) for track, target in queue)
        state['failed'].extend(dict(entry[0], message=str(error)) for entry in active)
        state['status'] = 'done'
    finally:
        for entry in active:
            terminate(entry[3])
        state['current'] = []
        state['currentIds'] = []
        write_json(job / 'status.json', state)


def request(route, query, length):
    if route == 'OPTIONS':
        return {}
    if route == '/playlist-folder':
        JOBS.mkdir(parents=True, exist_ok=True)
        for previous in JOBS.glob('selection-*.json'):
            if time.time() - previous.stat().st_mtime > 1800:
                previous.unlink(missing_ok=True)
        result = subprocess.run(['osascript', '-e', 'POSIX path of (choose folder with prompt "Select download location")'], capture_output=True, text=True)
        if result.returncode or not result.stdout.strip():
            return {'status': 'no_folder'}
        token = uuid.uuid4().hex
        write_json(JOBS / ('selection-' + token + '.json'), {'folder': result.stdout.strip()})
        return {'status': 'selected', 'token': token}
    playlist_id = parse_qs(query).get('id', [''])[0]
    body = None
    if route == '/playlist':
        if length <= 0 or length > 2097152:
            raise ValueError('Invalid playlist request.')
        body = json.loads(sys.stdin.buffer.read(length))
        playlist_id = body.get('id', '')
        if body.get('kind') == 'album':
            playlist_id = 'album-' + playlist_id
    if not re.fullmatch(r'(?:album-)?[a-zA-Z0-9]{22}', playlist_id):
        raise ValueError('Invalid Spotify playlist ID.')
    JOBS.mkdir(parents=True, exist_ok=True)
    pointer = JOBS / (playlist_id + '.json')
    job = Path(json.loads(pointer.read_text())['job']) if pointer.exists() else None
    state = json.loads((job / 'status.json').read_text()) if job and (job / 'status.json').exists() else {'status': 'idle'}
    if route == '/open-folder':
        if not job or not Path(state.get('folder', '')).is_dir():
            raise RuntimeError('The download folder is no longer available.')
        subprocess.run(['open', state['folder']], check=True)
        return {'status': 'opened'}
    if route == '/playlist-status':
        if state['status'] == 'downloading':
            pid = json.loads((job / 'pid.json').read_text())['pid']
            try:
                os.kill(pid, 0)
            except ProcessLookupError:
                return {'status': 'idle'}
        return state
    if route == '/playlist-cancel':
        if job:
            (job / 'cancel').touch()
            for attempt in range(30):
                if json.loads((job / 'status.json').read_text())['status'] != 'downloading':
                    return {'status': 'cancelled'}
                time.sleep(0.1)
            raise RuntimeError('Cancellation is still pending. Try again.')
        return {'status': 'cancelled'}
    if state['status'] == 'downloading':
        return {'status': 'already_downloading'}
    tracks = body.get('tracks', [])
    if not tracks or len(tracks) > 10000 or any(not re.fullmatch(r'[a-zA-Z0-9]{22}|spotify:local:.{1,4082}', track.get('id', '')) for track in tracks):
        raise ValueError('Invalid or empty playlist.')
    token = body.get('folderToken')
    if token:
        if not re.fullmatch(r'[a-f0-9]{32}', token):
            raise ValueError('Invalid folder selection.')
        selection = JOBS / ('selection-' + token + '.json')
        if not selection.is_file() or time.time() - selection.stat().st_mtime > 1800:
            raise ValueError('Folder selection expired. Please start the download again.')
        selected = json.loads(selection.read_text())['folder']
        selection.unlink()
    else:
        result = subprocess.run(['osascript', '-e', 'POSIX path of (choose folder with prompt "Select download location")'], capture_output=True, text=True)
        if result.returncode != 0 or not result.stdout.strip():
            return {'status': 'no_folder'}
        selected = result.stdout.strip()
    folder = Path(selected) / safe_name(body.get('name', 'Playlist'))
    folder.mkdir(exist_ok=True)
    job = JOBS / uuid.uuid4().hex
    job.mkdir()
    write_json(job / 'request.json', {'tracks': tracks, 'folder': str(folder), 'name': body.get('name', 'Playlist')})
    write_json(job / 'status.json', {'status': 'downloading', 'saved': 0, 'skipped': 0, 'failed': [],
                                   'total': len(tracks), 'folder': str(folder), 'current': []})
    with (job / 'worker.log').open('wb') as log:
        process = subprocess.Popen([sys.executable, str(Path(__file__).resolve()), '--worker', str(job)],
                                   stdout=log, stderr=log, start_new_session=True)
    write_json(job / 'pid.json', {'pid': process.pid})
    write_json(pointer, {'job': str(job)})
    return {'status': 'started'}


if __name__ == '__main__':
    if sys.argv[1] == '--worker':
        worker(Path(sys.argv[2]))
    else:
        try:
            result = request(sys.argv[1], sys.argv[2], int(sys.argv[3]))
        except Exception as error:
            result = {'status': 'error', 'message': str(error)}
        body = json.dumps(result).encode('utf-8')
        headers = ('HTTP/1.1 200 OK\r\nAccess-Control-Allow-Origin: *\r\n'
                   'Access-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type\r\n'
                   'Content-Type: application/json\r\nConnection: close\r\nContent-Length: ' + str(len(body)) + '\r\n\r\n')
        sys.stdout.buffer.write(headers.encode('ascii') + body)
