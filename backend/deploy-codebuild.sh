#!/bin/bash

###############################################################################
# CodeBuild Deployment Script for SavorSwipe Lambda
#
# This script:
# 1. Creates/updates CloudFormation stack (CodeBuild + Lambda infrastructure)
# 2. Triggers CodeBuild to build Lambda package from GitHub
# 3. Waits for build to complete
# 4. Updates Lambda function with new code
#
# Requirements:
#   - AWS CLI configured
#
# Usage:
#   ./deploy-codebuild.sh [--create-stack]
#
# Options:
#   --create-stack    Create stack for first time (will prompt for parameters)
###############################################################################

set -e

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_success() { echo -e "${GREEN}✓ $1${NC}"; }
print_error() { echo -e "${RED}✗ $1${NC}"; }
print_warning() { echo -e "${YELLOW}⚠ $1${NC}"; }
print_info() { echo -e "${BLUE}ℹ $1${NC}"; }
print_header() {
    echo -e "${BLUE}===================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}===================================${NC}"
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STACK_NAME="${STACK_NAME:-savorswipe-backend}"
REGION="${AWS_REGION:-us-west-2}"
CREATE_STACK=false

# Parse arguments
for arg in "$@"; do
    case $arg in
        --create-stack)
            CREATE_STACK=true
            shift
            ;;
    esac
done

print_header "CodeBuild Lambda Deployment"

# Check AWS CLI
if ! command -v aws &> /dev/null; then
    print_error "AWS CLI not found"
    exit 1
fi

if ! aws sts get-caller-identity &> /dev/null; then
    print_error "AWS credentials not configured"
    exit 1
fi

print_success "AWS CLI configured"

# Create stack if needed
if [ "$CREATE_STACK" = true ]; then
    print_header "Creating CloudFormation Stack"

    # Prompt for parameters
    read -p "GitHub Repository URL (default: https://github.com/HatmanStack/savorswipe.git): " GITHUB_REPO
    GITHUB_REPO="${GITHUB_REPO:-https://github.com/HatmanStack/savorswipe.git}"

    read -p "GitHub Branch (default: main): " GITHUB_BRANCH
    GITHUB_BRANCH="${GITHUB_BRANCH:-main}"

    read -sp "OpenAI API Key: " OPENAI_KEY
    echo

    read -p "Google Search ID: " GOOGLE_SEARCH_ID

    read -sp "Google Search Key: " GOOGLE_SEARCH_KEY
    echo

    read -p "Recipe S3 Bucket (default: savorswipe-recipes): " RECIPE_BUCKET
    RECIPE_BUCKET="${RECIPE_BUCKET:-savorswipe-recipes}"

    print_info "Creating stack: ${STACK_NAME}"
    aws cloudformation create-stack \
        --stack-name "$STACK_NAME" \
        --region "$REGION" \
        --template-body "file://${SCRIPT_DIR}/codebuild-template.yaml" \
        --capabilities CAPABILITY_IAM \
        --parameters \
            ParameterKey=GitHubRepo,ParameterValue="$GITHUB_REPO" \
            ParameterKey=GitHubBranch,ParameterValue="$GITHUB_BRANCH" \
            ParameterKey=OpenAIApiKey,ParameterValue="$OPENAI_KEY" \
            ParameterKey=GoogleSearchId,ParameterValue="$GOOGLE_SEARCH_ID" \
            ParameterKey=GoogleSearchKey,ParameterValue="$GOOGLE_SEARCH_KEY" \
            ParameterKey=RecipeBucketName,ParameterValue="$RECIPE_BUCKET"

    print_info "Waiting for stack creation to complete..."
    aws cloudformation wait stack-create-complete \
        --stack-name "$STACK_NAME" \
        --region "$REGION"

    print_success "Stack created successfully"
fi

# Check if stack exists
if ! aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$REGION" &> /dev/null; then
    print_error "Stack '${STACK_NAME}' not found"
    print_info "Run with --create-stack to create it"
    exit 1
fi

print_success "Stack '${STACK_NAME}' exists"

# Get CodeBuild project name from stack
print_header "Triggering CodeBuild"
PROJECT_NAME=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$REGION" \
    --query 'Stacks[0].Outputs[?OutputKey==`CodeBuildProject`].OutputValue' \
    --output text)

if [ -z "$PROJECT_NAME" ]; then
    print_error "Could not find CodeBuild project in stack outputs"
    exit 1
fi

print_info "CodeBuild Project: ${PROJECT_NAME}"

# Start build
print_info "Starting build..."
BUILD_ID=$(aws codebuild start-build \
    --project-name "$PROJECT_NAME" \
    --region "$REGION" \
    --query 'build.id' \
    --output text)

print_success "Build started: ${BUILD_ID}"

# Wait for build to complete
print_info "Waiting for build to complete (this may take a few minutes)..."
BUILD_STATUS=""
while [ "$BUILD_STATUS" != "SUCCEEDED" ] && [ "$BUILD_STATUS" != "FAILED" ] && [ "$BUILD_STATUS" != "STOPPED" ]; do
    sleep 10
    BUILD_STATUS=$(aws codebuild batch-get-builds \
        --ids "$BUILD_ID" \
        --region "$REGION" \
        --query 'builds[0].buildStatus' \
        --output text)
    echo -n "."
done
echo ""

if [ "$BUILD_STATUS" = "SUCCEEDED" ]; then
    print_success "Build completed successfully"
else
    print_error "Build failed with status: ${BUILD_STATUS}"
    print_info "View logs:"
    echo "  aws codebuild batch-get-builds --ids $BUILD_ID --region $REGION"
    exit 1
fi

# Update Lambda function with new code
print_header "Updating Lambda Function"

ARTIFACT_BUCKET=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$REGION" \
    --query 'Stacks[0].Outputs[?OutputKey==`ArtifactBucket`].OutputValue' \
    --output text)

print_info "Updating Lambda from s3://${ARTIFACT_BUCKET}/lambda-function.zip"

aws lambda update-function-code \
    --function-name savorswipe-recipe-add \
    --s3-bucket "$ARTIFACT_BUCKET" \
    --s3-key lambda-function.zip \
    --region "$REGION" \
    --output json > /dev/null

print_success "Lambda function updated"

# Wait for update to complete
print_info "Waiting for Lambda update to complete..."
aws lambda wait function-updated \
    --function-name savorswipe-recipe-add \
    --region "$REGION"

print_success "Update complete and active"

# Show outputs
print_header "Stack Outputs"
aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$REGION" \
    --query 'Stacks[0].Outputs' \
    --output table

echo ""
print_info "View Lambda logs:"
echo "  aws logs tail /aws/lambda/savorswipe-recipe-add --region $REGION --follow"

print_info "View CodeBuild logs:"
echo "  aws codebuild batch-get-builds --ids $BUILD_ID --region $REGION"

print_success "Deployment complete!"
