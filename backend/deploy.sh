#!/bin/bash
set -e

cd "$(dirname "$0")"

echo "==================================="
echo "SavorSwipe API Gateway Deployment"
echo "==================================="
echo ""

# Load from .env.deploy if it exists
if [ -f ".env.deploy" ]; then
    echo "Loading configuration from .env.deploy..."
    export $(grep -v '^#' .env.deploy | xargs)
fi

# Get region (from env or prompt)
if [ -z "$AWS_REGION" ]; then
    read -p "AWS Region (e.g., us-west-2): " AWS_REGION
fi
if [ -z "$AWS_REGION" ]; then
    echo "Error: Region is required"
    exit 1
fi

# Get API keys (from env or prompt)
if [ -z "$OPENAI_KEY" ]; then
    read -sp "OpenAI API Key: " OPENAI_KEY
    echo ""
fi
if [ -z "$OPENAI_KEY" ]; then
    echo "Error: OpenAI API Key is required"
    exit 1
fi

if [ -z "$GOOGLE_SEARCH_ID" ]; then
    read -p "Google Search Engine ID: " GOOGLE_SEARCH_ID
fi
if [ -z "$GOOGLE_SEARCH_ID" ]; then
    echo "Error: Google Search ID is required"
    exit 1
fi

if [ -z "$GOOGLE_SEARCH_KEY" ]; then
    read -sp "Google Search API Key: " GOOGLE_SEARCH_KEY
    echo ""
fi
if [ -z "$GOOGLE_SEARCH_KEY" ]; then
    echo "Error: Google Search Key is required"
    exit 1
fi

# Include Dev Origins parameter
IncludeDevOrigins="${INCLUDE_DEV_ORIGINS:-false}"

echo ""
echo "Using configuration:"
echo "  Region: $AWS_REGION"
echo "  OpenAI Key: ${OPENAI_KEY:0:8}..."
echo "  Google Search ID: ${GOOGLE_SEARCH_ID:0:8}..."
echo "  Google Search Key: ${GOOGLE_SEARCH_KEY:0:8}..."
echo "  Include Dev Origins: $IncludeDevOrigins"
echo ""

echo ""
echo "Building Lambda function with Docker..."
sam build --template template.yaml --use-container

echo ""
echo "Deploying to AWS..."

# Create deployment bucket if needed
DEPLOY_BUCKET="sam-deploy-savorswipe-${AWS_REGION}"
if ! aws s3 ls "s3://${DEPLOY_BUCKET}" --region "$AWS_REGION" 2>/dev/null; then
    echo "Creating deployment bucket: ${DEPLOY_BUCKET}"
    aws s3 mb "s3://${DEPLOY_BUCKET}" --region "$AWS_REGION"
fi

# Deploy
sam deploy \
    --stack-name savorswipe-lambda \
    --region "$AWS_REGION" \
    --s3-bucket "$DEPLOY_BUCKET" \
    --capabilities CAPABILITY_IAM \
    --parameter-overrides \
        OpenAIApiKey="$OPENAI_KEY" \
        GoogleSearchId="$GOOGLE_SEARCH_ID" \
        GoogleSearchKey="$GOOGLE_SEARCH_KEY" \
        S3BucketName="savorswipe-recipe" \
        IncludeDevOrigins="$IncludeDevOrigins" \
    --no-confirm-changeset

echo ""
echo "==================================="
echo "Deployment Complete!"
echo "==================================="
echo ""

# Get API Gateway URL
API_URL=$(aws cloudformation describe-stacks \
    --stack-name savorswipe-lambda \
    --region "$AWS_REGION" \
    --query 'Stacks[0].Outputs[?OutputKey==`ApiGatewayUrl`].OutputValue' \
    --output text)

# Verify we got a valid URL
if [ -z "$API_URL" ] || [ "$API_URL" = "None" ]; then
  echo "Error: ApiGatewayUrl output not found on stack savorswipe-lambda"
  echo "This usually means the deployment failed or the template is missing the ApiGatewayUrl output"
  exit 1
fi

echo "API Gateway URL:"
echo "$API_URL"
echo ""
echo "Add this to your .env file:"
echo "EXPO_PUBLIC_API_GATEWAY_URL=$API_URL"
