
import base64
import json
import handlepdf
import ocr
import upload
import search_image as si

def extract_from_multiple_pages(base64_images):
    recipes = []
    
    for base64_image in base64_images:
        recipe_json = ocr.extract_recipe_data(base64_image)
        if recipe_json is None:
            print("Warning: extract_recipe_data returned None for an image.")
            continue  # Skip this image if extraction failed
        
        try:
            invoice_data = json.loads(recipe_json)
            recipes.append(invoice_data)
        except json.JSONDecodeError as e:
            print(f"Error decoding JSON: {e}")

    final_recipe = ocr.parseJSON(recipes)
    print(final_recipe)
    
    return final_recipe


def lambda_handler(event, context):
    if 'base64' in event:
        file_content = event['base64']  # The file content from the event
    else:
        return

    if 'pdf' in file_content[0:25]:
        print('start pdf')
        base64_images = handlepdf.pdf_to_base64_images(file_content)
        if not base64_images:
            return {
            'statusCode': 200,
            'body': json.dumps('Error: Too many pages.')
        }
    else:
        print('start image')
        try:
            with open("/tmp/test_image.jpg", "wb") as f:
                f.write(base64.b64decode(file_content))
            with open("/tmp/test_image.jpg", "rb") as f:
                base64_string = base64.b64encode(f.read()).decode("utf-8")
            print("Base64 string is valid and encoded from test_image.jpg.")
        except Exception as e:
            print(f"Error decoding base64 string: {e}")
        base64_images = [base64_string]

    output_data = extract_from_multiple_pages(base64_images)
    print(output_data)
    
    # Load output_data as JSON
    try:
        output_data_json = json.loads(output_data)
    except json.JSONDecodeError as e:
        print(f"Error decoding output_data to JSON: {e}")
        return {
            'statusCode': 500,
            'body': json.dumps('Error: Failed to decode output data.')
        }
    
    if len(output_data_json) == 0:
        return {
            'statusCode': 400,
            'body': json.dumps('Error: No data found in output.')
        }
    if isinstance(output_data_json, list):
        for recipe in output_data_json:
            print('start upload list')
            upload_success = upload.to_s3(recipe, si.google_search_image(recipe['Title']))
    else:
        print('start upload single')
        upload_success = upload.to_s3(output_data_json, si.google_search_image(output_data_json['Title']))
    
    if upload_success:
        return_message = 'Processing completed successfully! Output saved'
    else:
        return_message = 'Error: Processing Failed'
    return {
        'statusCode': 200,
        'body': json.dumps(return_message)
    }




