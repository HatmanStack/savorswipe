import os
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Dict, List, Optional, Set

import requests

from logger import StructuredLogger

log = StructuredLogger("search")


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
    log.info("Simplifying title", title=title)

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

    log.info("Simplified title", simplified=simplified)
    return simplified


def validate_image_urls(image_urls: List[str], timeout: int = 5) -> List[str]:
    """
    Validate that image URLs are actually accessible using parallel requests.

    Checks each URL concurrently to ensure:
    - HTTP 200 response
    - Content-Type header contains 'image'

    Uses ThreadPoolExecutor for parallel validation, preserving original URL order
    so search result ranking is maintained.

    Args:
        image_urls: List of image URLs to validate
        timeout: Request timeout in seconds (default: 5)

    Returns:
        List of valid image URLs in original order (may be fewer than input)
    """
    if not image_urls:
        log.info("No image URLs to validate")
        return []

    log.info("Validating image URLs", count=len(image_urls))

    def _validate_single(url: str) -> Optional[str]:
        if not url:
            return None
        try:
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            }
            response = requests.head(url, headers=headers, timeout=timeout, allow_redirects=True)
            if response.status_code == 200:
                content_type = response.headers.get('Content-Type', '')
                if 'image' in content_type.lower():
                    return url
            return None
        except Exception as e:
            log.debug("URL validation failed", url=url, error=str(e))
            return None

    valid_urls = []
    with ThreadPoolExecutor(max_workers=5) as executor:
        future_to_url = {executor.submit(_validate_single, url): url for url in image_urls}
        for future in as_completed(future_to_url):
            result = future.result()
            if result:
                valid_urls.append(result)

    # Preserve original order (as_completed returns in completion order)
    ordered_valid = [url for url in image_urls if url in set(valid_urls)]

    log.info("URL validation complete", valid=len(ordered_valid), total=len(image_urls))
    return ordered_valid


def google_search_image(title: str, count: int = 10, recipe_type: Optional[str] = None) -> List[str]:
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
    log.info("Search request", title=title, recipe_type=recipe_type)

    # Simplify the title first
    simplified_title = simplify_recipe_title(title)

    # Determine search suffix based on recipe type
    if recipe_type and 'beverage' in recipe_type.lower():
        suffix1 = "beverage photo"
        log.info("Detected beverage type - using beverage-specific search terms")
    else:
        suffix1 = "food photo"

    # Strategy 1: Try simplified title + type-specific suffix
    log.info("Strategy 1", query=f"{simplified_title} {suffix1}")
    results = _search_google_images(f"{simplified_title} {suffix1}", count)

    # Strategy 2: If we got very few results, try with "recipe photo"
    if len(results) < 5:
        log.info("Strategy 2: trying recipe photo", results_so_far=len(results), query=f"{simplified_title} recipe photo")
        recipe_results = _search_google_images(f"{simplified_title} recipe photo", count)

        # Use whichever gave us more results
        if len(recipe_results) > len(results):
            log.info("Strategy 2 found more results", count=len(recipe_results))
            results = recipe_results

    # Strategy 3: If still very few, try just simplified title as fallback
    if len(results) < 5:
        log.info("Strategy 3: trying simplified title only", results_so_far=len(results), query=simplified_title)
        simple_results = _search_google_images(simplified_title, count)

        # Use whichever gave us more results
        if len(simple_results) > len(results):
            log.info("Strategy 3 found more results", count=len(simple_results))
            results = simple_results

    # Validate URLs to ensure they're actually accessible
    log.info("Validating URLs before returning", count=len(results))
    validated_results = validate_image_urls(results)

    log.info("Final validated result count", count=len(validated_results))
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
    log.info("Searching for images", query=query, count=count)
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
        log.info("Sending request to Google Custom Search API")
        response = requests.get(url, params=params, timeout=10)  # 10 second timeout
        log.info("Response received", status_code=response.status_code)

        if response.status_code == 200:
            try:
                search_results = response.json()
                log.info("Response parsed successfully")
            except ValueError as json_err:
                log.error("Error parsing JSON response", error=str(json_err))
                return []

            # Extract image URLs from results
            if 'items' in search_results and len(search_results['items']) > 0:
                image_urls = [item['link'] for item in search_results['items']]
                log.info("Found image URLs", count=len(image_urls))
                return image_urls
            else:
                log.info("No image results found")
                return []
        else:
            log.error("Search API error", status_code=response.status_code, response=response.text[:200])
            return []

    except requests.exceptions.Timeout:
        log.error("Request timed out", timeout=10)
        return []
    except requests.exceptions.RequestException as e:
        log.error("Error making request", error=str(e))
        return []


def extract_used_image_urls(json_data: Dict) -> Set[str]:
    """
    Extract all image URLs currently in use by existing recipes.

    Args:
        json_data: Combined recipe data dictionary

    Returns:
        Set of image URLs already in use
    """
    log.info("Extracting used image URLs", recipe_count=len(json_data))
    used_urls = set()

    for recipe in json_data.values():
        # Check various possible fields for image URL
        if 'image_url' in recipe:
            used_urls.add(recipe['image_url'])
        elif 'imageUrl' in recipe:
            used_urls.add(recipe['imageUrl'])
        elif 'ImageUrl' in recipe:
            used_urls.add(recipe['ImageUrl'])

    log.info("Extracted used image URLs", count=len(used_urls))
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
    log.info("Selecting unique URL", results=len(search_results), used=len(used_urls))
    if not search_results:
        log.info("No search results provided")
        return ''

    # Find first unused URL
    for idx, url in enumerate(search_results):
        if url not in used_urls:
            log.info("Selected unused URL", position=idx)
            return url

    # All URLs are used - return first as fallback
    log.warning("All URLs already used, using first as fallback")
    return search_results[0]
