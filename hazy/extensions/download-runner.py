import logging
import contextlib
import json
import os
import subprocess
import sys
import threading
import time
import uuid
from pathlib import Path

if os.name == 'nt':
    original_popen_init = subprocess.Popen.__init__

    def hidden_popen_init(self, *args, **kwargs):
        kwargs['creationflags'] = kwargs.get('creationflags', 0) | subprocess.CREATE_NO_WINDOW
        startup = kwargs.get('startupinfo') or subprocess.STARTUPINFO()
        startup.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        startup.wShowWindow = subprocess.SW_HIDE
        kwargs['startupinfo'] = startup
        original_popen_init(self, *args, **kwargs)

    subprocess.Popen.__init__ = hidden_popen_init


def worker_root():
    root = Path(os.environ['LOCALAPPDATA']) / 'spotify-remastered' if os.name == 'nt' else Path.home() / '.local/share/spotify-remastered'
    audio_format = os.environ.get('SR_WORKER_FORMAT','mp3')
    if '--format' in sys.argv:
        audio_format = sys.argv[sys.argv.index('--format')+1]
    if audio_format not in ('mp3','wav','ogg','flac'):
        raise ValueError('Invalid audio format.')
    return root / ('cache/spotify-worker' + ('' if audio_format == 'mp3' else '-' + audio_format))


def audio_temp_path():
    directory = worker_root() / 'audio-temp'
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def clear_job_logging():
    for name in ('', 'spotdl'):
        job_logger = logging.getLogger(name)
        for handler in job_logger.handlers[:]:
            job_logger.removeHandler(handler)
            handler.close()


def write_json(path, value):
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(value), encoding='utf-8')
    temporary.replace(path)


def acquire_worker_lock(root):
    lock = (root / 'worker.lock').open('a+b')
    try:
        if os.name == 'nt':
            import msvcrt
            lock.seek(0)
            if not lock.read(1):
                lock.write(b'0')
                lock.flush()
            lock.seek(0)
            msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        return lock
    except OSError:
        lock.close()
        return None


def submit():
    root = worker_root()
    root.mkdir(parents=True, exist_ok=True)
    job = root / uuid.uuid4().hex
    job.mkdir()
    heartbeat = job / 'heartbeat'
    heartbeat.touch()
    write_json(job / 'request.json', {'args': sys.argv[2:], 'cwd': os.getcwd()})
    options = {'start_new_session': True} if os.name != 'nt' else {'creationflags': subprocess.CREATE_NO_WINDOW}
    def ensure_worker():
        lock = acquire_worker_lock(root)
        if lock is not None:
            lock.close()
            audio_format = sys.argv[sys.argv.index('--format')+1] if '--format' in sys.argv else 'mp3'
            subprocess.Popen([sys.executable, str(Path(__file__).resolve()), '--serve'], env={**os.environ,'SR_WORKER_FORMAT':audio_format}, stdin=subprocess.DEVNULL,
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, **options)
    ensure_worker()
    last_check = time.monotonic()
    try:
        while True:
            heartbeat.touch()
            if time.monotonic() - last_check > 5:
                ensure_worker()
                last_check = time.monotonic()
            result = job / 'result.json'
            if result.is_file():
                response = json.loads(result.read_text(encoding='utf-8'))
                for name, stream in [('stdout.log', sys.stdout), ('stderr.log', sys.stderr)]:
                    path = job / name
                    if path.is_file():
                        stream.write(path.read_text(encoding='utf-8', errors='replace'))
                return response['code']
            time.sleep(0.25)
    finally:
        heartbeat.unlink(missing_ok=True)
        if (job / 'result.json').is_file():
            import shutil
            shutil.rmtree(job, ignore_errors=True)


if __name__ == '__main__' and len(sys.argv) > 1 and sys.argv[1] == '--client':
    sys.exit(submit())

service_lock = None
if __name__ == '__main__' and len(sys.argv) > 1 and sys.argv[1] == '--serve':
    service_lock = acquire_worker_lock(worker_root())
    if service_lock is None:
        sys.exit(0)
from types import MethodType
from urllib.parse import parse_qs, urlparse

