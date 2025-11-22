# SavorSwipe Deployment Guide

This guide explains how to deploy the SavorSwipe backend Lambda function to AWS.

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
1. Prompt for AWS region and API keys (if not already configured)
2. Save your configuration to `backend/.env.deploy` for future deployments
3. Generate `backend/samconfig.toml` with deployment parameters
4. Build the Lambda function using Docker
5. Deploy to AWS using SAM
6. Update your `.env` file with the Lambda Function URL

## Configuration

### First-Time Setup

On your first deployment, you'll be prompted for:

- **AWS Region**: e.g., `us-west-2`
- **OpenAI API Key**: Your OpenAI API key for OCR functionality
- **Google Search Engine ID**: Your Google Custom Search engine ID
- **Google Search API Key**: Your Google Custom Search API key

These values are saved to `backend/.env.deploy` for subsequent deployments.

### Subsequent Deployments

After the first deployment, the script will automatically load your saved configuration. You can:

- Edit `backend/.env.deploy` to update your configuration
- Delete `backend/.env.deploy` to be prompted again

### Environment Files

The project uses two environment files:

1. **`.env.deploy`** (backend directory)
   - Contains AWS deployment configuration
   - Used by the deployment script
   - **Not committed to Git** (in `.gitignore`)

2. **`.env`** (project root)
   - Contains frontend environment variables
   - Automatically updated by deployment script with Lambda Function URL
   - **Not committed to Git** (in `.gitignore`)

Example `.env.deploy`:
```bash
AWS_REGION=us-west-2
OPENAI_KEY=sk-...
GOOGLE_SEARCH_ID=...
GOOGLE_SEARCH_KEY=...
```

Example `.env` (auto-updated):
```bash
EXPO_PUBLIC_CLOUDFRONT_BASE_URL=https://your-cloudfront-url.cloudfront.net
EXPO_PUBLIC_LAMBDA_FUNCTION_URL=https://your-lambda-url.lambda-url.us-west-2.on.aws/
```

## Deployment Persistence

The deployment script uses `samconfig.toml` to persist deployment configuration. This file:

- Is generated automatically during deployment
- Stores SAM deployment parameters (region, S3 bucket, etc.)
- Ensures consistent deployments without re-entering parameters
- **Is committed to Git** (safe to commit, no secrets)

## CI/CD Strategy

### GitHub Actions (CI Only)

The `.github/workflows` configuration runs:
- ✅ Linting (`npm run lint`)
- ✅ Unit Tests (`npm test`)
- ✅ Mocked Integration Tests (no live AWS resources)
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

1. Retrieves the Lambda Function URL from CloudFormation outputs
2. Updates your `.env` file with `EXPO_PUBLIC_LAMBDA_FUNCTION_URL`
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
2. Modify the bucket name in `scripts/deploy.js`

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
- Prints the Function URL (manual `.env` update required)

**Note**: The Node.js script (`npm run deploy`) is recommended as it provides automatic `.env` updates and better integration with the npm workflow.

## Next Steps

After successful deployment:

1. ✅ `.env` file is updated with Lambda Function URL
2. ✅ Run `npm start` to start the Expo development server
3. ✅ The app will automatically use the deployed Lambda function

## Architecture

The deployment creates:

- **Lambda Function**: Python-based recipe processing (OCR, image search)
- **Function URL**: HTTPS endpoint for frontend API calls
- **CloudWatch Logs**: Automatic logging for debugging
- **S3 Bucket**: Stores recipe images and metadata (`savorswipe-recipe`)

The Lambda function has permissions to:
- Read/write to S3 bucket
- Call OpenAI API
- Call Google Custom Search API

## Security

- API keys are passed as CloudFormation parameters (encrypted in transit)
- Lambda environment variables are encrypted at rest
- `.env.deploy` is in `.gitignore` (never committed)
- Function URL uses CORS to restrict frontend origins (configurable in `template.yaml`)
