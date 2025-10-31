"""
Manual testing script for Lambda endpoints.

Tests DELETE and POST image endpoints locally by simulating Lambda events.
"""

import json
import os
import sys
from unittest.mock import patch
from moto import mock_aws
import boto3

# Set up mocked AWS credentials
os.environ['AWS_ACCESS_KEY_ID'] = 'testing'
os.environ['AWS_SECRET_ACCESS_KEY'] = 'testing'
os.environ['AWS_SECURITY_TOKEN'] = 'testing'
os.environ['AWS_SESSION_TOKEN'] = 'testing'
os.environ['AWS_DEFAULT_REGION'] = 'us-east-1'
os.environ['S3_BUCKET'] = 'test-bucket'

from lambda_function import handle_delete_request, handle_post_image_request


def setup_test_data(s3_client):
    """Create initial test data in S3."""
    combined_data = {
        "1": {
            "Title": "Chocolate Cake",
            "Ingredients": ["flour", "sugar", "chocolate"],
            "Directions": ["Mix", "Bake at 350F"],
            "Type": "dessert",
            "image_url": None,
            "image_search_results": [
                "https://example.com/cake1.jpg",
                "https://example.com/cake2.jpg",
                "https://example.com/cake3.jpg",
            ]
        },
        "2": {
            "Title": "Pasta Carbonara",
            "Ingredients": ["pasta", "eggs", "bacon"],
            "Directions": ["Cook pasta", "Mix with eggs"],
            "Type": "main dish",
            "image_url": None,
            "image_search_results": [
                "https://example.com/pasta1.jpg",
                "https://example.com/pasta2.jpg",
            ]
        }
    }

    embeddings = {
        "1": [0.1] * 1536,
        "2": [0.2] * 1536,
    }

    s3_client.put_object(
        Bucket="test-bucket",
        Key="jsondata/combined_data.json",
        Body=json.dumps(combined_data)
    )

    s3_client.put_object(
        Bucket="test-bucket",
        Key="jsondata/recipe_embeddings.json",
        Body=json.dumps(embeddings)
    )

    print("✓ Test data created in S3")


@mock_aws
def test_delete_recipe():
    """Test DELETE endpoint."""
    print("\n" + "=" * 60)
    print("TEST 1: DELETE /recipe/{recipe_key}")
    print("=" * 60)

    # Setup
    s3_client = boto3.client('s3')
    s3_client.create_bucket(Bucket="test-bucket")
    setup_test_data(s3_client)

    # Create DELETE event
    event = {
        "requestContext": {
            "http": {
                "method": "DELETE",
                "path": "/recipe/1"
            }
        }
    }

    print("\nRequest:")
    print(f"  Path: /recipe/1")
    print(f"  Method: DELETE")

    # Execute
    response = handle_delete_request(event, None)

    # Verify
    print("\nResponse:")
    print(f"  Status: {response['statusCode']}")
    body = json.loads(response['body'])
    print(f"  Body: {json.dumps(body, indent=4)}")

    # Check S3 state
    result = s3_client.get_object(Bucket="test-bucket", Key="jsondata/combined_data.json")
    data = json.loads(result['Body'].read())
    print(f"\nVerification:")
    print(f"  Recipe 1 exists: {('1' in data)}")
    print(f"  Recipe 2 exists: {('2' in data)}")
    print(f"  ✓ DELETE test passed" if response['statusCode'] == 200 else "  ✗ DELETE test failed")

    return response['statusCode'] == 200


@mock_aws
def test_post_image_selection():
    """Test POST image endpoint."""
    print("\n" + "=" * 60)
    print("TEST 2: POST /recipe/{recipe_key}/image")
    print("=" * 60)

    # Setup
    s3_client = boto3.client('s3')
    s3_client.create_bucket(Bucket="test-bucket")
    setup_test_data(s3_client)

    # Create POST event
    event = {
        "requestContext": {
            "http": {
                "method": "POST",
                "path": "/recipe/1/image"
            }
        },
        "body": json.dumps({
            "imageUrl": "https://example.com/cake1.jpg"
        })
    }

    print("\nRequest:")
    print(f"  Path: /recipe/1/image")
    print(f"  Method: POST")
    print(f"  Body: {json.dumps(json.loads(event['body']), indent=4)}")

    # Mock image fetching
    with patch('lambda_function.fetch_and_upload_image') as mock_fetch:
        mock_fetch.return_value = ("images/1.jpg", None, False)

        # Execute
        response = handle_post_image_request(event, None)

    # Verify
    print("\nResponse:")
    print(f"  Status: {response['statusCode']}")
    body = json.loads(response['body'])
    print(f"  Body: {json.dumps(body, indent=4)}")

    # Check S3 state
    result = s3_client.get_object(Bucket="test-bucket", Key="jsondata/combined_data.json")
    data = json.loads(result['Body'].read())
    recipe = data.get("1", {})

    print(f"\nVerification:")
    print(f"  Recipe 1 exists: {('1' in data)}")
    print(f"  Image URL set: {bool(recipe.get('image_url'))}")
    print(f"  Image URL value: {recipe.get('image_url')}")
    print(f"  ✓ POST image test passed" if response['statusCode'] == 200 else "  ✗ POST image test failed")

    return response['statusCode'] == 200


