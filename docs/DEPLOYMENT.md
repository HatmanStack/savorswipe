# SavorSwipe Deployment Guide

This guide explains how to deploy the SavorSwipe backend Lambda function and API Gateway to AWS.

## Prerequisites

1. **AWS CLI** installed and configured with appropriate credentials
2. **AWS SAM CLI** installed (`pip install aws-sam-cli`)
3. **Docker** installed and running (required for SAM build with containers)
4. **Node.js** installed (for running the deployment script)

## Quick Start

From the project root, run:

```bash
npm run deploy
```

The script will:
1. Prompt for stack name, AWS region, environment, and API keys
2. Save your configuration to `.env.deploy` for future deployments
3. Generate `backend/samconfig.toml` with deployment parameters
4. Build the Lambda function using Docker
5. Deploy to AWS using SAM (creating S3, CloudFront, Lambda, API Gateway)
6. Upload starter data (images and recipes) to S3
7. Update your `.env` file with the API Gateway and CloudFront URLs

## Configuration

### First-Time Setup

On your first deployment, you'll be prompted for:

- **Stack Name**: CloudFormation stack name (default: savorswipe)
- **AWS Region**: e.g., `us-east-1`
- **Environment**: `dev` (CORS wildcard) or `prod` (restricted origins)
- **Production Origins**: Comma-separated allowed origins for prod
- **OpenAI API Key**: Your OpenAI API key for OCR functionality
- **Google Search Engine ID**: Your Google Custom Search engine ID
- **Google Search API Key**: Your Google Custom Search API key

These values are saved to `.env.deploy` for subsequent deployments.

### Subsequent Deployments

After the first deployment, the script will load your saved configuration and show current values in brackets. Press Enter to accept defaults or type a new value.

You can:
- Edit `.env.deploy` to update your configuration
- Delete `.env.deploy` to start fresh

### Environment Files

The project uses two environment files:

1. **`.env.deploy`** (project root)
   - Contains AWS deployment configuration
   - Used by the deployment script
   - **Not committed to Git** (in `.gitignore`)

2. **`.env`** (project root)
   - Contains frontend environment variables
   - Automatically updated by deployment script
   - **Not committed to Git** (in `.gitignore`)

Example `.env.deploy`:
```bash
STACK_NAME=savorswipe
AWS_REGION=us-east-1
ENVIRONMENT=dev
PRODUCTION_ORIGINS=https://myapp.example.com
OPENAI_KEY=sk-...
GOOGLE_SEARCH_ID=...
GOOGLE_SEARCH_KEY=...
```

Example `.env` (auto-updated):
```bash
EXPO_PUBLIC_CLOUDFRONT_BASE_URL=https://your-cloudfront-url.cloudfront.net
EXPO_PUBLIC_API_GATEWAY_URL=https://your-api-url.execute-api.us-west-2.amazonaws.com
```

### Local Development CORS

For local development, deploy with `Environment=dev` which enables CORS wildcard (`*`). For production, use `Environment=prod` and specify your allowed origins in `PRODUCTION_ORIGINS`.

## Deployment Persistence

The deployment script uses `samconfig.toml` to persist deployment configuration. This file:

- Is generated automatically during deployment
- Stores SAM deployment parameters (region, S3 bucket, etc.)
- Ensures consistent deployments without re-entering parameters
- **Is safe to commit to Git** (secrets are passed via CLI at deploy time, not stored in this file)

## CI/CD Strategy

### GitHub Actions (CI Only)

The `.github/workflows` configuration runs:
- ✅ Frontend linting and type-check (`npm run lint`)
- ✅ Frontend tests (`npm test`)
- ✅ Backend linting (`ruff check`)
- ✅ Backend tests (`pytest`)
- ❌ **No deployment** (CI is isolated from production)

### Local Deployment (Manual)

All infrastructure deployments are done locally via:

```bash
npm run deploy
```

This ensures:
- Control over when deployments happen
- No accidental deployments from CI
- Proper credential management

## Stack Outputs

After deployment, the script automatically:

1. Retrieves the API Gateway URL from CloudFormation outputs
2. Updates your `.env` file with `EXPO_PUBLIC_API_GATEWAY_URL`
3. Displays the URL in the terminal

You can manually retrieve outputs with:

```bash
aws cloudformation describe-stacks \
  --stack-name savorswipe-lambda \
  --region us-west-2 \
  --query 'Stacks[0].Outputs'
```

## Troubleshooting

### Docker Not Running

**Error**: `Cannot connect to the Docker daemon`

**Solution**: Start Docker Desktop or Docker daemon

### SAM Not Installed

**Error**: `sam: command not found`

