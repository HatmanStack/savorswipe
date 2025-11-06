#!/bin/bash

###############################################################################
# SAM Deployment Script for SavorSwipe Backend
#
# This script uses AWS SAM to build and deploy the Lambda function.
# SAM automatically handles Python dependencies in the correct environment.
#
# Requirements:
#   - AWS SAM CLI (install: brew install aws-sam-cli OR pip install aws-sam-cli)
#   - AWS CLI configured with credentials
#
# Usage:
#   ./deploy-sam.sh [--guided]
#
# Options:
#   --guided    Run guided deployment (prompts for all parameters)
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
GUIDED=false

# Parse arguments
for arg in "$@"; do
    case $arg in
        --guided)
            GUIDED=true
            shift
            ;;
    esac
done

print_header "SavorSwipe Lambda Deployment (SAM)"

# Check if SAM CLI is installed
if ! command -v sam &> /dev/null; then
    print_error "AWS SAM CLI is not installed"
    print_info "Install with:"
    print_info "  macOS:   brew install aws-sam-cli"
    print_info "  pip:     pip install aws-sam-cli"
    print_info "  Or see: https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html"
    exit 1
fi
print_success "SAM CLI is installed"

# Check AWS credentials
if ! aws sts get-caller-identity &> /dev/null; then
    print_error "AWS credentials are not configured"
    print_info "Run: aws configure"
    exit 1
fi
print_success "AWS credentials are valid"

cd "$SCRIPT_DIR"

# Build
print_header "Building Lambda Function"
print_info "SAM will automatically install dependencies in Lambda-compatible environment..."

if sam build --use-container; then
    print_success "Build completed successfully"
else
    print_error "Build failed"
    exit 1
fi

# Deploy
print_header "Deploying to AWS"

if [ "$GUIDED" = true ]; then
    print_info "Starting guided deployment..."
    print_warning "You'll be prompted for:"
    print_warning "  - Stack name (default: savorswipe-backend)"
    print_warning "  - AWS Region (e.g., us-west-2)"
    print_warning "  - OpenAI API Key"
    print_warning "  - Google Search ID"
    print_warning "  - Google Search Key"
    print_warning "  - S3 Bucket Name"
    echo ""

    sam deploy --guided
else
    print_info "Deploying with saved configuration..."
    print_info "(Run with --guided to reconfigure)"

    if [ ! -f "samconfig.toml" ]; then
        print_warning "No samconfig.toml found. Running guided deployment..."
        sam deploy --guided
    else
        sam deploy
    fi
fi

if [ $? -eq 0 ]; then
    print_success "Deployment completed!"
    echo ""
    print_header "Deployment Information"

    # Get stack outputs
    STACK_NAME=$(grep stack_name samconfig.toml 2>/dev/null | cut -d'=' -f2 | tr -d ' "' || echo "savorswipe-backend")
    REGION=$(grep region samconfig.toml 2>/dev/null | cut -d'=' -f2 | tr -d ' "' || echo "us-west-2")

    print_info "Fetching outputs..."
    aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --region "$REGION" \
        --query 'Stacks[0].Outputs' \
        --output table

    echo ""
    print_info "View logs with:"
    echo "  sam logs -n RecipeProcessorFunction --stack-name $STACK_NAME --tail"
else
    print_error "Deployment failed"
    exit 1
fi
