#!/bin/bash
###############################################################################
# Simple SAM Deployment Script for SavorSwipe Lambda
#
# First time: Run with --guided to set up configuration
# Subsequent: Just run ./deploy-simple.sh
###############################################################################

set -e

cd "$(dirname "${BASH_SOURCE[0]}")"

echo "Building Lambda function..."
sam build --template template.yaml --use-container

if [ "$1" == "--guided" ]; then
    echo "Running guided deployment (first time setup)..."
    sam deploy --guided
else
    echo "Deploying with saved configuration..."
    sam deploy
fi

echo ""
echo "✓ Deployment complete!"
echo ""
echo "To get the Lambda URL:"
echo "  aws cloudformation describe-stacks --stack-name <your-stack-name> --query 'Stacks[0].Outputs[?OutputKey==\`FunctionUrl\`].OutputValue' --output text"
