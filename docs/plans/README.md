# API Gateway v2 Migration Implementation Plan

## Feature Overview

This plan outlines the migration from AWS Lambda Function URLs to API Gateway v2 HTTP API for the SavorSwipe backend. The migration will provide centralized CORS management, rate limiting, and explicit RESTful routing while maintaining backward compatibility during a hard cutover deployment strategy.

The current architecture uses Lambda Function URLs with CORS handling in the Lambda code. The new architecture will leverage API Gateway v2's native CORS support, throttling capabilities, and explicit route definitions (GET /recipes, POST /recipe/upload, DELETE /recipe/{recipe_key}, POST /recipe/{recipe_key}/image) to create a more scalable and maintainable API infrastructure.

This migration involves infrastructure changes (SAM template), backend code updates (Lambda handler), deployment script modifications, frontend environment variable updates, comprehensive testing, and documentation updates. The entire migration is designed as a single atomic operation to ensure consistency.

## Prerequisites

### Required Tools
* AWS CLI configured with appropriate credentials and permissions
* AWS SAM CLI (Serverless Application Model)
* Node.js v24 LTS (via nvm)
* Python 3.13 (via uv)
* npm for package management

### Required Permissions
* Lambda: CreateFunction, UpdateFunctionCode, UpdateFunctionConfiguration, DeleteFunction
* API Gateway: CreateApi, CreateRoute, CreateIntegration, UpdateApi, DeleteApi
* CloudWatch: PutMetricData, CreateLogGroup (for basic metrics)
* S3: Access to deployment bucket (sam-deploy-savorswipe-*)
* CloudFormation: CreateStack, UpdateStack, DescribeStacks

### Environment Setup
* Backend: `.env.deploy` with AWS_REGION, OPENAI_KEY, GOOGLE_SEARCH_ID, GOOGLE_SEARCH_KEY
* Frontend: `.env` will be auto-updated by deployment script
* S3 bucket: `savorswipe-recipe` must exist

## Phase Summary

| Phase | Goal | Token Estimate | Status |
|-------|------|----------------|--------|
| Phase-0 | Foundation - Architecture decisions, deployment strategy, testing approach | ~10,000 | Not Started |
| Phase-1 | Complete Migration - Infrastructure, backend, frontend, tests, documentation | ~90,000 | Not Started |

**Total Estimated Tokens:** ~100,000

## Navigation

* **[Phase 0: Foundation](./phase-0.md)** - Architecture decisions, deployment script specifications, testing strategy
* **[Phase 1: Complete Migration](./phase-1.md)** - Implementation tasks for infrastructure, backend, frontend, tests, and documentation

## Notes

* **Hard Cutover Strategy:** This migration removes Lambda Function URLs completely in a single deployment. No gradual transition period.
* **Branch Agnostic:** This plan does not specify which git branch to use. Engineers should follow their team's branching strategy.
* **Token Optimization:** Phases are combined to fit within ~100k token context windows for efficient implementation.
* **CI Restrictions:** GitHub Actions runs linting, unit tests, and mocked integration tests only. Deployment happens locally via `npm run deploy`.
