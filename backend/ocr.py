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

5. The JSON output should have four main parts: Title, Ingredients, Directions, and Description.

6. You may nest items under Ingredients and Directions if necessary.

7. All parts should either be a string or an array of strings.

8. The Description can include cooking tips, a general description of the recipe, or be left blank.

9. The Title should be the name of the recipe.

Here is an example output:


    "Title": "Potato Gratin with Mushrooms, Onions and Cereal Crunch",
    "Ingredients": 
        "Potatoes": [
            "2 pounds Yukon Gold potatoes, thinly sliced",
            "3 tablespoons unsalted butter",
            "1/2 pound cremini mushrooms, sliced",
        ],
        "Cereal Crunch Topping": [
            "1 cup panko breadcrumbs",
            "2 tablespoons unsalted butter, melted",
        ]
    ,
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