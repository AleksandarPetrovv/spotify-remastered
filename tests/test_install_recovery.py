import base64
import ctypes
import importlib.util
import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

REPO = Path(__file__).resolve().parents[1]


def load_module(name, filename):
    spec = importlib.util.spec_from_file_location(name, REPO / 'hazy/extensions' / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class InstallRecovery(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='spotify-recovery-test-')
        self.addCleanup(self.temporary.cleanup)
        self.directory = Path(self.temporary.name)
        self.root = self.directory / 'support'
        self.cfg = self.directory / 'config'
        self.theme = self.cfg / 'Themes/Hazy'
        self.theme.mkdir(parents=True)
        (self.cfg / 'config-xpui.ini').write_text('[Setting]\ncurrent_theme = Hazy\n[AdditionalOptions]\nextensions = \ncustom_apps = \n')
        self.module = load_module('install_recovery', 'install-state.py')

    def test_second_cycle_takes_exact_snapshot(self):
        (self.theme / 'old.css').write_text('old')
        self.module.capture(self.root, self.cfg, True)
        state_path = self.root / 'data/install-state.json'
        state = json.loads(state_path.read_text())
        state['active'] = False
        state_path.write_text(json.dumps(state))
        (self.theme / 'old.css').unlink()
        (self.theme / 'new.css').write_text('new')
        self.module.capture(self.root, self.cfg, True)
        self.module.restore(self.root, self.cfg)
        self.assertEqual([p.name for p in self.theme.iterdir()], ['new.css'])

    def test_failed_snapshot_keeps_prior_record_and_backup(self):
        (self.theme / 'old.css').write_text('old')
        self.module.capture(self.root, self.cfg, True)
        state_path = self.root / 'data/install-state.json'
        state = json.loads(state_path.read_text())
        state['active'] = False
        state_path.write_text(json.dumps(state))
        previous = state_path.read_bytes()
        with patch.object(self.module.shutil, 'copytree', side_effect=OSError('copy failed')):
            with self.assertRaises(OSError):
                self.module.capture(self.root, self.cfg, True)
        self.assertEqual(state_path.read_bytes(), previous)
        self.assertEqual((self.root / state['assets_backup'] / 'Themes/Hazy/old.css').read_text(), 'old')

    def test_legacy_asset_snapshot_remains_restorable(self):
        (self.theme / 'old.css').write_text('old')
        self.module.capture(self.root, self.cfg, True)
        state_path = self.root / 'data/install-state.json'
        state = json.loads(state_path.read_text())
        (self.root / state.pop('assets_backup')).rename(self.root / 'data/previous-assets')
        state_path.write_text(json.dumps(state))
        (self.theme / 'old.css').write_text('changed')
        self.module.restore(self.root, self.cfg)
        self.assertEqual((self.theme / 'old.css').read_text(), 'old')

    def test_backup_directory_rejects_data_root_and_external_paths(self):
        for path in ['data', '../outside', str(self.directory / 'outside')]:
            with self.assertRaises(RuntimeError):
                self.module.backup_directory(self.root, {'assets_backup': path}, 'assets_backup', 'data/previous-assets')

    def test_missing_original_asset_does_not_delete_current_theme(self):
        (self.theme / 'old.css').write_text('old')
        self.module.capture(self.root, self.cfg, True)
        state = json.loads((self.root / 'data/install-state.json').read_text())
        shutil = self.module.shutil
        shutil.rmtree(self.root / state['assets_backup'] / 'Themes/Hazy')
        (self.theme / 'old.css').write_text('current theme')
        with self.assertRaisesRegex(RuntimeError, 'original installation asset is missing'):
            self.module.restore(self.root, self.cfg)
        self.assertEqual((self.theme / 'old.css').read_text(), 'current theme')

    def make_bundle(self):
        app = self.directory / 'Spotify.app'
        files = {'Contents/MacOS/Spotify': b'original executable', 'Contents/Frameworks/framework': b'original framework',
                 'Contents/_CodeSignature/CodeResources': b'original signature', 'Contents/Resources/Apps/xpui.spa': b'original interface',
                 'Contents/Resources/unchanged': b'unchanged'}
        for relative, content in files.items():
            path = app / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(content)
        return app, files

    def test_mac_restores_nested_signed_files_and_removes_added_files(self):
        app, files = self.make_bundle()
        with patch.object(self.module.sys, 'platform', 'darwin'), patch.object(self.module, 'read_attributes', return_value={}):
            self.module.spotx(self.root, app / 'Contents/Resources', 'before')
            for relative in ['Contents/MacOS/Spotify', 'Contents/Frameworks/framework', 'Contents/_CodeSignature/CodeResources']:
                (app / relative).write_bytes(b'patched')
            added = app / 'Contents/_CodeSignature/added'
            added.write_bytes(b'added')
            self.module.spotx(self.root, app, 'after')
            state = json.loads((self.root / 'data/spotx-state.json').read_text())
            self.assertNotIn('Contents/Resources/unchanged', state['files'])
            self.module.spotx(self.root, app, 'restore')
        self.assertFalse(added.exists())
        for relative, content in files.items():
            self.assertEqual((app / relative).read_bytes(), content)

    def test_mac_refuses_to_overwrite_files_changed_after_patching(self):
        app, _ = self.make_bundle()
        with patch.object(self.module.sys, 'platform', 'darwin'), patch.object(self.module, 'read_attributes', return_value={}):
            self.module.spotx(self.root, app, 'before')
            (app / 'Contents/Frameworks/framework').write_bytes(b'patched')
            self.module.spotx(self.root, app, 'after')
            (app / 'Contents/Frameworks/framework').write_bytes(b'updated independently')
            with self.assertRaisesRegex(RuntimeError, 'changed since patching'):
                self.module.spotx(self.root, app, 'restore')
        self.assertEqual((app / 'Contents/Frameworks/framework').read_bytes(), b'updated independently')

    @unittest.skipUnless(os.name == 'nt', 'windows backup fixture')
    def test_legacy_windows_patch_backup_remains_restorable(self):
        spotify = self.directory / 'windows-spotify'
        spotify.mkdir()
        executable = spotify / 'Spotify.exe'
        executable.write_bytes(b'original')
        self.module.spotx(self.root, spotify, 'before')
        executable.write_bytes(b'patched')
        self.module.spotx(self.root, spotify, 'after')
        state_path = self.root / 'data/spotx-state.json'
        state = json.loads(state_path.read_text())
        (self.root / state.pop('backup')).rename(self.root / 'data/spotx-original')
        state_path.write_text(json.dumps(state))
        self.module.spotx(self.root, spotify, 'restore')
        self.assertEqual(executable.read_bytes(), b'original')

    def test_mac_restores_security_attributes(self):
        app, _ = self.make_bundle()
        original = base64.b64encode(b'quarantine value').decode('ascii')
        attributes = {str(app): {'quarantine': original}}
        def read(path):
            return dict(attributes.get(str(path), {}))
        def set_attribute(path, name, value, **kwargs):
            attributes.setdefault(str(path), {})[name] = base64.b64encode(value).decode('ascii')
        def remove_attribute(path, name, **kwargs):
            attributes[str(path)].pop(name)
        with patch.object(self.module.sys, 'platform', 'darwin'), patch.object(self.module, 'read_attributes', side_effect=read), \
                patch.object(self.module, 'set_attribute', side_effect=set_attribute), \
                patch.object(self.module, 'remove_attribute', side_effect=remove_attribute):
            self.module.spotx(self.root, app, 'before')
            attributes[str(app)] = {'new attribute': original}
            self.module.spotx(self.root, app, 'after')
            self.module.spotx(self.root, app, 'restore')
        self.assertEqual(attributes[str(app)], {'quarantine': original})

    def test_darwin_attribute_adapter_preserves_binary_values(self):
        attributes = {b'quarantine': b'\0\xffbinary'}
        testcase = self
        class NativeAttributes:
            def listxattr(self, path, buffer, size, options):
                testcase.assertEqual(options, 1)
                names = b'\0'.join(attributes) + b'\0'
                if buffer is not None:
                    ctypes.memmove(buffer, names, len(names))
                return len(names)
            def getxattr(self, path, name, buffer, size, position, options):
                testcase.assertEqual((position, options), (0, 1))
                value = attributes[name]
                if buffer is not None:
                    ctypes.memmove(buffer, value, len(value))
                return len(value)
            def setxattr(self, path, name, buffer, size, position, options):
                testcase.assertEqual((position, options), (0, 1))
                attributes[name] = ctypes.string_at(buffer, size)
                return 0
            def removexattr(self, path, name, options):
                testcase.assertEqual(options, 1)
                del attributes[name]
                return 0
        with patch.object(self.module.sys, 'platform', 'darwin'), patch.object(self.module, 'darwin_attributes', return_value=NativeAttributes()):
            value = self.module.read_attributes(self.directory)['quarantine']
            self.assertEqual(base64.b64decode(value), b'\0\xffbinary')
            self.module.set_attribute(self.directory, 'new', b'new\0value')
            self.assertEqual(attributes[b'new'], b'new\0value')
            self.module.remove_attribute(self.directory, 'new')
            self.assertNotIn(b'new', attributes)


class PythonRecovery(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='spotify-python-test-')
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.module = load_module('python_recovery', 'setup-downloader.py')
        self.environment = self.root / 'dependencies/downloader'
        self.environment.mkdir(parents=True)
        (self.environment / 'old sentinel').write_text('old environment')

    def fake_run(self, args, **kwargs):
        if '-m' in args and 'venv' in args:
            self.environment.mkdir()
            (self.environment / 'new sentinel').write_text('new environment')
        return subprocess.CompletedProcess(args, 0)

    def test_broken_environment_is_recreated(self):
        with patch.object(self.module, 'usable_python', return_value=False), patch.object(self.module.subprocess, 'run', side_effect=self.fake_run):
            self.module.setup(self.root)
        self.assertFalse((self.environment / 'old sentinel').exists())
        self.assertTrue((self.environment / 'new sentinel').exists())
        self.assertTrue((self.root / 'data/downloader-environment.json').exists())

    def test_failed_package_install_restores_previous_environment(self):
        def run(args, **kwargs):
            if 'install' in args:
                raise subprocess.CalledProcessError(1, args)
            return self.fake_run(args, **kwargs)
        with patch.object(self.module, 'usable_python', return_value=False), patch.object(self.module.subprocess, 'run', side_effect=run):
            with self.assertRaises(subprocess.CalledProcessError):
                self.module.setup(self.root)
        self.assertEqual((self.environment / 'old sentinel').read_text(), 'old environment')
        self.assertFalse((self.environment / 'new sentinel').exists())
        self.assertFalse((self.root / 'data/downloader-environment.json').exists())

    def test_unrunnable_python_fails_health_probe(self):
        with patch.object(self.module.subprocess, 'run', side_effect=OSError('invalid executable')):
            self.assertFalse(self.module.usable_python(self.environment / 'python'))


if __name__ == '__main__':
    unittest.main()
