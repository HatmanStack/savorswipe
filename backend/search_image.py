import os
import requests
from typing import List, Set, Dict


def google_search_image(title: str, count: int = 10) -> List[str]:
    """
    Search for images using Google Custom Search API.

    Args:
        title: Search query (recipe title)
        count: Number of results to return (default 10)

    Returns:
        List of image URLs (up to count results), or empty list if no results
    """
    url = "https://www.googleapis.com/customsearch/v1"
    params = {
        'key': os.getenv('SEARCH_KEY'),
        'cx': os.getenv('SEARCH_ID'),
        'q': title,
        'searchType': 'image',
        'num': count,
        'imgSize': 'xlarge',
        'imgType': 'photo',
    }

    try:
        response = requests.get(url, params=params, timeout=10)  # 10 second timeout

        if response.status_code == 200:
            try:
                search_results = response.json()
            except ValueError as json_err:
                print(f"Error parsing JSON response: {json_err}")
                return []

            # Extract image URLs from results
            if 'items' in search_results and len(search_results['items']) > 0:
                image_urls = [item['link'] for item in search_results['items']]
                return image_urls
            else:
                print("No image results found.")
                return []
        else:
            print(f"Error: {response.status_code} - {response.text[:200]}")
            return []

    except requests.exceptions.Timeout:
        print("Error: Request timed out after 10 seconds")
        return []
    except requests.exceptions.RequestException as e:
        print(f"Error making request: {e}")
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
    for url in search_results:
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
            print("No image results found.")
            return None
    else:
        print(f"Error: {response.status_code}")
        return None