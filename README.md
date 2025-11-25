<div align="center" style="display: block;margin-left: auto;margin-right: auto;width: 70%;">
<h1>Savor Swipe</h1>

<h4 align="center">
<a href="https://www.apache.org/licenses/LICENSE-2.0.html"><img src="https://img.shields.io/badge/license-Apache2.0-blue" alt="savorswipe is under the Apache 2.0 liscense" /></a><a hre>
</h4>
<p align="center">
  <p align="center"><b>From Cravings to Cooking - Swipe, Discover, Repeat!<br> <a href="https://savorswipe.hatstack.fun"> SavorSwipe » </a> </b> </p>
</p>
<h1 align="center">
  <img width="400" src="docs/banner.jpg" alt="savorswipe-app icon">
</h1>
<p>Swipe left to discover mouthwatering food photos
and right to reveal the complete recipe—ingredients with directions.
Search for recipes by name or ingredients to find exactly what you're craving.
Upload a picture of your own directions, ingredients or recipe to join it to the swipe list. </p>
</div>

## Structure

```
├── frontend/   # Expo/React Native client
├── backend/    # AWS Lambda serverless API
├── docs/       # Documentation
└── tests/      # Centralized test suites
```

## Prerequisites

- **Node.js** v18+ (v24 LTS recommended)
- **AWS CLI** configured with credentials (`aws configure`)
- **AWS SAM CLI** for serverless deployment
- **Python 3.11+** for backend Lambda functions

## Quick Start

```bash
npm install     # Install dependencies
npm run deploy  # Deploy backend (required before first run)
npm start       # Start Expo dev server
npm run check   # Run all lint and tests
```

## Deployment

```bash
npm run deploy
```

The deploy script prompts for configuration on each run:

| Prompt | Description |
|--------|-------------|
| Stack Name | CloudFormation stack name (default: savorswipe) |
| AWS Region | Deployment region (default: us-east-1) |
| Environment | `dev` (CORS wildcard) or `prod` (restricted origins) |
| Production Origins | Comma-separated allowed origins for prod (e.g., `https://myapp.com`) |

Defaults are saved to `.env.deploy` and shown in brackets. Press Enter to accept.

See [docs/README.md](docs/README.md) for full documentation.
