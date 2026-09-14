import importlib.util
import json
from pathlib import Path
import tempfile
import types
import unittest
from unittest.mock import patch, Mock


class MacBulkPreview(unittest.TestCase):
    def run_preview(self, info, collection):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            spec = importlib.util.spec_from_file_location('bulk_link_helper', Path(__file__).resolve().parents[1] / 'hazy/extensions/link-helper.py')
            module = importlib.util.module_from_spec(spec)
            with patch.dict('sys.modules', fcntl=types.ModuleType('fcntl')), patch.object(Path, 'home', return_value=root):
                spec.loader.exec_module(module)
            module.ROOT = root
            (root / 'data').mkdir()
            (root / 'data/download-tools.json').write_text(json.dumps({'ytdlp':'fake','runtime':'deno:fake'}))
            job = root / 'job'
            job.mkdir()
            (job / 'status.json').write_text(json.dumps({'status':'previewing','collection':collection,'url':'https://www.youtube.com/watch?v=jNQXAC9IVRw'}))
            def launch(args, **kwargs):
                kwargs['stdout'].write(json.dumps(info).encode())
                kwargs['stdout'].flush()
                process = Mock(returncode=0)
                process.poll.return_value = 0
                return process
            with patch.object(module.subprocess, 'Popen', side_effect=launch) as start:
                module.worker(job)
            return json.loads((job / 'status.json').read_text()), start.call_args.args[0]

    def test_ordered_collection(self):
        state, args = self.run_preview({'_type':'playlist','extractor':'youtube:tab','title':'mix','entries':[{'id':'jNQXAC9IVRw','title':'first'},None,{'id':'dQw4w9WgXcQ','title':'second'}]}, True)
        self.assertEqual(state['status'], 'ready')
        self.assertEqual([e['title'] for e in state['entries']], ['first','second'])
        self.assertIn('--flat-playlist', args)

    def test_soundcloud_album(self):
        state, _ = self.run_preview({'_type':'playlist','extractor':'soundcloud:set','title':'album','entries':[{'url':'https://api.soundcloud.com/tracks/123','title':'song'}]}, True)
        self.assertEqual(state['source'], 'SoundCloud')
        self.assertEqual(len(state['entries']), 1)

    def test_single_preserved(self):
        state, args = self.run_preview({'extractor':'youtube','title':'song','uploader':'artist','duration':20}, False)
        self.assertEqual(state['status'], 'ready')
        self.assertNotIn('entries', state)
        self.assertIn('--no-playlist', args)


if __name__ == '__main__':
    unittest.main()
