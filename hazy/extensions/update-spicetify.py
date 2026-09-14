import os
import subprocess
import sys
from pathlib import Path


root = Path(__file__).resolve().parent.parent
spice = sys.argv[1]
try:
    subprocess.run([spice, 'upgrade'], check=True, timeout=60)
except (subprocess.SubprocessError, OSError) as error:
    print('spicetify upgrade was unavailable; applying the installed version:', error)
subprocess.run(['pkill', '-x', 'Spotify'], check=False)
subprocess.run([sys.executable, str(root / 'scripts/repair-spicetify.py')], check=True)
subprocess.run([spice, 'backup', 'apply'], check=True)
if sys.argv[2] == 'yes':
    subprocess.run(['open', '-a', 'Spotify'], check=True)
else:
    subprocess.run(['pkill', '-x', 'Spotify'], check=False)
