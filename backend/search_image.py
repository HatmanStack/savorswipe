import os
import requests
import re
from typing import List, Set, Dict
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


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
    print(f"[SEARCH] Simplifying title: '{title}'")

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

    print(f"[SEARCH] Simplified to: '{simplified}'")
    return simplified


def validate_image_urls(image_urls: List[str], timeout: int = 5) -> List[str]:
    """
    Validate that image URLs are actually accessible.

    Checks each URL to ensure:
    - HTTP 200 response
    - Content-Type header contains 'image'

    Args:
        image_urls: List of image URLs to validate
        timeout: Request timeout in seconds (default: 5)

    Returns:
        List of valid image URLs (may be fewer than input)
    """
    if not image_urls:
        logger.info("[SEARCH] No image URLs to validate")
        return []

    logger.info(f"[SEARCH] Validating {len(image_urls)} image URLs...")
    valid_urls = []

    for url in image_urls:
        if not url:
            logger.warning("[SEARCH] Skipping empty URL")
            continue

        try:
            logger.info(f"[SEARCH] Validating URL: {url[:100]}...")
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            }

            # Send HEAD request first (faster than GET)
            response = requests.head(url, headers=headers, timeout=timeout, allow_redirects=True)

            if response.status_code == 200:
                # Verify content-type is an image
                content_type = response.headers.get('Content-Type', '')
                if 'image' in content_type.lower():
                    logger.info(f"[SEARCH] URL validated successfully: {content_type}")
                    valid_urls.append(url)
                else:
                    logger.warning(
                        f"[SEARCH] URL has invalid content-type (not an image): {content_type}"
                    )
            else:
                logger.warning(f"[SEARCH] URL returned non-200 status: {response.status_code}")

        except requests.exceptions.Timeout:
            logger.warning(f"[SEARCH] URL validation timeout after {timeout}s")
        except requests.exceptions.RequestException as e:
            logger.warning(f"[SEARCH] URL validation failed: {str(e)}")
        except Exception as e:
            logger.error(f"[SEARCH] Unexpected error validating URL: {str(e)}")

    logger.info(f"[SEARCH] URL validation complete: {len(valid_urls)}/{len(image_urls)} URLs are valid")
    return valid_urls


def google_search_image(title: str, count: int = 10, recipe_type: str = None) -> List[str]:
    """
    Search for images using Google Custom Search API with automatic query simplification.

    Tries multiple search strategies to find actual photos:
    1. Simplified title + type-specific suffix (e.g., "Hot Cocoa beverage photo" or "Steak food photo")
    2. If <5 results, tries simplified title + "recipe photo"
    3. If still <5 results, tries just simplified title
    4. Returns best results found

    Args:
        title: Search query (recipe title)
        count: Number of results to return (default 10)
        recipe_type: Recipe type (e.g., "beverage", "dessert", "main dish") for targeted searches

    Returns:
        List of image URLs (up to count results), or empty list if no results
    """
    print(f"[SEARCH] Original title: '{title}', type: '{recipe_type}'")

    # Simplify the title first
    simplified_title = simplify_recipe_title(title)

    # Determine search suffix based on recipe type
    if recipe_type and 'beverage' in recipe_type.lower():
        suffix1 = "beverage photo"
        print(f"[SEARCH] Detected beverage type - using beverage-specific search terms")
    else:
        suffix1 = "food photo"

    # Strategy 1: Try simplified title + type-specific suffix
    print(f"[SEARCH] Strategy 1: Trying '{simplified_title} {suffix1}'...")
    results = _search_google_images(f"{simplified_title} {suffix1}", count)

    # Strategy 2: If we got very few results, try with "recipe photo"
    if len(results) < 5:
        print(f"[SEARCH] Only found {len(results)} results, trying strategy 2: '{simplified_title} recipe photo'...")
        recipe_results = _search_google_images(f"{simplified_title} recipe photo", count)

        # Use whichever gave us more results
        if len(recipe_results) > len(results):
            print(f"[SEARCH] Strategy 2 found more results: {len(recipe_results)}")
            results = recipe_results

    # Strategy 3: If still very few, try just simplified title as fallback
    if len(results) < 5:
        print(f"[SEARCH] Only found {len(results)} results, trying strategy 3: '{simplified_title}'...")
        simple_results = _search_google_images(simplified_title, count)

        # Use whichever gave us more results
        if len(simple_results) > len(results):
            print(f"[SEARCH] Strategy 3 (simplified only) found more results: {len(simple_results)}")
            results = simple_results

    # Validate URLs to ensure they're actually accessible
    print(f"[SEARCH] Validating {len(results)} URLs before returning...")
    validated_results = validate_image_urls(results)

    print(f"[SEARCH] Final validated result count: {len(validated_results)}")
    return validated_results


