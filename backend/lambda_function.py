from openai import OpenAI
from pdf2image import convert_from_path
import base64
import json
import os
import boto3
from duckduckgo_search import DDGS
import requests

s3_client = boto3.client('s3')
client = OpenAI(api_key=os.getenv('API_KEY'))


@staticmethod
def encode_image(image_path):
    with open(image_path, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode("utf-8")
    
def pdf_to_base64_images(base64_pdf):
    pdf_data = base64.b64decode(base64_pdf)
    with open('/tmp/temp_pdf.pdf', 'wb') as temp_pdf_file:
        temp_pdf_file.write(pdf_data)
    base64_images = []
    temp_image_paths = []
    images = convert_from_path('/tmp/temp_pdf.pdf')

    total_pages = len(images)
    if total_pages > 3:
        return False
    print('Total pages Counted')

    for page_num, img in enumerate(images):
        temp_image_path = f"/tmp/temp_page_{page_num}.png"
        img.save(temp_image_path, format="PNG")
        temp_image_paths.append(temp_image_path)
        base64_image = encode_image(temp_image_path)
        base64_images.append(base64_image)

    print('PDF Pages Saved and Encoded')
    for temp_image_path in temp_image_paths:
        os.remove(temp_image_path)

    return base64_images

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
                    {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{base64_image}", "detail": "high"}}
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

def extract_from_multiple_pages(base64_images, original_filename, output_directory):
    recipes = []
    
    for base64_image in base64_images:
        recipe_json = extract_recipe_data(base64_image)
        if recipe_json is None:
            print("Warning: extract_recipe_data returned None for an image.")
            continue  # Skip this image if extraction failed
        
        try:
            invoice_data = json.loads(recipe_json)
            recipes.append(invoice_data)
        except json.JSONDecodeError as e:
            print(f"Error decoding JSON: {e}")

    final_recipe = parseJSON(recipes)
    print(final_recipe)
    
    return final_recipe


def lambda_handler(event, context):
    if 'base64' in event:
        file_content = event['base64']  # The file content from the event
    else:
        return
    
    if 'pdf' in file_content[0,100]:
        print('start pdf')
        base64_images = pdf_to_base64_images(file_content)
        if not base64_images:
            return {
            'statusCode': 200,
            'body': json.dumps('Too many pages.')
        }
    elif 'image' in file_content[0,100]:
        print('start image')
        base64_images = file_content
    else:
        return {
            'statusCode': 400,
            'body': json.dumps('Unsupported file format.')
        }

    output_data = extract_from_multiple_pages(base64_images)
    for recipe in output_data:
        print('start upload')
        to_s3(recipe, get_image(recipe['Title']))

    return {
        'statusCode': 200,
        'body': json.dumps(f'Processing completed successfully! Output saved')
    }


def get_image(title):
    results = DDGS().images(
    keywords=title,
    region="us-en",
    safesearch="on",
    size='Medium',
    type_image='photo',
    license_image='ShareCommercially',
    max_results=1,
    )
    url = results[0]['url']
    print(f'Image url {url}')
    return url

def to_s3(recipe, image_url):
    combined_data_key = 'jsondata/combineddata.json'
    bucket_name = 'savor-swipe-recipe' 
    images_prefix = 'images/'

    existing_data =  s3_client.get_object(Bucket=bucket_name, Key=combined_data_key)
    existing_data_json = json.loads(existing_data['Body'])
    highest_key = max(existing_data_json.keys(), key=int) + 1
    recipe['key'] = highest_key
    existing_data_json[highest_key] = recipe
    image_data = requests.get(image_url).content
    image_key = images_prefix + str(highest_key) + '.jpg'
    updated_data_json = json.dumps(existing_data_json)
    
    print('Bucket upload starting')
    s3_client.put_object(Bucket=bucket_name, Key=image_key, Body=image_data, ContentType='image/jpeg')
    s3_client.put_object(Bucket=bucket_name, Key=combined_data_key, Body=updated_data_json, ContentType='application/json')