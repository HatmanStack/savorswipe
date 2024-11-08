import json
import os
import boto3
import requests


s3_client = boto3.client('s3')


def to_s3(recipe, search_results):
    combined_data_key = 'jsondata/combined_data.json'
    bucket_name = os.getenv('S3_BUCKET') 
    try:
        existing_data = s3_client.get_object(Bucket=bucket_name, Key=combined_data_key)
        existing_data_body = existing_data['Body'].read()  
        existing_data_json = json.loads(existing_data_body)  
        highest_key = max(int(key) for key in existing_data_json.keys()) + 1
    except s3_client.exceptions.NoSuchKey:
        existing_data_json = {}
        highest_key = 1  # Start with 1 if no existing data

    if upload_image(search_results, bucket_name, highest_key):
        recipe['key'] = highest_key
        existing_data_json[str(highest_key)] = recipe
        updated_data_json = json.dumps(existing_data_json)    
        s3_client.put_object(Bucket=bucket_name, Key=combined_data_key, Body=updated_data_json, ContentType='application/json')
        return True
    else:
        return False

def upload_image(search_results, bucket_name, highest_key):
    images_prefix = 'images/'
    for searched_item in search_results['items']:
        image_url = searched_item['link']
        print(f"Fetching image from URL: {image_url}")
        image_response = requests.get(image_url)

        if image_response.status_code == 200:
            if 'image' in image_response.headers['Content-Type']:
                
                image_data = image_response.content
                image_key = images_prefix + str(highest_key) + '.jpg'

                # Upload to S3
                s3_client = boto3.client('s3')
                try:
                    s3_client.put_object(
                        Bucket=bucket_name,  # Replace with your bucket name
                        Key=image_key,
                        Body=image_data,
                        ContentType='image/jpeg'  # Adjust based on the actual image type
                    )
                    print('Image uploaded successfully.')
                    return True
                    
                except Exception as e:
                    print(f"Error uploading image to S3: {e}")
                    return False
            else:
                print("The fetched content is not an image.")
        else:
            print(f"Error fetching image: {image_response.status_code} - {image_response.text}")
    return False    
    
    
    