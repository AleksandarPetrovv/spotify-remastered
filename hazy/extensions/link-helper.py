import json
import re
import os
import shlex
import shutil
import signal
import subprocess
import sys
import time
import uuid
import hashlib
import fcntl
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from importlib.util import spec_from_file_location, module_from_spec

ROOT = Path.home() / '.local/share/spotify-remastered'
JOBS = ROOT / 'cache/import-logs'


def migrate_song_folder():
    folder = ROOT / 'local songs'
    if not ROOT.is_dir():
        return
    migrated = False
    for previous in ROOT.iterdir():
        if previous.is_dir() and previous.name.lower() == folder.name and previous.name != folder.name:
            if not folder.exists() or previous.samefile(folder):
                try:
                    previous.rename(folder)
                    migrated = True
                except FileNotFoundError:
                    if not folder.is_dir():
                        raise
    if not migrated:
        return
    for index in (ROOT / 'data/import-index').glob('*.json'):
        try:
            record = json.loads(index.read_text(encoding='utf-8'))
            audio = Path(record['file'])
            if audio.parent.parent == ROOT and audio.parent.name.lower() == folder.name and audio.parent.name != folder.name:
                replacement = folder / audio.name
                if replacement.is_file():
                    record['file'] = str(replacement)
                    index.write_text(json.dumps(record), encoding='utf-8')
        except (OSError, ValueError, KeyError):
            continue


migrate_song_folder()


def index_path(url):
    directory = ROOT / 'data/import-index'
    directory.mkdir(parents=True, exist_ok=True)
    return directory / (hashlib.sha256(url.encode('utf-8')).hexdigest() + '.json')


def save_index(state):
    path = index_path(state['url'])
    temp = path.with_name(path.name + '.' + uuid.uuid4().hex + '.tmp')
    temp.write_text(json.dumps({key:state[key] for key in ('file','title','artist','duration','source','cover')}), encoding='utf-8')
    temp.replace(path)


def find_saved(state):
    folder = ROOT / 'local songs'
    path = index_path(state['url'])
    if path.is_file():
        record = json.loads(path.read_text(encoding='utf-8'))
        audio = Path(record['file'])
        if audio.resolve().parent == folder.resolve() and audio.is_file() and audio.stat().st_size:
            return record
    for audio in folder.glob('*.mp3'):
        result = subprocess.run([str(ROOT / 'dependencies/ffmpeg'), '-v','error','-i',str(audio),'-f','ffmetadata','-'], capture_output=True, text=True, encoding='utf-8', timeout=10)
        tags = {}
        for line in result.stdout.splitlines():
            if '=' in line:
                key, value = line.split('=',1)
                tags[key] = re.sub(r'\\(.)',r'\1',value)
        if state['url'] in (tags.get('purl'),tags.get('comment')):
            return dict(file=str(audio),title=tags['title'],artist=tags['artist'],duration=state['duration'],source=state['source'],cover=state['cover'])


def write(job, state):
    temp = job / 'status.tmp'
    temp.write_text(json.dumps(state), encoding='utf-8')
    temp.replace(job / 'status.json')


def validate(value, collection=False):
    url = urlparse(value)
    if url.scheme != 'https' or url.username or url.password or url.port not in (None, 443):
        raise ValueError('Paste a valid HTTPS song link.')
    if url.hostname in ('youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be'):
        playlist = parse_qs(url.query).get('list', [''])[0]
        if collection and re.fullmatch(r'[A-Za-z0-9_-]{1,200}', playlist):
            video = url.path.strip('/') if url.hostname == 'youtu.be' else parse_qs(url.query).get('v', [''])[0]
            if re.fullmatch(r'[A-Za-z0-9_-]{11}', video):
                return 'https://www.youtube.com/watch?v=' + video + '&list=' + playlist
            return 'https://www.youtube.com/playlist?list=' + playlist
        video = url.path.strip('/') if url.hostname == 'youtu.be' else parse_qs(url.query).get('v', [''])[0]
        match = re.fullmatch(r'/(shorts|embed)/([A-Za-z0-9_-]{11})/?', url.path)
        if match:
            video = match[2]
        if re.fullmatch(r'[A-Za-z0-9_-]{11}', video):
            return 'https://www.youtube.com/watch?v=' + video
    if collection and url.hostname in ('soundcloud.com', 'www.soundcloud.com', 'm.soundcloud.com') and re.fullmatch(r'/[^/]+(?:/[^/]+){0,3}/?', url.path):
        return value
    if collection and url.hostname in ('api.soundcloud.com', 'api-v2.soundcloud.com') and re.fullmatch(r'/playlists/(?:soundcloud(?::|%3A)playlists(?::|%3A))?[0-9]+/?', url.path):
        return value
    if url.hostname in ('api.soundcloud.com', 'api-v2.soundcloud.com') and re.fullmatch(r'/tracks/[0-9]+/?', url.path):
        return value
    if url.hostname in ('soundcloud.com', 'www.soundcloud.com') and re.fullmatch(r'/[^/]+/[^/]+/?', url.path) and not re.search(r'/(sets|likes|tracks|albums|popular-tracks)/?$', url.path):
        return value
    if url.hostname in ('on.soundcloud.com', 'snd.sc') and re.fullmatch(r'/[A-Za-z0-9]+/?', url.path):
        return value
    raise ValueError('Use a single YouTube or SoundCloud song link.')


