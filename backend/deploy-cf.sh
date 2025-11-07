#!/bin/bash

###############################################################################
# CloudFormation Deployment Script for SavorSwipe Backend
#
# This script:
# 1. Packages Lambda source code with Linux-compatible dependencies
# 2. Uploads package to S3
# 3. Deploys/updates CloudFormation stack
#
# Requirements:
#   - AWS CLI configured
#   - zip command
#
# Usage:
#   ./deploy-cf.sh
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
BUILD_DIR="${SCRIPT_DIR}/build"
PACKAGE_DIR="${BUILD_DIR}/package"

# Configuration (can be overridden with env vars)
STACK_NAME="${STACK_NAME:-savorswipe-backend}"
REGION="${AWS_REGION:-us-west-2}"
CODE_BUCKET="${CODE_BUCKET:-savorswipe-lambda-code-${REGION}}"
CODE_KEY="lambda-function.zip"

print_header "CloudFormation Deployment"

# Prompt for values if not set
if [ -z "$OPENAI_API_KEY" ]; then
    read -sp "OpenAI API Key: " OPENAI_API_KEY
    echo
fi

if [ -z "$GOOGLE_SEARCH_ID" ]; then
    read -p "Google Search ID: " GOOGLE_SEARCH_ID
fi

if [ -z "$GOOGLE_SEARCH_KEY" ]; then
    read -sp "Google Search Key: " GOOGLE_SEARCH_KEY
    echo
fi

if [ -z "$RECIPE_BUCKET" ]; then
    read -p "Recipe S3 Bucket (default: savorswipe-recipe): " RECIPE_BUCKET
    RECIPE_BUCKET="${RECIPE_BUCKET:-savorswipe-recipe}"
fi

# Check prerequisites
if ! command -v aws &> /dev/null; then
    print_error "AWS CLI not found"
    exit 1
fi

if ! command -v zip &> /dev/null; then
    print_error "zip command not found"
    print_info "Install: sudo apt-get install zip"
    exit 1
fi

print_success "Prerequisites check passed"

# Clean and create build directory
print_header "Building Lambda Package"
rm -rf "$BUILD_DIR"
mkdir -p "$PACKAGE_DIR"

# Install dependencies for Linux (Lambda environment)
print_info "Installing Linux-compatible dependencies..."
python3 -m pip install \
    --platform manylinux2014_x86_64 \
    --target="$PACKAGE_DIR" \
    --implementation cp \
    --python-version 3.9 \
    --only-binary=:all: \
    --upgrade \
    -r "${SCRIPT_DIR}/requirements.txt" \
    --quiet

# Copy Python source files
print_info "Copying source files..."
cp "${SCRIPT_DIR}"/*.py "$PACKAGE_DIR/"

# Create ZIP
print_info "Creating deployment package..."
cd "$PACKAGE_DIR"
zip -r9q "${BUILD_DIR}/${CODE_KEY}" .
cd "$SCRIPT_DIR"

ZIP_SIZE=$(du -h "${BUILD_DIR}/${CODE_KEY}" | cut -f1)
print_success "Package created: ${CODE_KEY} (${ZIP_SIZE})"

# Create S3 bucket for code if it doesn't exist
print_header "Uploading to S3"
if ! aws s3 ls "s3://${CODE_BUCKET}" --region "$REGION" &>/dev/null; then
    print_info "Creating S3 bucket: ${CODE_BUCKET}"
    aws s3 mb "s3://${CODE_BUCKET}" --region "$REGION"
fi

# Upload to S3
print_info "Uploading ${CODE_KEY} to s3://${CODE_BUCKET}/"
aws s3 cp "${BUILD_DIR}/${CODE_KEY}" "s3://${CODE_BUCKET}/${CODE_KEY}" --region "$REGION"
print_success "Upload complete"

# Deploy CloudFormation stack
print_header "Deploying CloudFormation Stack"
print_info "Stack: ${STACK_NAME}"
print_info "Region: ${REGION}"

aws cloudformation deploy \
    --template-file "${SCRIPT_DIR}/cloudformation.yaml" \
    --stack-name "$STACK_NAME" \
    --region "$REGION" \
    --capabilities CAPABILITY_IAM \
    --parameter-overrides \
        SourceCodeBucket="$CODE_BUCKET" \
        SourceCodeKey="$CODE_KEY" \
        OpenAIApiKey="$OPENAI_API_KEY" \
        GoogleSearchId="$GOOGLE_SEARCH_ID" \
        GoogleSearchKey="$GOOGLE_SEARCH_KEY" \
        RecipeBucketName="$RECIPE_BUCKET"

if [ $? -eq 0 ]; then
    print_success "Deployment complete!"

    print_header "Stack Outputs"
    aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --region "$REGION" \
        --query 'Stacks[0].Outputs' \
        --output table

    echo ""
    print_info "View logs:"
    echo "  aws logs tail /aws/lambda/savorswipe-recipe-add --region $REGION --follow"
else
    print_error "Deployment failed"
    exit 1
fi

# Cleanup
print_info "Cleaning up build directory..."
rm -rf "$BUILD_DIR"
print_success "Done!"
