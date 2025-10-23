# Embedding Backfill Instructions

## Overview

The backfill script generates OpenAI embeddings for existing recipes that don't have embeddings yet. This enables duplicate detection to work for all recipes, not just newly uploaded ones.

**Script Location**: `backend/scripts/backfill_embeddings.py`
**Runtime**: ~1-2 seconds per recipe
**Cost**: ~$0.00002 per recipe (OpenAI embedding API)

---

## When to Run

Run the backfill script if:

- ✅ You just deployed the multi-file upload feature
- ✅ You have existing recipes in S3 without embeddings
- ✅ Duplicate detection should work for all recipes

**Skip if**:
- ❌ This is a fresh installation with no existing recipes
- ❌ All recipes already have embeddings

---

## Prerequisites

Before running the backfill script:

- [ ] Lambda function deployed and tested
- [ ] S3 bucket contains `jsondata/combined_data.json` with existing recipes
- [ ] S3 bucket contains `jsondata/recipe_embeddings.json` (can be empty `{}`)
- [ ] AWS credentials configured locally (for S3 access)
- [ ] OpenAI API key set in environment variable
- [ ] Python 3.12 installed (or use `uv` to manage Python)

---

## Environment Setup

### Required Environment Variables

```bash
export S3_BUCKET="your-bucket-name"          # S3 bucket containing recipe data
export OPENAI_API_KEY="sk-..."              # OpenAI API key
export AWS_PROFILE="your-profile"           # (Optional) AWS profile to use
export AWS_REGION="us-east-1"               # (Optional) AWS region
```

### AWS Credentials

The script needs AWS credentials to access S3. Choose one method:

**Option A: AWS CLI credentials** (recommended):
```bash
aws configure
# Enter your AWS Access Key ID, Secret Access Key, and region
```

**Option B: Environment variables**:
```bash
export AWS_ACCESS_KEY_ID="your-access-key"
export AWS_SECRET_ACCESS_KEY="your-secret-key"
export AWS_REGION="us-east-1"
```

**Option C: IAM role** (if running on EC2):
- Attach IAM role with S3 read/write permissions to EC2 instance
- No additional configuration needed

---

## Installation

### Step 1: Install Python Dependencies

The script requires the same dependencies as the Lambda function.

**Option A: Using uv** (recommended):
```bash
cd backend/scripts
uv venv --python 3.12
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
uv pip install -r ../requirements.txt
```

**Option B: Using pip**:
```bash
cd backend/scripts
python3.12 -m venv venv
source venv/bin/activate   # On Windows: venv\Scripts\activate
pip install -r ../requirements.txt
```

### Step 2: Verify Installation

```bash
python backfill_embeddings.py --help
```

Expected output:
```
usage: backfill_embeddings.py [-h] [--dry-run]

Generate embeddings for existing recipes without embeddings

options:
  -h, --help  show this help message and exit
  --dry-run   Preview what would be done without actually saving to S3
```

---

## Running the Script

### Step 1: Dry Run (Preview)

**Always start with a dry run** to see what will be processed:

```bash
cd backend/scripts
source .venv/bin/activate  # Or venv/bin/activate

export S3_BUCKET="your-bucket-name"
export OPENAI_API_KEY="sk-..."

python backfill_embeddings.py --dry-run
```

**Expected Output**:
```
Using bucket: your-bucket-name
Mode: DRY RUN (no changes will be saved)

Loading existing recipes...
Found 450 recipes
Loading existing embeddings...
Found 0 existing embeddings
Found 450 recipes without embeddings

DRY RUN - Would process the following recipes:
  1. Recipe recipe_20231015_120000: Chocolate Chip Cookies
  2. Recipe recipe_20231015_120100: Classic Lasagna
  3. Recipe recipe_20231015_120200: Chicken Stir Fry
  ... and 447 more

Run without --dry-run to actually generate and save embeddings.
```

### Step 2: Run Backfill (Live)

After verifying the dry run output, run the actual backfill:

```bash
python backfill_embeddings.py
```

