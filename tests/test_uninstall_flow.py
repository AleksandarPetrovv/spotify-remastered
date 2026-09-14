import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import subprocess
import threading
import time
import unittest
from unittest.mock import patch
import urllib.error
import urllib.request

spec = importlib.util.spec_from_file_location('uninstall_helper', Path(__file__).resolve().parents[1] / 'hazy/extensions/uninstall-helper.py')
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)


class UninstallFlow(unittest.TestCase):
    def test_mac_cleanup_preserves_songs_and_unrelated_files(self):
        source = (Path(__file__).resolve().parents[1] / 'macDel.sh').read_text()
        code = source.split('root=Path(sys.argv[1]).absolute()', 1)[1].split('\nPY', 1)[0]
        code = 'from pathlib import Path\nimport os, shutil, sys\nroot=Path(sys.argv[1]).absolute()' + code
        with tempfile.TemporaryDirectory() as folder:
            home = Path(folder)
            root = home / '.local/share/spotify-remastered'
            for name in ['dependencies', 'data', 'scripts', 'cache', 'local songs', 'unrelated']:
                path = root / name
                path.mkdir(parents=True)
                (path / 'file').write_text('fixture')
            with patch.object(Path, 'home', return_value=home), patch.object(helper.sys, 'argv', ['cleanup', str(root)]):
                exec(code, {})
            self.assertEqual(sorted(p.name for p in root.iterdir()), ['local songs', 'unrelated'])
            with patch.object(Path, 'home', return_value=home), patch.object(helper.sys, 'argv', ['cleanup', str(root)]), patch.dict(os.environ, SR_DELETE_LOCAL_SONGS='1'):
                exec(code, {})
            self.assertEqual([p.name for p in root.iterdir()], ['unrelated'])

    @unittest.skipUnless(os.name == 'nt', 'windows worker')
    def test_windows_worker_records_completion_without_popup(self):
        with tempfile.TemporaryDirectory(prefix='spotify-worker-test-') as folder:
            job = Path(folder)
            (job / 'winDel.ps1').write_text("param([switch]$DeleteLocalSongs,[switch]$PrepareOnly)\nif ($PrepareOnly) { Write-Output 'SR_STAGE:2:Prepared fixture'; exit 0 }\nif (-not $DeleteLocalSongs) { exit 2 }\nWrite-Output 'SR_STAGE:4:Restoring fixture'\nexit 0\n")
            script = Path(__file__).resolve().parents[1] / 'hazy/extensions/uninstall-worker.ps1'
            process = subprocess.Popen(['powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', str(script), '-Root', folder, '-Job', folder], creationflags=subprocess.CREATE_NO_WINDOW)
            try:
                for _ in range(100):
                    if (job / 'session.json').exists():
                        break
                    time.sleep(.05)
                session = json.loads((job / 'session.json').read_text(encoding='utf-8-sig'))
                start = urllib.request.Request(session['url'] + '/start?token=' + session['token'] + '&deleteSongs=1', method='POST')
                self.assertEqual(json.load(urllib.request.urlopen(start))['status'], 'ready')
                check = urllib.request.Request(session['url'] + '/check?token=' + session['token'], method='POST')
                urllib.request.urlopen(check).close()
                for _ in range(100):
                    try:
                        state = json.loads((job / 'status.json').read_text(encoding='utf-8-sig'))
                    except (FileNotFoundError, json.JSONDecodeError):
                        state = {}
                    if state.get('status') == 'prepared':
                        break
                    time.sleep(.05)
                self.assertEqual(state.get('status'), 'prepared', state)
                urllib.request.urlopen(start).close()
                for _ in range(100):
                    try:
                        state = json.loads((job / 'status.json').read_text(encoding='utf-8-sig'))
                    except (FileNotFoundError, json.JSONDecodeError):
                        state = {}
                    if state.get('status') in ['complete', 'error']:
                        break
                    time.sleep(.05)
                self.assertEqual(state['status'], 'complete', state)
                self.assertEqual(state['stage'], 6)
            finally:
                process.terminate()
                process.wait(timeout=5)

    def test_missing_tools_never_launch(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(helper.subprocess, 'run') as run:
            with self.assertRaisesRegex(RuntimeError, 'missing'):
                helper.prepare(Path(folder))
            run.assert_not_called()

    def test_token_confirmation_progress_and_error(self):
        with tempfile.TemporaryDirectory() as folder:
            job = Path(folder)
            fake = unittest.mock.Mock()
            fake.stdout = io.StringIO('SR_STAGE:1:Stopping helpers\nSR_STAGE:3:Restoring files\nrestoration failed\n')
            fake.wait.return_value = 1
            with patch.object(helper.subprocess, 'Popen', return_value=fake) as launch:
                thread = threading.Thread(target=helper.serve, args=(job, job), daemon=True)
                thread.start()
                for _ in range(100):
                    if (job / 'session.json').exists():
                        break
                    time.sleep(.02)
                session = json.loads((job / 'session.json').read_text())
                url = session['url']
                with self.assertRaises(urllib.error.HTTPError) as error:
                    urllib.request.urlopen(urllib.request.Request(url + '/start?token=wrong', method='POST'))
                self.assertEqual(error.exception.code, 403)
                launch.assert_not_called()
                endpoint = url + '/status?token=' + session['token']
                self.assertEqual(json.load(urllib.request.urlopen(endpoint))['status'], 'ready')
                start = urllib.request.Request(url + '/start?token=' + session['token'], method='POST')
                urllib.request.urlopen(start).close()
                launch.assert_not_called()
                check = urllib.request.Request(url + '/check?token=' + session['token'], method='POST')
                urllib.request.urlopen(check).close()
                for _ in range(100):
                    result = json.load(urllib.request.urlopen(endpoint))
                    if result['status'] == 'error':
                        break
                    time.sleep(.02)
                self.assertEqual(result['stage'], 3)
                self.assertIn('restoration failed', result['message'])
                self.assertTrue((job / 'worker.log').exists())
                urllib.request.urlopen(start).close()
                self.assertEqual(launch.call_count, 1)


if __name__ == '__main__':
    unittest.main()
