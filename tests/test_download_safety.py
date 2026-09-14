import ast
import io
import sys
from types import SimpleNamespace
import importlib.util
import json
import os
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

REPO = Path(__file__).resolve().parents[1]


def load_module(name, filename):
    spec = importlib.util.spec_from_file_location(name, REPO / 'hazy/extensions' / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class DownloadSafety(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='spotify-download-test-')
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.folder = self.root / 'output'
        self.folder.mkdir()
        self.module = load_module('download_safety', 'download-playlist.py')
        self.module.ROOT = self.root
        self.module.JOBS = self.root / 'jobs'
        self.calls = []

    def test_formats_keep_separate_files_and_reuse(self):
        track={'id':'A'*22,'name':'song'}
        for audio_format in ('mp3','wav','ogg','flac'):
            self.run_worker([track], audio_format=audio_format)
            self.assertTrue((self.folder / ('song.'+audio_format)).is_file())
            self.run_worker([track], audio_format=audio_format)
        self.assertEqual(len(self.calls),4)

    def test_parallel_requests_use_format_specific_jobs(self):
        module=self.module
        module.JOBS.mkdir()
        calls=[]
        def start(*args,**kwargs):
            calls.append(args)
            return SimpleNamespace(pid=123)
        result=SimpleNamespace(returncode=0,stdout=str(self.folder))
        with patch.object(module.subprocess,'run',return_value=result), patch.object(module.subprocess,'Popen',side_effect=start):
            for audio_format in ('mp3','wav','ogg','flac'):
                query='id='+('A'*22)+'&format='+audio_format
                self.assertEqual(module.request('/download',query,0)['status'],'started')
                self.assertEqual(module.request('/download',query,0)['status'],'already_downloading')
            self.assertEqual(len(calls),4)
            for audio_format in ('mp3','wav','ogg','flac'):
                body=json.dumps({'id':'B'*22,'name':'album','kind':'album','format':audio_format,'tracks':[{'id':'A'*22,'name':'song'}]}).encode()
                with patch.object(module.sys,'stdin',SimpleNamespace(buffer=io.BytesIO(body))):
                    self.assertEqual(module.request('/playlist','',len(body))['status'],'started')
                self.assertTrue((self.folder / ('album (.'+audio_format+')')).is_dir())
                with patch.object(module.sys,'stdin',SimpleNamespace(buffer=io.BytesIO(body))):
                    self.assertEqual(module.request('/playlist','',len(body))['status'],'already_downloading')
            self.assertEqual(len(calls),8)

    def test_runner_roots_are_separate_for_each_format(self):
        source=(REPO / 'hazy/extensions/download-runner.py').read_text(encoding='utf-8')
        tree=ast.parse(source)
        function=next(node for node in tree.body if isinstance(node,ast.FunctionDef) and node.name=='worker_root')
        namespace={'os':os,'sys':sys,'Path':Path}
        exec(compile(ast.Module(body=[function],type_ignores=[]),'runner','exec'),namespace)
        roots=[]
        for audio_format in ('mp3','wav','ogg','flac'):
            with patch.object(sys,'argv',['runner','--client','download','--format',audio_format]):
                roots.append(namespace['worker_root']())
        self.assertEqual(len(set(roots)),4)
        with patch.object(sys,'argv',['runner','--serve']),patch.dict(os.environ,{'SR_WORKER_FORMAT':'flac'}):
            self.assertEqual(namespace['worker_root'](),roots[-1])

    def run_worker(self, tracks, single=False, before_output=None, audio_format='mp3'):
        job = self.module.JOBS / ('job-' + str(len(list(self.module.JOBS.glob('*')))))
        job.mkdir(parents=True)
        (job / 'request.json').write_text(json.dumps({'tracks': tracks, 'folder': str(self.folder), 'single': single, 'format':audio_format}))
        calls = self.calls
        class FakeProcess:
            def __init__(self, args, **kwargs):
                identifier = next(arg.rsplit('/', 1)[1] for arg in args if arg.startswith('https://open.spotify.com/track/'))
                calls.append(identifier)
                if before_output:
                    before_output()
                (Path(kwargs['cwd']) / ('song.' + args[args.index('--format')+1])).write_bytes(identifier.encode())
            def poll(self):
                return 0
        with patch.object(self.module, 'managed_ffmpeg', return_value='fake-ffmpeg'), \
                patch.object(self.module.subprocess, 'Popen', FakeProcess), \
                patch.object(self.module.time, 'sleep'):
            self.module.worker(job)
        return json.loads((job / 'status.json').read_text())

    def test_unindexed_audio_is_preserved_and_not_counted_saved(self):
        existing = self.folder / 'song.mp3'
        existing.write_bytes(b'unrelated')
        result = self.run_worker([{'id': 'A' * 22, 'name': 'song'}])
        self.assertEqual(existing.read_bytes(), b'unrelated')
        self.assertEqual((self.folder / 'song (2).mp3').read_bytes(), b'A' * 22)
        self.assertEqual((result['saved'], result['skipped'], result['failed']), (1, 0, []))

    def test_capitalization_collisions_preserve_both_songs(self):
        tracks = [{'id': 'A' * 22, 'name': 'Song'}, {'id': 'B' * 22, 'name': 'song'}]
        result = self.run_worker(tracks)
        self.assertEqual(result['saved'], 2)
        self.assertEqual({p.read_bytes() for p in self.folder.glob('*.mp3')}, {b'A' * 22, b'B' * 22})
        self.assertEqual(len(list(self.folder.glob('*.mp3'))), 2)

    def test_unicode_equivalent_names_are_reserved_separately(self):
        result = self.run_worker([{'id': 'A' * 22, 'name': 'café'}, {'id': 'B' * 22, 'name': 'cafe\u0301'}])
        self.assertEqual(result['saved'], 2)
        self.assertEqual(len(list(self.folder.glob('*.mp3'))), 2)

    def test_repeated_indexed_tracks_are_reused(self):
        tracks = [{'id': 'A' * 22, 'name': 'song'}]
        self.run_worker(tracks)
        result = self.run_worker(tracks)
        self.assertEqual((result['saved'], result['skipped'], result['failed']), (0, 1, []))
        self.assertEqual(self.calls, ['A' * 22])

    def test_single_track_never_overwrites_existing_title(self):
        (self.folder / 'song.mp3').write_bytes(b'unrelated')
        result = self.run_worker([{'id': 'A' * 22, 'name': 'A' * 22}], single=True)
        self.assertEqual(result['saved'], 1)
        self.assertEqual((self.folder / 'song.mp3').read_bytes(), b'unrelated')
        self.assertEqual((self.folder / 'song (2).mp3').read_bytes(), b'A' * 22)
        repeated = self.run_worker([{'id': 'A' * 22, 'name': 'A' * 22}], single=True)
        self.assertEqual(repeated['skipped'], 1)

    def test_file_created_after_queue_reservation_is_preserved(self):
        result = self.run_worker([{'id': 'A' * 22, 'name': 'song'}], before_output=lambda: (self.folder / 'song.mp3').write_bytes(b'external'))
        self.assertEqual(result['saved'], 1)
        self.assertEqual((self.folder / 'song.mp3').read_bytes(), b'external')
        self.assertEqual((self.folder / 'song (2).mp3').read_bytes(), b'A' * 22)
        self.assertEqual(self.run_worker([{'id': 'A' * 22, 'name': 'song'}])['skipped'], 1)

    def test_copying_local_audio_preserves_source_and_existing_target(self):
        source = self.root / 'local songs/source.mp3'
        source.parent.mkdir()
        source.write_bytes(b'local audio')
        (self.folder / 'song.mp3').write_bytes(b'external')
        result = self.run_worker([{'id': 'spotify:local:artist:album:song:180', 'name': 'song', 'localFile': 'source.mp3'}])
        self.assertEqual(result['saved'], 1)
        self.assertEqual(source.read_bytes(), b'local audio')
        self.assertEqual((self.folder / 'song.mp3').read_bytes(), b'external')
        self.assertEqual((self.folder / 'song (2).mp3').read_bytes(), b'local audio')

    def test_partial_copy_is_removed_and_source_kept(self):
        source = self.root / 'source.mp3'
        source.write_bytes(b'audio')
        with patch.object(self.module.shutil, 'copyfileobj', side_effect=OSError('disk full')):
            with self.assertRaises(OSError):
                self.module.place_audio(source, self.folder / 'song.mp3')
        self.assertTrue(source.exists())
        self.assertFalse((self.folder / 'song.mp3').exists())

    def test_cleanup_preserves_active_jobs_and_indexes(self):
        jobs = self.module.JOBS
        jobs.mkdir()
        now = time.time()
        for index in range(25):
            job = jobs / f'{index:032x}'
            job.mkdir()
            (job / 'status.json').write_text(json.dumps({'status': 'done'}))
            os.utime(job, (now - 100 - index, now - 100 - index))
        active = jobs / ('f' * 32)
        active.mkdir()
        (active / 'status.json').write_text(json.dumps({'status': 'downloading'}))
        (active / 'pid.json').write_text(json.dumps({'pid': 12345}))
        os.utime(active, (now - 10 * 86400, now - 10 * 86400))
        index = jobs / ('a' * 64 + '.files.json')
        index.write_text('{}')
        pointer = jobs / ('A' * 22 + '.json')
        pointer.write_text(json.dumps({'job': str(jobs / f'{24:032x}')}))
        with patch.object(self.module.os, 'kill'):
            self.module.cleanup_jobs()
        self.assertTrue(active.exists())
        self.assertTrue(index.exists())
        self.assertFalse(pointer.exists())
        self.assertEqual(len([p for p in jobs.iterdir() if p.is_dir()]), 21)


if __name__ == '__main__':
    unittest.main()