**Expected Output**:
```
Using bucket: your-bucket-name
Mode: LIVE (will save to S3)

Loading existing recipes...
Found 450 recipes
Loading existing embeddings...
Found 0 existing embeddings
Found 450 recipes without embeddings

Generating embeddings...
This may take a while depending on the number of recipes...

Progress: 10/450 recipes processed
Progress: 20/450 recipes processed
Progress: 30/450 recipes processed
...
Progress: 450/450 recipes processed

Successfully generated 450 embeddings

Saving embeddings to S3...
✓ Successfully saved embeddings to S3

============================================================
SUMMARY
============================================================
Total recipes:              450
Recipes with embeddings:    450
Coverage:                   100.0%
New embeddings added:       450
Failed:                     0
============================================================
```

### Step 3: Verify Results

Check that embeddings were saved to S3:

```bash
aws s3 cp s3://your-bucket-name/jsondata/recipe_embeddings.json - | \
  python -c "import sys, json; data = json.load(sys.stdin); print(f'Total embeddings: {len(data)}')"
```

Expected output:
```
Total embeddings: 450
```

---

## Performance & Timing

### Processing Time

- **Single recipe**: ~1-2 seconds (OpenAI API call)
- **10 recipes**: ~10-20 seconds
- **100 recipes**: ~2-3 minutes
- **500 recipes**: ~10-15 minutes
- **1000 recipes**: ~20-30 minutes

### Cost Estimation

OpenAI embedding API costs (as of 2025):
- **Model**: text-embedding-3-small
- **Cost**: ~$0.00002 per recipe (1536 dimensions)
- **100 recipes**: ~$0.002 (less than 1 cent)
- **500 recipes**: ~$0.01 (1 cent)
- **1000 recipes**: ~$0.02 (2 cents)

---

## Handling Errors

### Common Errors

**1. S3_BUCKET environment variable not set**

```
Error: S3_BUCKET environment variable not set
```

**Solution**: Set the environment variable:
```bash
export S3_BUCKET="your-bucket-name"
```

**2. OpenAI API key not set**

```
Error: OpenAI API key not found in environment
```

**Solution**: Set the API key:
```bash
export OPENAI_API_KEY="sk-..."
```

**3. AWS credentials not configured**

```
Error: Unable to locate credentials
```

**Solution**: Configure AWS credentials:
```bash
aws configure
```

**4. Recipe embeddings.json doesn't exist**

```
Error loading embeddings: NoSuchKey
```

**Solution**: Create empty embeddings file:
```bash
echo '{}' > /tmp/recipe_embeddings.json
aws s3 cp /tmp/recipe_embeddings.json s3://your-bucket-name/jsondata/recipe_embeddings.json
```

**5. OpenAI rate limit exceeded**

```
Error: Recipe recipe_123 (Title): Rate limit exceeded
```

**Solution**: Wait a few minutes and run again (script will skip already-processed recipes)

**6. Max retries exceeded saving to S3**

```
✗ Failed to save embeddings (max retries exceeded)
This can happen due to concurrent modifications.
Try running the script again.
```

**Solution**: Wait a few seconds and re-run the script (safe to run multiple times)

### Partial Failures

If some recipes fail to process, the script will:
- Continue processing remaining recipes
- Print error summary at the end
- Save successful embeddings to S3

You can re-run the script to retry failed recipes (already-processed recipes will be skipped).

---

## Re-running the Script

The backfill script is **safe to run multiple times**:

- ✅ Skips recipes that already have embeddings
- ✅ Only processes recipes without embeddings
- ✅ Won't duplicate embeddings
- ✅ Can be interrupted and resumed (Ctrl+C)

**Example**: If script processes 400/500 recipes and fails, re-running will only process the remaining 100.

---

## Monitoring Progress

### Live Progress Updates

The script prints progress every 10 recipes:
```
Progress: 10/450 recipes processed
Progress: 20/450 recipes processed
...
```

### Checking Current Coverage

To check embedding coverage without running the script:

```bash
# Download and count recipes
RECIPE_COUNT=$(aws s3 cp s3://your-bucket-name/jsondata/combined_data.json - | \
  python -c "import sys, json; print(len(json.load(sys.stdin)))")

# Download and count embeddings
EMBEDDING_COUNT=$(aws s3 cp s3://your-bucket-name/jsondata/recipe_embeddings.json - | \
  python -c "import sys, json; print(len(json.load(sys.stdin)))")

# Calculate coverage
echo "Recipes: $RECIPE_COUNT"
echo "Embeddings: $EMBEDDING_COUNT"
echo "Coverage: $(echo "scale=1; $EMBEDDING_COUNT * 100 / $RECIPE_COUNT" | bc)%"
```

