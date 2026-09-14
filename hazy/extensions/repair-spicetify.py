import re
import shutil
import json
import sys
from pathlib import Path


def repair():
    record_path = Path(__file__).resolve().parent.parent / 'data/wrapper-repair.json'
    if '--restore' in sys.argv:
        if record_path.is_file():
            for record in json.loads(record_path.read_text()):
                path = Path(record['path'])
                if path.is_file():
                    content = path.read_text(encoding='utf-8')
                    if record['after'] in content:
                        path.write_text(content.replace(record['after'], record['before']), encoding='utf-8')
            record_path.unlink()
        return
    command = shutil.which('spicetify')
    if not command:
        return
    binary = Path(command).resolve()
    candidates = [binary.parent / 'jsHelper/spicetifyWrapper.js',
                  binary.parent.parent / 'share/spicetify-cli/jsHelper/spicetifyWrapper.js',
                  Path.home() / '.spicetify/jsHelper/spicetifyWrapper.js']
    pattern = re.compile(r'(?P<v>[A-Za-z_$][\w$]*)\[1\]>=2&&(?P=v)\[2\]>=57')
    records = json.loads(record_path.read_text()) if record_path.is_file() else []
    for path in dict.fromkeys(candidates):
        if not path.is_file():
            continue
        source = path.read_text(encoding='utf-8')
        if '*:not([data-scroll-optimized])' not in source or len(list(pattern.finditer(source))) != 1:
            continue
        def replacement(match):
            v = match['v']
            return f'({v}[0]>1||({v}[0]===1&&({v}[1]>2||({v}[1]===2&&{v}[2]>=57))))'
        match = pattern.search(source)
        records = [record for record in records if record['path'] != str(path)]
        records.append({'path': str(path), 'before': match[0], 'after': replacement(match)})
        record_path.write_text(json.dumps(records), encoding='utf-8')
        path.write_text(pattern.sub(replacement, source), encoding='utf-8')


if __name__ == '__main__':
    repair()
