# Lambda Deployment Instructions

## Overview

This document provides step-by-step instructions for deploying the multi-file upload feature to AWS Lambda.

**Function Name**: `savorswipe-recipe-add`
**Runtime**: Python 3.12
**Package Location**: `lambda-deploy/savorswipe-recipe-add-deployment.zip`
**Package Size**: ~25 MB

---

## Prerequisites

Before deploying, ensure you have:

- [ ] AWS Console access with Lambda permissions
- [ ] Lambda function `savorswipe-recipe-add` already exists
- [ ] S3 bucket configured and accessible
- [ ] Environment variables configured (see Configuration section)
- [ ] Deployment package: `lambda-deploy/savorswipe-recipe-add-deployment.zip`

---

## Step 1: Update Lambda Function Code

### Option A: AWS Console (Recommended for small updates)

1. **Navigate to Lambda Console**
   - Go to https://console.aws.amazon.com/lambda/
   - Select your function: `savorswipe-recipe-add`

2. **Upload Deployment Package**
   - Click the "Code" tab
   - Click "Upload from" → ".zip file"
   - Select `lambda-deploy/savorswipe-recipe-add-deployment.zip`
   - Click "Save"
   - Wait for upload to complete (~30 seconds)

3. **Verify Upload**
   - Check "Code source" shows updated timestamp
   - Verify file size shows ~25 MB

### Option B: AWS CLI (Recommended for large files or automation)

```bash
# From project root directory
aws lambda update-function-code \
  --function-name savorswipe-recipe-add \
  --zip-file fileb://lambda-deploy/savorswipe-recipe-add-deployment.zip

# Wait for update to complete
aws lambda wait function-updated \
  --function-name savorswipe-recipe-add

# Verify deployment
aws lambda get-function \
  --function-name savorswipe-recipe-add \
  --query 'Configuration.[LastModified,CodeSize,Runtime]' \
  --output table
```

---

## Step 2: Update Lambda Configuration

### Timeout and Memory Settings

**Critical**: The Lambda function needs increased timeout and memory for processing multiple recipes.

1. **Via AWS Console**:
   - Navigate to Configuration → General configuration
   - Click "Edit"
   - Set **Timeout**: `600 seconds` (10 minutes)
   - Set **Memory**: `1024 MB`
   - Click "Save"

2. **Via AWS CLI**:
   ```bash
   aws lambda update-function-configuration \
     --function-name savorswipe-recipe-add \
     --timeout 600 \
     --memory-size 1024
   ```

### Environment Variables

Verify the following environment variables are configured:

| Variable | Description | Example |
|----------|-------------|---------|
| `API_KEY` | OpenAI API key for OCR and embeddings | `sk-...` |
| `SEARCH_ID` | Google Custom Search engine ID | `abc123...` |
| `SEARCH_KEY` | Google Custom Search API key | `AIza...` |
| `AWS_S3_BUCKET` | S3 bucket name for recipe storage | `your-bucket-name` |

**To verify/update** (AWS Console):
1. Navigate to Configuration → Environment variables
2. Click "Edit" to add/modify variables
3. Click "Save"

**To verify** (AWS CLI):
```bash
aws lambda get-function-configuration \
  --function-name savorswipe-recipe-add \
  --query 'Environment.Variables'
```

---

## Step 3: Initialize S3 Embeddings File

The embeddings file must exist before the Lambda function can write to it.

### Check if file exists:

```bash
aws s3 ls s3://YOUR-BUCKET-NAME/jsondata/recipe_embeddings.json
```

### If file doesn't exist, create it:

```bash
# Create empty embeddings file
echo '{}' > /tmp/recipe_embeddings.json

# Upload to S3
aws s3 cp /tmp/recipe_embeddings.json \
  s3://YOUR-BUCKET-NAME/jsondata/recipe_embeddings.json \
  --content-type application/json

# Verify upload
aws s3 ls s3://YOUR-BUCKET-NAME/jsondata/recipe_embeddings.json
```

### Verify S3 permissions:

The Lambda execution role must have:
- `s3:GetObject` - Read recipe data and embeddings
- `s3:PutObject` - Write new recipes and embeddings
- `s3:ListBucket` - List objects in bucket

---

## Step 4: Test Deployment

### Test with Sample Payload

Create a test event to verify the deployment:

