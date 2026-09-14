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


ROOT = Path.home() / '.local/share/spotify-remastered'
JOBS = ROOT / 'playlist-jobs'


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
        ffmpeg = shutil.which('ffmpeg') or str(Path.home() / '.spotdl/ffmpeg')
        if not Path(ffmpeg).is_file():
            subprocess.run([str(ROOT / 'spotdl'), '--download-ffmpeg'], timeout=120,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
        while queue or active:
            if (job / 'cancel').exists():
                state['status'] = 'cancelled'
                break
            while queue and len(active) < 1:
                track, target = queue.pop(0)
                work = job / track['id']
                work.mkdir()
                try:
                    with (work / 'stdout.log').open('wb') as out, (work / 'stderr.log').open('wb') as err:
                        process = subprocess.Popen([str(ROOT / 'spotdl'), 'download',
                            'https://open.spotify.com/track/' + track['id'], '--output', '{title}.{output-ext}',
                            '--ffmpeg', ffmpeg, '--format', 'mp3', '--audio', 'youtube-music', 'youtube',
                            '--max-retries', '2'], cwd=work, stdout=out, stderr=err, start_new_session=True)
                    active.append((track, target, work, process, time.monotonic()))
                except Exception as error:
                    state['failed'].append(dict(track, message=str(error)))
            for entry in active[:]:
                track, target, work, process, started = entry
                code = process.poll()
                if code is None and time.monotonic() - started < 600:
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
    playlist_id = parse_qs(query).get('id', [''])[0]
    body = None
    if route == '/playlist':
        if length <= 0 or length > 2097152:
            raise ValueError('Invalid playlist request.')
        body = json.loads(sys.stdin.buffer.read(length))
        playlist_id = body.get('id', '')
    if not re.fullmatch(r'[a-zA-Z0-9]{22}', playlist_id):
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
    if not tracks or len(tracks) > 10000 or any(not re.fullmatch(r'[a-zA-Z0-9]{22}', track.get('id', '')) for track in tracks):
        raise ValueError('Invalid or empty playlist.')
    result = subprocess.run(['osascript', '-e', 'POSIX path of (choose folder with prompt "Select download location")'],
                            capture_output=True, text=True)
    if result.returncode != 0 or not result.stdout.strip():
        return {'status': 'no_folder'}
    folder = Path(result.stdout.strip()) / safe_name(body.get('name', 'Playlist'))
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
