import json
from pathlib import Path
import re
import sys


def enrich(info, client=None, cachedir=False):
    if 'soundcloud' not in info.get('extractor', '').lower():
        return info
    entries = info.get('entries', [])
    missing = {}
    albums = []
    for entry in entries:
        if not entry or entry.get('title'):
            continue
        url = entry.get('webpage_url') or entry.get('url', '')
        playlist = re.search(r'/playlists/(?:soundcloud(?::|%3A)playlists(?::|%3A))?(\d+)', url)
        if playlist:
            albums.append((playlist[1], entry))
            continue
        match = re.search(r'/tracks/(\d+)', url)
        identifier = match[1] if match else str(entry.get('id', '')) if entry.get('ie_key') == 'Soundcloud' else ''
        if identifier.isdigit():
            missing.setdefault(identifier, []).append(entry)
    if not missing and not albums:
        return info
    try:
        if client is None:
            from yt_dlp import YoutubeDL
            from yt_dlp.extractor.soundcloud import SoundcloudIE
            client = SoundcloudIE(YoutubeDL({'quiet': True, 'no_warnings': True, 'socket_timeout': 20, 'cachedir': cachedir}))
            client.initialize()
        for identifier, entry in albums:
            album = client._call_api('https://api-v2.soundcloud.com/playlists/' + identifier, 'collection', fatal=False)
            if isinstance(album, dict):
                entry.update(title=album.get('title'), uploader=album.get('user', {}).get('username'), thumbnail=album.get('artwork_url') or next((t.get('artwork_url') for t in album.get('tracks', []) if t.get('artwork_url')), ''))
        identifiers = list(missing)
        for offset in range(0, len(identifiers), 50):
            tracks = client._call_api('https://api-v2.soundcloud.com/tracks', 'collection', query={'ids': ','.join(identifiers[offset:offset + 50])}, fatal=False)
            for track in tracks or []:
                for entry in missing.get(str(track.get('id')), []):
                    entry.update(title=track.get('title'), uploader=track.get('user', {}).get('username'), thumbnail=track.get('artwork_url'))
        if not info.get('thumbnail'):
            info['thumbnail'] = next((entry.get('thumbnail') for entry in entries if entry and entry.get('thumbnail')), '')
    except Exception:
        pass
    return info


if __name__ == '__main__':
    path = Path(sys.argv[1])
    info = enrich(json.loads(path.read_text(encoding='utf-8-sig')), cachedir=sys.argv[2] if len(sys.argv) > 2 else False)
    path.write_text(json.dumps(info, ensure_ascii=False), encoding='utf-8')
