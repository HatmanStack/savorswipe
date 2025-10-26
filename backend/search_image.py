import os
import requests
import re
from typing import List, Set, Dict


def simplify_recipe_title(title: str) -> str:
    """
    Simplify recipe title for better image search results.

    Examples:
        "Flat Iron Steak Sandwiches with Peppers and Onions" -> "Flat Iron Steak"
        "Grandma's Famous Chocolate Chip Cookies" -> "Chocolate Chip Cookies"
        "Easy 30-Minute Chicken Parmesan" -> "Chicken Parmesan"

    Args:
        title: Full recipe title

    Returns:
        Simplified title focusing on main ingredient/dish
    """
    # Remove common prefixes
    prefixes_to_remove = [
        r"^(Easy|Quick|Best|Perfect|Homemade|Classic|Traditional|Authentic|Simple|Delicious|Amazing|Ultimate|World's Best)\s+",
        r"^\d+(-|\s)?(Minute|Hour|Ingredient|Step)\s+",  # "30-Minute", "5 Ingredient"
        r"^(Mom's|Grandma's|Aunt\s+\w+'s|[A-Z]\w+'s)\s+",  # Possessives
    ]

    simplified = title
    for pattern in prefixes_to_remove:
        simplified = re.sub(pattern, '', simplified, flags=re.IGNORECASE)

    # Remove trailing qualifiers (everything after "with", "in", "on", etc.)
    qualifiers = r'\s+(with|in|on|topped with|served with|featuring)\s+.+$'
    simplified = re.sub(qualifiers, '', simplified, flags=re.IGNORECASE)

    # Remove parenthetical notes
    simplified = re.sub(r'\([^)]*\)', '', simplified)

    # Remove extra whitespace
    simplified = ' '.join(simplified.split())

    return simplified


def google_search_image(title: str, count: int = 10) -> List[str]:
    """
    Search for images using Google Custom Search API with automatic query simplification.

    Tries multiple search strategies to find actual food photos:
    1. Simplified title + "food dish" (e.g., "Flat Iron Steak food dish")
    2. If <5 results, tries simplified title + "recipe food"
    3. If still <5 results, tries just simplified title
    4. Returns best results found

    Args:
        title: Search query (recipe title)
        count: Number of results to return (default 10)

    Returns:
        List of image URLs (up to count results), or empty list if no results
    """
    # Simplify the title first
    simplified_title = simplify_recipe_title(title)

    # Strategy 1: Try simplified title + "food dish" to prioritize actual food photos
    results = _search_google_images(f"{simplified_title} food dish", count)

    # Strategy 2: If we got very few results, try "recipe food"
    if len(results) < 5:
        recipe_results = _search_google_images(f"{simplified_title} recipe food", count)

        # Use whichever gave us more results
        if len(recipe_results) > len(results):
            results = recipe_results

    # Strategy 3: If still very few, try just simplified title as fallback
    if len(results) < 5:
        simple_results = _search_google_images(simplified_title, count)

        # Use whichever gave us more results
        if len(simple_results) > len(results):
            results = simple_results

    return results


def _search_google_images(query: str, count: int = 10) -> List[str]:
    """
    Internal function to perform actual Google Custom Search API call.

    Args:
        query: Search query string
        count: Number of results to return

    Returns:
        List of image URLs
    """
    url = "https://www.googleapis.com/customsearch/v1"
    params = {
        'key': os.getenv('SEARCH_KEY'),
        'cx': os.getenv('SEARCH_ID'),
        'q': query,
        'searchType': 'image',
        'num': count,
        'imgSize': 'xlarge',
        'imgType': 'photo',
        'imgColorType': 'color',  # Prefer color photos (most food photos are in color)
        'safe': 'active',  # Enable SafeSearch to filter inappropriate content
    }

    try:
        response = requests.get(url, params=params, timeout=10)  # 10 second timeout

        if response.status_code == 200:
            try:
                search_results = response.json()
            except ValueError as json_err:
                return []

            # Extract image URLs from results
            if 'items' in search_results and len(search_results['items']) > 0:
                image_urls = [item['link'] for item in search_results['items']]
                return image_urls
            else:
                return []
        else:
            return []

    except requests.exceptions.Timeout:
        return []
    except requests.exceptions.RequestException as e:
        return []


def extract_used_image_urls(json_data: Dict) -> Set[str]:
    """
    Extract all image URLs currently in use by existing recipes.

    Args:
        json_data: Combined recipe data dictionary

    Returns:
        Set of image URLs already in use
    """
    used_urls = set()

    for recipe in json_data.values():
        # Check various possible fields for image URL
        if 'image_url' in recipe:
            used_urls.add(recipe['image_url'])
        elif 'imageUrl' in recipe:
            used_urls.add(recipe['imageUrl'])
        elif 'ImageUrl' in recipe:
            used_urls.add(recipe['ImageUrl'])

    return used_urls


def select_unique_image_url(search_results: List[str], used_urls: Set[str]) -> str:
    """
    Select the first unused image URL from search results.

    Args:
        search_results: List of image URLs from Google search
        used_urls: Set of image URLs already in use

    Returns:
        First unused URL, or first URL as fallback if all are used,
        or empty string if no results
    """
    if not search_results:
        return ''

    # Find first unused URL
    for idx, url in enumerate(search_results):
        if url not in used_urls:
            return url

    # All URLs are used - return first as fallback
    return search_results[0]


# Legacy function for backward compatibility with existing code
def google_search_image_legacy(title):
    """
    Legacy function that returns full search results object.

    DEPRECATED: Use google_search_image() instead.
    """
    url = "https://www.googleapis.com/customsearch/v1"
    params = {
        'key': os.getenv('SEARCH_KEY'),
        'cx': os.getenv('SEARCH_ID'),
        'q': title,
        'searchType': 'image',
        'num': 10,
        'imgSize': 'xlarge',
        'imgType': 'photo',
    }
    response = requests.get(url, params=params)
    if response.status_code == 200:
        search_results = response.json()

        if 'items' in search_results and len(search_results['items']) > 0:
            return search_results
        else:
            return None
    else:
        return None