def _search_google_images(query: str, count: int = 10) -> List[str]:
    """
    Internal function to perform actual Google Custom Search API call.

    Args:
        query: Search query string
        count: Number of results to return

    Returns:
        List of image URLs
    """
    print(f"[SEARCH] Searching for images: '{query}', count={count}")
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
        print(f"[SEARCH] Sending request to Google Custom Search API...")
        response = requests.get(url, params=params, timeout=10)  # 10 second timeout
        print(f"[SEARCH] Response status code: {response.status_code}")

        if response.status_code == 200:
            try:
                search_results = response.json()
                print(f"[SEARCH] Response parsed successfully")
            except ValueError as json_err:
                print(f"[SEARCH ERROR] Error parsing JSON response: {json_err}")
                return []

            # Extract image URLs from results
            if 'items' in search_results and len(search_results['items']) > 0:
                image_urls = [item['link'] for item in search_results['items']]
                print(f"[SEARCH] Found {len(image_urls)} image URLs")
                return image_urls
            else:
                print(f"[SEARCH] No image results found")
                return []
        else:
            print(f"[SEARCH ERROR] Error: {response.status_code} - {response.text[:200]}")
            return []

    except requests.exceptions.Timeout:
        print(f"[SEARCH ERROR] Request timed out after 10 seconds")
        return []
    except requests.exceptions.RequestException as e:
        print(f"[SEARCH ERROR] Error making request: {e}")
        return []


def extract_used_image_urls(json_data: Dict) -> Set[str]:
    """
    Extract all image URLs currently in use by existing recipes.

    Args:
        json_data: Combined recipe data dictionary

    Returns:
        Set of image URLs already in use
    """
    print(f"[SEARCH] Extracting used image URLs from {len(json_data)} recipes")
    used_urls = set()

    for recipe in json_data.values():
        # Check various possible fields for image URL
        if 'image_url' in recipe:
            used_urls.add(recipe['image_url'])
        elif 'imageUrl' in recipe:
            used_urls.add(recipe['imageUrl'])
        elif 'ImageUrl' in recipe:
            used_urls.add(recipe['ImageUrl'])

    print(f"[SEARCH] Extracted {len(used_urls)} used image URLs")
    return used_urls


def select_unique_image_url(search_results: List[str], used_urls: Set[str]) -> str:
    """
    Select the first unused image URL from search results.

    This function implements image URL deduplication to ensure that
    different recipes don't use the same image. It's used during both
    initial upload (legacy auto-selection) and new image picker workflow
    (user selection from grid).

    Args:
        search_results: List of image URLs from Google search (typically 9 from picker)
        used_urls: Set of image URLs already in use by existing recipes

    Returns:
        First unused URL from search results, first URL as fallback if all are used,
        or empty string if no search results provided

    Examples:
        >>> urls = ["url1", "url2", "url3"]
        >>> used = {"url1"}
        >>> select_unique_image_url(urls, used)
        'url2'  # First unused
        >>> select_unique_image_url(urls, {"url1", "url2", "url3"})
        'url1'  # All used, fallback to first
        >>> select_unique_image_url([], set())
        ''  # Empty results
    """
    print(f"[SEARCH] Selecting unique URL from {len(search_results)} results, {len(used_urls)} URLs already used")
    if not search_results:
        print(f"[SEARCH] No search results provided")
        return ''

    # Find first unused URL
    for idx, url in enumerate(search_results):
        if url not in used_urls:
            print(f"[SEARCH] Selected unused URL at position {idx}")
            return url

    # All URLs are used - return first as fallback
    print(f"[SEARCH WARNING] All URLs already used, using first as fallback")
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