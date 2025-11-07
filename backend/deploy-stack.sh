#!/bin/bash

###############################################################################
# SAM Stack Deployment Script for SavorSwipe Lambda
#
# This script deploys the Lambda function using AWS SAM/CloudFormation
#
# Requirements:
#   - AWS CLI configured
#   - SAM CLI (will prompt to install if missing)
#   - Required API keys (OpenAI, Google Search)
#
# Usage:
#   ./deploy-stack.sh [OPTIONS]
#
# Options:
#   --stack-name NAME       CloudFormation stack name (default: savorswipe-lambda)
#   --region REGION         AWS region (default: prompt)
#   --openai-key KEY        OpenAI API Key (or will prompt)
#   --google-search-id ID   Google Search Engine ID (or will prompt)
#   --google-search-key KEY Google Search API Key (or will prompt)
#   --s3-bucket NAME        S3 bucket name (default: savorswipe-recipe)
#   --help                  Show this help message
###############################################################################

set -e  # Exit on error

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
STACK_NAME="savorswipe-lambda"
AWS_REGION="${AWS_REGION:-}"
OPENAI_KEY=""
GOOGLE_SEARCH_ID=""
GOOGLE_SEARCH_KEY=""
S3_BUCKET="savorswipe-recipe"

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

###############################################################################
# Helper Functions
###############################################################################

print_header() {
    echo -e "${BLUE}===================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}===================================${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

show_help() {
    grep '^#' "$0" | grep -v '#!/bin/bash' | sed 's/^# //' | sed 's/^#//'
    exit 0
}

###############################################################################
# Parse Arguments
###############################################################################

while [[ $# -gt 0 ]]; do
    case $1 in
        --stack-name)
            STACK_NAME="$2"
            shift 2
            ;;
        --region)
            AWS_REGION="$2"
            shift 2
            ;;
        --openai-key)
            OPENAI_KEY="$2"
            shift 2
            ;;
        --google-search-id)
            GOOGLE_SEARCH_ID="$2"
            shift 2
            ;;
        --google-search-key)
            GOOGLE_SEARCH_KEY="$2"
            shift 2
            ;;
        --s3-bucket)
            S3_BUCKET="$2"
            shift 2
            ;;
        --help)
            show_help
            ;;
        *)
            print_error "Unknown option: $1"
            show_help
            ;;
    esac
done

###############################################################################
# Check Prerequisites
###############################################################################

print_header "Checking Prerequisites"

# Check AWS CLI
if ! command -v aws &> /dev/null; then
    print_error "AWS CLI not found. Please install it first."
    exit 1
fi
print_success "AWS CLI found"

# Check SAM CLI
if ! command -v sam &> /dev/null; then
    print_warning "SAM CLI not found"
    print_info "You can install it with:"
    print_info "  brew install aws-sam-cli  (macOS)"
    print_info "  pip install aws-sam-cli   (Python)"
    print_info "  Or follow: https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html"
    exit 1
fi
print_success "SAM CLI found: $(sam --version)"

# Get AWS region
if [ -z "$AWS_REGION" ]; then
    read -p "Enter AWS region (e.g., us-east-1): " AWS_REGION
    if [ -z "$AWS_REGION" ]; then
        print_error "AWS region is required"
        exit 1
    fi
fi
print_info "Using region: $AWS_REGION"

# Get parameters if not provided
if [ -z "$OPENAI_KEY" ]; then
    read -sp "Enter OpenAI API Key: " OPENAI_KEY
    echo
    if [ -z "$OPENAI_KEY" ]; then
        print_error "OpenAI API Key is required"
        exit 1
    fi
fi

if [ -z "$GOOGLE_SEARCH_ID" ]; then
    read -p "Enter Google Custom Search Engine ID: " GOOGLE_SEARCH_ID
    if [ -z "$GOOGLE_SEARCH_ID" ]; then
        print_error "Google Search Engine ID is required"
        exit 1
    fi
fi

