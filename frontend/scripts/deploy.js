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

const PROJECT_ROOT = path.join(__dirname, '..', '..');
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

    // Create a named function so we can remove it later
    function onData(char) {
      char = char.toString('utf8');

      switch(char) {
        case '\n':
        case '\r':
        case '\u0004':
          stdin.setRawMode(false);
          stdin.pause();
          stdin.removeListener('data', onData); // Clean up listener
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
    }

    stdin.on('data', onData);
  });
}

// Utility to ask a question
function ask(question) {
  return new Promise((resolve) => {
    // Ensure stdin is resumed for readline (in case it was paused by readHiddenInput)
    if (process.stdin.isPaused()) {
      process.stdin.resume();
    }
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
  let content = `# Stack Name
STACK_NAME=${config.STACK_NAME}

# AWS Region
AWS_REGION=${config.AWS_REGION}

# OpenAI API Key
OPENAI_KEY=${config.OPENAI_KEY}

# Google Custom Search Configuration
GOOGLE_SEARCH_ID=${config.GOOGLE_SEARCH_ID}
GOOGLE_SEARCH_KEY=${config.GOOGLE_SEARCH_KEY}

# Include Dev Origins (allows all origins for local development)
INCLUDE_DEV_ORIGINS=${config.INCLUDE_DEV_ORIGINS || 'false'}

# Production Origins (comma-separated list of allowed origins for CORS)
# Example: https://myapp.example.com,https://www.myapp.example.com
PRODUCTION_ORIGINS=${config.PRODUCTION_ORIGINS || ''}
`;

  fs.writeFileSync(ENV_DEPLOY_PATH, content);
  console.log('✓ Configuration saved to .env.deploy\n');
}

// Generate samconfig.toml (without secrets - they're passed at deploy time)
function generateSamConfig(config) {
  const deployBucket = `sam-deploy-${config.STACK_NAME}-${config.AWS_REGION}`;
  const stackName = `${config.STACK_NAME}-stack`;

  const samconfig = `version = 0.1

[default]
[default.build]
[default.build.parameters]
cached = true
parallel = true
use_container = true

[default.deploy]
[default.deploy.parameters]
stack_name = "${stackName}"
s3_bucket = "${deployBucket}"
s3_prefix = "${config.STACK_NAME}"
region = "${config.AWS_REGION}"
capabilities = "CAPABILITY_IAM"
confirm_changeset = false
`;

  fs.writeFileSync(SAMCONFIG_PATH, samconfig);
  console.log('✓ Generated samconfig.toml (secrets passed separately at deploy time)\n');
}

// Upload starter data to S3 (images and combined_data.json)
function uploadStarterData(s3BucketName, region) {
  const starterDataDir = path.join(PROJECT_ROOT, 'frontend', 'assets', 'starter_data');

  // Check if starter data directory exists
  if (!fs.existsSync(starterDataDir)) {
    console.log('No starter data found, skipping initial data upload\n');
    return;
  }

  console.log('Uploading starter data to S3...\n');

  // Upload combined_data.json to jsondata/
  const jsonFile = path.join(starterDataDir, 'combined_data.json');
  if (fs.existsSync(jsonFile)) {
    try {
      execSync(
        `aws s3 cp "${jsonFile}" s3://${s3BucketName}/jsondata/combined_data.json --region ${region}`,
        { stdio: 'inherit' }
      );
      console.log('✓ Uploaded combined_data.json to jsondata/\n');
    } catch (error) {
      console.error('✗ Failed to upload combined_data.json:', error.message);
    }
  }

  // Upload image files to images/
  const imageFiles = fs.readdirSync(starterDataDir).filter(f => f.endsWith('.jpg'));
  if (imageFiles.length > 0) {
    console.log(`Uploading ${imageFiles.length} starter images...\n`);
    imageFiles.forEach(imageFile => {
      const imagePath = path.join(starterDataDir, imageFile);
      try {
        execSync(
          `aws s3 cp "${imagePath}" s3://${s3BucketName}/images/${imageFile} --region ${region}`,
          { stdio: 'inherit' }
        );
      } catch (error) {
        console.error(`✗ Failed to upload ${imageFile}:`, error.message);
      }
    });
    console.log(`✓ Uploaded ${imageFiles.length} images to images/\n`);
  }

  // Upload recipe_embeddings.json to jsondata/
  const embeddingsFile = path.join(starterDataDir, 'recipe_embeddings.json');
  if (fs.existsSync(embeddingsFile)) {
    try {
      execSync(
        `aws s3 cp "${embeddingsFile}" s3://${s3BucketName}/jsondata/recipe_embeddings.json --region ${region}`,
        { stdio: 'inherit' }
      );
      console.log('✓ Uploaded recipe_embeddings.json to jsondata/\n');
    } catch (error) {
      console.error('✗ Failed to upload recipe_embeddings.json:', error.message);
    }
  } else {
    // Create empty one if starter file doesn't exist
    console.log('No recipe_embeddings.json in starter_data, creating empty file...');
    const emptyEmbeddings = path.join(PROJECT_ROOT, '.tmp_embeddings.json');
    fs.writeFileSync(emptyEmbeddings, '{}');
    try {
      execSync(
        `aws s3 cp "${emptyEmbeddings}" s3://${s3BucketName}/jsondata/recipe_embeddings.json --region ${region}`,
        { stdio: 'inherit' }
      );
      console.log('✓ Created empty recipe_embeddings.json\n');
    } finally {
      fs.unlinkSync(emptyEmbeddings);
    }
  }
}

// Update .env file with API Gateway URL and CloudFront URL
function updateEnvFile(apiGatewayUrl, cloudFrontUrl) {
  let envContent = '';

  // Read existing .env if it exists
  if (fs.existsSync(ENV_PATH)) {
    envContent = fs.readFileSync(ENV_PATH, 'utf8');
  }

  // Update or add API Gateway URL
  const apiUrlPattern = /^EXPO_PUBLIC_API_GATEWAY_URL=.*/m;
  const oldLambdaUrlPattern = /^EXPO_PUBLIC_LAMBDA_FUNCTION_URL=.*/m;

  if (apiUrlPattern.test(envContent)) {
    envContent = envContent.replace(apiUrlPattern, `EXPO_PUBLIC_API_GATEWAY_URL=${apiGatewayUrl}`);
  } else if (oldLambdaUrlPattern.test(envContent)) {
    envContent = envContent.replace(oldLambdaUrlPattern, `EXPO_PUBLIC_API_GATEWAY_URL=${apiGatewayUrl}`);
  } else {
    envContent += `\nEXPO_PUBLIC_API_GATEWAY_URL=${apiGatewayUrl}\n`;
  }

  // Update or add CloudFront URL
  const cloudFrontPattern = /^EXPO_PUBLIC_CLOUDFRONT_BASE_URL=.*/m;

  if (cloudFrontPattern.test(envContent)) {
    envContent = envContent.replace(cloudFrontPattern, `EXPO_PUBLIC_CLOUDFRONT_BASE_URL=${cloudFrontUrl}`);
  } else {
    envContent += `EXPO_PUBLIC_CLOUDFRONT_BASE_URL=${cloudFrontUrl}\n`;
  }

  fs.writeFileSync(ENV_PATH, envContent);
  console.log(`✓ Updated .env with API Gateway URL: ${apiGatewayUrl}`);
  console.log(`✓ Updated .env with CloudFront URL: ${cloudFrontUrl}\n`);
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
  console.log('=======================================');
  console.log('SavorSwipe Complete Stack Deployment');
  console.log('=======================================\n');

  // Load existing configuration
  const config = loadEnvDeploy();

  // Set defaults for missing values
  const defaults = {
    STACK_NAME: config.STACK_NAME || 'savorswipe',
    AWS_REGION: config.AWS_REGION || 'us-west-2',
    OPENAI_KEY: config.OPENAI_KEY || '',
    GOOGLE_SEARCH_ID: config.GOOGLE_SEARCH_ID || '',
    GOOGLE_SEARCH_KEY: config.GOOGLE_SEARCH_KEY || '',
    INCLUDE_DEV_ORIGINS: config.INCLUDE_DEV_ORIGINS || 'false',
    PRODUCTION_ORIGINS: config.PRODUCTION_ORIGINS || '',
  };

  // Helper to mask sensitive values for display
  const maskValue = (val) => val ? `${val.substring(0, 8)}...` : '(not set)';

  // Prompt for stack name
  const stackNameInput = await ask(`Stack Name [${defaults.STACK_NAME}]: `);
  config.STACK_NAME = stackNameInput.trim() || defaults.STACK_NAME;

  // Validate stack name format
  if (!/^[a-z][a-z0-9-]*$/.test(config.STACK_NAME)) {
    console.error('✗ Stack name must start with lowercase letter and contain only lowercase letters, numbers, and hyphens');
    rl.close();
    process.exit(1);
  }

  // Prompt for AWS region
  const regionInput = await ask(`AWS Region [${defaults.AWS_REGION}]: `);
  config.AWS_REGION = regionInput.trim() || defaults.AWS_REGION;
  if (!config.AWS_REGION) {
    console.error('✗ AWS Region is required');
    rl.close();
    process.exit(1);
  }

  // Prompt for OpenAI API Key
  const openaiPrompt = defaults.OPENAI_KEY
    ? `OpenAI API Key [${maskValue(defaults.OPENAI_KEY)}]: `
    : 'OpenAI API Key: ';
  const openaiInput = await readHiddenInput(openaiPrompt);
  config.OPENAI_KEY = openaiInput.trim() || defaults.OPENAI_KEY;
  if (!config.OPENAI_KEY) {
    console.error('✗ OpenAI API Key is required');
    rl.close();
    process.exit(1);
  }

  // Prompt for Google Search Engine ID
  const searchIdPrompt = defaults.GOOGLE_SEARCH_ID
    ? `Google Search Engine ID [${maskValue(defaults.GOOGLE_SEARCH_ID)}]: `
    : 'Google Search Engine ID: ';
  const searchIdInput = await ask(searchIdPrompt);
  config.GOOGLE_SEARCH_ID = searchIdInput.trim() || defaults.GOOGLE_SEARCH_ID;
  if (!config.GOOGLE_SEARCH_ID) {
    console.error('✗ Google Search Engine ID is required');
    rl.close();
    process.exit(1);
  }

  // Prompt for Google Search API Key
  const searchKeyPrompt = defaults.GOOGLE_SEARCH_KEY
    ? `Google Search API Key [${maskValue(defaults.GOOGLE_SEARCH_KEY)}]: `
    : 'Google Search API Key: ';
  const searchKeyInput = await readHiddenInput(searchKeyPrompt);
  config.GOOGLE_SEARCH_KEY = searchKeyInput.trim() || defaults.GOOGLE_SEARCH_KEY;
  if (!config.GOOGLE_SEARCH_KEY) {
    console.error('✗ Google Search API Key is required');
    rl.close();
    process.exit(1);
  }

  // Prompt for dev origins (optional)
  const devOriginsInput = await ask(`Include Dev Origins (allows all origins) [${defaults.INCLUDE_DEV_ORIGINS}]: `);
  config.INCLUDE_DEV_ORIGINS = devOriginsInput.trim() || defaults.INCLUDE_DEV_ORIGINS;

  // Prompt for production origins
  const prodOriginsDisplay = defaults.PRODUCTION_ORIGINS || '(none)';
  console.log('\nProduction Origins: Comma-separated list of allowed origins for CORS');
  console.log('Example: https://myapp.example.com,https://www.myapp.example.com');
  const prodOriginsInput = await ask(`Production Origins [${prodOriginsDisplay}]: `);
  config.PRODUCTION_ORIGINS = prodOriginsInput.trim() || defaults.PRODUCTION_ORIGINS;

  rl.close();

  // Display configuration
  console.log('\nUsing configuration:');
  console.log(`  Stack Name: ${config.STACK_NAME}`);
  console.log(`  Region: ${config.AWS_REGION}`);
  console.log(`  OpenAI Key: ${config.OPENAI_KEY.substring(0, 8)}...`);
  console.log(`  Google Search ID: ${config.GOOGLE_SEARCH_ID.substring(0, 8)}...`);
  console.log(`  Google Search Key: ${config.GOOGLE_SEARCH_KEY.substring(0, 8)}...`);
  console.log(`  Include Dev Origins: ${config.INCLUDE_DEV_ORIGINS}`);
  console.log(`  Production Origins: ${config.PRODUCTION_ORIGINS || '(none)'}\n`);

  // Save configuration
  saveEnvDeploy(config);
  generateSamConfig(config);

  // Create S3 deployment bucket if needed
  const deployBucket = `sam-deploy-${config.STACK_NAME}-${config.AWS_REGION}`;
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

  // Deploy to AWS (pass secrets and stack name via CLI)
  console.log('\nDeploying to AWS...\n');
  const productionOrigins = config.PRODUCTION_ORIGINS || '';
  const paramOverrides = `StackName="${config.STACK_NAME}" OpenAIApiKey="${config.OPENAI_KEY}" GoogleSearchId="${config.GOOGLE_SEARCH_ID}" GoogleSearchKey="${config.GOOGLE_SEARCH_KEY}" IncludeDevOrigins="${config.INCLUDE_DEV_ORIGINS}" ProductionOrigins="${productionOrigins}"`;
  execCommand(`sam deploy --parameter-overrides ${paramOverrides}`);

  // Get stack outputs
  console.log('\nRetrieving stack outputs...\n');
  const stackName = `${config.STACK_NAME}-stack`;
  const outputs = getStackOutputs(stackName, config.AWS_REGION);

  const apiGatewayUrlOutput = outputs.find(o => o.OutputKey === 'ApiGatewayUrl');
  const cloudFrontUrlOutput = outputs.find(o => o.OutputKey === 'CloudFrontUrl');
  const s3BucketOutput = outputs.find(o => o.OutputKey === 'S3BucketName');

  if (!apiGatewayUrlOutput || !cloudFrontUrlOutput || !s3BucketOutput) {
    console.error('✗ Required outputs not found in stack');
    console.error('Missing:', {
      apiGateway: !apiGatewayUrlOutput,
      cloudFront: !cloudFrontUrlOutput,
      s3Bucket: !s3BucketOutput
    });
    process.exit(1);
  }

  const apiGatewayUrl = apiGatewayUrlOutput.OutputValue;
  const cloudFrontUrl = cloudFrontUrlOutput.OutputValue;
  const s3BucketName = s3BucketOutput.OutputValue;

  // Update .env file with both URLs
  updateEnvFile(apiGatewayUrl, cloudFrontUrl);

  // Upload starter data to S3
  uploadStarterData(s3BucketName, config.AWS_REGION);

  console.log('============================================');
  console.log('Deployment Complete!');
  console.log('============================================\n');
  console.log('Stack Resources:');
  console.log(`  S3 Bucket:       ${s3BucketName}`);
  console.log(`  CloudFront URL:  ${cloudFrontUrl}`);
  console.log(`  API Gateway URL: ${apiGatewayUrl}\n`);
  console.log('Next steps:');
  console.log('1. Your .env file has been updated automatically');
  console.log('2. Starter recipes and images have been uploaded to S3');
  console.log('3. Run "npm start" to start your app\n');
}

// Run deployment
deploy().catch(error => {
  console.error('\n✗ Deployment failed:', error.message);
  rl.close();
  process.exit(1);
});