def worker(job):
    state = json.loads((job / 'status.json').read_text(encoding='utf-8'))
    try:
        tools_config = json.loads((ROOT / 'data/download-tools.json').read_text(encoding='utf-8'))
        args = [tools_config['ytdlp'], '--js-runtimes', tools_config['runtime'], '--ignore-config', '--socket-timeout', '20', '--retries', '2']
        state['snapshot'] = bool(state.get('collection') and parse_qs(urlparse(state['url']).query).get('list',[''])[0].startswith('RD'))
        args += ['--yes-playlist','--flat-playlist','--playlist-end','50' if state['snapshot'] else '2001'] if state.get('collection') and state['status'] == 'previewing' else ['--no-playlist']
        if state['status'] == 'previewing':
            args += ['--skip-download', '--dump-single-json']
        else:
            spec = spec_from_file_location('download_playlist', ROOT / 'scripts/download-playlist.py')
            tools = module_from_spec(spec)
            spec.loader.exec_module(tools)
            ffmpeg = tools.managed_ffmpeg()
            args += ['--config-locations', str(job / 'metadata.conf'), '-x', '--audio-format', 'mp3', '--audio-quality', '0', '--ffmpeg-location', ffmpeg,
                     '--embed-metadata', '--embed-thumbnail', '--convert-thumbnails', 'jpg', '-o', 'audio.%(ext)s']
        with (job / 'stdout.log').open('wb') as out, (job / 'stderr.log').open('wb') as err:
            process = subprocess.Popen(args + ['--', state['url']], cwd=job, stdout=out, stderr=err, start_new_session=True)
            deadline = time.monotonic() + 600
            while process.poll() is None:
                if (job / 'cancel').exists() or time.monotonic() > deadline:
                    os.killpg(process.pid, signal.SIGKILL)
                    process.wait()
                    state.update(status='cancelled' if (job / 'cancel').exists() else 'error', message='Import timed out.')
                    write(job, state)
                    return
                time.sleep(.25)
        if process.returncode:
            errors = (job / 'stderr.log').read_text(encoding='utf-8', errors='replace').splitlines()
            raise RuntimeError(next((line for line in reversed(errors) if line.startswith('ERROR:')), 'The source could not be downloaded. See the import logs.'))
        if state['status'] == 'previewing':
            info = json.loads((job / 'stdout.log').read_text(encoding='utf-8'))
            metadata_spec = spec_from_file_location('collection_metadata', Path(__file__).with_name('collection_metadata.py'))
            if Path(metadata_spec.origin).is_file():
                metadata = module_from_spec(metadata_spec)
                metadata_spec.loader.exec_module(metadata)
                info = metadata.enrich(info, cachedir=str(ROOT / 'cache/source-metadata'))
            if info.get('_type') in ('playlist', 'multi_video'):
                entries = []
                def collect(items):
                    for item in items:
                        if not item:
                            continue
                        if item.get('entries'):
                            collect(item['entries'])
                            continue
                        try:
                            url = 'https://www.youtube.com/watch?v=' + item['id'] if re.fullmatch(r'[A-Za-z0-9_-]{11}', item.get('id','')) and 'soundcloud' not in info.get('extractor','').lower() else item.get('webpage_url') or item.get('url','')
                            entries.append({'url':validate(url,True),'title':item.get('title',''),'artist':item.get('uploader',''),'cover':item.get('thumbnail') or next((t['url'] for t in reversed(item.get('thumbnails') or []) if t.get('url')), ''),'collection':bool(re.search(r'/playlist(?:s/|\?)|/sets/|/albums(?:$|\?)',url))})
                        except ValueError:
                            continue
                if len(info.get('entries', [])) >= 2001:
                    raise ValueError('This collection has more than 2000 entries. Use a smaller playlist.')
                collect(info.get('entries', []))
                if len(entries) > 2000:
                    raise ValueError('This collection has more than 2000 entries. Use a smaller playlist.')
                if not entries:
                    raise ValueError('This collection has no accessible songs.')
                state.update(status='ready', entries=entries, title=info.get('title','Collection'), cover=info.get('thumbnail') or next((t['url'] for t in reversed(info.get('thumbnails',[])) if t.get('url')), entries[0].get('cover','')), source='SoundCloud' if 'soundcloud' in info.get('extractor','').lower() else 'YouTube')
                write(job, state)
                return
            if info.get('is_live') or info.get('live_status') in ('is_live', 'is_upcoming') or not info.get('duration'):
                raise ValueError('Use a finished, single song upload.')
            state.update(status='ready', title=info.get('track') or info['title'], artist=info.get('artist') or info.get('uploader', ''), duration=info['duration'],
                         cover=info.get('thumbnail', ''), source='SoundCloud' if 'soundcloud' in info['extractor'].lower() else 'YouTube')
        else:
            audio = job / 'audio.mp3'
            if not audio.is_file() or not audio.stat().st_size:
                raise RuntimeError('The downloader produced no MP3 file.')
            folder = ROOT / 'local songs'
            folder.mkdir(exist_ok=True)
            name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', '_', state['title']).strip().rstrip('.')[:80] or 'Song'
            target = folder / (name + '.mp3')
            suffix = 2
            while True:
                try:
                    destination = target.open('xb')
                    break
                except FileExistsError:
                    target = folder / f'{name} ({suffix}).mp3'
                    suffix += 1
            try:
                with destination, audio.open('rb') as source:
                    shutil.copyfileobj(source, destination)
            except Exception:
                target.unlink(missing_ok=True)
                raise
            audio.unlink()
            state.update(status='done', folder=str(folder),file=str(target))
            save_index(state)
    except Exception as error:
        state.update(status='error', message=str(error))
    write(job, state)