from spotdl.console.entry_point import console_entry_point
from spotdl.download.downloader import Downloader
from spotdl.providers.audio.base import AudioProvider, AudioProviderError
from spotdl.utils.matching import order_results


logger = logging.getLogger('spotify-remastered')
original_search = Downloader.search
original_metadata = AudioProvider.get_download_metadata
context = None


def video_key(url):
    parsed = urlparse(url)
    return parse_qs(parsed.query).get('v', [parsed.path.rstrip('/').split('/')[-1]])[0]


def prepare(downloader, song):
    global context
    if context and context['song'] is song:
        return context
    context = {'downloader': downloader, 'song': song, 'blocked': set(), 'failed': 0}
    state = context
    for provider in downloader.audio_providers:
        if provider.name == 'youtube-music' and hasattr(provider, 'SEARCH_ATTEMPTS'):
            provider.SEARCH_ATTEMPTS = 1
        original_results = getattr(provider, '_remastered_original_results', provider.get_results)
        provider._remastered_original_results = original_results
        cache = {}

        def results(self, *args, _original=original_results, _cache=cache, **kwargs):
            key = repr((args, sorted(kwargs.items())))
            if key not in _cache:
                _cache[key] = _original(*args, **kwargs)
            available = [result for result in _cache[key] if video_key(result.url) not in state['blocked']]
            if state['blocked']:
                scores = order_results(available, song, self.search_query)
                available = [result for result in available if scores.get(result, 0) >= 80]
            return available

        provider.get_results = MethodType(results, provider)
    return state


def reject(state, url, error):
    state['blocked'].add(video_key(url))
    state['failed'] += 1
    cause = error.__cause__ or error
    logger.warning('Audio unavailable at %s: %s', url, cause)
    if state['failed'] >= 4:
        raise AudioProviderError('No downloadable matching upload found after 4 candidates.') from error
    logger.info('Trying another matching upload for %s', state['song'].display_name)


def search(downloader, song):
    state = prepare(downloader, song)
    while True:
        failures = state['failed']
        try:
            url = original_search(downloader, song)
        except AudioProviderError:
            if state['failed'] >= 4 or state['failed'] == failures:
                raise
            continue
        return url


def metadata(provider, url, download=False):
    if not context:
        return original_metadata(provider, url, download=download)
    if not download:
        try:
            return original_metadata(provider, url, download=False)
        except AudioProviderError as error:
            reject(context, url, error)
            raise
    while True:
        try:
            return original_metadata(provider, url, download=True)
        except AudioProviderError as error:
            reject(context, url, error)
            url = search(context['downloader'], context['song'])


Downloader.search = search
AudioProvider.get_download_metadata = metadata

from concurrent.futures import ThreadPoolExecutor
import spotdl.download.downloader as downloader_module
import spotdl.providers.audio.base as audio_provider_module

downloader_module.get_temp_path = audio_temp_path
audio_provider_module.get_temp_path = audio_temp_path

original_lyrics_search = Downloader.search_lyrics
original_embed = downloader_module.embed_metadata
EMBED_LYRICS = True
lyrics_pool = ThreadPoolExecutor(max_workers=1)
lyrics_pending = {}
lyrics_lock = threading.Lock()


def concurrent_lyrics(downloader, song):
    if not EMBED_LYRICS:
        return None
    with lyrics_lock:
        key = id(song)
        if key not in lyrics_pending:
            lyrics_pending[key] = lyrics_pool.submit(original_lyrics_search, downloader, song)
    return None


def embed_with_lyrics(output_file, song, *args, **kwargs):
    with lyrics_lock:
        future = lyrics_pending.pop(id(song), None)
    if future is not None:
        try:
            song.lyrics = future.result()
        except Exception as error:
            logger.debug('Could not search for lyrics: %s', error)
    return original_embed(output_file, song, *args, **kwargs)


Downloader.search_lyrics = concurrent_lyrics
downloader_module.embed_metadata = embed_with_lyrics

