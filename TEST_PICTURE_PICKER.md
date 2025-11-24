# Picture Picker Feature - Testing Guide

## Prerequisites

1. **Environment Variables**: Ensure `.env` file exists with:
   ```
   EXPO_PUBLIC_CLOUDFRONT_BASE_URL=your-cloudfront-url
   EXPO_PUBLIC_API_GATEWAY_URL=your-api-gateway-url
   ```

2. **Lambda Deployment**: Backend Lambda must be deployed and accessible

3. **S3 Bucket**: Must have proper permissions for image upload

## Testing Steps

### Test 1: Modal Appearance
1. Upload a recipe image through the upload feature
2. Wait for OCR processing to complete
3. **Expected**: ImagePickerModal should automatically appear with 9 thumbnail images
4. **If it doesn't appear**: Check that the recipe has `image_search_results` array in `combined_data.json`

### Test 2: Image Selection
1. Tap any thumbnail in the 3x3 grid
2. **Expected**: Full-size preview appears
3. Tap "Confirm & Apply Image" button
4. **Expected**:
   - Toast shows "Saving image selection..."
   - Then "Image saved"
   - Modal closes
   - Recipe appears in swipe queue with selected image

### Test 3: Recipe Deletion
1. Open ImagePickerModal (upload a recipe)
2. Tap the "Delete" button (top-right)
3. Confirm deletion in alert dialog
4. **Expected**:
   - Toast shows "Deleting recipe..."
   - Then "Recipe deleted"
   - Modal closes
   - Recipe removed from `combined_data.json` and `recipe_embeddings.json`

### Test 4: Error Handling
1. Disconnect internet
2. Try to select an image
3. **Expected**: Toast shows user-friendly error message

## Common Issues

### Modal Doesn't Appear
- Check: Does recipe have `image_search_results` in jsonData?
- Check: Does recipe have `image_url` already set? (if yes, modal won't show)
- Check: Is `showImagePickerModal` state being set in useImageQueue?

### Images Don't Load in Grid
- Check: Are URLs in `image_search_results` accessible?
- Check: Network connectivity
- Check: CORS configuration on API Gateway

### Selection Fails
- Check: API endpoint `/recipe/{key}/image` is accessible
- Check: S3 bucket permissions allow image upload
- Check: Check browser/app console for errors

### Delete Fails
- Check: API endpoint `/recipe/{key}` with DELETE method works
- Check: S3 permissions allow file modification
- Check: ETag-based atomic operations aren't being blocked

## Debugging

### Frontend Logs
Look for these console logs in useImageQueue.ts:
- `[QUEUE] Pending recipe detected: {key}`
- `[QUEUE] Confirming image selection for: {key}`
- `[QUEUE] Image selection confirmed for: {key}`
- `[QUEUE] Deleting recipe: {key}`

### Backend Logs
Look for these CloudWatch logs in Lambda:
- `[POST-IMAGE] Request path: /recipe/{key}/image`
- `[POST-IMAGE] Parsed recipe_key: {key}`
- `[POST-IMAGE] Image uploaded successfully: images/{key}.jpg`
- `[DELETE] Deleting recipe: {key}`

### Network Debugging
Use browser DevTools or React Native Debugger to inspect:
- Request to `POST /recipe/{key}/image` with body `{"imageUrl": "..."}`
- Response should be `{"success": true, "recipe": {...}}`
- Request to `DELETE /recipe/{key}`
- Response should be `{"success": true, "message": "..."}`

## Manual Test Data

To manually create a test recipe with pending image selection:

1. Add to `combined_data.json`:
```json
{
  "test_recipe_pending": {
    "Title": "Test Recipe",
    "Ingredients": ["flour", "sugar"],
    "Directions": ["mix", "bake"],
    "Type": "dessert",
    "image_search_results": [
      "https://example.com/img1.jpg",
      "https://example.com/img2.jpg",
      "https://example.com/img3.jpg",
      "https://example.com/img4.jpg",
      "https://example.com/img5.jpg",
      "https://example.com/img6.jpg",
      "https://example.com/img7.jpg",
      "https://example.com/img8.jpg",
      "https://example.com/img9.jpg"
    ]
    // NOTE: no image_url field
  }
}
```

2. Reload app
3. Modal should appear for this recipe
