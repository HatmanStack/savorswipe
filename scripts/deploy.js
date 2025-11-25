#!/usr/bin/env node

/**
 * SavorSwipe Deployment Script
 *
 * This script:
 * 1. Prompts for AWS region and API keys (or loads from .env.deploy)
 * 2. Saves configuration to samconfig.toml for persistence
 * 3. Runs sam build and sam deploy
 * 4. Captures stack outputs (API Gateway URL)
 * 5. Updates .env file automatically
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const PROJECT_ROOT = path.join(__dirname, '..');
const BACKEND_DIR = path.join(PROJECT_ROOT, 'backend');
const ENV_DEPLOY_PATH = path.join(BACKEND_DIR, '.env.deploy');
const ENV_PATH = path.join(PROJECT_ROOT, '.env');
const SAMCONFIG_PATH = path.join(BACKEND_DIR, 'samconfig.toml');

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Utility to read hidden input (passwords/keys)
function readHiddenInput(prompt) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    const stdout = process.stdout;

    stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    let password = '';
    stdin.on('data', function(char) {
      char = char.toString('utf8');

      switch(char) {
        case '\n':
        case '\r':
        case '\u0004':
          stdin.setRawMode(false);
          stdin.pause();
          stdout.write('\n');
          resolve(password);
          break;
        case '\u0003':
          process.exit();
          break;
        case '\u007F':
        case '\b':
          password = password.slice(0, -1);
          break;
        default:
          password += char;
          break;
      }
    });
  });
}

// Utility to ask a question
function ask(question) {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

// Load existing .env.deploy if it exists
function loadEnvDeploy() {
  const config = {};

  if (fs.existsSync(ENV_DEPLOY_PATH)) {
    console.log('Loading configuration from .env.deploy...\n');
    const content = fs.readFileSync(ENV_DEPLOY_PATH, 'utf8');

    content.split('\n').forEach(line => {
      line = line.trim();
      if (line && !line.startsWith('#')) {
        const [key, ...valueParts] = line.split('=');
        const value = valueParts.join('=').trim();
        config[key.trim()] = value;
      }
    });
  }

  return config;
}

// Save configuration to .env.deploy
function saveEnvDeploy(config) {
  let content = `# AWS Region
AWS_REGION=${config.AWS_REGION}

# OpenAI API Key
OPENAI_KEY=${config.OPENAI_KEY}

# Google Custom Search Configuration
GOOGLE_SEARCH_ID=${config.GOOGLE_SEARCH_ID}
GOOGLE_SEARCH_KEY=${config.GOOGLE_SEARCH_KEY}
`;

  if (config.INCLUDE_DEV_ORIGINS) {
      content += `\n# Include Dev Origins\nINCLUDE_DEV_ORIGINS=${config.INCLUDE_DEV_ORIGINS}\n`;
  }

  fs.writeFileSync(ENV_DEPLOY_PATH, content);
  console.log('✓ Configuration saved to .env.deploy\n');
}

// Generate samconfig.toml (without secrets - they're passed at deploy time)
function generateSamConfig(config) {
  const deployBucket = `sam-deploy-savorswipe-${config.AWS_REGION}`;

  const samconfig = `version = 0.1

[default]
[default.build]
[default.build.parameters]
cached = true
parallel = true
use_container = true

[default.deploy]
[default.deploy.parameters]
stack_name = "savorswipe-lambda"
s3_bucket = "${deployBucket}"
s3_prefix = "savorswipe"
region = "${config.AWS_REGION}"
capabilities = "CAPABILITY_IAM"
confirm_changeset = false
`;

  fs.writeFileSync(SAMCONFIG_PATH, samconfig);
  console.log('✓ Generated samconfig.toml (secrets passed separately at deploy time)\n');
}

// Update .env file with API Gateway URL
function updateEnvFile(apiGatewayUrl) {
  let envContent = '';

  // Read existing .env if it exists
  if (fs.existsSync(ENV_PATH)) {
    envContent = fs.readFileSync(ENV_PATH, 'utf8');
  }

  // Check if EXPO_PUBLIC_API_GATEWAY_URL exists
  const apiUrlPattern = /^EXPO_PUBLIC_API_GATEWAY_URL=.*/m;
  const oldLambdaUrlPattern = /^EXPO_PUBLIC_LAMBDA_FUNCTION_URL=.*/m;

  if (apiUrlPattern.test(envContent)) {
    // Update existing entry
    envContent = envContent.replace(
      apiUrlPattern,
      `EXPO_PUBLIC_API_GATEWAY_URL=${apiGatewayUrl}`
    );
  } else if (oldLambdaUrlPattern.test(envContent)) {
      // Replace old lambda url with new api url key
      envContent = envContent.replace(
        oldLambdaUrlPattern,
        `EXPO_PUBLIC_API_GATEWAY_URL=${apiGatewayUrl}`
      );
  } else {
    // Add new entry
    envContent += `\nEXPO_PUBLIC_API_GATEWAY_URL=${apiGatewayUrl}\n`;
  }

  fs.writeFileSync(ENV_PATH, envContent);
  console.log(`✓ Updated .env with API Gateway URL: ${apiGatewayUrl}\n`);
}

