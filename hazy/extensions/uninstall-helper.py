import json
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer


def prepare(root):
    songs = root / 'local songs'
    if songs.is_symlink():
        raise RuntimeError('The local songs folder is linked. Move it outside the support folder before uninstalling.')
    has_songs = songs.is_dir() and any(path.is_file() for path in songs.rglob('*'))
    scripts = root / 'scripts'
    name = 'winDel.ps1' if os.name == 'nt' else 'macDel.sh'
    required = [name, 'install-state.py', 'installer-common.ps1', 'repair-spicetify.ps1', 'uninstall-worker.ps1'] if os.name == 'nt' else [name, 'install-state.py', 'repair-spicetify.py']
    for name_required in required:
        if not (scripts / name_required).is_file():
            raise RuntimeError('Uninstall tools are missing. Repair setup before removing this installation.')
    candidates = [Path(os.environ.get('LOCALAPPDATA', '')) / 'spicetify'] if os.name == 'nt' else [Path.home() / '.spicetify', Path('/opt/homebrew/bin'), Path('/usr/local/bin')]
    os.environ['PATH'] = os.pathsep.join([*(str(path) for path in candidates), os.environ.get('PATH', '')])
    if not shutil.which('spicetify'):
        raise RuntimeError('Spicetify is unavailable. Repair setup before uninstalling.')
    job = Path(tempfile.mkdtemp(prefix='spotify-remastered-uninstall-'))
    shutil.copy2(scripts / name, job / name)
    shutil.copy2(Path(__file__), job / 'uninstall-helper.py')
    args = [sys.executable, str(job / 'uninstall-helper.py'), '--serve', str(root), str(job)]
    if os.name == 'nt':
        shutil.copy2(scripts / 'uninstall-worker.ps1', job / 'uninstall-worker.ps1')
        args = ['powershell.exe', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', str(job / 'uninstall-worker.ps1'), '-Root', str(root), '-Job', str(job)]
        command = subprocess.list2cmdline(args)
        ps = "$startup = New-CimInstance -ClassName Win32_ProcessStartup -ClientOnly -Property @{ShowWindow=[uint16]0}; $r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{CommandLine='" + command.replace("'", "''") + "';ProcessStartupInformation=$startup}; if ($r.ReturnValue -ne 0) { exit 1 }"
        subprocess.run(['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', ps], check=True, capture_output=True, creationflags=subprocess.CREATE_NO_WINDOW)
    else:
        child = os.fork()
        if child == 0:
            os.setsid()
            if os.fork():
                os._exit(0)
            with open(os.devnull, 'rb') as inp, open(os.devnull, 'ab') as out:
                os.dup2(inp.fileno(), 0)
                os.dup2(out.fileno(), 1)
                os.dup2(out.fileno(), 2)
                os.execv(args[0], args)
        os.waitpid(child, 0)
    for _ in range(100):
        if (job / 'session.json').is_file():
            result = json.loads((job / 'session.json').read_text(encoding='utf-8-sig'))
            result.update(hasLocalSongs=has_songs, songsFolder=str(songs))
            return result
        time.sleep(.1)
    raise RuntimeError('Could not start the uninstall worker. No removal was started.')


def serve(root, job):
    token = secrets.token_urlsafe(32)
    state = {'status': 'ready', 'stage': 0, 'message': 'Ready to uninstall', 'log': str(job / 'worker.log')}
    lock = threading.Lock()
    delete_songs = False

    def save():
        (job / 'status.json').write_text(json.dumps(state))

    def work(preparing=False):
        nonlocal deadline
        try:
            name = 'winDel.ps1' if os.name == 'nt' else 'macDel.sh'
            args = ['powershell.exe', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', str(job / name)] if os.name == 'nt' else ['/bin/bash', str(job / name)]
            if preparing:
                args.append('-PrepareOnly' if os.name == 'nt' else '--prepare')
            options = {'creationflags': subprocess.CREATE_NO_WINDOW} if os.name == 'nt' else {}
            if delete_songs and not preparing:
                if os.name == 'nt':
                    args.append('-DeleteLocalSongs')
                else:
                    options['env'] = dict(os.environ, SR_DELETE_LOCAL_SONGS='1')
            with (job / 'worker.log').open('w', encoding='utf-8') as log:
                process = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, errors='replace', **options)
                for line in process.stdout:
                    log.write(line)
                    log.flush()
                    if line.startswith('SR_STAGE:'):
                        _, stage, message = line.strip().split(':', 2)
                        with lock:
                            state.update(stage=int(stage), message=message)
                            save()
                code = process.wait()
            details = (job / 'worker.log').read_text(encoding='utf-8')[-2500:] if code else ''
            with lock:
                state.update(status=('prepared' if preparing else 'complete') if code == 0 else 'error', message=('Ready. Finish uninstall will close Spotify and restore its files.' if preparing else 'Spotify Remastered removed.') if code == 0 else 'Removal stopped. Recovery files were retained. ' + details, stage=(2 if preparing else 6) if code == 0 else state['stage'])
                save()
                if code == 0 and not preparing:
                    deadline = time.monotonic() + 15
        except Exception as error:
            with lock:
                state.update(status='error', message=str(error))
                save()

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def do_OPTIONS(self):
            self.reply({})

        def reply(self, body, code=200):
            data = json.dumps(body).encode()
            self.send_response(code)
            self.send_header('Access-Control-Allow-Origin', 'https://xpui.app.spotify.com')
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type')
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self):
            if self.path != '/status?token=' + token:
                self.reply({'status': 'error'}, 403)
                return
            with lock:
                self.reply(dict(state))

        def do_POST(self):
            nonlocal delete_songs
            if self.path == '/open-songs?token=' + token:
                songs = root / 'local songs'
                if songs.is_dir() and not songs.is_symlink():
                    subprocess.Popen(['open', str(songs)])
                    self.reply({'status': 'ready'})
                else:
                    self.reply({'status': 'error', 'message': 'The songs folder is unavailable.'})
                return
            preparing = self.path == '/check?token=' + token
            if not preparing and self.path not in ['/start?token=' + token, '/start?token=' + token + '&deleteSongs=1']:
                self.reply({'status': 'error'}, 403)
                return
            with lock:
                if (preparing and state['status'] == 'ready') or (not preparing and state['status'] == 'prepared'):
                    delete_songs = self.path.endswith('&deleteSongs=1')
                    state.update(status='checking' if preparing else 'running', message='Checking restoration tools' if preparing else 'Finishing uninstall')
                    save()
                    threading.Thread(target=work, args=(preparing,), daemon=True).start()
                self.reply(dict(state))

    server = HTTPServer(('127.0.0.1', 0), Handler)
    server.timeout = 1
    (job / 'session.json').write_text(json.dumps({'url': 'http://127.0.0.1:' + str(server.server_port), 'token': token}))
    deadline = time.monotonic() + 1800
    while time.monotonic() < deadline or state['status'] in ['checking', 'running']:
        server.handle_request()
    server.server_close()
    if state['status'] in ['ready', 'prepared', 'complete']:
        shutil.rmtree(job)


if __name__ == '__main__':
    if sys.argv[1] == '--serve':
        serve(Path(sys.argv[2]), Path(sys.argv[3]))
    else:
        try:
            result = prepare(Path(sys.argv[1]))
        except Exception as error:
            result = {'status': 'error', 'message': str(error)}
        if len(sys.argv) > 2 and sys.argv[2] == '--http':
            data = json.dumps(result).encode()
            sys.stdout.buffer.write(('HTTP/1.1 200 OK\r\nAccess-Control-Allow-Origin: https://xpui.app.spotify.com\r\nContent-Type: application/json\r\nContent-Length: ' + str(len(data)) + '\r\n\r\n').encode() + data)
        else:
            print(json.dumps(result))
