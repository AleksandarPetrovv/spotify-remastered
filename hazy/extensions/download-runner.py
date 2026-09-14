import logging
from types import MethodType
from urllib.parse import parse_qs, urlparse

from spotdl.console.entry_point import console_entry_point
from spotdl.download.downloader import Downloader
from spotdl.providers.audio.base import AudioProvider, AudioProviderError
from spotdl.utils.matching import order_results


logger = logging.getLogger('spotify-remastered')
original_search = Downloader.search
original_metadata = AudioProvider.get_download_metadata
context = None


def video_key(url):
    parsed = urlparse(url)
    return parse_qs(parsed.query).get('v', [parsed.path.rstrip('/').split('/')[-1]])[0]


def prepare(downloader, song):
    global context
    if context and context['song'] is song:
        return context
    context = {'downloader': downloader, 'song': song, 'blocked': set(), 'failed': 0}
    state = context
    for provider in downloader.audio_providers:
        original_results = provider.get_results
        cache = {}

        def results(self, *args, _original=original_results, _cache=cache, **kwargs):
            key = repr((args, sorted(kwargs.items())))
            if key not in _cache:
                _cache[key] = _original(*args, **kwargs)
            available = [result for result in _cache[key] if video_key(result.url) not in state['blocked']]
            if state['blocked']:
                scores = order_results(available, song, self.search_query)
                available = [result for result in available if scores.get(result, 0) >= 80]
            return available

        provider.get_results = MethodType(results, provider)
    return state


def reject(state, url, error):
    state['blocked'].add(video_key(url))
    state['failed'] += 1
    cause = error.__cause__ or error
    logger.warning('Audio unavailable at %s: %s', url, cause)
    if state['failed'] >= 4:
        raise AudioProviderError('No downloadable matching upload found after 4 candidates.') from error
    logger.info('Trying another matching upload for %s', state['song'].display_name)


def search(downloader, song):
    state = prepare(downloader, song)
    while True:
        failures = state['failed']
        try:
            url = original_search(downloader, song)
        except AudioProviderError:
            if state['failed'] >= 4 or state['failed'] == failures:
                raise
            continue
        try:
            original_metadata(downloader.audio_providers[-1], url, download=False)
            return url
        except AudioProviderError as error:
            reject(state, url, error)


def metadata(provider, url, download=False):
    if not context:
        return original_metadata(provider, url, download=download)
    if not download:
        try:
            return original_metadata(provider, url, download=False)
        except AudioProviderError as error:
            reject(context, url, error)
            raise
    while True:
        try:
            return original_metadata(provider, url, download=True)
        except AudioProviderError as error:
            reject(context, url, error)
            url = search(context['downloader'], context['song'])


Downloader.search = search
AudioProvider.get_download_metadata = metadata

if __name__ == '__main__':
    console_entry_point()
