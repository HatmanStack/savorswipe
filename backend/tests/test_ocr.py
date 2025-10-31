#!/usr/bin/env python3
"""
Test script for OCR recipe extraction with servings and ingredient normalization.

This script tests the updated OCR prompt to ensure:
1. Servings field is present and numeric
2. Ingredients are in object format (not arrays)
3. Fractions are preserved
4. "To taste" items are handled correctly
"""

import base64
import json
import os
import sys

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ocr import extract_recipe_data

def test_recipe_image(image_path):
    """
    Test a recipe image and verify the output.

    Args:
        image_path: Path to the recipe image
    """
    print(f"\n{'='*60}")
    print(f"Testing: {image_path}")
    print(f"{'='*60}")

    # Check if image exists
    if not os.path.exists(image_path):
        print(f"❌ Image not found: {image_path}")
        return False

    # Encode image to base64
    try:
        with open(image_path, 'rb') as f:
            encoded = base64.b64encode(f.read()).decode('utf-8')
    except Exception as e:
        print(f"❌ Error encoding image: {e}")
        return False

    # Call OCR
    try:
        result_json = extract_recipe_data(encoded)
        result = json.loads(result_json)
    except Exception as e:
        print(f"❌ OCR failed: {e}")
        return False

    # Print result
    print("\n📋 OCR Result:")
    print(json.dumps(result, indent=2))

    # Verification checklist
    checks = []

    # Check 1: Servings field exists and is numeric
    if 'Servings' in result:
        servings = result['Servings']
        if isinstance(servings, (int, float)) and servings > 0:
            print(f"✅ Servings: {servings} (valid)")
            checks.append(True)
        else:
            print(f"❌ Servings: {servings} (invalid - not a positive number)")
            checks.append(False)
    else:
        print("❌ Servings field missing")
        checks.append(False)

    # Check 2: Ingredients are in object format (not array)
    if 'Ingredients' in result:
        ingredients = result['Ingredients']
        if isinstance(ingredients, dict):
            print("✅ Ingredients: Object format (correct)")

            # Check if it's a nested object or flat object
            is_nested = any(isinstance(v, dict) for v in ingredients.values())
            if is_nested:
                print("   📁 Format: Nested (sectioned recipe)")
            else:
                print("   📄 Format: Flat (simple recipe)")

            # Sample some ingredients
            print("   Sample ingredients:")
            count = 0
            for key, value in ingredients.items():
                if isinstance(value, dict):
                    print(f"   - Section: {key}")
                    for k2, v2 in list(value.items())[:2]:
                        print(f"     • {k2}: {v2}")
                        count += 1
                else:
                    print(f"   - {key}: {value}")
                    count += 1
                if count >= 5:
                    break

            checks.append(True)
        elif isinstance(ingredients, list):
            print(f"❌ Ingredients: Array format (incorrect - should be object)")
            print(f"   Example: {ingredients[:2]}")
            checks.append(False)
        else:
            print(f"❌ Ingredients: Unexpected format ({type(ingredients)})")
            checks.append(False)
    else:
        print("❌ Ingredients field missing")
        checks.append(False)

    # Check 3: Look for fractions in ingredients
    ingredients_str = json.dumps(result.get('Ingredients', {}))
    has_fractions = '1/2' in ingredients_str or '1/4' in ingredients_str or '3/4' in ingredients_str
    if has_fractions:
        print("✅ Fractions preserved (e.g., 1/2, 1/4, 3/4)")
    else:
        print("⚠️  No fractions found (may be normal for this recipe)")

    # Check 4: Look for "to taste" items
    has_to_taste = 'to taste' in ingredients_str.lower()
    if has_to_taste:
        print("✅ 'To taste' items present")

    # Overall result
    print(f"\n{'='*60}")
    if all(checks):
        print("✅ ALL CHECKS PASSED")
        return True
    else:
        print(f"❌ {sum(not c for c in checks)} CHECK(S) FAILED")
        return False

def main():
    """Main test function."""
    # Check for API key
    api_key = os.getenv('API_KEY')
    if not api_key:
        print("❌ Error: API_KEY environment variable not set")
        print("   Please set it with: export API_KEY='your-openai-api-key'")
        sys.exit(1)

    print("OpenAI API Key found ✓")

    # Define test cases
    test_cases = [
        {
            'path': 'test_images/simple_recipe.jpg',
            'description': 'Simple recipe with clear serving size',
            'expected': {'servings': True, 'object_format': True}
        },
        {
            'path': 'test_images/yield_recipe.jpg',
            'description': 'Recipe with yield (e.g., "Yields 24 cookies")',
            'expected': {'servings': True, 'object_format': True}
        },
        {
            'path': 'test_images/sectioned_recipe.jpg',
            'description': 'Recipe with sections (crust + filling)',
            'expected': {'servings': True, 'object_format': True}
        },
    ]

    # If test images don't exist, prompt user
    if not os.path.exists('test_images'):
        print("\n⚠️  Test images directory not found.")
        print("   Please provide recipe image path(s) as command line arguments:")
        print("   python test_ocr.py path/to/recipe1.jpg path/to/recipe2.jpg")

        # Check for command line arguments
        if len(sys.argv) > 1:
            test_cases = []
            for i, image_path in enumerate(sys.argv[1:], 1):
                test_cases.append({
                    'path': image_path,
                    'description': f'Recipe {i}',
                    'expected': {'servings': True, 'object_format': True}
                })
        else:
            print("\n❌ No test images provided")
            sys.exit(1)

    # Run tests
    results = []
    for i, test in enumerate(test_cases, 1):
        print(f"\n\n🧪 TEST {i}/{len(test_cases)}: {test['description']}")
        result = test_recipe_image(test['path'])
        results.append(result)

    # Summary
    print("\n\n" + "="*60)
    print("TEST SUMMARY")
    print("="*60)
    passed = sum(results)
    total = len(results)
    print(f"Passed: {passed}/{total}")

    if passed == total:
        print("\n🎉 All tests passed!")
        return 0
    else:
        print(f"\n⚠️  {total - passed} test(s) failed")
        return 1

if __name__ == '__main__':
    sys.exit(main())
