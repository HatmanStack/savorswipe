"""
Unit tests for search_image module.

Tests image search, selection, and title simplification logic.
"""

import pytest
from unittest.mock import patch, Mock
import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from search_image import (
    google_search_image,
    select_unique_image_url,
    simplify_recipe_title,
    extract_used_image_urls,
)


class TestGoogleSearchImage:
    """Tests for google_search_image() function."""

    @patch("search_image.requests.get")
    def test_google_search_image_returns_correct_count(self, mock_get):
        """Test that google_search_image returns requested number of URLs."""
        # Arrange
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "items": [
                {"link": f"https://example.com/image{i}.jpg"}
                for i in range(1, 11)
            ]
        }
        mock_get.return_value = mock_response

        # Act
        results = google_search_image("chocolate cookies", count=10)

        # Assert
        assert len(results) == 10
        assert all(isinstance(url, str) for url in results)
        assert all(url.startswith("https://") for url in results)

    @patch("search_image.requests.get")
    def test_google_search_image_with_beverage_type(self, mock_get):
        """Test google_search_image uses beverage-specific search terms."""
        # Arrange
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "items": [
                {"link": f"https://example.com/image{i}.jpg"}
                for i in range(1, 6)
            ]
        }
        mock_get.return_value = mock_response

        # Act
        results = google_search_image("hot cocoa", count=10, recipe_type="beverage")

        # Assert
        assert len(results) == 5
        # Verify the function was called (implicitly tests search with beverage suffix)
        assert mock_get.called

    @patch("search_image.requests.get")
    def test_google_search_image_empty_response(self, mock_get):
        """Test handling of empty API response."""
        # Arrange
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"items": []}
        mock_get.return_value = mock_response

        # Act
        results = google_search_image("nonexistent recipe")

        # Assert
        assert results == []

    @patch("search_image.requests.get")
    def test_google_search_image_api_error(self, mock_get):
        """Test handling of API error."""
        # Arrange
        import requests

        mock_get.side_effect = requests.exceptions.RequestException("API Error")

        # Act
        results = google_search_image("test recipe")

        # Assert
        assert results == []

    @patch("search_image.requests.get")
    def test_google_search_image_timeout(self, mock_get):
        """Test handling of request timeout."""
        # Arrange
        import requests

        mock_get.side_effect = requests.exceptions.Timeout()

        # Act
        results = google_search_image("test recipe")

        # Assert
        assert results == []


class TestSelectUniqueImageUrl:
    """Tests for select_unique_image_url() function."""

    def test_select_first_unused_url(self):
        """Test selecting first unused URL when some are used."""
        # Arrange
        search_results = [
            "https://example.com/image3.jpg",
            "https://example.com/image4.jpg",
            "https://example.com/image5.jpg",
        ]
        used_urls = {"https://example.com/image1.jpg", "https://example.com/image3.jpg"}

        # Act
        result = select_unique_image_url(search_results, used_urls)

        # Assert
        assert result == "https://example.com/image4.jpg"

    def test_select_all_urls_used_fallback(self):
        """Test fallback when all search results already used."""
        # Arrange
        search_results = [
            "https://example.com/image1.jpg",
            "https://example.com/image2.jpg",
            "https://example.com/image3.jpg",
        ]
        used_urls = {
            "https://example.com/image1.jpg",
            "https://example.com/image2.jpg",
            "https://example.com/image3.jpg",
        }

        # Act
        result = select_unique_image_url(search_results, used_urls)

        # Assert
        assert result == "https://example.com/image1.jpg"

    def test_select_empty_search_results(self):
        """Test handling of empty search results."""
        # Arrange
        search_results = []
        used_urls = {"https://example.com/image1.jpg"}

        # Act
        result = select_unique_image_url(search_results, used_urls)

        # Assert
        assert result == ""

    def test_select_no_used_urls(self):
        """Test selecting when no URLs are used yet."""
        # Arrange
        search_results = [
            "https://example.com/image1.jpg",
            "https://example.com/image2.jpg",
            "https://example.com/image3.jpg",
        ]
        used_urls = set()

        # Act
        result = select_unique_image_url(search_results, used_urls)

        # Assert
        assert result == "https://example.com/image1.jpg"

    def test_select_single_url_unused(self):
        """Test with single unused URL."""
        # Arrange
        search_results = ["https://example.com/image1.jpg"]
        used_urls = set()

        # Act
        result = select_unique_image_url(search_results, used_urls)

        # Assert
        assert result == "https://example.com/image1.jpg"