def start(job, state):
    write(job, state)
    with (job / 'worker.log').open('ab') as log:
        subprocess.Popen([sys.executable, str(Path(__file__).resolve()), '--worker', str(job)], stdout=log, stderr=log, start_new_session=True)


def local_catalogue():
    folder = ROOT / 'local songs'
    folder.mkdir(exist_ok=True)
    cache_dir = ROOT / 'cache'
    cache_dir.mkdir(exist_ok=True)
    cache_path = cache_dir / 'local-catalogue.json'
    with (cache_dir / 'local-catalogue.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        try:
            old = json.loads(cache_path.read_text(encoding='utf-8'))
        except (OSError, ValueError):
            old = {}
        spec = spec_from_file_location('catalogue_tools', ROOT / 'scripts/download-playlist.py')
        tools = module_from_spec(spec)
        spec.loader.exec_module(tools)
        ffmpeg = tools.managed_ffmpeg()
        indexes = {}
        for path in (ROOT / 'data/import-index').glob('*.json'):
            try:
                record = json.loads(path.read_text(encoding='utf-8'))
                indexes[record['file']] = record
            except (OSError, ValueError, KeyError):
                continue
        files = sorted(folder.glob('*.mp3'))
        def read(audio):
            try:
                stat = audio.stat()
                if not stat.st_size:
                    return None
                stamp = f'{stat.st_size}:{stat.st_mtime_ns}'
                cached = old.get(str(audio))
                if cached and cached['stamp'] == stamp:
                    return str(audio), cached
                result = subprocess.run([ffmpeg, '-hide_banner', '-i', str(audio), '-f', 'ffmetadata', '-'], capture_output=True, text=True, encoding='utf-8', timeout=10)
                if result.returncode:
                    return None
                tags = {key: re.sub(r'\\(.)', r'\1', value) for line in result.stdout.splitlines() if '=' in line for key, value in [line.split('=', 1)]}
                match = re.search(r'Duration: (\d+):(\d+):(\d+(?:\.\d+)?)', result.stderr)
                duration = int(match[1])*3600+int(match[2])*60+float(match[3]) if match else 0
                return str(audio), dict(stamp=stamp, tags=tags, duration=duration)
            except (OSError, subprocess.TimeoutExpired, ValueError, KeyError):
                return None
        with ThreadPoolExecutor(max_workers=2) as pool:
            entries = dict(item for item in pool.map(read, files) if item)
        temporary = cache_path.with_suffix('.tmp')
        temporary.write_text(json.dumps(entries), encoding='utf-8')
        temporary.replace(cache_path)
        songs = []
        for name, entry in entries.items():
            tags = entry['tags']
            songs.append(dict(file=Path(name).name, title=tags.get('title') or Path(name).stem, artist=tags.get('artist', ''), source=tags.get('album', ''), duration=entry['duration'], cover=indexes.get(name, {}).get('cover', ''), folder=str(folder)))
        return dict(status='done', songs=songs, folder=str(folder))


def request(route, query, size):
    if route == '/link-local':
        return local_catalogue()
    body = {}
    if route in ('/link-preview', '/link-download'):
        if not 0 < size <= 8192:
            raise ValueError('Invalid import request.')
        body = json.loads(sys.stdin.buffer.read(size))
    identifier = body.get('id') or parse_qs(query).get('id', [''])[0]
    JOBS.mkdir(parents=True, exist_ok=True)
    inactive = []
    for path in JOBS.glob('*/status.json'):
        state = json.loads(path.read_text(encoding='utf-8'))
        if state['status'] not in ('previewing', 'downloading', 'ready') or (state['status'] == 'ready' and time.time() - path.stat().st_mtime > 1800):
            inactive.append(path.parent)
    inactive.sort(key=lambda path: path.stat().st_mtime, reverse=True)
    for index, path in enumerate(inactive):
        if path.name != identifier and (index >= 20 or time.time() - path.stat().st_mtime > 7 * 86400):
            if path.parent == JOBS and re.fullmatch(r'[a-f0-9]{32}', path.name):
                shutil.rmtree(path)
    if route == '/link-preview':
        identifier = uuid.uuid4().hex
        job = JOBS / identifier
        job.mkdir()
        state = {'id':identifier, 'url':validate(body.get('url', ''),bool(body.get('collection'))), 'collection':bool(body.get('collection')), 'status':'previewing'}
        start(job, state)
        return state
    if not re.fullmatch(r'[a-f0-9]{32}', identifier):
        raise ValueError('This import is no longer available.')
    job = JOBS / identifier
    state = json.loads((job / 'status.json').read_text(encoding='utf-8'))
    if route == '/link-download':
        if state.get('entries'):
            raise ValueError('Choose the collection queue before downloading.')
        if state['status'] != 'ready':
            raise ValueError('Wait for the song preview first.')
        saved = find_saved(state)
        if saved:
            state.update(saved,status='done',reused=True,folder=str(ROOT / 'local songs'))
            save_index(state)
            write(job,state)
            return state
        title, artist = str(body.get('title', '')).strip(), str(body.get('artist', '')).strip()
        if not title or not artist or max(len(title),len(artist)) > 200 or re.search(r'[\x00-\x1f]', title+artist):
            raise ValueError('Enter a title and artist of up to 200 characters.')
        config = ['--replace-in-metadata title "^.*$" '+shlex.quote(title.replace('\\','\\\\')), '--parse-metadata title:meta_title',
                  '--replace-in-metadata uploader "^.*$" '+shlex.quote(artist.replace('\\','\\\\')), '--parse-metadata uploader:meta_artist',
                  '--parse-metadata %(extractor_key)s:meta_album']
        (job / 'metadata.conf').write_text('\n'.join(config), encoding='utf-8')
        state.update(status='downloading', title=title, artist=artist)
        start(job, state)
    elif route == '/link-cancel':
        if state['status'] == 'ready':
            state['status'] = 'cancelled'
            write(job, state)
        elif state['status'] in ('previewing','downloading'):
            (job / 'cancel').touch()
    elif route == '/link-folder' and state.get('folder'):
        subprocess.Popen(['open',state['folder']])
    return state


if __name__ == '__main__':
    if sys.argv[1] == '--worker':
        worker(Path(sys.argv[2]))
    else:
        try:
            data = request(sys.argv[1],sys.argv[2],int(sys.argv[3]))
        except Exception as error:
            data = {'status':'error','message':str(error)}
        payload = json.dumps(data).encode('utf-8')
        headers = 'HTTP/1.1 200 OK\r\nAccess-Control-Allow-Origin: *\r\nContent-Type: application/json\r\nConnection: close\r\nContent-Length: '+str(len(payload))+'\r\n\r\n'
        sys.stdout.buffer.write(headers.encode('ascii')+payload)