// Execute shell command and stream output
function execCommand(command, cwd = BACKEND_DIR) {
  console.log(`Executing: ${command}\n`);

  try {
    execSync(command, {
      cwd,
      stdio: 'inherit',
      env: process.env
    });
  } catch (error) {
    console.error(`\n✗ Command failed: ${command}`);
    process.exit(1);
  }
}

// Get CloudFormation stack outputs
function getStackOutputs(stackName, region) {
  try {
    const command = `aws cloudformation describe-stacks --stack-name ${stackName} --region ${region} --query 'Stacks[0].Outputs' --output json`;
    const output = execSync(command, { encoding: 'utf8' });
    return JSON.parse(output);
  } catch (error) {
    console.error('✗ Failed to get stack outputs');
    throw error;
  }
}

// Main deployment flow
async function deploy() {
  console.log('===================================');
  console.log('SavorSwipe API Gateway Deployment');
  console.log('===================================\n');

  // Load existing configuration
  const config = loadEnvDeploy();

  // Prompt for missing values
  if (!config.AWS_REGION) {
    config.AWS_REGION = await ask('AWS Region (e.g., us-west-2): ');
  }
  if (!config.AWS_REGION) {
    console.error('✗ AWS Region is required');
    rl.close();
    process.exit(1);
  }

  if (!config.OPENAI_KEY) {
    config.OPENAI_KEY = await readHiddenInput('OpenAI API Key: ');
  }
  if (!config.OPENAI_KEY) {
    console.error('✗ OpenAI API Key is required');
    rl.close();
    process.exit(1);
  }

  if (!config.GOOGLE_SEARCH_ID) {
    config.GOOGLE_SEARCH_ID = await ask('Google Search Engine ID: ');
  }
  if (!config.GOOGLE_SEARCH_ID) {
    console.error('✗ Google Search Engine ID is required');
    rl.close();
    process.exit(1);
  }

  if (!config.GOOGLE_SEARCH_KEY) {
    config.GOOGLE_SEARCH_KEY = await readHiddenInput('Google Search API Key: ');
  }
  if (!config.GOOGLE_SEARCH_KEY) {
    console.error('✗ Google Search API Key is required');
    rl.close();
    process.exit(1);
  }

  // Dev Origins config (optional)
  if (!config.INCLUDE_DEV_ORIGINS) {
      config.INCLUDE_DEV_ORIGINS = 'false';
  }

  rl.close();

  // Display configuration
  console.log('\nUsing configuration:');
  console.log(`  Region: ${config.AWS_REGION}`);
  console.log(`  OpenAI Key: ${config.OPENAI_KEY.substring(0, 8)}...`);
  console.log(`  Google Search ID: ${config.GOOGLE_SEARCH_ID.substring(0, 8)}...`);
  console.log(`  Google Search Key: ${config.GOOGLE_SEARCH_KEY.substring(0, 8)}...`);
  console.log(`  Include Dev Origins: ${config.INCLUDE_DEV_ORIGINS}\n`);

  // Save configuration
  saveEnvDeploy(config);
  generateSamConfig(config);

  // Create S3 deployment bucket if needed
  const deployBucket = `sam-deploy-savorswipe-${config.AWS_REGION}`;
  console.log(`Checking deployment bucket: ${deployBucket}...`);

  try {
    execSync(`aws s3 ls s3://${deployBucket} --region ${config.AWS_REGION}`, { stdio: 'ignore' });
    console.log('✓ Deployment bucket exists\n');
  } catch {
    console.log('Creating deployment bucket...');
    execCommand(`aws s3 mb s3://${deployBucket} --region ${config.AWS_REGION}`);
  }

  // Build Lambda function
  console.log('Building Lambda function with Docker...\n');
  execCommand('sam build --use-container');

  // Deploy to AWS (pass secrets via CLI, not samconfig.toml)
  console.log('\nDeploying to AWS...\n');
  const paramOverrides = `OpenAIApiKey="${config.OPENAI_KEY}" GoogleSearchId="${config.GOOGLE_SEARCH_ID}" GoogleSearchKey="${config.GOOGLE_SEARCH_KEY}" S3BucketName="savorswipe-recipe" IncludeDevOrigins="${config.INCLUDE_DEV_ORIGINS}"`;
  execCommand(`sam deploy --parameter-overrides ${paramOverrides}`);

  // Get API Gateway URL from stack outputs
  console.log('\nRetrieving stack outputs...\n');
  const outputs = getStackOutputs('savorswipe-lambda', config.AWS_REGION);

  const apiGatewayUrlOutput = outputs.find(o => o.OutputKey === 'ApiGatewayUrl');
  if (!apiGatewayUrlOutput) {
    console.error('✗ Could not find ApiGatewayUrl in stack outputs');
    process.exit(1);
  }

  const apiGatewayUrl = apiGatewayUrlOutput.OutputValue;

  // Update .env file
  updateEnvFile(apiGatewayUrl);

  console.log('===================================');
  console.log('Deployment Complete!');
  console.log('===================================\n');
  console.log(`API Gateway URL: ${apiGatewayUrl}\n`);
  console.log('Next steps:');
  console.log('  1. Run "npm start" to start the development server');
  console.log('  2. The app will use the updated API Gateway URL\n');
}

// Run deployment
deploy().catch(error => {
  console.error('\n✗ Deployment failed:', error.message);
  rl.close();
  process.exit(1);
});
