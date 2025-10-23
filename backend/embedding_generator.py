"""
OpenAI Embeddings Client with Timeout

Generates text embeddings using OpenAI API with timeout handling.
"""

import os
import requests
from typing import List, Dict, Optional


class EmbeddingGenerator:
    """Generates text embeddings using OpenAI API."""

    OPENAI_API_URL: str = "https://api.openai.com/v1/embeddings"
    MODEL: str = "text-embedding-3-small"
    TIMEOUT: int = 30  # seconds

    def __init__(self, api_key: Optional[str] = None) -> None:
        """
        Initialize the embedding generator.

        Args:
            api_key: OpenAI API key. If not provided, loads from API_KEY env variable.

        Raises:
            ValueError: If no API key is available
        """
        self.api_key = api_key if api_key else os.getenv('API_KEY')

        if not self.api_key:
            raise ValueError('API key is required. Provide via constructor or API_KEY environment variable.')

    def generate_embedding(self, text: str) -> List[float]:
        """
        Generate embedding for the given text.

        Args:
            text: The text to generate an embedding for

        Returns:
            List of floats representing the embedding vector

        Raises:
            Exception: If API request times out or fails
        """
        # Build request
        headers = {
            'Authorization': f'Bearer {self.api_key}',
            'Content-Type': 'application/json'
        }

        payload = {
            'model': self.MODEL,
            'input': text
        }

        try:
            # Make request with timeout
            response = requests.post(
                self.OPENAI_API_URL,
                json=payload,
                headers=headers,
                timeout=self.TIMEOUT
            )

            # Check for HTTP errors
            response.raise_for_status()

            # Extract embedding from response
            try:
                data = response.json()
            except ValueError as json_err:
                raise Exception(f'Failed to parse OpenAI response as JSON: {json_err}') from json_err

            # Validate response structure
            if 'data' not in data or not data['data'] or 'embedding' not in data['data'][0]:
                raise Exception(f'Invalid OpenAI response structure. Got: {list(data.keys())}')

            embedding = data['data'][0]['embedding']

            return embedding

        except requests.exceptions.Timeout as timeout_err:
            raise Exception(f'OpenAI API timeout after {self.TIMEOUT} seconds') from timeout_err
        except requests.exceptions.RequestException as req_err:
            raise Exception(f'OpenAI API request error: {str(req_err)}') from req_err

    @staticmethod
    def recipe_to_text(recipe: Dict) -> str:
        """
        Convert recipe to text representation for embedding.

        Handles multiple ingredient formats:
        - String: Use as-is
        - List: Join with newlines
        - Flat dict: Extract values and join
        - Nested dict: Recursively extract all values

        Args:
            recipe: Recipe dictionary with Title and Ingredients

        Returns:
            String representation of recipe
        """
        # Extract title
        title = recipe.get('Title', '')

        # Extract ingredients
        ingredients = recipe.get('Ingredients', '')
        ingredients_text = ''

        if isinstance(ingredients, str):
            # String format
            ingredients_text = ingredients

        elif isinstance(ingredients, list):
            # List format
            ingredients_text = '\n'.join(str(item) for item in ingredients)

        elif isinstance(ingredients, dict):
            # Dict format (flat or nested)
            def extract_values(d):
                """Recursively extract all string values from dict."""
                values = []
                for value in d.values():
                    if isinstance(value, dict):
                        # Nested dict - recurse
                        values.extend(extract_values(value))
                    elif isinstance(value, list):
                        # List - add all items
                        values.extend(str(item) for item in value)
                    else:
                        # Scalar value
                        values.append(str(value))
                return values

            ingredient_values = extract_values(ingredients)
            ingredients_text = '\n'.join(ingredient_values)

        # Format final text
        text = f"{title}\n{ingredients_text}"

        return text

    def generate_recipe_embedding(self, recipe: Dict) -> List[float]:
        """
        Generate embedding for a recipe.

        Args:
            recipe: Recipe dictionary with Title and Ingredients

        Returns:
            Embedding vector for the recipe
        """
        text = self.recipe_to_text(recipe)
        embedding = self.generate_embedding(text)
        return embedding
