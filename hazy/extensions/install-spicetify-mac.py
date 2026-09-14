import collections
import json
import subprocess
import sys
from pathlib import Path


root = Path(sys.argv[1])
profiles = [Path.home()/name for name in ['.zshrc','.bashrc','.bash_profile','.profile']]
before = {path: collections.Counter(path.read_text().splitlines()) if path.exists() else collections.Counter() for path in profiles}
subprocess.run(['sh', sys.argv[2]], check=True)
added = {}
for path in profiles:
    if not path.exists():
        continue
    difference = collections.Counter(path.read_text().splitlines()) - before[path]
    lines = [line for line in difference.elements() if 'spicetify' in line.lower()]
    if lines:
        added[path.name] = lines
(root/'data/spicetify-profile-lines.json').write_text(json.dumps(added), encoding='utf-8')
