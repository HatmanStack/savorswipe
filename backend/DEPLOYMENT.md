# Backend Deployment Guide

This document describes the AWS Lambda configuration and S3 initialization required for the multi-file recipe upload feature.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Lambda Configuration](#lambda-configuration)
- [S3 Initialization](#s3-initialization)
- [Deployment Steps](#deployment-steps)
- [Verification](#verification)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Environment Variables

The following environment variables must be configured in the Lambda function:

| Variable | Description | Example |
|----------|-------------|---------|
| `S3_BUCKET` | S3 bucket name for recipe storage | `savorswipe-recipe` |
| `API_KEY` | OpenAI API key (for OCR and embeddings) | `sk-proj-...` |
| `SEARCH_ID` | Google Custom Search engine ID | `671ce857876934d48` |
| `SEARCH_KEY` | Google Custom Search API key | `AIzaSy...` |

### Required Python Packages

Add to `requirements.txt`:
```txt
boto3>=1.26.0
requests>=2.28.0
Pillow>=9.0.0
PyPDF2>=3.0.0
```

---

## Lambda Configuration

### Task 1.7: Configure Lambda for Multi-File Processing

#### Lambda Settings

Configure the following Lambda function settings:

**Basic Settings:**
- **Timeout**: 600 seconds (10 minutes - maximum allowed)
  - Required for processing large PDFs and multiple files
  - With 3 parallel workers, can process ~11 recipes per invocation
- **Memory**: 1024 MB
  - Sufficient for parallel processing and PDF handling
  - Balances performance and cost
- **Ephemeral Storage**: 512 MB (default)
  - Adequate for temporary file storage

**Environment Variables:**

Configure all 4 required environment variables (see table above).

#### IAM Permissions

The Lambda execution role must have the following permissions:

**S3 Permissions:**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject"
      ],
      "Resource": [
        "arn:aws:s3:::YOUR-BUCKET-NAME/jsondata/*",
        "arn:aws:s3:::YOUR-BUCKET-NAME/images/*",
        "arn:aws:s3:::YOUR-BUCKET-NAME/user_images/*",
        "arn:aws:s3:::YOUR-BUCKET-NAME/user_images_json/*",
        "arn:aws:s3:::YOUR-BUCKET-NAME/upload-status/*"
      ]
    }
  ]
}
```

**CloudWatch Permissions:**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "cloudwatch:PutMetricData"
      ],
      "Resource": "*"
    }
  ]
}
```

**CloudWatch Logs** (usually included by default):
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:*:*:*"
    }
  ]
}
```

#### Configuration Methods

**Option 1: AWS Console**
1. Navigate to AWS Lambda → Functions → [Your Function]
2. Configuration → General configuration → Edit
3. Set Timeout to 600 seconds
4. Set Memory to 1024 MB
5. Save changes
6. Configuration → Environment variables → Edit
7. Add all 4 required variables
8. Configuration → Permissions → Execution role
9. Attach policies or add inline policies with required permissions

**Option 2: AWS CLI**
```bash
# Update function configuration
aws lambda update-function-configuration \
  --function-name recipe-processor \
  --timeout 600 \
  --memory-size 1024 \
  --environment Variables="{S3_BUCKET=your-bucket,API_KEY=sk-...,SEARCH_ID=your-id,SEARCH_KEY=your-key}"

# Update IAM role (attach policy)
aws iam put-role-policy \
  --role-name your-lambda-role \
  --policy-name S3AccessPolicy \
  --policy-document file://s3-policy.json
```

**Option 3: Infrastructure as Code (Terraform/CloudFormation)**

Terraform example:
```hcl
resource "aws_lambda_function" "recipe_processor" {
  function_name = "recipe-processor"
  timeout       = 600
  memory_size   = 1024

  environment {
    variables = {
      S3_BUCKET  = var.s3_bucket_name
      API_KEY    = var.openai_api_key
      SEARCH_ID  = var.google_search_id
      SEARCH_KEY = var.google_search_key
    }
  }
}
```

---

## S3 Initialization

### Task 1.8: Initialize Embedding Storage

The multi-file upload feature requires an embeddings file in S3 for duplicate detection.

#### Create Empty Embeddings File

**Option 1: AWS CLI**
```bash
# Create local empty JSON file
echo '{}' > recipe_embeddings.json

# Upload to S3
aws s3 cp recipe_embeddings.json \
  s3://YOUR-BUCKET-NAME/jsondata/recipe_embeddings.json \
  --content-type application/json

# Verify upload
aws s3 ls s3://YOUR-BUCKET-NAME/jsondata/recipe_embeddings.json

# Clean up local file
rm recipe_embeddings.json
```

**Option 2: AWS Console**
1. Navigate to S3 → Buckets → [Your Bucket]
2. Open the `jsondata/` folder
3. Click "Upload" → "Create folder" (if jsondata doesn't exist)
4. Click "Upload" → "Create file"
5. File name: `recipe_embeddings.json`
6. Content: `{}`
7. Metadata: Set `Content-Type` to `application/json`
8. Click "Upload"

**Option 3: Python Script**
```python
import boto3
import json

s3_client = boto3.client('s3')
bucket_name = 'YOUR-BUCKET-NAME'

s3_client.put_object(
    Bucket=bucket_name,
    Key='jsondata/recipe_embeddings.json',
    Body=json.dumps({}),
    ContentType='application/json'
)

print("✓ Created recipe_embeddings.json")
```

#### Verify File Creation

```bash
# Download and verify
aws s3 cp s3://YOUR-BUCKET-NAME/jsondata/recipe_embeddings.json - | python -m json.tool

# Expected output: {}
```

#### Backfill Existing Recipes

After initializing the empty file, generate embeddings for existing recipes:

```bash
cd backend

