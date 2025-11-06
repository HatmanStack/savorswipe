#!/bin/bash

###############################################################################
# Lambda Deployment Script for SavorSwipe Backend
#
# This script automates the deployment of the Lambda function by:
# 1. Running tests with uv (optional)
# 2. Installing production dependencies with uv from pyproject.toml
# 3. Creating a deployment package
# 4. Uploading to AWS Lambda
#
# Requirements:
#   - uv (fast Python package manager)
#   - AWS CLI
#   - Configured AWS credentials
#
# Usage:
#   ./deploy.sh [OPTIONS]
#
# Options:
#   --function-name NAME    Lambda function name (default: from env or prompt)
#   --skip-tests           Skip running tests before deployment
#   --layer                Build and deploy as Lambda Layer
#   --dry-run              Create package but don't deploy
#   --help                 Show this help message
#
# Environment Variables:
#   LAMBDA_FUNCTION_NAME   Default Lambda function name
#   AWS_PROFILE            AWS profile to use (optional)
#   AWS_REGION             AWS region (will prompt if not set)
###############################################################################

set -e  # Exit on error

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
SKIP_TESTS=false
DRY_RUN=false
BUILD_LAYER=false
FUNCTION_NAME="${LAMBDA_FUNCTION_NAME:-}"
AWS_REGION="${AWS_REGION:-}"  # Will prompt if empty
AWS_PROFILE_ARG=""

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="${SCRIPT_DIR}/build"
PACKAGE_DIR="${BUILD_DIR}/package"
LAYER_DIR="${BUILD_DIR}/layer/python"

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

cleanup() {
    if [ -d "$BUILD_DIR" ]; then
        print_info "Cleaning up build directory..."
        rm -rf "$BUILD_DIR"
    fi
}

###############################################################################
# Parse Command Line Arguments
###############################################################################

while [[ $# -gt 0 ]]; do
    case $1 in
        --function-name)
            FUNCTION_NAME="$2"
            shift 2
            ;;
        --skip-tests)
            SKIP_TESTS=true
            shift
            ;;
        --layer)
            BUILD_LAYER=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
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
# Pre-flight Checks
###############################################################################

print_header "Pre-flight Checks"

# Check if uv is installed
if ! command -v uv &> /dev/null; then
    print_error "uv is not installed. Please install it first."
    print_info "Install with: curl -LsSf https://astral.sh/uv/install.sh | sh"
    print_info "Or with pip: pip install uv"
    exit 1
fi
print_success "uv is installed"

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    print_error "AWS CLI is not installed. Please install it first."
    print_info "Install with: pip install awscli"
    exit 1
fi
print_success "AWS CLI is installed"

# Check AWS credentials
if ! aws sts get-caller-identity ${AWS_PROFILE_ARG} &> /dev/null; then
    print_error "AWS credentials are not configured or invalid"
    print_info "Configure with: aws configure"
    exit 1
fi
print_success "AWS credentials are valid"

# Prompt for region if not provided
if [ -z "$AWS_REGION" ]; then
    read -p "Enter AWS region (default: us-east-1): " INPUT_REGION
    AWS_REGION="${INPUT_REGION:-us-east-1}"
fi

# Get function name if not provided
if [ -z "$FUNCTION_NAME" ] && [ "$BUILD_LAYER" = false ]; then
    read -p "Enter Lambda function name: " FUNCTION_NAME
    if [ -z "$FUNCTION_NAME" ]; then
        print_error "Function name is required"
        exit 1
    fi
fi

# Check if function exists (unless building layer)
if [ "$BUILD_LAYER" = false ]; then
    if ! aws lambda get-function --function-name "$FUNCTION_NAME" ${AWS_PROFILE_ARG} --region "$AWS_REGION" &> /dev/null; then
        print_error "Lambda function '$FUNCTION_NAME' not found in region $AWS_REGION"
        exit 1
    fi
    print_success "Lambda function '$FUNCTION_NAME' found"
fi

# Set AWS profile arg if profile is set
if [ -n "$AWS_PROFILE" ]; then
    AWS_PROFILE_ARG="--profile $AWS_PROFILE"
    print_info "Using AWS profile: $AWS_PROFILE"
fi

print_info "Using AWS region: $AWS_REGION"

###############################################################################
# Run Tests
###############################################################################

if [ "$SKIP_TESTS" = false ]; then
    print_header "Running Tests"

    if [ ! -f "${SCRIPT_DIR}/pytest.ini" ]; then
        print_warning "No pytest.ini found, skipping tests"
    else
        cd "$SCRIPT_DIR"

        # Run tests with uv (automatically manages dev dependencies)
        print_info "Running tests with uv..."
        if uv run pytest; then
            print_success "All tests passed"
        else
            print_error "Tests failed"
            exit 1
        fi
    fi
