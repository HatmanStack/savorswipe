import json
import os

from openai import OpenAI

from fix_ingredients import normalize_recipe

# Lazy initialization will happen in functions
client = None


def get_client():
    global client
    if client is None:
        # Check if API_KEY is present
        api_key = os.getenv('API_KEY')
        if api_key:
            client = OpenAI(api_key=api_key)
        else:
            raise ValueError("API_KEY environment variable not set. Mock get_client() in tests.")
    return client


def _repair_partial_json(recipe_json: str) -> str:
    """
    Repair partial/truncated JSON by adding missing quotes, brackets, or braces.

    Args:
        recipe_json: Potentially incomplete JSON string

    Returns:
        Repaired JSON string with balanced quotes/brackets/braces
    """
    repaired = recipe_json
    if repaired.count('"') % 2 != 0:
        repaired += '"'
    if repaired.count('[') > repaired.count(']'):
        repaired += '\n]'
    if repaired.count('{') > repaired.count('}'):
        repaired += '\n}'
    return repaired


def complete_recipe_with_gpt(partial_recipe_json, base64_image):
    """
    Attempts to complete a truncated recipe using GPT vision model.

    Takes the partial OCR extraction and the original image to complete missing parts.
    """
    # Try to parse what we have
    partial_data = {}
    try:
        # Attempt to repair and parse the partial JSON
        repaired_json = _repair_partial_json(partial_recipe_json)
        partial_data = json.loads(repaired_json)
    except json.JSONDecodeError:
        # If we can't parse it, just use the raw text
        partial_data = {"partial_extraction": partial_recipe_json}

    completion_prompt = """
You are a recipe completion expert. An OCR extraction was interrupted while processing a recipe image,
and we have a partial extraction. Your task is to complete the missing parts of the recipe.

IMPORTANT GUIDELINES:
1. Use the partial extraction and the recipe image to complete the missing information
2. Maintain consistency with the extracted portions (language, formatting, style)
3. Ensure the completed recipe follows this structure:
   - Title: string
   - Servings: integer
   - Ingredients: object (key-value pairs, not arrays)
   - Directions: object (key-value pairs with numeric strings as keys, e.g., {"1": "Step one", "2": "Step two"})
   - Description: string

4. Ingredients MUST be formatted as objects (key-value pairs):
   - For simple recipes: {"ingredient": "amount"}
   - For sectioned recipes: {"Section Name": {"ingredient": "amount"}}
   - Never use arrays like ["2 cups flour", "1 cup sugar"]
   - Preserve fractional notation (use "1/2 cup" not "0.5 cups")
   - Normalize units to standard full words (no abbreviations):
     * Use "cup" or "cups" (not "c", "c.", "C")
     * Use "tablespoon" or "tablespoons" (not "T", "T.", "tbsp", "Tbsp")
     * Use "teaspoon" or "teaspoons" (not "t", "t.", "tsp")
     * Use "ounce" or "ounces" (not "oz", "oz.")
     * Use "pound" or "pounds" (not "lb", "lb.", "lbs")
     * Use "gram" or "grams" (not "g", "g.")

5. Directions MUST be formatted as objects (key-value pairs) with numeric strings as keys:
   - Example: {"1": "Preheat oven.", "2": "Mix ingredients."}
   - For sectioned directions: {"Section Name": {"1": "Step one", "2": "Step two"}}
   - Never use arrays like ["Step one", "Step two"]

6. If the extraction was cut off mid-sentence or mid-field, complete that section naturally
7. Don't add information that's not visible in the image - only complete what's incomplete
8. Return ONLY valid JSON in the exact format specified
9. This is a cooking recipe - focus on factual ingredient quantities and cooking instructions

Here is the partial extraction we have so far:
"""

    partial_str = json.dumps(partial_data, indent=2)

    response = get_client().chat.completions.create(
        model="gpt-5.2",
        response_format={"type": "json_object"},
        messages=[
            {
                "role": "system",
                "content": completion_prompt
            },
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": f"Partial extraction:\n{partial_str}\n\nPlease complete this recipe using the image:"},
                    {"type": "image_url", "image_url": {
                        "url": f"data:image/jpeg;base64,{base64_image}", "detail": "high"}}
                ]
            }
        ],
        temperature=0.1,  # Slightly higher to allow for completion creativity while staying accurate
        max_completion_tokens=4096,
    )

    completed_json = response.choices[0].message.content

    return completed_json


