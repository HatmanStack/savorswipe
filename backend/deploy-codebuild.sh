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
#   ./deploy-codebuild.sh [--create-stack] [--force]
#
# Options:
#   --create-stack    Create stack for first time (will prompt for parameters)
#   --force           Delete existing stack and recreate (use with --create-stack)
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
FORCE=false

# Parse arguments
for arg in "$@"; do
    case $arg in
        --create-stack)
            CREATE_STACK=true
            shift
            ;;
        --force)
            FORCE=true
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

# Force delete if requested
if [ "$FORCE" = true ]; then
    print_header "Force Deleting Existing Resources"

    # Delete Lambda function if it exists
    if aws lambda get-function \
        --function-name savorswipe-recipe-add \
        --region "$REGION" &> /dev/null; then

        print_warning "Deleting existing Lambda function: savorswipe-recipe-add"
        aws lambda delete-function \
            --function-name savorswipe-recipe-add \
            --region "$REGION"
        print_success "Lambda function deleted"
    fi

    # Empty and delete BuildBucket if stack exists
    if aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --region "$REGION" &> /dev/null; then

        # Get BuildBucket name before deleting stack
        BUILD_BUCKET=$(aws cloudformation describe-stack-resources \
            --stack-name "$STACK_NAME" \
            --region "$REGION" \
            --logical-resource-id BuildBucket \
            --query 'StackResources[0].PhysicalResourceId' \
            --output text 2>/dev/null || echo "")

        if [ -n "$BUILD_BUCKET" ] && [ "$BUILD_BUCKET" != "None" ]; then
            print_warning "Emptying S3 bucket: ${BUILD_BUCKET}"
            aws s3 rm "s3://${BUILD_BUCKET}" --recursive --region "$REGION" 2>/dev/null || true
            print_success "Bucket emptied"
        fi

        print_warning "Deleting existing stack: ${STACK_NAME}"
        aws cloudformation delete-stack \
            --stack-name "$STACK_NAME" \
            --region "$REGION"

        print_info "Waiting for stack deletion..."
        if ! aws cloudformation wait stack-delete-complete \
            --stack-name "$STACK_NAME" \
            --region "$REGION" 2>/dev/null; then

            print_warning "Stack deletion encountered issues, checking status..."

            # If deletion failed, try to manually clean up and delete again
            if [ -n "$BUILD_BUCKET" ] && [ "$BUILD_BUCKET" != "None" ]; then
                print_info "Attempting to delete bucket manually..."
                aws s3 rb "s3://${BUILD_BUCKET}" --force --region "$REGION" 2>/dev/null || true
            fi

            # Force delete the stack
            print_info "Retrying stack deletion..."
            aws cloudformation delete-stack \
                --stack-name "$STACK_NAME" \
                --region "$REGION"

            aws cloudformation wait stack-delete-complete \
                --stack-name "$STACK_NAME" \
                --region "$REGION" 2>/dev/null || true
        fi

        print_success "Stack cleanup complete"
    else
        print_info "No existing stack to delete"
    fi
fi

# Create stack if needed
if [ "$CREATE_STACK" = true ]; then
    print_header "Creating CloudFormation Stack"

    # Prompt for parameters
    read -sp "OpenAI API Key: " OPENAI_KEY
    echo

    read -p "Google Search ID: " GOOGLE_SEARCH_ID

    read -sp "Google Search Key: " GOOGLE_SEARCH_KEY
    echo

    read -p "Recipe S3 Bucket (default: savorswipe-recipes): " RECIPE_BUCKET
    RECIPE_BUCKET="${RECIPE_BUCKET:-savorswipe-recipes}"

    # Create a temporary dummy Lambda package for initial stack creation
    print_info "Creating placeholder Lambda package..."
    TEMP_DIR=$(mktemp -d)
    cat > "$TEMP_DIR/lambda_function.py" << 'EOF'
def lambda_handler(event, context):
    return {
        'statusCode': 503,
        'body': 'Function is being deployed. Please try again in a few minutes.'
    }
