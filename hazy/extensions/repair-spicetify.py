import re
import shutil
from pathlib import Path


def repair():
    command = shutil.which('spicetify')
    if not command:
        return
    binary = Path(command).resolve()
    candidates = [binary.parent / 'jsHelper/spicetifyWrapper.js',
                  binary.parent.parent / 'share/spicetify-cli/jsHelper/spicetifyWrapper.js',
                  Path.home() / '.spicetify/jsHelper/spicetifyWrapper.js']
    pattern = re.compile(r'(?P<v>[A-Za-z_$][\w$]*)\[1\]>=2&&(?P=v)\[2\]>=57')
    for path in candidates:
        if not path.is_file():
            continue
        source = path.read_text(encoding='utf-8')
        if '*:not([data-scroll-optimized])' not in source or len(list(pattern.finditer(source))) != 1:
            continue
        def replacement(match):
            v = match['v']
            return f'({v}[0]>1||({v}[0]===1&&({v}[1]>2||({v}[1]===2&&{v}[2]>=57))))'
        path.write_text(pattern.sub(replacement, source), encoding='utf-8')


if __name__ == '__main__':
    repair()
