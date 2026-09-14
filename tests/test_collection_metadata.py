import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('collection_metadata', Path(__file__).resolve().parents[1] / 'hazy/extensions/collection_metadata.py')
metadata = importlib.util.module_from_spec(spec)
spec.loader.exec_module(metadata)


class CollectionMetadata(unittest.TestCase):
    def test_batched_names_preserve_order(self):
        batches = []
        class Client:
            def _call_api(self, url, label, **kwargs):
                ids = kwargs['query']['ids'].split(',')
                batches.append(ids)
                return [{'id':int(identifier),'title':'track '+identifier,'user':{'username':'artist'},'artwork_url':'https://cover'} for identifier in reversed(ids)]
        info = {'extractor':'soundcloud:set','entries':[{'url':'https://api.soundcloud.com/tracks/'+str(i)} for i in range(1,62)]}
        result = metadata.enrich(info, Client())
        self.assertEqual([len(batch) for batch in batches],[50,11])
        self.assertEqual([entry['title'] for entry in result['entries']],['track '+str(i) for i in range(1,62)])
        self.assertEqual(result['thumbnail'],'https://cover')

    def test_album_names(self):
        class Client:
            def _call_api(self, *args, **kwargs):
                return {'title':'album','user':{'username':'artist'},'tracks':[{'artwork_url':'https://cover'}]}
        info = {'extractor':'soundcloud:related','entries':[{'url':'https://api.soundcloud.com/playlists/123'}]}
        self.assertEqual(metadata.enrich(info, Client())['entries'][0]['title'],'album')

    def test_failure_leaves_entries_usable(self):
        class Client:
            def _call_api(self, *args, **kwargs):
                raise OSError('offline')
        info = {'extractor':'soundcloud:set','entries':[{'url':'https://api.soundcloud.com/tracks/123'}]}
        self.assertEqual(metadata.enrich(info, Client())['entries'][0]['url'],'https://api.soundcloud.com/tracks/123')