def extract_recipe_data(base64_image, retry_attempt=0):
    # Add safety instruction on retry to avoid content filter
    safety_note = ""
    if retry_attempt > 0:
        safety_note = "\nIMPORTANT: This is a cooking recipe extraction task. Focus only on factual ingredient quantities and cooking instructions."

    system_prompt = """
You are an OCR-like data extraction tool that extracts recipe data from PDFs.

1. Please extract the data from the provided PDF, grouping it according to themes and subgroups, then output it in JSON format.

2. Ensure the keys and values in the JSON remain in the original language.

3. The types of data you might encounter include, but are not limited to: Recipe, Ingredients, Directions, Comments, and Description.

4. IMPORTANT - Multiple Recipes Per Page:
   - If the image contains MULTIPLE DISTINCT recipes (complete OR partial), return them as: {"recipes": [recipe1, recipe2, ...]}
   - If the image contains a SINGLE recipe (complete or partial), return it as a single recipe object (no "recipes" wrapper)
   - Examples of multiple recipes:
     * Index pages with multiple recipe snippets
     * Recipe cards with 2+ recipes (even if incomplete)
     * Cookbook pages with multiple mini-recipes
     * Pages listing several recipes with partial info (titles + ingredients but no directions)
   - Examples of single recipe:
     * A full recipe spanning one or more pages
     * A single recipe card (even if incomplete)
     * A recipe with only title and ingredients visible (continuation on next page)
   - For partial recipes: Extract whatever is visible (Title, some Ingredients, etc.) - missing fields will be completed later
   - Don't worry about completeness - just detect if there are multiple distinct recipes vs a single recipe

5. Each recipe should ATTEMPT to have SIX main parts: Title, Servings, Type, Ingredients, Directions, and Description.
   - For partial recipes, extract whatever fields are visible
   - Missing or unclear fields should use reasonable defaults:
     * Title: Required - if not visible, use "Untitled Recipe"
     * Servings: Default to 4 if not stated
     * Type: Default to ["main dish"] if not clear
     * Ingredients: Empty object {} if none visible
     * Directions: Empty object {} if none visible
     * Description: Empty string "" if none visible

6. Extract or infer the number of servings for this recipe. Guidelines:
   - If explicitly stated ("Serves 4", "Makes 8 servings"), use that number
   - If yield is given ("Yields 24 cookies", "Makes 12 muffins"), divide by 2-3 to estimate servings
     (e.g., "24 cookies" = 12 servings, "12 muffins" = 6 servings)
   - For casseroles/baked dishes, consider pan size (9x13 pan ≈ 8-12 servings)
   - For soups/stews, consider volume (8 cups ≈ 4-6 servings)
   - Use ingredient quantities as hints (2 lbs chicken ≈ 4-6 servings)
   - Default to 4 servings if no context is available or recipe is partial
   - Return the number in a field called "Servings" (integer)

7. Extract or infer the recipe type (meal category). Guidelines:
   - Return as "Type" field (array of strings)
   - Valid types: "main dish", "dessert", "appetizer", "breakfast", "side dish", "beverage"
   - Examples:
     * Cookies, cakes, pies → ["dessert"]
     * Bread, rolls → ["side dish"] or ["breakfast"]
     * Soups, stews, pasta → ["main dish"]
     * Coffee, smoothies → ["beverage"]
   - A recipe can have multiple types (e.g., bread could be ["breakfast", "side dish"])
   - Default to ["main dish"] if uncertain or recipe is partial

8. You may nest items under Ingredients and Directions if necessary.

9. Ingredients MUST be formatted as objects (key-value pairs), NOT arrays.
   - For simple recipes: {"ingredient": "amount"}
   - For sectioned recipes: {"Section Name": {"ingredient": "amount"}}
   - Never use arrays like ["2 cups flour", "1 cup sugar"]
   - Preserve fractional notation (use "1/2 cup" not "0.5 cups")
   - Normalize units to standard full words (no abbreviations):
     * Use "cup" or "cups" (not "c", "c.", "C")
     * Use "tablespoon" or "tablespoons" (not "T", "T.", "tbsp", "Tbsp")
     * Use "teaspoon" or "teaspoons" (not "t", "t.", "tsp")
     * Use "ounce" or "ounces" (not "oz", "oz.")
     * Use "pound" or "pounds" (not "lb", "lb.", "lbs")
     * Use "gram" or "grams" (not "g", "g.")
   - For items without amounts, use phrases like "to taste", "as needed"

10. Directions MUST be formatted as objects (key-value pairs) with numeric strings as keys, NOT arrays.
   - Example: {"1": "Preheat oven.", "2": "Mix ingredients."}
   - For sectioned directions: {"Section Name": {"1": "Step one", "2": "Step two"}}
   - Never use arrays like ["Step one", "Step two"]

11. All parts should either be a string or an object, EXCEPT Type which is an array of strings.

12. The Description can include cooking tips, a general description of the recipe, or be left blank.

13. The Title should be the name of the recipe.

Here are example outputs:

Example 1 - Single recipe on page:

    "Title": "Potato Gratin with Mushrooms, Onions and Cereal Crunch",
    "Servings": 6,
    "Type": ["main dish"],
    "Ingredients": {
        "yukon gold potatoes": "2 pounds, thinly sliced",
        "unsalted butter": "3 tablespoons",
        "cremini mushrooms": "1/2 pound, sliced",
        "panko breadcrumbs": "1 cup",
        "heavy cream": "1 cup",
        "gruyere cheese, grated": "1/2 cup",
        "parmesan cheese, freshly grated": "1/4 cup",
        "fresh thyme, chopped": "2 tablespoons",
        "salt": "to taste",
        "pepper": "to taste"
    },
    "Directions": {
        "1": "Preheat the oven to 375°F. Grease a 9x13 inch baking dish with butter.",
        "2": "Melt 3 tablespoons butter in a skillet over medium heat. Add the mushrooms, onion, and garlic. Sauté for 5-7 minutes until softened.",
        "3": "Arrange a layer of potato slices in the prepared baking dish, overlapping slices. Season with salt and pepper. Top with the mushroom mixture, then sprinkle with thyme, Gruyère, and Parmesan."
    },
    "Description": "A creamy and flavorful potato gratin with a crunchy cereal topping, perfect for a cozy meal."


Example 2 - Multiple complete recipes on page:

{
    "recipes": [
        {
            "Title": "Chocolate Chip Cookies",
            "Servings": 24,
            "Type": ["dessert"],
            "Ingredients": {
                "all-purpose flour": "2 cups",
                "chocolate chips": "2 cups",
                "butter, softened": "1 cup",
                "brown sugar": "1 cup",
                "eggs": "2 large"
            },
            "Directions": {
                "1": "Preheat oven to 375°F.",
                "2": "Mix butter and sugar until creamy.",
                "3": "Add eggs and beat well.",
                "4": "Stir in flour and chocolate chips.",
                "5": "Bake for 10-12 minutes."
            },
            "Description": "Classic chocolate chip cookies."
        },
        {
            "Title": "Oatmeal Raisin Cookies",
            "Servings": 24,
            "Type": ["dessert"],
            "Ingredients": {
                "rolled oats": "3 cups",
                "raisins": "1 cup",
                "butter, softened": "1 cup",
                "brown sugar": "1 cup",
                "eggs": "2 large"
            },
            "Directions": {
                "1": "Preheat oven to 350°F.",
                "2": "Mix butter and sugar.",
                "3": "Add eggs and beat.",
                "4": "Stir in oats and raisins.",
                "5": "Bake for 12-15 minutes."
            },
            "Description": "Chewy oatmeal cookies with raisins."
        }
    ]
}

Example 3 - Multiple partial recipes (e.g., index page with snippets):

{
    "recipes": [
        {
            "Title": "Classic Lasagna",
            "Servings": 4,
            "Type": ["main dish"],
            "Ingredients": {
                "lasagna noodles": "1 pound",
                "ground beef": "1 pound",
                "ricotta cheese": "2 cups"
            },
            "Directions": {},
            "Description": ""
        },
        {
            "Title": "Chicken Parmesan",
            "Servings": 4,
            "Type": ["main dish"],
            "Ingredients": {
                "chicken breasts": "4 pieces",
                "marinara sauce": "2 cups"
            },
            "Directions": {},
            "Description": ""
        },
        {
            "Title": "Caesar Salad",
            "Servings": 4,
            "Type": ["side dish"],
            "Ingredients": {},
            "Directions": {},
            "Description": ""
        }
    ]
}

"""
    # Append safety note if this is a retry
    system_prompt = system_prompt + safety_note

    response = get_client().chat.completions.create(
        model="gpt-5.2",
        response_format={"type": "json_object"},
        messages=[
            {
                "role": "system",
                "content": system_prompt
            },
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "extract the data in this recipe and output into JSON "},
                    {"type": "image_url", "image_url": {
                        "url": f"data:image/jpeg;base64,{base64_image}", "detail": "high"}}
                ]
            }
        ],
        temperature=0.0,
        max_completion_tokens=4096,  # Ensure enough tokens for complete recipe extraction
    )

    # Handle content filter by retrying (max 2 attempts)
    if response.choices[0].finish_reason == 'content_filter' and retry_attempt < 2:
        return extract_recipe_data(base64_image, retry_attempt + 1)

    # Parse the LLM response and normalize the recipe
    recipe_json = response.choices[0].message.content

    # If content filter triggered after retries, use GPT to complete the recipe
    if response.choices[0].finish_reason == 'content_filter':
        try:
            # Use GPT to complete the truncated recipe based on partial extraction and image
            recipe_json = complete_recipe_with_gpt(recipe_json, base64_image)
        except (json.JSONDecodeError, Exception):
            # Fallback to basic repair if completion fails
            recipe_json = _repair_partial_json(recipe_json)

    try:
        recipe_data = json.loads(recipe_json)

        # Check if response contains multiple recipes
        if 'recipes' in recipe_data and isinstance(recipe_data['recipes'], list):
            # Normalize each recipe separately
            normalized_recipes = []
            for recipe in recipe_data['recipes']:
                normalized_recipe = normalize_recipe(recipe)
                normalized_recipes.append(normalized_recipe)

            # Return as array
            result = json.dumps(normalized_recipes, ensure_ascii=False)
            return result
        else:
            # Single recipe (original behavior)
            # Normalize to fix special characters, unicode fractions, and abbreviations
            normalized_recipe = normalize_recipe(recipe_data)
            result = json.dumps(normalized_recipe, ensure_ascii=False)
            return result
    except json.JSONDecodeError:
        # Return None to signal parsing failure
        return None