EOF
    cd "$TEMP_DIR"
    zip -q lambda-function.zip lambda_function.py
    DUMMY_ZIP="$TEMP_DIR/lambda-function.zip"

    print_info "Creating stack: ${STACK_NAME}"
    aws cloudformation create-stack \
        --stack-name "$STACK_NAME" \
        --region "$REGION" \
        --template-body "file://${SCRIPT_DIR}/codebuild-template.yaml" \
        --capabilities CAPABILITY_IAM \
        --parameters \
            ParameterKey=OpenAIApiKey,ParameterValue="$OPENAI_KEY" \
            ParameterKey=GoogleSearchId,ParameterValue="$GOOGLE_SEARCH_ID" \
            ParameterKey=GoogleSearchKey,ParameterValue="$GOOGLE_SEARCH_KEY" \
            ParameterKey=RecipeBucketName,ParameterValue="$RECIPE_BUCKET"

    # Upload dummy package immediately so Lambda creation succeeds
    print_info "Waiting for S3 bucket to be created..."
    sleep 10  # Give CloudFormation time to create the bucket

    # Try to get bucket name and upload dummy package
    for i in {1..30}; do
        BUILD_BUCKET=$(aws cloudformation describe-stack-resources \
            --stack-name "$STACK_NAME" \
            --region "$REGION" \
            --logical-resource-id BuildBucket \
            --query 'StackResources[0].PhysicalResourceId' \
            --output text 2>/dev/null || echo "")

        if [ -n "$BUILD_BUCKET" ] && [ "$BUILD_BUCKET" != "None" ]; then
            print_info "Uploading placeholder to s3://${BUILD_BUCKET}/lambda-function.zip"
            aws s3 cp "$DUMMY_ZIP" "s3://${BUILD_BUCKET}/lambda-function.zip" --region "$REGION"
            break
        fi
        sleep 2
    done

    rm -rf "$TEMP_DIR"

    print_info "Waiting for stack creation to complete..."
    aws cloudformation wait stack-create-complete \
        --stack-name "$STACK_NAME" \
        --region "$REGION"

    print_success "Stack created successfully"

    # Get the Build Bucket name
    BUILD_BUCKET=$(aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --region "$REGION" \
        --query 'Stacks[0].Outputs[?OutputKey==`BuildBucket`].OutputValue' \
        --output text)

    # Upload initial source and trigger first build
    print_header "Initial Build"
    print_info "Uploading source code..."
    cd "$SCRIPT_DIR"
    zip -r9q /tmp/source.zip *.py requirements.txt buildspec.yml
    aws s3 cp /tmp/source.zip "s3://${BUILD_BUCKET}/source.zip" --region "$REGION"
    rm /tmp/source.zip
    print_success "Source uploaded"

    # Trigger CodeBuild to create initial lambda package
    PROJECT_NAME=$(aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --region "$REGION" \
        --query 'Stacks[0].Outputs[?OutputKey==`CodeBuildProject`].OutputValue' \
        --output text)

    print_info "Starting initial build..."
    BUILD_ID=$(aws codebuild start-build \
        --project-name "$PROJECT_NAME" \
        --region "$REGION" \
        --query 'build.id' \
        --output text)

    print_info "Waiting for build to complete..."
    BUILD_STATUS=""
    while [ "$BUILD_STATUS" != "SUCCEEDED" ] && [ "$BUILD_STATUS" != "FAILED" ]; do
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
        print_success "Initial build complete"

        # Update Lambda with built code
        aws lambda update-function-code \
            --function-name savorswipe-recipe-add \
            --s3-bucket "$BUILD_BUCKET" \
            --s3-key lambda-function.zip \
            --region "$REGION" > /dev/null

        aws lambda wait function-updated \
            --function-name savorswipe-recipe-add \
            --region "$REGION"

        print_success "Lambda function updated with built code"
    else
        print_error "Initial build failed"
    fi
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

# Get Build Bucket from stack
BUILD_BUCKET=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$REGION" \
    --query 'Stacks[0].Outputs[?OutputKey==`BuildBucket`].OutputValue' \
    --output text)

if [ -z "$BUILD_BUCKET" ]; then
    print_error "Could not find BuildBucket in stack outputs"
    exit 1
fi

print_success "Build Bucket: ${BUILD_BUCKET}"

# Package source code
print_header "Packaging Source Code"
print_info "Creating source package..."
cd "$SCRIPT_DIR"
zip -r9q /tmp/source.zip *.py requirements.txt buildspec.yml

print_success "Source packaged"

# Upload to S3
print_info "Uploading source to S3..."
aws s3 cp /tmp/source.zip "s3://${BUILD_BUCKET}/source.zip" --region "$REGION"
rm /tmp/source.zip

print_success "Source uploaded to s3://${BUILD_BUCKET}/source.zip"

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

print_info "Updating Lambda from s3://${BUILD_BUCKET}/lambda-function.zip"

aws lambda update-function-code \
    --function-name savorswipe-recipe-add \
    --s3-bucket "$BUILD_BUCKET" \
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
