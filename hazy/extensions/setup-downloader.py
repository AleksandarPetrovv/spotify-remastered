import hashlib
import json
import os
import shutil
import subprocess
import sys
import uuid
from pathlib import Path


def usable_python(python):
    try:
        result = subprocess.run([str(python), '-c', 'import sys,venv; sys.exit(not ((3,11) <= sys.version_info[:2] <= (3,13)))'],
                                capture_output=True, timeout=15)
        return result.returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        return False


def setup(root):
    environment = root / 'dependencies/downloader'
    python = environment / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')
    requirements = Path(__file__).with_name('downloader-requirements.txt')
    stamp = hashlib.sha256(requirements.read_bytes()).hexdigest()
    record = root / 'data/downloader-environment.json'
    record.parent.mkdir(parents=True, exist_ok=True)
    backup = None
    created = False
    try:
        if not usable_python(python):
            if environment.is_symlink() or not environment.resolve().is_relative_to(root.resolve()):
                raise RuntimeError('Invalid downloader environment directory.')
            if environment.exists():
                backup = environment.with_name('downloader-recovery-' + uuid.uuid4().hex)
                environment.rename(backup)
            created = True
            subprocess.run([sys.executable, '-m', 'venv', str(environment)], check=True)
        try:
            installed = json.loads(record.read_text())
        except (OSError, ValueError):
            installed = {}
        probe = subprocess.run([str(python), '-c', 'import spotdl, SpotipyFree, yt_dlp'], capture_output=True, timeout=30)
        if probe.returncode or installed.get('requirements') != stamp or created:
            subprocess.run([str(python), '-m', 'pip', 'install', '--disable-pip-version-check', '-r', str(requirements)], check=True)
        subprocess.run([str(python), '-m', 'pip', 'check'], check=True)
        temporary = record.with_suffix('.tmp')
        temporary.write_text(json.dumps({'requirements': stamp, 'python': str(python)}), encoding='utf-8')
        temporary.replace(record)
    except BaseException:
        if created and environment.exists():
            shutil.rmtree(environment)
        if backup is not None:
            backup.rename(environment)
        raise
    if backup is not None:
        shutil.rmtree(backup, ignore_errors=True)
    return python


if __name__ == '__main__':
    print(setup(Path(sys.argv[1]).resolve()))