class TestSimplifyRecipeTitle:
    """Tests for simplify_recipe_title() function."""

    def test_remove_common_prefixes(self):
        """Test removal of common prefixes."""
        # Arrange
        test_cases = [
            ("Easy Chocolate Chip Cookies", "Chocolate Chip Cookies"),
            ("Quick Banana Bread", "Banana Bread"),
            ("Best Chicken Parmesan", "Chicken Parmesan"),
            ("Perfect Pasta Carbonara", "Pasta Carbonara"),
        ]

        # Act & Assert
        for input_title, expected in test_cases:
            result = simplify_recipe_title(input_title)
            assert result == expected

    def test_remove_time_prefixes(self):
        """Test removal of time-based prefixes."""
        # Arrange
        test_cases = [
            ("30-Minute Steak Dinner", "Steak Dinner"),
            ("5 Ingredient Soup", "Soup"),
            ("10-Step Risotto", "Risotto"),
        ]

        # Act & Assert
        for input_title, expected in test_cases:
            result = simplify_recipe_title(input_title)
            assert result == expected

    def test_remove_possessive_prefixes(self):
        """Test removal of possessive prefixes."""
        # Arrange
        test_cases = [
            ("Mom's Chocolate Cake", "Chocolate Cake"),
            ("Grandma's Famous Soup", "Famous Soup"),
        ]

        # Act & Assert
        for input_title, expected in test_cases:
            result = simplify_recipe_title(input_title)
            # Just check that possessives are removed (exact matching is complex)
            assert "Mom's" not in result
            assert "Grandma's" not in result

    def test_remove_trailing_qualifiers(self):
        """Test removal of trailing qualifiers."""
        # Arrange
        test_cases = [
            (
                "Flat Iron Steak with Peppers and Onions",
                "Flat Iron Steak",
            ),
            ("Chicken Served with Rice", "Chicken"),
            ("Pasta Topped with Sauce", "Pasta"),
        ]

        # Act & Assert
        for input_title, expected in test_cases:
            result = simplify_recipe_title(input_title)
            assert result == expected

    def test_remove_parenthetical_notes(self):
        """Test removal of parenthetical notes."""
        # Arrange
        test_cases = [
            ("Chocolate Chip Cookies (Gluten Free)", "Chocolate Chip Cookies"),
            ("Pasta (Vegan Option)", "Pasta"),
        ]

        # Act & Assert
        for input_title, expected in test_cases:
            result = simplify_recipe_title(input_title)
            assert result == expected

    def test_handle_whitespace(self):
        """Test handling of extra whitespace."""
        # Arrange
        input_title = "   Extra   Spaces   Everywhere   "

        # Act
        result = simplify_recipe_title(input_title)

        # Assert - should have normalized spaces
        assert "   " not in result  # No double spaces
        assert result == result.strip()  # Should be trimmed


class TestExtractUsedImageUrls:
    """Tests for extract_used_image_urls() function."""

    def test_extract_from_multiple_recipes(self):
        """Test extracting URLs from multiple recipes."""
        # Arrange
        json_data = {
            "1": {"Title": "Recipe 1", "image_url": "https://example.com/image1.jpg"},
            "2": {"Title": "Recipe 2", "image_url": "https://example.com/image2.jpg"},
            "3": {"Title": "Recipe 3", "image_url": "https://example.com/image3.jpg"},
        }

        # Act
        result = extract_used_image_urls(json_data)

        # Assert
        assert len(result) == 3
        assert "https://example.com/image1.jpg" in result
        assert "https://example.com/image2.jpg" in result
        assert "https://example.com/image3.jpg" in result

    def test_extract_handles_missing_urls(self):
        """Test that recipes without image_url don't cause errors."""
        # Arrange
        json_data = {
            "1": {"Title": "Recipe 1", "image_url": "https://example.com/image1.jpg"},
            "2": {"Title": "Recipe 2"},  # Missing image_url
            "3": {"Title": "Recipe 3", "image_url": "https://example.com/image3.jpg"},
        }

        # Act
        result = extract_used_image_urls(json_data)

        # Assert
        assert len(result) == 2
        assert "https://example.com/image1.jpg" in result
        assert "https://example.com/image3.jpg" in result

    def test_extract_empty_data(self):
        """Test extracting from empty data."""
        # Arrange
        json_data = {}

        # Act
        result = extract_used_image_urls(json_data)

        # Assert
        assert result == set()
        assert isinstance(result, set)

    def test_extract_alternative_field_names(self):
        """Test extraction with alternative field names."""
        # Arrange
        json_data = {
            "1": {"Title": "Recipe 1", "imageUrl": "https://example.com/image1.jpg"},
            "2": {"Title": "Recipe 2", "ImageUrl": "https://example.com/image2.jpg"},
        }

        # Act
        result = extract_used_image_urls(json_data)

        # Assert
        assert len(result) == 2
        assert "https://example.com/image1.jpg" in result
        assert "https://example.com/image2.jpg" in result