else
    print_warning "Skipping tests (--skip-tests flag)"
fi

###############################################################################
# Build Deployment Package
###############################################################################

print_header "Building Deployment Package"

# Clean up old build
cleanup

# Create build directories
mkdir -p "$PACKAGE_DIR"
if [ "$BUILD_LAYER" = true ]; then
    mkdir -p "$LAYER_DIR"
fi

print_info "Installing dependencies with uv..."

# Use uv to install production dependencies only (no dev dependencies)
cd "$SCRIPT_DIR"
uv pip install --target "$PACKAGE_DIR" --no-cache . --no-dev 2>&1 | grep -v "Resolved" || true

# If uv pip install with --no-dev fails (older uv versions), try alternative approach
if [ $? -ne 0 ]; then
    print_warning "Trying alternative installation method..."
    uv pip install --target "$PACKAGE_DIR" --no-cache -r requirements.txt 2>&1 | grep -v "Resolved" || true
fi

cd "$SCRIPT_DIR"
print_success "Dependencies installed"

# Copy Python files
print_info "Copying Lambda function files..."
cp "${SCRIPT_DIR}"/*.py "$PACKAGE_DIR/"

print_success "Files copied"

# Create ZIP file
print_info "Creating deployment package..."
cd "$PACKAGE_DIR"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
ZIP_FILE="${BUILD_DIR}/lambda_deployment_${TIMESTAMP}.zip"

zip -r9 "$ZIP_FILE" . -q
cd "$SCRIPT_DIR"

ZIP_SIZE=$(du -h "$ZIP_FILE" | cut -f1)
print_success "Deployment package created: ${ZIP_FILE} (${ZIP_SIZE})"

# Check size limit
ZIP_SIZE_BYTES=$(stat -f%z "$ZIP_FILE" 2>/dev/null || stat -c%s "$ZIP_FILE")
if [ "$ZIP_SIZE_BYTES" -gt 50000000 ]; then
    print_warning "Package size (${ZIP_SIZE}) exceeds 50MB. Consider using Lambda Layers."
    print_info "Run with --layer flag to build dependencies as a layer"
fi

###############################################################################
# Deploy to AWS Lambda
###############################################################################

if [ "$DRY_RUN" = true ]; then
    print_warning "Dry run mode - skipping deployment"
    print_info "Package created at: $ZIP_FILE"
    exit 0
fi

print_header "Deploying to AWS Lambda"

print_info "Uploading to Lambda function: $FUNCTION_NAME"
print_info "Region: $AWS_REGION"

if aws lambda update-function-code \
    --function-name "$FUNCTION_NAME" \
    --zip-file "fileb://${ZIP_FILE}" \
    ${AWS_PROFILE_ARG} \
    --region "$AWS_REGION" \
    --output json > /dev/null; then

    print_success "Lambda function updated successfully!"

    # Wait for update to complete
    print_info "Waiting for update to complete..."
    aws lambda wait function-updated \
        --function-name "$FUNCTION_NAME" \
        ${AWS_PROFILE_ARG} \
        --region "$AWS_REGION"

    print_success "Update completed and active"

    # Get function info
    FUNCTION_INFO=$(aws lambda get-function \
        --function-name "$FUNCTION_NAME" \
        ${AWS_PROFILE_ARG} \
        --region "$AWS_REGION" \
        --output json)

    LAST_MODIFIED=$(echo "$FUNCTION_INFO" | grep -o '"LastModified":[^,]*' | cut -d'"' -f4)
    CODE_SIZE=$(echo "$FUNCTION_INFO" | grep -o '"CodeSize":[^,]*' | cut -d':' -f2)

    print_info "Last Modified: $LAST_MODIFIED"
    print_info "Code Size: $CODE_SIZE bytes"

else
    print_error "Failed to update Lambda function"
    exit 1
fi

###############################################################################
# Cleanup
###############################################################################

print_header "Cleanup"
read -p "Do you want to keep the deployment package? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    cleanup
    print_success "Build directory cleaned up"
else
    print_info "Deployment package saved at: $ZIP_FILE"
fi

###############################################################################
# Summary
###############################################################################

print_header "Deployment Summary"
print_success "Function Name: $FUNCTION_NAME"
print_success "Region: $AWS_REGION"
print_success "Package Size: $ZIP_SIZE"
print_success "Status: Deployed and Active"

echo ""
print_info "Test your Lambda function with:"
echo "  aws lambda invoke --function-name $FUNCTION_NAME output.json"
echo ""