1. **Via AWS Console**:
   - Click "Test" tab
   - Click "Create new event"
   - Event name: `test-single-image`
   - Event JSON:
     ```json
     {
       "body": {
         "files": [
           {
             "name": "test.jpg",
             "data": "/9j/4AAQSkZJRgABAQEAYABgAAD...",
             "type": "image/jpeg"
           }
         ]
       }
     }
     ```
   - Click "Save"
   - Click "Test"

2. **Via AWS CLI**:
   ```bash
   aws lambda invoke \
     --function-name savorswipe-recipe-add \
     --payload '{"body":{"files":[{"name":"test.jpg","data":"base64...","type":"image/jpeg"}]}}' \
     --cli-binary-format raw-in-base64-out \
     response.json

   # Check response
   cat response.json
   ```

### Verify Test Results

**Expected Response** (success):
```json
{
  "statusCode": 200,
  "body": {
    "success": 3,
    "failed": 0,
    "newRecipeKeys": ["recipe_1698765432", "recipe_1698765433"],
    "errors": []
  }
}
```

**Expected Response** (failure):
```json
{
  "statusCode": 200,
  "body": {
    "success": 0,
    "failed": 1,
    "newRecipeKeys": [],
    "errors": [
      {
        "file": "test.jpg",
        "error": "OCR processing failed: Invalid image format"
      }
    ]
  }
}
```

---

## Step 5: Check CloudWatch Logs

Verify the Lambda function is executing correctly:

1. **Via AWS Console**:
   - Navigate to Monitor → Logs
   - Click "View logs in CloudWatch"
   - Open most recent log stream
   - Check for errors or warnings

2. **Via AWS CLI**:
   ```bash
   # Get recent log streams
   aws logs describe-log-streams \
     --log-group-name /aws/lambda/savorswipe-recipe-add \
     --order-by LastEventTime \
     --descending \
     --max-items 5

   # View recent logs
   aws logs tail /aws/lambda/savorswipe-recipe-add --follow
   ```

### Expected Log Output

```
START RequestId: abc-123 Version: $LATEST
Processing 1 files...
[INFO] Starting OCR processing for test.jpg
[INFO] Generated embedding for recipe (1536 dimensions)
[INFO] Duplicate check: No similar recipes found
[INFO] Searching for recipe image...
[INFO] Found image URL: https://example.com/image.jpg
[INFO] Uploaded recipe data to S3: recipe_1698765432
[INFO] Successfully processed 1 recipes
END RequestId: abc-123
REPORT RequestId: abc-123 Duration: 12453.67 ms Billed Duration: 12454 ms Memory Size: 1024 MB Max Memory Used: 487 MB
```

---

## Step 6: Verify S3 Updates

After successful test, verify data was written to S3:

```bash
# Check combined_data.json was updated
aws s3 cp s3://YOUR-BUCKET-NAME/jsondata/combined_data.json - | jq 'keys | length'

# Check embeddings were added
aws s3 cp s3://YOUR-BUCKET-NAME/jsondata/recipe_embeddings.json - | jq 'keys | length'

# List recent images
aws s3 ls s3://YOUR-BUCKET-NAME/images/ --recursive | tail -10
```

---

## Step 7: Run Backfill Script (Optional)

If you have existing recipes without embeddings, run the backfill script to generate embeddings for them.

**See**: `docs/BACKFILL_INSTRUCTIONS.md` for detailed steps.

**Summary**:
1. Script location: `backend/scripts/backfill_embeddings.py`
2. Generates embeddings for all recipes in `combined_data.json`
3. Updates `recipe_embeddings.json` with new embeddings
4. Takes ~1-2 seconds per recipe
5. Safe to run multiple times (skips existing embeddings)

---

## Deployment Verification Checklist

After deployment, verify all the following:

- [ ] Lambda function code updated (check Last Modified timestamp)
- [ ] Timeout set to 600 seconds
- [ ] Memory set to 1024 MB
- [ ] All environment variables configured
- [ ] S3 embeddings file exists (`recipe_embeddings.json`)
- [ ] Test invocation succeeds
- [ ] CloudWatch logs show no errors
- [ ] S3 data files updated correctly
- [ ] (Optional) Backfill script completed successfully

---

## Rollback Plan

If issues occur after deployment:

### Option 1: Revert to Previous Version (AWS Console)

