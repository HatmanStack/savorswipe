import unittest
from unittest.mock import MagicMock, patch, Mock
import requests
from embedding_generator import EmbeddingGenerator


class TestEmbeddingGenerator(unittest.TestCase):
    """Test cases for EmbeddingGenerator class."""

    def setUp(self):
        """Set up test fixtures."""
        self.api_key = 'test-api-key'
        self.mock_embedding = [0.1, 0.2, 0.3, 0.4, 0.5]

    def test_init_with_api_key(self):
        """Test initialization with API key provided."""
        generator = EmbeddingGenerator(api_key=self.api_key)
        self.assertEqual(generator.api_key, self.api_key)

    @patch('embedding_generator.os.getenv')
    def test_init_from_env(self, mock_getenv):
        """Test initialization loads API key from environment."""
        mock_getenv.return_value = self.api_key
        generator = EmbeddingGenerator()
        self.assertEqual(generator.api_key, self.api_key)
        mock_getenv.assert_called_once_with('API_KEY')

    @patch('embedding_generator.os.getenv')
    def test_init_no_api_key(self, mock_getenv):
        """Test initialization fails when no API key available."""
        mock_getenv.return_value = None
        with self.assertRaises(ValueError) as context:
            EmbeddingGenerator()
        self.assertIn('API key', str(context.exception))

    def test_recipe_to_text_simple_list(self):
        """Test converting recipe with list of ingredients to text."""
        recipe = {
            'Title': 'Chocolate Chip Cookies',
            'Ingredients': [
                '2 cups flour',
                '1 cup sugar',
                '1 cup chocolate chips'
            ]
        }
        text = EmbeddingGenerator.recipe_to_text(recipe)

        self.assertIn('Chocolate Chip Cookies', text)
        self.assertIn('2 cups flour', text)
        self.assertIn('1 cup sugar', text)
        self.assertIn('1 cup chocolate chips', text)

    def test_recipe_to_text_string(self):
        """Test converting recipe with ingredients as string."""
        recipe = {
            'Title': 'Simple Soup',
            'Ingredients': '2 cups water\n1 cup vegetables\nsalt to taste'
        }
        text = EmbeddingGenerator.recipe_to_text(recipe)

        self.assertIn('Simple Soup', text)
        self.assertIn('2 cups water', text)
        self.assertIn('vegetables', text)

    def test_recipe_to_text_flat_dict(self):
        """Test converting recipe with flat dict of ingredients."""
        recipe = {
            'Title': 'Pasta',
            'Ingredients': {
                'pasta': '1 lb',
                'tomato sauce': '2 cups',
                'garlic': '3 cloves'
            }
        }
        text = EmbeddingGenerator.recipe_to_text(recipe)

        self.assertIn('Pasta', text)
        self.assertIn('1 lb', text)
        self.assertIn('2 cups', text)
        self.assertIn('3 cloves', text)

    def test_recipe_to_text_nested_dict(self):
        """Test converting recipe with nested sections in ingredients."""
        recipe = {
            'Title': 'Layered Cake',
            'Ingredients': {
                'For the Crust': {
                    'graham crackers': '2 cups',
                    'butter': '1/2 cup'
                },
                'For the Filling': {
                    'cream cheese': '8 oz',
                    'sugar': '1 cup'
                }
            }
        }
        text = EmbeddingGenerator.recipe_to_text(recipe)

        self.assertIn('Layered Cake', text)
        self.assertIn('2 cups', text)
        self.assertIn('1/2 cup', text)
        self.assertIn('8 oz', text)
        self.assertIn('1 cup', text)

    @patch('embedding_generator.requests.post')
    def test_generate_embedding_success(self, mock_post):
        """Test successful embedding generation."""
        # Mock successful API response
        mock_response = Mock()
        mock_response.json.return_value = {
            'data': [
                {'embedding': self.mock_embedding}
            ]
        }
        mock_response.raise_for_status = Mock()
        mock_post.return_value = mock_response

        generator = EmbeddingGenerator(api_key=self.api_key)
        embedding = generator.generate_embedding('test text')

        self.assertEqual(embedding, self.mock_embedding)
        mock_post.assert_called_once()
        mock_response.raise_for_status.assert_called_once()

    @patch('embedding_generator.requests.post')
    def test_generate_embedding_timeout(self, mock_post):
        """Test embedding generation handles timeout."""
        # Mock timeout error
        mock_post.side_effect = requests.Timeout()

        generator = EmbeddingGenerator(api_key=self.api_key)

        with self.assertRaises(Exception) as context:
            generator.generate_embedding('test text')
        self.assertIn('timeout', str(context.exception).lower())

    @patch('embedding_generator.requests.post')
    def test_generate_embedding_api_error(self, mock_post):
        """Test embedding generation handles API errors."""
        # Mock request exception
        mock_post.side_effect = requests.RequestException('API Error')

        generator = EmbeddingGenerator(api_key=self.api_key)

        with self.assertRaises(Exception) as context:
            generator.generate_embedding('test text')
        self.assertIn('API error', str(context.exception).lower())

    @patch('embedding_generator.requests.post')
    def test_generate_embedding_includes_timeout(self, mock_post):
        """Test that requests.post is called with timeout parameter."""
        # Mock successful response
        mock_response = Mock()
        mock_response.json.return_value = {
            'data': [{'embedding': self.mock_embedding}]
        }
        mock_response.raise_for_status = Mock()
        mock_post.return_value = mock_response

        generator = EmbeddingGenerator(api_key=self.api_key)
        generator.generate_embedding('test text')

        # Verify timeout was passed
        call_kwargs = mock_post.call_args[1]
        self.assertEqual(call_kwargs['timeout'], EmbeddingGenerator.TIMEOUT)

    @patch('embedding_generator.requests.post')
    def test_generate_recipe_embedding(self, mock_post):
        """Test generating embedding for full recipe."""
        # Mock successful API response
        mock_response = Mock()
        mock_response.json.return_value = {
            'data': [{'embedding': self.mock_embedding}]
        }
        mock_response.raise_for_status = Mock()
        mock_post.return_value = mock_response

        recipe = {
            'Title': 'Test Recipe',
            'Ingredients': ['flour', 'sugar']
        }

        generator = EmbeddingGenerator(api_key=self.api_key)
        embedding = generator.generate_recipe_embedding(recipe)

        # Verify result
        self.assertEqual(embedding, self.mock_embedding)

        # Verify API was called with recipe text
        call_args = mock_post.call_args
        request_data = call_args[1]['json']
        self.assertIn('Test Recipe', request_data['input'])
        self.assertIn('flour', request_data['input'])

    @patch('embedding_generator.requests.post')
    def test_recipe_to_text_missing_title(self, mock_post):
        """Test recipe_to_text handles missing title gracefully."""
        recipe = {
            'Ingredients': ['flour', 'sugar']
        }
        text = EmbeddingGenerator.recipe_to_text(recipe)

        # Should still include ingredients
        self.assertIn('flour', text)
        self.assertIn('sugar', text)

    @patch('embedding_generator.requests.post')
    def test_recipe_to_text_missing_ingredients(self, mock_post):
        """Test recipe_to_text handles missing ingredients gracefully."""
        recipe = {
            'Title': 'Test Recipe'
        }
        text = EmbeddingGenerator.recipe_to_text(recipe)

        # Should still include title
        self.assertIn('Test Recipe', text)


if __name__ == '__main__':
    unittest.main()
