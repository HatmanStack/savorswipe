#!/bin/bash
set -e

cd "$(dirname "$0")"

echo "==================================="
echo "SavorSwipe Lambda Deployment"
echo "==================================="
echo ""

# Get region
read -p "AWS Region (e.g., us-west-2): " AWS_REGION
if [ -z "$AWS_REGION" ]; then
    echo "Error: Region is required"
    exit 1
fi

# Get API keys
read -sp "OpenAI API Key: " OPENAI_KEY
echo ""
if [ -z "$OPENAI_KEY" ]; then
    echo "Error: OpenAI API Key is required"
    exit 1
fi

read -p "Google Search Engine ID: " GOOGLE_SEARCH_ID
if [ -z "$GOOGLE_SEARCH_ID" ]; then
    echo "Error: Google Search ID is required"
    exit 1
fi

read -sp "Google Search API Key: " GOOGLE_SEARCH_KEY
echo ""
if [ -z "$GOOGLE_SEARCH_KEY" ]; then
    echo "Error: Google Search Key is required"
    exit 1
fi

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
    --no-confirm-changeset

echo ""
echo "==================================="
echo "Deployment Complete!"
echo "==================================="
echo ""

# Get Function URL
FUNCTION_URL=$(aws cloudformation describe-stacks \
    --stack-name savorswipe-lambda \
    --region "$AWS_REGION" \
    --query 'Stacks[0].Outputs[?OutputKey==`FunctionUrl`].OutputValue' \
    --output text)

echo "Lambda Function URL:"
echo "$FUNCTION_URL"
echo ""
echo "Add this to your .env file:"
echo "EXPO_PUBLIC_LAMBDA_FUNCTION_URL=$FUNCTION_URL"