1. Navigate to Versions tab
2. Find previous working version
3. Click "Actions" → "Publish new version"
4. Update alias to point to old version

### Option 2: Revert to Previous Version (AWS CLI)

```bash
# List recent versions
aws lambda list-versions-by-function \
  --function-name savorswipe-recipe-add \
  --max-items 5

# Update alias to previous version
aws lambda update-alias \
  --function-name savorswipe-recipe-add \
  --name PROD \
  --function-version <PREVIOUS_VERSION>
```

### Option 3: Restore from Backup

If you created a backup before deployment:

```bash
aws lambda update-function-code \
  --function-name savorswipe-recipe-add \
  --zip-file fileb://backup/savorswipe-recipe-add-backup.zip
```

---

## Troubleshooting

### Issue: Upload fails with "Package too large"

**Cause**: Deployment package exceeds 50 MB uncompressed limit.

**Solution**:
- Current package is ~25 MB (within limit)
- If issue persists, use S3 upload method:
  ```bash
  aws s3 cp lambda-deploy/savorswipe-recipe-add-deployment.zip \
    s3://YOUR-BUCKET/lambda-deploys/

  aws lambda update-function-code \
    --function-name savorswipe-recipe-add \
    --s3-bucket YOUR-BUCKET \
    --s3-key lambda-deploys/savorswipe-recipe-add-deployment.zip
  ```

### Issue: Lambda timeout after deployment

**Cause**: Timeout not increased to 600 seconds.

**Solution**: Follow Step 2 to update timeout configuration.

### Issue: "Module not found" errors in logs

**Cause**: Dependencies not included in deployment package.

**Solution**:
- Verify package includes all dependencies (see verification script)
- Rebuild package with `uv pip install -r requirements.txt`

### Issue: S3 permission errors

**Cause**: Lambda execution role lacks S3 permissions.

**Solution**:
1. Navigate to Configuration → Permissions
2. Click on Execution role
3. Verify policy includes S3 read/write permissions
4. Add missing permissions if needed

### Issue: OpenAI API errors

**Cause**: Invalid or missing API key.

**Solution**:
1. Verify `API_KEY` environment variable is set
2. Test API key: `curl https://api.openai.com/v1/models -H "Authorization: Bearer $API_KEY"`
3. Update environment variable if needed

---

## Performance Benchmarks

After deployment, monitor these metrics:

| Metric | Expected Value | Action if Exceeded |
|--------|----------------|-------------------|
| Average Duration | 30-60s per file | Check OpenAI API latency |
| Max Memory Used | 400-600 MB | Consider increasing memory |
| Error Rate | < 5% | Review CloudWatch logs |
| Timeout Rate | < 1% | Increase timeout or reduce batch size |

---

## Next Steps

After successful deployment:

1. **Frontend Deployment**: Deploy updated Expo app (see `docs/FRONTEND_DEPLOYMENT.md`)
2. **Monitoring Setup**: Configure CloudWatch dashboards and alarms (optional)
3. **User Testing**: Test upload feature with real recipes
4. **Documentation**: Update user-facing documentation with new upload capabilities

---

## Support

For deployment issues:

1. Check CloudWatch logs for detailed error messages
2. Review troubleshooting section above
3. Consult AWS Lambda documentation: https://docs.aws.amazon.com/lambda/
4. Check OpenAI API status: https://status.openai.com/

---

## Appendix: Package Contents

The deployment package includes:

**Lambda Source Files** (9 files):
- `lambda_function.py` - Main handler
- `ocr.py` - OpenAI Vision OCR processing
- `handlepdf.py` - PDF handling and page extraction
- `fix_ingredients.py` - Ingredient parsing utilities
- `embeddings.py` - S3 embedding storage with optimistic locking
- `embedding_generator.py` - OpenAI embedding generation
- `duplicate_detector.py` - Cosine similarity duplicate detection
- `upload.py` - S3 upload operations with atomic writes
- `search_image.py` - Google Image Search integration

**Dependencies** (27 packages):
- openai (2.6.0) - OpenAI API client
- boto3 (1.40.58) - AWS SDK
- botocore (1.40.58) - AWS SDK core
- requests (2.32.5) - HTTP requests
- Pillow (12.0.0) - Image processing
- pdf2image (1.17.0) - PDF to image conversion
- And 21 additional dependency packages

**Total Size**: ~25 MB compressed, ~80 MB uncompressed
