import os
import shlex
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
BASH = str(Path('C:/Program Files/Git/bin/bash.exe')) if Path('C:/Program Files/Git/bin/bash.exe').exists() else shutil.which('bash')


@unittest.skipUnless(BASH, 'bash is unavailable')
class MacRuntimeRecovery(unittest.TestCase):
    def run_rollback(self, bootstrap_fails=False):
        with tempfile.TemporaryDirectory(prefix='spotify-mac-runtime-test-') as temporary:
            root = Path(temporary)
            backup = root / 'backup'
            scripts = root / 'support/scripts'
            agents = root / 'agents'
            scripts.mkdir(parents=True)
            agents.mkdir()
            (backup / 'previous-scripts').mkdir(parents=True)
            (scripts / 'helper').write_text('new helper')
            (scripts / 'new-only').write_text('new helper file')
            (backup / 'previous-scripts/helper').write_text('old helper')
            label = 'com.spotify-remastered.download-helper'
            (backup / (label + '.plist')).write_text('old agent')
            (agents / (label + '.plist')).write_text('new agent')
            source = (REPO / 'macDl.sh').read_text()
            function = source[source.index('rollback() {'):source.index('trap rollback EXIT')]
            variables = {'temporary': backup, 'root': root / 'support', 'agents_dir': agents, 'log': root / 'calls'}
            declarations = '\n'.join(name + '=' + shlex.quote(path.as_posix()) for name, path in variables.items())
            commands = '''
runtime_stopped=true
install_succeeded=false
loaded_agents=com.spotify-remastered.download-helper
python=fake_python
fake_python() { return 0; }
launchctl() {
    echo "$*" >> "$log"
    if [ "$1" = bootstrap ] && [ "$bootstrap_fails" = true ]; then return 1; fi
    return 0
}
(exit 7)
rollback
'''
            result = subprocess.run([BASH, '-c', 'set -uo pipefail\n' + declarations + '\nbootstrap_fails=' + str(bootstrap_fails).lower() + '\n' + function + commands], capture_output=True, text=True)
            self.assertEqual(result.returncode, 7, result.stderr)
            self.assertEqual((scripts / 'helper').read_text(), 'old helper')
            self.assertFalse((scripts / 'new-only').exists())
            self.assertEqual((agents / (label + '.plist')).read_text(), 'old agent')
            self.assertIn('bootstrap', (root / 'calls').read_text())
            self.assertEqual(backup.exists(), bootstrap_fails)

    def test_failed_reinstall_restores_loaded_agent_and_scripts(self):
        self.run_rollback()

    def test_failed_agent_restore_keeps_recovery_backup(self):
        self.run_rollback(bootstrap_fails=True)


if __name__ == '__main__':
    unittest.main()
