import configparser
import os
import platform
import plistlib
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path


def run(*args):
    return subprocess.run(args, check=True, capture_output=True)


def verify(app):
    if app.is_symlink() or not app.is_dir():
        raise RuntimeError('Invalid Spotify app bundle.')
    with (app / 'Contents/Info.plist').open('rb') as source:
        info = plistlib.load(source)
    if info.get('CFBundleIdentifier') != 'com.spotify.client':
        raise RuntimeError('The replacement is not Spotify.')
    run('/usr/bin/codesign', '--verify', '--deep', '--strict', '-R',
        '=anchor apple generic and certificate leaf[subject.OU] = "2FNC3A47ZF"', str(app))
    signature = run('/usr/bin/codesign', '-dv', '--verbose=4', str(app)).stderr.decode()
    if 'TeamIdentifier=2FNC3A47ZF' not in signature.splitlines():
        raise RuntimeError('The replacement is not signed by Spotify.')
    minimum = tuple(int(part) for part in info.get('LSMinimumSystemVersion', '0').split('.'))
    current = tuple(int(part) for part in platform.mac_ver()[0].split('.'))
    if current < minimum:
        raise RuntimeError('The official Spotify download requires a newer macOS. Current app and recovery files were retained.')


def app_path(config_path):
    config = configparser.RawConfigParser()
    config.read(config_path)
    resources = Path(os.path.expandvars(config.get('Setting', 'spotify_path'))).expanduser()
    if resources.name != 'Resources' or resources.parent.name != 'Contents':
        raise RuntimeError('Unexpected Spotify resources path; no app was replaced.')
    app = resources.parent.parent
    if app.name != 'Spotify.app' or app.is_symlink() or app.resolve() != app.absolute():
        raise RuntimeError('Unexpected or linked Spotify app path; no app was replaced.')
    with (app / 'Contents/Info.plist').open('rb') as source:
        if plistlib.load(source).get('CFBundleIdentifier') != 'com.spotify.client':
            raise RuntimeError('The configured app is not Spotify.')
    return app


def prepare(root):
    cache = root / 'cache'
    if root.is_symlink() or cache.is_symlink():
        raise RuntimeError('Linked recovery directories are not supported.')
    cache.mkdir(parents=True, exist_ok=True)
    prepared = cache / 'uninstall-stock-Spotify.app'
    if prepared.exists() or prepared.is_symlink():
        verify(prepared)
        return prepared
    print('Downloading and verifying official Spotify for restoration. Account data and local songs are kept.', flush=True)
    arm = platform.machine() == 'arm64'
    if not arm:
        probe = subprocess.run(['/usr/sbin/sysctl', '-n', 'hw.optional.arm64'], capture_output=True, text=True)
        arm = probe.returncode == 0 and probe.stdout.strip() == '1'
    url = 'https://download.scdn.co/' + ('SpotifyARM64.dmg' if arm else 'Spotify.dmg')
    with tempfile.TemporaryDirectory(prefix='uninstall-download-', dir=cache) as temporary:
        work = Path(temporary)
        image = work / 'Spotify.dmg'
        run('/usr/bin/curl', '-fL', '--retry', '2', '--connect-timeout', '20', '--max-time', '600', '-o', str(image), url)
        mounted = plistlib.loads(run('/usr/bin/hdiutil', 'attach', '-readonly', '-nobrowse', '-plist', str(image)).stdout)
        mounts = [Path(item['mount-point']) for item in mounted['system-entities'] if item.get('mount-point')]
        try:
            apps = [mount / 'Spotify.app' for mount in mounts if (mount / 'Spotify.app').is_dir()]
            if len(apps) != 1:
                raise RuntimeError('The official Spotify image did not contain exactly one app.')
            verify(apps[0])
            staged = work / 'Spotify.app'
            run('/usr/bin/ditto', str(apps[0]), str(staged))
            verify(staged)
            staged.rename(prepared)
        finally:
            for mount in mounts:
                run('/usr/bin/hdiutil', 'detach', str(mount))
    return prepared


def replace_app(app, source):
    verify(source)
    stage = Path(tempfile.mkdtemp(prefix='.spotify-remastered-restore-', dir=app.parent))
    replacement, previous = stage / 'replacement.app', stage / 'previous.app'
    retain = False
    try:
        run('/usr/bin/ditto', str(source), str(replacement))
        verify(replacement)
        subprocess.run(['/usr/bin/pkill', '-x', 'Spotify'], check=False)
        for _ in range(100):
            if subprocess.run(['/usr/bin/pgrep', '-x', 'Spotify'], capture_output=True).returncode == 1:
                break
            time.sleep(.1)
        else:
            raise RuntimeError('Spotify did not close; the app was not replaced.')
        app.rename(previous)
        try:
            replacement.rename(app)
            verify(app)
        except BaseException:
            try:
                if app.exists():
                    app.rename(stage / 'failed.app')
                previous.rename(app)
            except BaseException as rollback_error:
                retain = True
                raise RuntimeError(f'Could not roll back app replacement. Original app retained at {previous}') from rollback_error
            raise
    finally:
        if not retain:
            shutil.rmtree(stage)
    print('Restored official, signature-verified Spotify. Account data and local songs were not changed.', flush=True)


def main():
    if sys.platform != 'darwin':
        raise RuntimeError('This recovery helper is only for macOS.')
    root, config = Path(sys.argv[1]).absolute(), Path(sys.argv[2])
    if root != Path.home() / '.local/share/spotify-remastered':
        raise RuntimeError('Unexpected support directory.')
    app = app_path(config)
    source = prepare(root)
    if '--prepare' not in sys.argv[3:]:
        replace_app(app, source)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(f'Spotify restoration stopped: {error}. Recovery files were retained.', file=sys.stderr)
        sys.exit(1)