# Preview what will be processed
python scripts/backfill_embeddings.py --dry-run

# Actually generate and save embeddings
python scripts/backfill_embeddings.py
```

**Note**: Backfilling is a one-time operation. It can take several minutes depending on the number of existing recipes (approximately 1 recipe per second due to API rate limits).

---

## Deployment Steps

### Complete Deployment Checklist

1. **Update Lambda Code**
   - [ ] Deploy all new Python modules to Lambda
   - [ ] Update requirements.txt with new dependencies
   - [ ] Package and upload deployment package

2. **Configure Lambda**
   - [ ] Set timeout to 600 seconds
   - [ ] Set memory to 1024 MB
   - [ ] Configure environment variables (S3_BUCKET, API_KEY, SEARCH_ID, SEARCH_KEY)
   - [ ] Verify IAM role has required S3 and CloudWatch permissions

3. **Initialize S3**
   - [ ] Create empty `recipe_embeddings.json` file
   - [ ] Verify file exists and is valid JSON
   - [ ] Create `upload-status/` folder (optional, will be created automatically)

4. **Backfill Embeddings**
   - [ ] Run backfill script with --dry-run
   - [ ] Review output
   - [ ] Run backfill script without --dry-run
   - [ ] Verify embeddings saved successfully

5. **Test Deployment**
   - [ ] Test single image upload
   - [ ] Test multi-image upload
   - [ ] Test PDF upload
   - [ ] Verify CloudWatch metrics appear
   - [ ] Check CloudWatch logs for errors

---

## Verification

### Test Lambda Configuration

```bash
# Check Lambda configuration
aws lambda get-function-configuration --function-name recipe-processor

# Expected output should show:
# - Timeout: 600
# - MemorySize: 1024
# - Environment variables set
```

### Test Lambda Invocation

Create test event:
```json
{
  "files": [
    {
      "base64": "iVBORw0KGgoAAAANS...",
      "type": "image"
    }
  ],
  "jobId": "test-job-123"
}
```

Invoke Lambda:
```bash
aws lambda invoke \
  --function-name recipe-processor \
  --payload file://test-event.json \
  response.json

# Check response
cat response.json | python -m json.tool
```

### Verify CloudWatch Metrics

1. Navigate to CloudWatch → Metrics → Custom Namespaces
2. Look for "RecipeProcessor" namespace
3. Verify metrics appear:
   - SuccessCount
   - FailureCount
   - ExecutionTime
   - DuplicateRate

### Verify S3 Files

```bash
# Check embeddings file
aws s3 ls s3://YOUR-BUCKET-NAME/jsondata/recipe_embeddings.json

# Check combined data
aws s3 ls s3://YOUR-BUCKET-NAME/jsondata/combined_data.json

# Check upload status folder
aws s3 ls s3://YOUR-BUCKET-NAME/upload-status/
```

---

## Troubleshooting

### Lambda Issues

**Problem**: Lambda timeout errors
- **Solution**: Verify timeout is set to 600 seconds
- **Solution**: Check if processing too many files at once (limit to ~10-15 files per invocation)

**Problem**: Memory errors
- **Solution**: Increase memory to 1024 MB or higher
- **Solution**: Check for large PDF files (>20 pages should be chunked by frontend)

**Problem**: Environment variables not set
- **Solution**: Verify all 4 variables configured in Lambda console
- **Solution**: Check variable names match exactly (S3_BUCKET, not AWS_S3_BUCKET)

### S3 Issues

**Problem**: recipe_embeddings.json not found
- **Solution**: Initialize file using steps in Task 1.8
- **Solution**: Verify file is in `jsondata/` folder, not root

**Problem**: S3 permission denied
- **Solution**: Verify Lambda execution role has s3:GetObject and s3:PutObject permissions
- **Solution**: Check bucket policy doesn't block Lambda access

### Embedding Issues

**Problem**: Backfill script fails with API timeout
- **Solution**: OpenAI API may be slow, script will retry automatically
- **Solution**: Check API_KEY environment variable is valid

**Problem**: "Max retries exceeded" during backfill
- **Solution**: Another process may be writing to embeddings file
- **Solution**: Wait a moment and run script again

### CloudWatch Issues

**Problem**: No metrics appearing
- **Solution**: Verify IAM role has `cloudwatch:PutMetricData` permission
- **Solution**: Check CloudWatch Logs for error messages

**Problem**: Logs show permission errors
- **Solution**: Review IAM policy and ensure all required permissions granted
- **Solution**: Check bucket name in policy matches actual bucket

---

## Performance Notes

### Processing Limits

- **Lambda timeout**: 10 minutes maximum
- **Recipes per invocation**: ~11 recipes maximum with 3 parallel workers
- **PDF page limit**: 20 pages per PDF (frontend should chunk larger PDFs)
- **Processing time per recipe**: ~53 seconds average (OCR + embedding + image search)

### Cost Considerations

- **Lambda**: ~$0.20 per 1 million requests
- **OpenAI API**: ~$0.0001 per recipe (embedding generation)
- **Google Image Search**: Free tier: 100 queries/day, then ~$5 per 1000 queries
- **S3**: ~$0.023 per GB/month
- **CloudWatch**: First 10 custom metrics free, then $0.30 per metric/month

---

## Additional Resources

- [AWS Lambda Configuration](https://docs.aws.amazon.com/lambda/latest/dg/configuration-function-common.html)
- [AWS Lambda Limits](https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html)
- [S3 Conditional Writes](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-requests.html)
- [OpenAI Embeddings API](https://platform.openai.com/docs/api-reference/embeddings)
- [CloudWatch Custom Metrics](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/publishingMetrics.html)
