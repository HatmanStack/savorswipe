from openai import OpenAI
import os
import json

client = OpenAI(api_key=os.getenv('API_KEY'))

def extract_recipe_data(base64_image):
    system_prompt = f"""
You are an OCR-like data extraction tool that extracts recipe data from PDFs.

1. Please extract the data from the provided PDF, grouping it according to themes and subgroups, then output it in JSON format.

2. Ensure the keys and values in the JSON remain in the original language.

3. The types of data you might encounter include, but are not limited to: Recipe, Ingredients, Directions, Comments, and Description.

4. If the PDF contains multiple recipes, each one should be grouped separately.

5. The JSON output should have five main parts: Title, Servings, Ingredients, Directions, and Description.

6. Extract or infer the number of servings for this recipe. Guidelines:
   - If explicitly stated ("Serves 4", "Makes 8 servings"), use that number
   - If yield is given ("Yields 24 cookies", "Makes 12 muffins"), divide by 2-3 to estimate servings
     (e.g., "24 cookies" = 12 servings, "12 muffins" = 6 servings)
   - For casseroles/baked dishes, consider pan size (9x13 pan ≈ 8-12 servings)
   - For soups/stews, consider volume (8 cups ≈ 4-6 servings)
   - Use ingredient quantities as hints (2 lbs chicken ≈ 4-6 servings)
   - Default to 4 servings only if no context is available
   - Return the number in a field called "Servings" (integer)
   - Always provide a number - never null or omit this field

7. You may nest items under Ingredients and Directions if necessary.

8. Ingredients MUST be formatted as objects (key-value pairs), NOT arrays.
   - For simple recipes: {"ingredient": "amount"}
   - For sectioned recipes: {"Section Name": {"ingredient": "amount"}}
   - Never use arrays like ["2 cups flour", "1 cup sugar"]

9. All parts should either be a string or an array of strings, EXCEPT Ingredients which must be objects.

8. The Description can include cooking tips, a general description of the recipe, or be left blank.

9. The Title should be the name of the recipe.

Here is an example output:


    "Title": "Potato Gratin with Mushrooms, Onions and Cereal Crunch",
    "Servings": 6,
    "Ingredients": {
        "yukon gold potatoes": "2 pounds, thinly sliced",
        "unsalted butter": "3 tablespoons",
        "cremini mushrooms": "1/2 pound, sliced",
        "panko breadcrumbs": "1 cup",
        "salt": "to taste",
        "pepper": "to taste"
    },
    "Directions": [
        "Preheat the oven to 375°F. Grease a 9x13 inch baking dish with butter.",
        "Melt 3 tablespoons butter in a skillet over medium heat. Add the mushrooms, onion, and garlic. Sauté for 5-7 minutes until softened.",
        "Arrange a layer of potato slices in the prepared baking dish, overlapping slices. Season with salt and pepper. Top with the mushroom mixture, then sprinkle with thyme, Gruyère, and Parmesan.",
    ],
    "Description": "A creamy and flavorful potato gratin with a crunchy cereal topping, perfect for a cozy meal.",

"""
    print('OCR Starting')
    response = client.chat.completions.create(
        model="gpt-4o",
        response_format={ "type": "json_object" },
        messages=[
            {
                "role": "system",
                "content": system_prompt
            },
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "extract the data in this recipe and output into JSON "},
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{base64_image}", "detail": "high"}}
                ]
            }
        ],
        temperature=0.0,
    )
    return response.choices[0].message.content

def parseJSON(recipes):
    parse_prompt = f"""
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

# Data Processing Rules
1. LANGUAGE PRESERVATION
   - All keys and values must remain in their original language
   - Do not translate or modify any text content

2. STRUCTURAL REQUIREMENTS
   - Preserve all nested structures under primary keys
   - Maintain arrays and objects in their original format
   - Keep hierarchical relationships intact

3. RECIPE CONSOLIDATION LOGIC
   - Compare recipes within arrays for duplicates
   - If multiple versions exist for the same recipe, merge while preserving unique elements
   - Maintain distinct recipes as separate entries

4. KEY HANDLING
   - Process standard recipe keys including but not limited to:
     * Title
     * Ingredients
     * Directions
     * Description
   - Preserve any additional keys present in the source data
   - Maintain nested keys under primary categories

# Example Data Structure

{{
    "Title": "Potato Gratin with Mushrooms, Onions and Cereal Crunch",
    "Ingredients": {{
        "Potatoes": [
            "2 pounds Yukon Gold potatoes, thinly sliced",
            "3 tablespoons unsalted butter",
            "1/2 pound cremini mushrooms, sliced"
        ],
        "Cereal Crunch Topping": [
            "1 cup panko breadcrumbs",
            "2 tablespoons unsalted butter, melted"
        ]
    }},
    "Directions": [
        "Preheat the oven to 375°F. Grease a 9x13 inch baking dish with butter.",
        "Melt 3 tablespoons butter in a skillet over medium heat. Add the mushrooms, onion, and garlic. Sauté for 5-7 minutes until softened.",
        "Arrange a layer of potato slices in the prepared baking dish, overlapping slices. Season with salt and pepper. Top with the mushroom mixture, then sprinkle with thyme, Gruyère, and Parmesan."
    ],
    "Description": "A creamy and flavorful potato gratin with a crunchy cereal topping, perfect for a cozy meal."
}}

# Output Requirements
1. Maintain JSON validity
2. Preserve all nested structures
3. Don't include any special characters in the response
3. Keep original data types (arrays, objects, strings)
4. Ensure all keys and values are properly escaped
5. Format output for readability
6. Return only the JSON and nothing else

  """
    print('Recipe Combining Staring')
    json_string = json.dumps(recipes)
    response = client.chat.completions.create(
        model="gpt-4o",
        response_format={ "type": "json_object" },
        
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
    )
    return response.choices[0].message.content