#!/usr/bin/env python3
"""Exercise the real installer with offline release fixtures and isolated homes."""
import hashlib
import os
from pathlib import Path
import subprocess
import shutil
import tempfile
import unittest

INSTALLER = Path(__file__).with_name('install.sh').resolve()


class InstallerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='mylight-installer-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.bin = self.root / "user's bin"
        self.mocks = self.root / 'mocks'
        self.mocks.mkdir()
        self.fixture = self.root / 'release'
        self.fixture.mkdir()
        for platform in ('linux', 'darwin'):
            for arch in ('amd64', 'arm64'):
                (self.fixture / f'mylight-{platform}-{arch}').write_text('#!/bin/sh\nprintf "%s\\n" "$DATA_DIR" "$@"\n')
        self.checksums()
        self.mock('uname', '#!/bin/sh\ncase "$1" in -s) echo "${TEST_OS:-Linux}";; -m) echo "${TEST_ARCH:-x86_64}";; esac\n')
        self.mock('curl', '''#!/bin/sh
set -eu
printf '%s\\n' "$*" >> "$TEST_ROOT/requests"
out=
url=
while [ "$#" -gt 0 ]; do
  case "$1" in
    -o) out=$2; shift 2;;
    --retry|--proto|--proto-redir|-w) shift 2;;
    https://*) url=$1; shift;;
    *) shift;;
  esac
done
[ "${TEST_DOWNLOAD_FAIL:-0}" = 0 ] || exit 22
case "$url" in */latest) printf 'https://github.com/zachwilke/mylight/releases/tag/v0.2.0';; *) cp "$TEST_ROOT/release/${url##*/}" "$out";; esac
''')
        self.env = {**os.environ, 'HOME': str(self.root / 'home'), 'MYLIGHT_BIN_DIR': str(self.bin), 'PATH': f'{self.mocks}:/usr/bin:/bin', 'TEST_ROOT': str(self.root)}
        self.env.pop('MYLIGHT_VERSION', None)
        self.env.pop('DATA_DIR', None)

    def mock(self, name, script):
        p = self.mocks / name
        p.write_text(script)
        p.chmod(0o755)

    def checksums(self):
        (self.fixture / 'SHA256SUMS').write_text(''.join(f'{hashlib.sha256(p.read_bytes()).hexdigest()}  {p.name}\n' for p in sorted(self.fixture.glob('mylight-*'))))

    def install(self, **extra):
        return subprocess.run(['sh', str(INSTALLER)], env={**self.env, **extra}, capture_output=True, text=True)

    def test_install_launch_and_update(self):
        result = self.install()
        self.assertEqual(result.returncode, 0, result.stderr)
        command = [str(self.bin / 'mylight'), '--example', 'two words']
        launched = subprocess.check_output(command, env=self.env, cwd='/tmp', text=True).splitlines()
        self.assertEqual(launched, [str(self.root / 'home/.local/share/mylight/data'), '--example', 'two words'])
        overridden = subprocess.check_output(command, env={**self.env, 'DATA_DIR': '/custom/data'}, text=True).splitlines()
        self.assertEqual(overridden[0], '/custom/data')
        marker = self.root / 'home/.local/share/mylight/data/keep.txt'
        marker.parent.mkdir(parents=True)
        marker.write_text('household')
        self.assertEqual(self.install().returncode, 0)
        self.assertEqual(marker.read_text(), 'household')
        self.assertIn('/download/v0.2.0/', (self.root / 'requests').read_text())

    def test_checksum_failure_preserves_install(self):
        self.assertEqual(self.install().returncode, 0)
        original = (self.bin / 'mylight-server').read_bytes()
        (self.fixture / 'mylight-linux-amd64').write_text('tampered')
        self.assertNotEqual(self.install().returncode, 0)
        self.assertEqual((self.bin / 'mylight-server').read_bytes(), original)
        self.assertFalse(list(self.bin.glob('.mylight-install.*')))

    def test_missing_checksum(self):
        (self.fixture / 'SHA256SUMS').write_text('')
        self.assertNotEqual(self.install().returncode, 0)
        self.assertFalse(self.bin.exists())

    def test_download_failure(self):
        self.assertNotEqual(self.install(TEST_DOWNLOAD_FAIL='1').returncode, 0)
        self.assertFalse(self.bin.exists())

    def test_platforms_and_pinned_version(self):
        for platform, arch in [('Linux', 'aarch64'), ('Darwin', 'arm64'), ('Darwin', 'x86_64')]:
            with self.subTest(platform=platform, arch=arch):
                result = self.install(TEST_OS=platform, TEST_ARCH=arch, MYLIGHT_VERSION='v0.2.0-rc.1')
                self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn('/latest', (self.root / 'requests').read_text())

    def test_shasum_fallback(self):
        # A minimal PATH mimics macOS, which ships shasum instead of sha256sum.
        path = self.root / 'mac-tools'
        path.mkdir()
        for name in ('sh', 'mktemp', 'awk', 'mkdir', 'cp', 'chmod', 'mv', 'sed', 'rm', 'cat'):
            (path / name).symlink_to(shutil.which(name))
        (path / 'curl').symlink_to(self.mocks / 'curl')
        (path / 'uname').symlink_to(self.mocks / 'uname')
        # Provide the shasum interface without requiring Perl in CI.
        self.mock('shasum', '#!/bin/sh\n[ "$1" = -a ] && [ "$2" = 256 ] || exit 1\nexec ' + shutil.which('sha256sum') + ' "$3"\n')
        (path / 'shasum').symlink_to(self.mocks / 'shasum')
        result = self.install(PATH=str(path), TEST_OS='Darwin', TEST_ARCH='arm64')
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_truncated_script_does_not_install(self):
        script = INSTALLER.read_text().rsplit('main "$@"', 1)[0]
        result = subprocess.run(['sh'], input=script, env=self.env, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(self.bin.exists())

    def test_rejects_unsupported_and_invalid_inputs(self):
        for extra in [{'TEST_ARCH': 'armv7l'}, {'TEST_OS': 'Windows_NT'}, {'MYLIGHT_VERSION': '../oops'}, {'MYLIGHT_BIN_DIR': 'relative'}]:
            with self.subTest(extra=extra):
                self.assertNotEqual(self.install(**extra).returncode, 0)
                self.assertFalse(self.bin.exists())


if __name__ == '__main__':
    unittest.main()