if [ -z "$GOOGLE_SEARCH_KEY" ]; then
    read -sp "Enter Google Custom Search API Key: " GOOGLE_SEARCH_KEY
    echo
    if [ -z "$GOOGLE_SEARCH_KEY" ]; then
        print_error "Google Search API Key is required"
        exit 1
    fi
fi

###############################################################################
# Build Lambda Package
###############################################################################

print_header "Building Lambda Package"

cd "$SCRIPT_DIR"

# Create build directory
BUILD_DIR="build"
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

# Install dependencies using Docker for Lambda compatibility
print_info "Installing dependencies (this may take a few minutes)..."

if command -v docker &> /dev/null; then
    print_info "Using Docker for Lambda-compatible builds..."

    docker run --rm \
        --entrypoint bash \
        -v "$SCRIPT_DIR:/var/task" \
        -v "$SCRIPT_DIR/$BUILD_DIR:/var/output" \
        public.ecr.aws/lambda/python:3.13 \
        -c "pip install -r /var/task/requirements.txt -t /var/output --no-cache-dir"
else
    print_warning "Docker not found, using local pip (may not be Lambda-compatible)"
    pip install -r requirements.txt -t "$BUILD_DIR" --platform manylinux2014_x86_64 --only-binary=':all:'
fi

# Copy source files
print_info "Copying source files..."
cp *.py "$BUILD_DIR/"

print_success "Build complete"

###############################################################################
# Check and Clean Existing Stack
###############################################################################

print_header "Checking for Existing Stack"

# Check if stack exists and its status
STACK_STATUS=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$AWS_REGION" \
    --query 'Stacks[0].StackStatus' \
    --output text 2>/dev/null || echo "DOES_NOT_EXIST")

if [ "$STACK_STATUS" = "ROLLBACK_COMPLETE" ]; then
    print_warning "Stack is in ROLLBACK_COMPLETE state from previous failed deployment"
    print_info "Deleting old stack..."

    aws cloudformation delete-stack \
        --stack-name "$STACK_NAME" \
        --region "$AWS_REGION"

    print_info "Waiting for stack deletion to complete..."
    aws cloudformation wait stack-delete-complete \
        --stack-name "$STACK_NAME" \
        --region "$AWS_REGION"

    print_success "Old stack deleted successfully"
elif [ "$STACK_STATUS" != "DOES_NOT_EXIST" ]; then
    print_info "Existing stack found with status: $STACK_STATUS"
fi

###############################################################################
# Deploy Stack
###############################################################################

print_header "Deploying Stack: $STACK_NAME"

# Build with SAM
print_info "Running SAM build..."
sam build --template template.yaml --use-container

# Deploy with SAM
print_info "Deploying to AWS..."
sam deploy \
    --stack-name "$STACK_NAME" \
    --region "$AWS_REGION" \
    --capabilities CAPABILITY_IAM \
    --parameter-overrides \
        OpenAIApiKey="$OPENAI_KEY" \
        GoogleSearchId="$GOOGLE_SEARCH_ID" \
        GoogleSearchKey="$GOOGLE_SEARCH_KEY" \
        S3BucketName="$S3_BUCKET" \
    --resolve-s3 \
    --no-confirm-changeset \
    --no-fail-on-empty-changeset

###############################################################################
# Get Outputs
###############################################################################

print_header "Deployment Complete"

# Get stack outputs
print_info "Retrieving stack outputs..."

FUNCTION_NAME=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$AWS_REGION" \
    --query 'Stacks[0].Outputs[?OutputKey==`FunctionName`].OutputValue' \
    --output text)

FUNCTION_URL=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$AWS_REGION" \
    --query 'Stacks[0].Outputs[?OutputKey==`FunctionUrl`].OutputValue' \
    --output text)

print_success "Stack deployed successfully!"
echo
print_info "Stack Name: $STACK_NAME"
print_info "Function Name: $FUNCTION_NAME"
print_info "Function URL: $FUNCTION_URL"
echo
print_info "Add this to your .env file:"
echo -e "${GREEN}EXPO_PUBLIC_LAMBDA_FUNCTION_URL=$FUNCTION_URL${NC}"
echo
print_info "To test the function:"
echo "  curl $FUNCTION_URL"
