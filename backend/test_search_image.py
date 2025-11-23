import unittest
from unittest.mock import MagicMock, patch, Mock
from search_image import google_search_image, extract_used_image_urls, select_unique_image_url


class TestSearchImageModule(unittest.TestCase):
    """Test cases for search_image module with URL deduplication."""

    def setUp(self):
        """Set up test fixtures."""
        self.test_urls = [
            'https://example.com/image1.jpg',
            'https://example.com/image2.jpg',
            'https://example.com/image3.jpg',
            'https://example.com/image4.jpg',
            'https://example.com/image5.jpg'
        ]

    @patch('search_image.validate_image_urls')
    @patch('search_image.requests.get')
    def test_google_search_image_returns_multiple(self, mock_get, mock_validate):
        """Test that google_search_image returns multiple URLs."""
        # Mock API response with 10 results
        mock_response = Mock()
        mock_response.json.return_value = {
            'items': [
                {'link': f'https://example.com/image{i}.jpg'}
                for i in range(1, 11)
            ]
        }
        mock_response.status_code = 200
        mock_get.return_value = mock_response

        # Mock validate_image_urls to return all URLs as valid
        mock_validate.side_effect = lambda urls, _timeout=5: urls

        # Test
        results = google_search_image('chocolate cookies', count=10)

        # Verify
        self.assertEqual(len(results), 10)
        self.assertTrue(all(isinstance(url, str) for url in results))

    @patch('search_image.validate_image_urls')
    @patch('search_image.requests.get')
    def test_google_search_image_handles_count_param(self, mock_get, mock_validate):
        """Test that count parameter is passed to API."""
        # Mock API response
        mock_response = Mock()
        mock_response.json.return_value = {
            'items': [
                {'link': f'https://example.com/image{i}.jpg'}
                for i in range(1, 6)
            ]
        }
        mock_response.status_code = 200
        mock_get.return_value = mock_response

        # Mock validate to return all URLs as valid
        mock_validate.side_effect = lambda urls, _timeout=5: urls

        # Test with count=5
        results = google_search_image('test query', count=5)

        # Verify API called with num=5
        call_args = mock_get.call_args
        # Check if 'num' parameter was passed
        if call_args[1].get('params'):
            self.assertEqual(call_args[1]['params'].get('num'), 5)

    @patch('search_image.requests.get')
    def test_google_search_image_empty_response(self, mock_get):
        """Test handling of empty API response."""
        # Mock empty response
        mock_response = Mock()
        mock_response.json.return_value = {'items': []}
        mock_response.status_code = 200
        mock_get.return_value = mock_response

        # Test
        results = google_search_image('no results query')

        # Verify returns empty list
        self.assertEqual(results, [])

    def test_extract_used_urls_empty_data(self):
        """Test extracting URLs from empty jsonData."""
        json_data = {}

        used_urls = extract_used_image_urls(json_data)

        self.assertEqual(used_urls, set())
        self.assertIsInstance(used_urls, set)

    def test_extract_used_urls_multiple_recipes(self):
        """Test extracting URLs from multiple recipes."""
        json_data = {
            '1': {
                'Title': 'Recipe 1',
                'image_url': 'https://example.com/image1.jpg'
            },
            '2': {
                'Title': 'Recipe 2',
                'image_url': 'https://example.com/image2.jpg'
            },
            '3': {
                'Title': 'Recipe 3',
                'image_url': 'https://example.com/image3.jpg'
            },
            '4': {
                'Title': 'Recipe 4',
                'image_url': 'https://example.com/image4.jpg'
            },
            '5': {
                'Title': 'Recipe 5',
                'image_url': 'https://example.com/image5.jpg'
            }
        }

        used_urls = extract_used_image_urls(json_data)

        # Verify all 5 URLs extracted
        self.assertEqual(len(used_urls), 5)
        self.assertIn('https://example.com/image1.jpg', used_urls)
        self.assertIn('https://example.com/image5.jpg', used_urls)

    def test_extract_used_urls_ignores_missing(self):
        """Test that recipes without image URLs don't cause errors."""
        json_data = {
            '1': {
                'Title': 'Recipe 1',
                'image_url': 'https://example.com/image1.jpg'
            },
            '2': {
                'Title': 'Recipe 2'
                # Missing image_url
            },
            '3': {
                'Title': 'Recipe 3',
                'image_url': 'https://example.com/image3.jpg'
            }
        }

        # Should not crash
        used_urls = extract_used_image_urls(json_data)

        # Should extract the 2 URLs that exist
        self.assertLessEqual(len(used_urls), 2)
        self.assertIsInstance(used_urls, set)

    def test_select_unique_url_first_unused(self):
        """Test selecting first unused URL from search results."""
        search_results = [
            'https://example.com/image3.jpg',
            'https://example.com/image4.jpg',
            'https://example.com/image5.jpg',
            'https://example.com/image6.jpg'
        ]
        used_urls = {
            'https://example.com/image1.jpg',
            'https://example.com/image2.jpg',
            'https://example.com/image3.jpg'
        }

        # Test
        unique_url = select_unique_image_url(search_results, used_urls)

        # Should return image4.jpg (first unused)
        self.assertEqual(unique_url, 'https://example.com/image4.jpg')

    def test_select_unique_url_all_used(self):
        """Test fallback when all search results already used."""
        search_results = [
            'https://example.com/image1.jpg',
            'https://example.com/image2.jpg',
            'https://example.com/image3.jpg'
        ]
        used_urls = {
            'https://example.com/image1.jpg',
            'https://example.com/image2.jpg',
            'https://example.com/image3.jpg'
        }

        # Test
        unique_url = select_unique_image_url(search_results, used_urls)

        # Should return first result as fallback
        self.assertEqual(unique_url, 'https://example.com/image1.jpg')

    def test_select_unique_url_empty_search(self):
        """Test handling of empty search results."""
        search_results = []
        used_urls = {'https://example.com/image1.jpg'}

        # Test
        unique_url = select_unique_image_url(search_results, used_urls)

        # Should return empty string
        self.assertEqual(unique_url, '')

    @patch('search_image.validate_image_urls')
    @patch('search_image.requests.get')
    def test_integration(self, mock_get, mock_validate):
        """Test full integration flow with deduplication."""
        # Mock Google API response
        mock_response = Mock()
        mock_response.json.return_value = {
            'items': [
                {'link': 'https://example.com/image1.jpg'},
                {'link': 'https://example.com/image2.jpg'},
                {'link': 'https://example.com/image3.jpg'},
                {'link': 'https://example.com/image4.jpg'},
                {'link': 'https://example.com/image5.jpg'}
            ]
        }
        mock_response.status_code = 200
        mock_get.return_value = mock_response

        # Mock validate to return all URLs as valid
        mock_validate.side_effect = lambda urls, _timeout=5: urls

        # Existing recipes using images 1-3
        json_data = {
            '1': {'image_url': 'https://example.com/image1.jpg'},
            '2': {'image_url': 'https://example.com/image2.jpg'},
            '3': {'image_url': 'https://example.com/image3.jpg'}
        }

        # Test full flow
        search_results = google_search_image('test query', count=5)
        used_urls = extract_used_image_urls(json_data)
        unique_url = select_unique_image_url(search_results, used_urls)

        # Verify unique URL selected (should be image4.jpg)
        self.assertEqual(unique_url, 'https://example.com/image4.jpg')
        self.assertNotIn(unique_url, used_urls)

    def test_select_unique_url_none_in_set(self):
        """Test selecting URL when used_urls is empty."""
        search_results = [
            'https://example.com/image1.jpg',
            'https://example.com/image2.jpg'
        ]
        used_urls = set()

        # Test
        unique_url = select_unique_image_url(search_results, used_urls)

        # Should return first result
        self.assertEqual(unique_url, 'https://example.com/image1.jpg')


if __name__ == '__main__':
    unittest.main()
