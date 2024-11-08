import os
import requests

def google_search_image(title):
    url = "https://www.googleapis.com/customsearch/v1"
    params = {
        'key': os.getenv('SEARCH_KEY'),                # Your API key
        'cx': os.getenv('SEARCH_ID'),        # Your Search Engine ID
        'q': title, 
        'searchType': 'image',  
        'num': 10,
        'imgSize': 'xlarge', 
        'imgType': 'photo',                      
    }
    response = requests.get(url, params=params)
    if response.status_code == 200:
        # Parse the JSON response
        search_results = response.json()
        
        # Check if there are any items in the results
        if 'items' in search_results and len(search_results['items']) > 0:
            # Get the URL of the first image
            return search_results
        else:
            print("No image results found.")
            return None
    else:
        print(f"Error: {response.status_code} - {response.text}")
        return None