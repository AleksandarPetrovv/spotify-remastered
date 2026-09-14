import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path


root = Path(sys.argv[1]).resolve()
environment = root / 'dependencies/downloader'
python = environment / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')
requirements = Path(__file__).with_name('downloader-requirements.txt')
stamp = hashlib.sha256(requirements.read_bytes()).hexdigest()
record = root / 'data/downloader-environment.json'
root.joinpath('data').mkdir(parents=True, exist_ok=True)
if not python.is_file():
    subprocess.run([sys.executable, '-m', 'venv', str(environment)], check=True)
try:
    installed = json.loads(record.read_text())
except (OSError, ValueError):
    installed = {}
probe = subprocess.run([str(python), '-c', 'import spotdl, SpotipyFree, yt_dlp'], capture_output=True)
if probe.returncode or installed.get('requirements') != stamp:
    subprocess.run([str(python), '-m', 'pip', 'install', '--disable-pip-version-check', '-r', str(requirements)], check=True)
subprocess.run([str(python), '-m', 'pip', 'check'], check=True)
record.write_text(json.dumps({'requirements': stamp, 'python': str(python)}), encoding='utf-8')
print(python)
