import json
import os
import boto3
import requests
import time
import io
import base64
from PIL import Image

s3_client = boto3.client('s3')
bucket_name = os.getenv('S3_BUCKET') 

def to_s3(recipe, search_results, jsonData = None):
    combined_data_key = 'jsondata/combined_data.json'
    try:
        if not jsonData:
            existing_data = s3_client.get_object(Bucket=bucket_name, Key=combined_data_key)
            existing_data_body = existing_data['Body'].read()  
        else: 
            existing_data_body = jsonData
        existing_data_json = json.loads(existing_data_body)  
        for existing_recipe in existing_data_json.values():
            if existing_recipe.get('Title') == recipe.get('Title'):
                return False, existing_data_json
        highest_key = max(int(key) for key in existing_data_json.keys()) + 1
    except s3_client.exceptions.NoSuchKey:
        existing_data_json = {}
        highest_key = 1  # Start with 1 if no existing data

    if upload_image(search_results, bucket_name, highest_key):
        recipe['key'] = highest_key
        existing_data_json[str(highest_key)] = recipe
        updated_data_json = json.dumps(existing_data_json)    
        s3_client.put_object(Bucket=bucket_name, Key=combined_data_key, Body=updated_data_json, ContentType='application/json')
        return True, existing_data_json
    else:
        return False, existing_data_json

def upload_image(search_results, bucket_name, highest_key):
    images_prefix = 'images/'
    for searched_item in search_results['items']: ## You are returned 10 items from the google search to iterate through and find a good response
        image_url = searched_item['link']
        print(f"Fetching image from URL: {image_url}")
        image_response = requests.get(image_url)

        if image_response.status_code == 200:
            if 'image' in image_response.headers['Content-Type']:
                
                image_data = image_response.content
                image_key = images_prefix + str(highest_key) + '.jpg'

                tmp_image_path = f'/tmp/searchImage.jpg'
                with open(tmp_image_path, 'wb') as image_file:
                    image_file.write(image_data)
                # Upload to S3
                s3_client = boto3.client('s3')
                try:
                    s3_client.put_object(
                        Bucket=bucket_name,  # Replace with your bucket name
                        Key=image_key,
                        Body=image_data,
                        ContentType='image/jpeg'  
                    )
                    print('Image uploaded successfully.')
                    return True
                    
                except Exception as e:
                    print(f"Error uploading image to S3: {e}")
                    return False
            else:
                print("The fetched content is not an image.")
        else:
            print(f"Error fetching image: {image_response.status_code}")
    return False    
    

def upload_user_data(prefix, content, type, data, app_time = None):    
    s3_client = boto3.client('s3')
    if not app_time:
        app_time = int(time.time())
    if type=='jpg':
        try:
            data = base64.b64decode(data)
            image = Image.open(io.BytesIO(data))
            jpeg_image_io = io.BytesIO()
            image.convert('RGB').save(jpeg_image_io, format='JPEG')
            data = jpeg_image_io.getvalue()
        except Exception as e:
            print(f"Error converting image to JPEG: {e}")
            return
    image_key = f'{prefix}/{app_time}.{type}'
    try:
        s3_client.put_object(
            Bucket=bucket_name,  # Replace with your bucket name
            Key=image_key,
            Body=data,
            ContentType=content  # Adjust based on the actual image type
        )
        print('User Image uploaded successfully.')
        
        
    except Exception as e:
        print(f"Error uploading User Image to S3: {e}")
    
    return app_time
        
           