@mock_aws
def test_complete_workflow():
    """Test complete workflow: select image then delete."""
    print("\n" + "=" * 60)
    print("TEST 3: Complete Workflow (Select then Delete)")
    print("=" * 60)

    # Setup
    s3_client = boto3.client('s3')
    s3_client.create_bucket(Bucket="test-bucket")
    setup_test_data(s3_client)

    # Step 1: Select image
    print("\nStep 1: User selects image")
    select_event = {
        "requestContext": {
            "http": {
                "method": "POST",
                "path": "/recipe/2/image"
            }
        },
        "body": json.dumps({
            "imageUrl": "https://example.com/pasta1.jpg"
        })
    }

    with patch('lambda_function.fetch_and_upload_image') as mock_fetch:
        mock_fetch.return_value = ("images/2.jpg", None, False)
        select_response = handle_post_image_request(select_event, None)

    print(f"  Status: {select_response['statusCode']}")
    select_body = json.loads(select_response['body'])
    print(f"  Success: {select_body['success']}")

    # Verify image was selected
    result = s3_client.get_object(Bucket="test-bucket", Key="jsondata/combined_data.json")
    data = json.loads(result['Body'].read())
    recipe_2 = data["2"]
    print(f"  Recipe 2 image_url: {recipe_2['image_url']}")

    # Step 2: Delete recipe
    print("\nStep 2: User deletes recipe")
    delete_event = {
        "requestContext": {
            "http": {
                "method": "DELETE",
                "path": "/recipe/2"
            }
        }
    }

    delete_response = handle_delete_request(delete_event, None)
    print(f"  Status: {delete_response['statusCode']}")
    delete_body = json.loads(delete_response['body'])
    print(f"  Success: {delete_body['success']}")

    # Verify recipe was deleted
    result = s3_client.get_object(Bucket="test-bucket", Key="jsondata/combined_data.json")
    final_data = json.loads(result['Body'].read())
    result = s3_client.get_object(Bucket="test-bucket", Key="jsondata/recipe_embeddings.json")
    final_embeddings = json.loads(result['Body'].read())

    print(f"\nFinal verification:")
    print(f"  Recipe 2 in combined_data: {('2' in final_data)}")
    print(f"  Recipe 2 in embeddings: {('2' in final_embeddings)}")
    print(f"  Recipe 1 still exists: {('1' in final_data)}")

    success = (
        select_response['statusCode'] == 200 and
        delete_response['statusCode'] == 200 and
        '2' not in final_data and
        '2' not in final_embeddings and
        '1' in final_data
    )

    print(f"\n  ✓ Complete workflow test passed" if success else "  ✗ Complete workflow test failed")

    return success


def main():
    """Run all manual tests."""
    print("\n" + "=" * 60)
    print("MANUAL LAMBDA ENDPOINT TESTING")
    print("=" * 60)

    results = []

    try:
        results.append(("DELETE endpoint", test_delete_recipe()))
        results.append(("POST image endpoint", test_post_image_selection()))
        results.append(("Complete workflow", test_complete_workflow()))
    except Exception as e:
        print(f"\n✗ Test failed with error: {e}")
        import traceback
        traceback.print_exc()
        return 1

    # Summary
    print("\n" + "=" * 60)
    print("TEST SUMMARY")
    print("=" * 60)

    for test_name, passed in results:
        status = "✓ PASSED" if passed else "✗ FAILED"
        print(f"  {test_name}: {status}")

    all_passed = all(passed for _, passed in results)
    print("\n" + "=" * 60)
    if all_passed:
        print("✓ ALL TESTS PASSED - Ready for deployment")
        print("=" * 60)
        return 0
    else:
        print("✗ SOME TESTS FAILED - Review errors above")
        print("=" * 60)
        return 1


if __name__ == "__main__":
    sys.exit(main())
