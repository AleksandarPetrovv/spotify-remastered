import os
import fcntl
import logging
from logging.handlers import RotatingFileHandler
import signal
import subprocess
import sys
import time
from pathlib import Path


root = Path(__file__).resolve().parent.parent
spice = sys.argv[1]
cache = root / 'cache'
cache.mkdir(parents=True, exist_ok=True)
lock = (cache / 'startup.lock').open('a')
try:
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
except BlockingIOError:
    sys.exit(0)
logger = logging.getLogger('startup')
logger.setLevel(logging.INFO)
handler = RotatingFileHandler(cache / 'startup.log', maxBytes=262144, backupCount=1)
handler.setFormatter(logging.Formatter('%(asctime)s %(message)s'))
logger.addHandler(handler)
os.environ['PATH'] = str(Path(spice).parent) + os.pathsep + os.environ.get('PATH', '')


def run(arguments):
    with subprocess.Popen(arguments, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                          text=True, errors='replace', start_new_session=True) as process:
        try:
            output, _ = process.communicate(timeout=180)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            process.communicate()
            raise RuntimeError(f'{arguments[1:]} timed out')
        logger.info('%s: %s', arguments[1:], output[-8192:])
        if process.returncode:
            raise RuntimeError(f'{arguments[1:]} exited with code {process.returncode}')


try:
    upgraded = applied = False
    for attempt in range(3):
        if attempt:
            time.sleep(15 * attempt)
        if not upgraded:
            try:
                run([spice, 'upgrade'])
                upgraded = True
            except (OSError, RuntimeError) as error:
                logger.warning('upgrade attempt %s failed: %s', attempt + 1, error)
        if not applied or upgraded:
            try:
                subprocess.run(['pkill', '-x', 'Spotify'], check=False)
                run([sys.executable, str(root / 'scripts/repair-spicetify.py')])
                run([spice, 'backup', 'apply', '-n'])
                applied = True
            except (OSError, RuntimeError) as error:
                applied = False
                logger.warning('apply attempt %s failed: %s', attempt + 1, error)
        if upgraded and applied:
            break
    if not applied:
        raise RuntimeError('customization could not be applied after three attempts')
    if sys.argv[2] == 'yes':
        run(['open', '-a', 'Spotify'])
    logger.info('startup finished; upgrade successful: %s; customization applied: %s', upgraded, applied)
except Exception:
    logger.exception('startup failed')
    sys.exit(1)
