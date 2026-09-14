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
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from importlib.util import spec_from_file_location, module_from_spec

ROOT = Path.home() / '.local/share/spotify-remastered'
JOBS = ROOT / 'cache/import-logs'


def index_path(url):
    directory = ROOT / 'data/import-index'
    directory.mkdir(parents=True, exist_ok=True)
    return directory / (hashlib.sha256(url.encode('utf-8')).hexdigest() + '.json')


def save_index(state):
    path = index_path(state['url'])
    temp = path.with_suffix('.tmp')
    temp.write_text(json.dumps({key:state[key] for key in ('file','title','artist','duration','source','cover')}), encoding='utf-8')
    temp.replace(path)


def find_saved(state):
    folder = ROOT / 'Local Songs'
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


def validate(value):
    url = urlparse(value)
    if url.scheme != 'https' or url.username or url.password or url.port not in (None, 443):
        raise ValueError('Paste a valid HTTPS song link.')
    if url.hostname in ('youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be'):
        video = url.path.strip('/') if url.hostname == 'youtu.be' else parse_qs(url.query).get('v', [''])[0]
        match = re.fullmatch(r'/(shorts|embed)/([A-Za-z0-9_-]{11})/?', url.path)
        if match:
            video = match[2]
        if re.fullmatch(r'[A-Za-z0-9_-]{11}', video):
            return 'https://www.youtube.com/watch?v=' + video
    raise ValueError('Use a single YouTube or SoundCloud song link.')


def worker(job):
    state = json.loads((job / 'status.json').read_text(encoding='utf-8'))
    try:
        tools_config = json.loads((ROOT / 'data/download-tools.json').read_text(encoding='utf-8'))
        args = [tools_config['ytdlp'], '--js-runtimes', tools_config['runtime'], '--ignore-config', '--no-playlist', '--socket-timeout', '20', '--retries', '2']
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
            if info.get('_type') in ('playlist', 'multi_video') or info.get('is_live') or info.get('live_status') in ('is_live', 'is_upcoming') or not info.get('duration'):
                raise ValueError('Use a finished, single song upload.')
            state.update(status='ready', title=info.get('track') or info['title'], artist=info.get('artist') or info.get('uploader', ''), duration=info['duration'],
                         cover=info.get('thumbnail', ''), source='SoundCloud' if 'soundcloud' in info['extractor'].lower() else 'YouTube')
        else:
            audio = job / 'audio.mp3'
            if not audio.is_file() or not audio.stat().st_size:
                raise RuntimeError('The downloader produced no MP3 file.')
            folder = ROOT / 'Local Songs'
            folder.mkdir(exist_ok=True)
            name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', '_', state['title']).strip().rstrip('.')[:80] or 'Song'
            target = folder / (name + '.mp3')
            suffix = 2
            while target.exists():
                target = folder / f'{name} ({suffix}).mp3'
                suffix += 1
            shutil.move(str(audio), target)
            state.update(status='done', folder=str(folder),file=str(target))
            save_index(state)
    except Exception as error:
        state.update(status='error', message=str(error))
    write(job, state)


def start(job, state):
    write(job, state)
    with (job / 'worker.log').open('ab') as log:
        subprocess.Popen([sys.executable, str(Path(__file__).resolve()), '--worker', str(job)], stdout=log, stderr=log, start_new_session=True)


def request(route, query, size):
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
        for path in JOBS.glob('*/status.json'):
            previous = json.loads(path.read_text(encoding='utf-8'))
            if previous['status'] in ('previewing', 'downloading') and time.time() - path.stat().st_mtime < 630:
                raise ValueError('Another link import is running. Finish or cancel it first.')
        identifier = uuid.uuid4().hex
        job = JOBS / identifier
        job.mkdir()
        state = {'id':identifier, 'url':validate(body.get('url', '')), 'status':'previewing'}
        start(job, state)
        return state
    if not re.fullmatch(r'[a-f0-9]{32}', identifier):
        raise ValueError('This import is no longer available.')
    job = JOBS / identifier
    state = json.loads((job / 'status.json').read_text(encoding='utf-8'))
    if route == '/link-download':
        if state['status'] != 'ready':
            raise ValueError('Wait for the song preview first.')
        saved = find_saved(state)
        if saved:
            state.update(saved,status='done',reused=True,folder=str(ROOT / 'Local Songs'))
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
