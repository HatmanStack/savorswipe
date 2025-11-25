#!/usr/bin/env python3
"""
Fix special characters and abbreviations in combined_data.json ingredient amounts.
Normalizes to plain text fractions and full unit names per OCR rules.
"""

import json
import re
from typing import Any, Dict

# Unicode fraction to text mapping
FRACTION_MAP = {
    '¼': '1/4',
    '½': '1/2',
    '¾': '3/4',
    '⅓': '1/3',
    '⅔': '2/3',
    '⅛': '1/8',
    '⅜': '3/8',
    '⅝': '5/8',
    '⅞': '7/8',
}

# Special character cleanup
SPECIAL_CHAR_MAP = {
    'â€"': '—',  # em dash
    'Â°': '°',   # degree symbol
    'Ã©': 'é',   # accented e
    'Ã': 'à',    # accented a
}


def normalize_units(text: str) -> str:
    """
    Normalize abbreviated units to full words according to OCR rules.
    Rules from backend/ocr.py lines 39-45
    """
    if not isinstance(text, str):
        return text

    # Create a copy to work with
    result = text

    # Normalize units - case sensitive patterns
    replacements = [
        # Ounces - handle hyphenated forms first (e.g., "4.5-oz." or "10-oz")
        (r'(\d+\.?\d*-)oz\.', r'\1ounce'),  # With period
        (r'(\d+\.?\d*-)oz\b', r'\1ounce'),  # Without period
        # Then handle regular ounces
        (r'\b(\d+\.?\d*\s*)oz\.?\b', r'\1ounces'),
        (r'\b(1\s*)ounces\b', r'\1ounce'),  # Fix singular

        # Pounds - handle plural
        (r'\b(\d+\s*)lbs?\.?\b', r'\1pounds'),
        (r'\b(1\s*)pounds\b', r'\1pound'),  # Fix singular

        # Cups - handle plural
        (r'\b(\d+\s*)c\.(?=\s|$)', r'\1cups'),  # Match "c." with period
        (r'\b(\d+\s*)c(?=\s*$)', r'\1cups'),  # Match "c" without period at end of string
        (r'\bC\.(?=\s|$)', r'cups'),  # Capital C with period
        (r'\b(1\s*)cups\b', r'\1cup'),  # Fix singular
        (r'\b(1/\d+\s*)cups\b', r'\1cup'),  # Fix fractions with singular

        # Tablespoons - handle plural
        (r'\b(\d+\s*)[Tt]bsp\.?\b', r'\1tablespoons'),
        (r'\b(\d+\s*)T\.(?=\s|$)', r'\1tablespoons'),
        (r'\b(1\s*)tablespoons\b', r'\1tablespoon'),  # Fix singular
        (r'\b(1/\d+\s*)tablespoons\b', r'\1tablespoon'),  # Fix fractions

        # Teaspoons - handle plural
        (r'\b(\d+\s*)tsp\.?\b', r'\1teaspoons'),
        (r'\b(\d+\s*)t\.(?=\s|$)', r'\1teaspoons'),
        (r'\b(1\s*)teaspoons\b', r'\1teaspoon'),  # Fix singular
        (r'\b(1/\d+\s*)teaspoons\b', r'\1teaspoon'),  # Fix fractions

        # Grams
        (r'\b(\d+\s*)g\.?\b', r'\1grams'),
        (r'\b(1\s*)grams\b', r'\1gram'),  # Fix singular

        # Gallons
        (r'\b(\d+\s*)gal\.?\b', r'\1gallons'),
        (r'\b(1\s*)gallons\b', r'\1gallon'),  # Fix singular
    ]

    for pattern, replacement in replacements:
        result = re.sub(pattern, replacement, result)

    return result


def replace_fractions(text: str) -> str:
    """Replace Unicode fraction characters with regular text."""
    if not isinstance(text, str):
        return text

    for unicode_frac, text_frac in FRACTION_MAP.items():
        text = text.replace(unicode_frac, text_frac)

    return text


def clean_special_chars(text: str) -> str:
    """Clean up mangled special characters from encoding issues."""
    if not isinstance(text, str):
        return text

    for bad_char, good_char in SPECIAL_CHAR_MAP.items():
        text = text.replace(bad_char, good_char)

    return text


def process_value(value: Any) -> Any:
    """Recursively process a value to normalize text."""
    if isinstance(value, str):
        # Apply all transformations
        value = clean_special_chars(value)
        value = replace_fractions(value)
        value = normalize_units(value)
        return value
    elif isinstance(value, dict):
        return {k: process_value(v) for k, v in value.items()}
    elif isinstance(value, list):
        return [process_value(item) for item in value]
    else:
        return value


def normalize_recipe(recipe: Dict) -> Dict:
    """
    Normalize a single recipe dictionary.
    Fixes special characters, unicode fractions, and unit abbreviations.

    Args:
        recipe: A single recipe dictionary with keys like Title, Ingredients, Directions, etc.

    Returns:
        The normalized recipe dictionary (modifies in place and returns)
    """
    # Process Ingredients - both keys and values
    if 'Ingredients' in recipe:
        if isinstance(recipe['Ingredients'], dict):
            # Process ingredient keys AND values
            normalized_ingredients = {}
            for ing_key, ing_val in recipe['Ingredients'].items():
                # Normalize both key and value
                new_key = process_value(ing_key)
                new_val = process_value(ing_val)
                normalized_ingredients[new_key] = new_val
            recipe['Ingredients'] = normalized_ingredients
        else:
            recipe['Ingredients'] = process_value(recipe['Ingredients'])

    # Also clean up Directions, Description, Comments for consistency
    if 'Directions' in recipe:
        recipe['Directions'] = process_value(recipe['Directions'])

    if 'Description' in recipe:
        recipe['Description'] = process_value(recipe['Description'])

    if 'Comments' in recipe:
        recipe['Comments'] = process_value(recipe['Comments'])

    # Clean any other text fields
    for field in recipe:
        if isinstance(recipe[field], str):
            recipe[field] = process_value(recipe[field])

    return recipe


def normalize_ingredients(data: Dict) -> Dict:
    """
    Normalize all ingredient amounts in the recipe data collection.
    Also normalizes Directions, Description, and Comments for consistency.
    Normalizes both ingredient keys and values.

    Args:
        data: Dictionary of recipes (keys are recipe IDs, values are recipe dicts)

    Returns:
        The normalized data dictionary
    """
    for key, recipe in data.items():
        normalize_recipe(recipe)

    return data


def main():
    input_file = '/home/christophergalliart/combined_data.json'
    output_file = '/home/christophergalliart/combined_data_fixed.json'

    print(f"Loading {input_file}...")
    with open(input_file, 'r', encoding='utf-8') as f:
        data = json.load(f)

    print(f"Processing {len(data)} recipes...")

    # Process the data
    data = normalize_ingredients(data)

    print(f"\nWriting to {output_file}...")
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"✓ Done! Fixed data written to {output_file}")
    print("\nTo replace the original file:")
    print(f"  mv {output_file} {input_file}")


if __name__ == '__main__':
    main()