def serve():
    from spotdl.utils.arguments import parse_arguments
    from spotdl.utils.config import create_settings
    from spotdl.utils.logging import init_logging
    from spotdl.utils.search import get_simple_songs
    from spotdl.utils.spotify import SpotifyClient, save_spotify_cache
    from spotdl.download.progress_handler import ProgressHandler

    root = worker_root()
    root.mkdir(parents=True, exist_ok=True)
    lock = service_lock
    downloader = None
    settings_key = None
    active = [None]
    shutdown = threading.Event()

    def watch_client():
        while not shutdown.wait(0.5):
            heartbeat = active[0]
            if heartbeat is None:
                continue
            try:
                abandoned = time.time() - heartbeat.stat().st_mtime > 5
            except FileNotFoundError:
                abandoned = True
            if abandoned and active[0] is heartbeat:
                if os.name == 'nt':
                    subprocess.run(['taskkill', '/PID', str(os.getpid()), '/T', '/F'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                else:
                    import signal
                    os.killpg(os.getpgrp(), signal.SIGKILL)
                os._exit(1)

    threading.Thread(target=watch_client, daemon=True).start()
    idle_since = time.monotonic()
    try:
        while time.monotonic() - idle_since < 120:
            def modified(path):
                try:
                    return path.stat().st_mtime
                except FileNotFoundError:
                    return 0
            jobs = sorted(root.glob('*/request.json'), key=modified)
            for request_path in jobs:
                job = request_path.parent
                if not request_path.is_file():
                    continue
                if (job / 'result.json').exists():
                    continue
                heartbeat = job / 'heartbeat'
                if not heartbeat.exists() or time.time() - modified(heartbeat) > 5:
                    write_json(job / 'result.json', {'code': 1})
                    continue
                active[0] = heartbeat
                request = json.loads(request_path.read_text(encoding='utf-8'))
                code = 0
                with (job / 'stdout.log').open('w', encoding='utf-8') as out, (job / 'stderr.log').open('w', encoding='utf-8') as err, contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
                    try:
                        os.chdir(request['cwd'])
                        Path('worker-started').touch()
                        sys.argv = [str(Path(__file__).resolve())] + request['args']
                        arguments = parse_arguments()
                        spotify_settings, settings, _ = create_settings(arguments)
                        if not EMBED_LYRICS:
                            settings['lyrics_providers'] = []
                        if SpotifyClient._instance is None:
                            SpotifyClient.init(**spotify_settings)
                        clear_job_logging()
                        init_logging(settings['log_level'], settings['log_format'])
                        key = json.dumps(settings, sort_keys=True, default=str)
                        if downloader is None or key != settings_key:
                            if downloader is not None:
                                downloader.progress_handler.close()
                                downloader.loop.close()
                            downloader = Downloader(settings)
                            settings_key = key
                        else:
                            downloader.progress_handler = ProgressHandler(settings['simple_tui'])
                            downloader.known_songs.clear()
                            downloader.errors.clear()
                        global context
                        context = None
                        songs = get_simple_songs(arguments.query, use_ytm_data=settings['ytm_data'],
                            playlist_numbering=settings['playlist_numbering'], albums_to_ignore=settings['ignore_albums'],
                            album_type=settings['album_type'], playlist_retain_track_cover=settings['playlist_retain_track_cover'])
                        results = downloader.download_multiple_songs(songs)
                        if any(path is None for _, path in results):
                            code = 1
                        if spotify_settings['use_cache_file']:
                            save_spotify_cache(SpotifyClient().cache)
                    except BaseException as error:
                        code = 1
                        logging.exception('Download failed: %s', error)
                    finally:
                        if downloader is not None:
                            downloader.progress_handler.close()
                            for provider in downloader.audio_providers:
                                if hasattr(provider, '_remastered_original_results'):
                                    provider.get_results = provider._remastered_original_results
                        context = None
                        active[0] = None
                        with lyrics_lock:
                            unfinished = list(lyrics_pending.values())
                            lyrics_pending.clear()
                        for future in unfinished:
                            future.cancel()
                        clear_job_logging()
                write_json(job / 'result.json', {'code': code})
                idle_since = time.monotonic()
            time.sleep(0.25)
    finally:
        shutdown.set()
        if downloader is not None:
            downloader.loop.close()
        lock.close()
        for path in root.glob('*/result.json'):
            if time.time() - path.stat().st_mtime > 86400:
                import shutil
                shutil.rmtree(path.parent, ignore_errors=True)


if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == '--serve':
        serve()
    else:
        console_entry_point()