**Solution**: Install AWS SAM CLI:
```bash
pip install aws-sam-cli
```

### AWS Credentials Not Configured

**Error**: `Unable to locate credentials`

**Solution**: Configure AWS CLI:
```bash
aws configure
```

### S3 Bucket Already Exists

The deployment script automatically creates an S3 bucket for SAM artifacts:
`sam-deploy-savorswipe-<region>`

If this bucket already exists in a different account, you may need to:
1. Choose a different region
2. Modify the bucket name in `frontend/scripts/deploy.js`

### Deployment Fails Mid-Way

If deployment fails, you can:

1. Check CloudFormation stack status:
   ```bash
   aws cloudformation describe-stacks --stack-name savorswipe-lambda
   ```

2. View stack events:
   ```bash
   aws cloudformation describe-stack-events --stack-name savorswipe-lambda
   ```

3. Delete the stack and retry:
   ```bash
   aws cloudformation delete-stack --stack-name savorswipe-lambda
   npm run deploy
   ```

## Manual Deployment (Bash Script)

If you prefer the original bash script, you can still use:

```bash
cd backend
./deploy.sh
```

This script:
- Loads from `.env.deploy`
- Prompts for missing values
- Runs `sam build` and `sam deploy`
- Prints the API Gateway URL (manual `.env` update required)

**Note**: The Node.js script (`npm run deploy`) is recommended as it provides automatic `.env` updates and better integration with the npm workflow.

## Frontend Deployment

To deploy the frontend as a web app:

1. **Build the web export**:
   ```bash
   cd frontend && npx expo export --platform web
   ```

2. **Upload to S3**: Upload the `frontend/dist` folder to an S3 bucket

3. **Deploy with AWS Amplify**: Create an Amplify app with the S3 bucket as source

4. **Update CORS**: Redeploy the backend with the Amplify CloudFront URL as a production origin:
   ```bash
   npm run deploy
   # When prompted for Production Origins, enter your Amplify URL
   # e.g., https://main.d1234abcd.amplifyapp.com
   ```

## Next Steps

After successful backend deployment:

1. ✅ `.env` file is updated with API Gateway URL
2. ✅ Run `npm start` to start the Expo development server
3. ✅ The app will automatically use the deployed API Gateway

## Migrating Data from Another Stack

Starter data uses keys 10000+ to avoid conflicts with user data. New uploads use `len(recipes) + 1` for key generation, so you can migrate data from an old deployment:

1. **Export from old stack**:
   ```bash
   aws s3 cp s3://old-bucket/jsondata/combined_data.json ./old_data.json
   aws s3 cp s3://old-bucket/jsondata/recipe_embeddings.json ./old_embeddings.json
   aws s3 sync s3://old-bucket/images/ ./old_images/
   ```

2. **Merge with new stack**: Append your old recipes to the new `combined_data.json` and `recipe_embeddings.json`. Your old keys (1-N) won't conflict with starter keys (10000+).

3. **Upload to new stack**:
   ```bash
   aws s3 cp ./merged_data.json s3://new-bucket/jsondata/combined_data.json
   aws s3 cp ./merged_embeddings.json s3://new-bucket/jsondata/recipe_embeddings.json
   aws s3 sync ./old_images/ s3://new-bucket/images/
   ```

New uploads will start at `total_recipe_count + 1`.

## Architecture

The deployment creates:

- **S3 Bucket**: Stores recipe images and metadata
  - `/images/*.jpg` - Recipe photos
  - `/jsondata/combined_data.json` - Recipe metadata
  - `/jsondata/recipe_embeddings.json` - Similarity vectors
- **CloudFront Distribution**: CDN for serving images
- **Lambda Function**: Python-based recipe processing (OCR, image search)
- **API Gateway v2**: HTTP API with routes:
  - `GET /recipes`
  - `POST /recipe/upload`
  - `DELETE /recipe/{recipe_key}`
  - `POST /recipe/{recipe_key}/image`
- **CloudWatch Logs**: Automatic logging for debugging

The Lambda function has permissions to:
- Read/write to S3 bucket
- Call OpenAI API
- Call Google Custom Search API

## Security

- API keys are passed as CloudFormation parameters via CLI (encrypted in transit, never written to `samconfig.toml`)
- Lambda environment variables are encrypted at rest
- `.env.deploy` is in `.gitignore` (never committed)
- `samconfig.toml` contains no secrets and is safe to commit
- Secrets are only stored in `.env.deploy` (local) and passed at deploy time via `--parameter-overrides`
- API Gateway uses CORS to restrict frontend origins (configurable in `template.yaml`)

**Important:** Never manually edit `samconfig.toml` to add `parameter_overrides` with secret values. The deployment script passes secrets securely via CLI.