---

## Advanced Usage

### Processing Specific Recipes

To process only specific recipes, modify the script or use Python:

```bash
python << 'EOF'
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from embedding_generator import EmbeddingGenerator
from embeddings import EmbeddingStore
import json

# Load specific recipe
recipe = {
    "Title": "Test Recipe",
    "Ingredients": ["1 cup flour", "2 eggs"],
    "Directions": ["Mix ingredients", "Bake at 350F"]
}

# Generate embedding
generator = EmbeddingGenerator()
embedding = generator.generate_recipe_embedding(recipe)

print(f"Generated embedding: {len(embedding)} dimensions")
print(f"First 5 values: {embedding[:5]}")
EOF
```

### Batch Processing with Rate Limiting

If you hit OpenAI rate limits, process in smaller batches:

```bash
# Process first 100 recipes
python backfill_embeddings.py  # Processes all missing, but you can interrupt after 100

# Wait 1 minute
sleep 60

# Process next batch (automatically skips first 100)
python backfill_embeddings.py
```

---

## Verification Checklist

After running the backfill script:

- [ ] Script completed without errors
- [ ] Summary shows 100% coverage (or close to it)
- [ ] S3 embeddings file updated (check Last Modified timestamp)
- [ ] Embedding count matches recipe count
- [ ] Test duplicate detection with sample recipe

### Test Duplicate Detection

Upload a test recipe that duplicates an existing recipe:

1. Copy an existing recipe text
2. Use the upload modal to upload it
3. Check for "Duplicate detected" error
4. Verify the error shows the original recipe key

If duplicate detection works, backfill was successful! ✓

---

## Cleanup

After successful backfill, you can optionally:

```bash
# Deactivate virtual environment
deactivate

# Remove virtual environment (if no longer needed)
rm -rf .venv  # or venv
```

Keep the script directory in case you need to run it again in the future.

---

## Troubleshooting

### Script hangs on OpenAI API call

**Cause**: Network timeout or OpenAI API slowness

**Solution**:
- Wait for timeout (30 seconds)
- Check internet connection
- Verify OpenAI API status: https://status.openai.com/

### Memory errors with large recipe datasets

**Cause**: Loading thousands of recipes into memory

**Solution**: Process in batches (script already handles this efficiently)

### ETag mismatch errors when saving

**Cause**: Concurrent modification of embeddings file

**Solution**: Wait a few seconds and re-run (script has retry logic)

---

## Support

For backfill issues:

1. Check error message and consult "Common Errors" section
2. Run with `--dry-run` to diagnose
3. Check AWS CloudWatch logs (if running on EC2/Lambda)
4. Verify environment variables are set correctly
5. Check OpenAI API status: https://status.openai.com/

---

## Next Steps

After successful backfill:

1. **Test duplicate detection**: Upload a duplicate recipe and verify it's caught
2. **Monitor coverage**: Check embedding coverage regularly
3. **Ongoing maintenance**: New recipes uploaded via the app automatically get embeddings
4. **Re-run if needed**: If you add recipes manually to S3, run backfill again

---

## Appendix: Script Options

### Command-Line Arguments

```
python backfill_embeddings.py [OPTIONS]

Options:
  --dry-run    Preview what would be done without saving to S3
  -h, --help   Show help message
```

### Environment Variables

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `S3_BUCKET` | Yes | S3 bucket name | `savorswipe-recipes` |
| `OPENAI_API_KEY` | Yes | OpenAI API key | `sk-...` |
| `AWS_PROFILE` | No | AWS CLI profile | `default` |
| `AWS_REGION` | No | AWS region | `us-east-1` |
| `AWS_ACCESS_KEY_ID` | No* | AWS access key | `AKIA...` |
| `AWS_SECRET_ACCESS_KEY` | No* | AWS secret key | `wJalrXUtn...` |

*Required if not using AWS CLI credentials or IAM role

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Error (check error message) |
| 130 | Interrupted by user (Ctrl+C) |