def parseJSON(recipes):
    print(f"[PARSEJSON] Received {len(recipes)} recipe object(s)")
    print(f"[PARSEJSON] Input preview: {str(recipes)[:300]}")

    parse_prompt = """
    # Role and Objective
You are an Expert Data Editor specializing in JSON processing and recipe data normalization. Your primary goal is to standardize and organize recipe data while preserving the original language and structure integrity.

# Core Responsibilities
1. Extract and process recipe data from JSON arrays
2. Maintain original language in all keys and values
3. Preserve structural hierarchy, especially in nested elements
4. Consolidate duplicate recipes when appropriate
5. Standardize output format while maintaining data fidelity
6. All tips or comments about the dish should be included in the Description
7. If a recipe doesn't have important fields like Ingredients or Directions Populated don't return it
8. It's necessary for every recipe to have at least a Title and Ingredients or a Title and Directions at minimum otherwise discard
9. If the Ingredients or Directions field doesn't exsist or is empty to your best to provide the missing information
10. Provide any tips in the Description that are reasonable even if they aren't present in the recipe
11. Ingredients MUST be formatted as objects (key-value pairs), NOT arrays

# Data Processing Rules
1. LANGUAGE PRESERVATION
   - All keys and values must remain in their original language
   - Do not translate or modify any text content

2. STRUCTURAL REQUIREMENTS
   - Preserve all nested structures under primary keys
   - Maintain arrays and objects in their original format
   - Keep hierarchical relationships intact

3. RECIPE CONSOLIDATION LOGIC
   - Keep all distinct recipes as separate entries
   - ONLY merge recipes if they have the EXACT SAME TITLE (case-insensitive)
   - If recipes have different titles, they are DISTINCT and must remain separate
   - When merging recipes with same title: combine ingredients and directions, preserve all unique information

4. KEY HANDLING
   - Process standard recipe keys including but not limited to:
     * Title
     * Servings
     * Type
     * Ingredients
     * Directions
     * Description
   - Preserve any additional keys present in the source data
   - Maintain nested keys under primary categories

# Example Data Structure

{{
    "Title": "Potato Gratin with Mushrooms, Onions and Cereal Crunch",
    "Servings": 6,
    "Type": ["main dish"],
    "Ingredients": {{
        "yukon gold potatoes": "2 pounds, thinly sliced",
        "unsalted butter": "3 tablespoons",
        "cremini mushrooms": "1/2 pound, sliced",
        "panko breadcrumbs": "1 cup",
        "salt": "to taste",
        "pepper": "to taste"
    }},
    "Directions": {{
        "1": "Preheat the oven to 375°F. Grease a 9x13 inch baking dish with butter.",
        "2": "Melt 3 tablespoons butter in a skillet over medium heat. Add the mushrooms, onion, and garlic. Sauté for 5-7 minutes until softened.",
        "3": "Arrange a layer of potato slices in the prepared baking dish, overlapping slices. Season with salt and pepper. Top with the mushroom mixture, then sprinkle with thyme, Gruyère, and Parmesan."
    }},
    "Description": "A creamy and flavorful potato gratin with a crunchy cereal topping, perfect for a cozy meal."
}}

# Output Requirements
1. If input contains MULTIPLE DISTINCT recipes (different titles), you MUST return: {"recipes": [recipe1, recipe2, ...]}
2. If input contains SINGLE recipe (or multiple with same title merged), return: {Title: "...", ...}
3. CRITICAL: For multiple recipes, ALWAYS wrap in {"recipes": [...]} - NEVER return a direct array or single object
4. Ingredients MUST be formatted as objects (key-value pairs), NOT arrays
5. Directions MUST be formatted as objects (key-value pairs) with numeric strings as keys, NOT arrays
6. Maintain JSON validity
5. Preserve all nested structures
6. Don't include any special characters in the response
7. Keep original data types (arrays, objects, strings)
8. Ensure all keys and values are properly escaped
9. Return only the JSON and nothing else

# Example for Multiple Recipes (3 recipes):
{
  "recipes": [
    {
      "Title": "Recipe 1",
      "Servings": 4,
      "Type": ["main dish"],
      "Ingredients": {...},
      "Directions": [...]
    },
    {
      "Title": "Recipe 2",
      "Servings": 6,
      "Type": ["dessert"],
      "Ingredients": {...},
      "Directions": [...]
    },
    {
      "Title": "Recipe 3",
      "Servings": 8,
      "Type": ["appetizer"],
      "Ingredients": {...},
      "Directions": [...]
    }
  ]
}

  """
    json_string = json.dumps(recipes)

    try:
        print("[PARSEJSON] Calling OpenAI API...")
        response = get_client().chat.completions.create(
            model="gpt-5.2",
            response_format={"type": "json_object"},

            messages=[
                {
                    "role": "system",
                    "content": parse_prompt
                },
                {
                    "role": "user",
                    "content": json_string
                }
            ],
            temperature=0.0,
            max_completion_tokens=16384,
            timeout=120.0  # 2 minute timeout for multi-recipe processing
        )
        print("[PARSEJSON] OpenAI API call completed")
    except Exception as e:
        print(f"[PARSEJSON ERROR] OpenAI API call failed: {str(e)}")
        import traceback
        traceback.print_exc()
        raise

    # Parse the LLM response and normalize the recipe
    recipe_json = response.choices[0].message.content
    print(f"[PARSEJSON] GPT returned {len(recipe_json)} characters")
    print(f"[PARSEJSON] GPT response preview: {recipe_json[:400]}")

    try:
        recipe_data = json.loads(recipe_json)

        # Handle three formats:
        # 1. {"recipes": [recipe1, recipe2]} - wrapped array
        # 2. [recipe1, recipe2] - direct array
        # 3. {recipe} - single recipe object

        recipes_to_normalize = None

        if isinstance(recipe_data, dict) and 'recipes' in recipe_data:
            # Format 1: Wrapped array
            print(
                f"[PARSEJSON] Detected wrapped array format with {len(recipe_data['recipes'])} recipes")
            recipes_to_normalize = recipe_data['recipes']
        elif isinstance(recipe_data, list):
            # Format 2: Direct array
            print(f"[PARSEJSON] Detected direct array format with {len(recipe_data)} recipes")
            recipes_to_normalize = recipe_data
        else:
            # Format 3: Single recipe
            print(
                f"[PARSEJSON] Detected single recipe format: {recipe_data.get('Title', 'Unknown')}")
            normalized_recipe = normalize_recipe(recipe_data)
            result = json.dumps(normalized_recipe, ensure_ascii=False)
            return result

        # Normalize multiple recipes
        normalized_recipes = []
        for recipe in recipes_to_normalize:
            normalized_recipe = normalize_recipe(recipe)
            normalized_recipes.append(normalized_recipe)

        print(f"[PARSEJSON] Returning {len(normalized_recipes)} normalized recipes")
        result = json.dumps(normalized_recipes, ensure_ascii=False)
        return result

    except json.JSONDecodeError:
        # Return empty JSON object to signal parsing failure
        return '{}'
