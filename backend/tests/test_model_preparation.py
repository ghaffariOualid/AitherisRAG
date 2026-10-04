import runpy
import unittest
from pathlib import Path
from unittest.mock import Mock, call

load = runpy.run_path(str(Path(__file__).resolve().parents[1] / 'scripts/download_models.py'))['load_cached_or_download']


class ModelPreparationTests(unittest.TestCase):
    def test_complete_cache_needs_no_network(self):
        loader = Mock(return_value='model')
        self.assertEqual(load(loader, 'BAAI/bge-m3', device='cpu'), 'model')
        loader.assert_called_once_with('BAAI/bge-m3', local_files_only=True, device='cpu')

    def test_missing_cache_triggers_download(self):
        loader = Mock(side_effect=[OSError('Missing weights'), 'downloaded'])
        self.assertEqual(load(loader, 'BAAI/bge-m3'), 'downloaded')
        self.assertEqual(loader.call_args_list, [call('BAAI/bge-m3', local_files_only=True), call('BAAI/bge-m3')])

    def test_invalid_runtime_is_not_hidden_by_download(self):
        loader = Mock(side_effect=ValueError('Incompatible runtime'))
        with self.assertRaises(ValueError):
            load(loader, 'BAAI/bge-m3')
        self.assertEqual(loader.call_count, 1)
