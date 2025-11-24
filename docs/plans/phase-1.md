# Phase 1: Complete Migration

## Phase Goal

Migrate SavorSwipe from Lambda Function URLs to API Gateway v2 HTTP API with explicit routes, centralized CORS, and rate limiting. This phase includes infrastructure changes (SAM template), backend code updates (Lambda handler), deployment script modifications, frontend environment variable updates, comprehensive testing, and documentation updates.

**Success Criteria:**
* API Gateway v2 deployed with explicit routes (GET /recipes, POST /recipe/upload, DELETE /recipe/{recipe_key}, POST /recipe/{recipe_key}/image)
* Lambda Function URLs removed completely
* CORS handled by API Gateway (dev origins configurable, easy to remove)
* Rate limiting active (10 req/sec burst, 1,000 req/day)
* Frontend uses `EXPO_PUBLIC_API_GATEWAY_URL` instead of `EXPO_PUBLIC_LAMBDA_FUNCTION_URL`
* All tests pass (backend pytest, frontend jest, CI)
* Deployment successful to production environment

**Estimated Tokens:** ~90,000

## Prerequisites

### Previous Phases
* Phase 0 completed (architecture decisions reviewed)

### External Dependencies
* AWS account with appropriate permissions (see Phase 0)
* SAM CLI installed and configured
* Node.js v24 LTS and Python 3.13 installed
* Backend `.env.deploy` file with API keys
* S3 bucket `savorswipe-recipe` exists

### Environment Requirements
* Current working directory: `/home/christophergalliart/war/savorswipe`
* Git repository clean (no uncommitted changes recommended)
* AWS CLI configured with credentials

---

## Tasks

### Task 1: Update SAM Template with API Gateway v2

**Goal:** Replace Lambda Function URLs with API Gateway v2 HTTP API, define explicit routes, configure CORS with dev origins parameter, and enable rate limiting.

**Files to Modify/Create:**
* `backend/template.yaml` - SAM template configuration
  * Remove `RecipeProcessorFunctionUrl` resource (lines 59-73)
  * Remove `RecipeProcessorFunctionUrlPermission` resource (lines 76-82)
  * Add `IncludeDevOrigins` parameter
  * Update `HttpApi` resource with CORS, throttling, and $default stage
  * Add explicit route resources (GET /recipes, POST /recipe/upload, DELETE /recipe/{recipe_key}, POST /recipe/{recipe_key}/image)
  * Update `Outputs` section (replace `FunctionUrl` with `ApiGatewayUrl`)

**Prerequisites:**
* Understanding of AWS SAM and CloudFormation syntax
* Review of Phase 0 ADR-002 (Explicit Routes), ADR-003 ($default Stage), ADR-004 (Dev CORS Origins)

**Implementation Steps:**

1. **Add CloudFormation Parameter for Dev Origins**
   * Add `IncludeDevOrigins` parameter (Type: String, AllowedValues: ['true', 'false'], Default: 'false')
   * Add condition `IsDevMode: !Equals [!Ref IncludeDevOrigins, 'true']`
   * This allows easy toggling of localhost origins without code changes

2. **Remove Function URL Resources**
   * Delete `RecipeProcessorFunctionUrl` (AWS::Lambda::Url)
   * Delete `RecipeProcessorFunctionUrlPermission` (AWS::Lambda::Permission)
   * These are incompatible with API Gateway and no longer needed

3. **Update HttpApi Resource**
   * Currently defined at lines 52-56 with basic /{proxy+} route
   * Remove the Events section from the Lambda function (lines 51-56)
   * Define standalone `HttpApi` resource (AWS::ApiGatewayV2::Api)
   * Configure CORS with conditional dev origins:
     ```yaml
     AllowOrigins:
       - 'https://savorswipe.hatstack.fun'
       - !If [IsDevMode, 'http://localhost:8081', !Ref 'AWS::NoValue']
       - !If [IsDevMode, 'http://localhost:19006', !Ref 'AWS::NoValue']
     ```
   * Configure throttling: BurstLimit: 10, RateLimit: 1000
   * Set StageName: $default for clean URLs

4. **Define Lambda Integration**
   * Create `LambdaIntegration` resource (AWS::ApiGatewayV2::Integration)
   * IntegrationType: AWS_PROXY
   * IntegrationUri: ARN of RecipeProcessorFunction
   * PayloadFormatVersion: '2.0'

5. **Create Explicit Routes**
   * `GetRecipesRoute`: GET /recipes (no path parameters)
   * `PostRecipeUploadRoute`: POST /recipe/upload (no path parameters)
   * `DeleteRecipeRoute`: DELETE /recipe/{recipe_key} (path parameter: recipe_key)
   * `PostRecipeImageRoute`: POST /recipe/{recipe_key}/image (path parameter: recipe_key)
   * Each route references the same `LambdaIntegration`

6. **Add Lambda Permission for API Gateway**
   * Create `ApiGatewayInvokePermission` resource (AWS::Lambda::Permission)
   * Allow API Gateway to invoke the Lambda function
   * SourceArn: !Sub 'arn:aws:execute-api:${AWS::Region}:${AWS::AccountId}:${HttpApi}/*'

7. **Update Outputs Section**
   * Remove `FunctionUrl` output
   * Add `ApiGatewayUrl` output with value: !Sub 'https://${HttpApi}.execute-api.${AWS::Region}.amazonaws.com'
   * Keep `FunctionName` and `FunctionArn` outputs unchanged

**Verification Checklist:**
* [ ] Template validates with `sam validate`
* [ ] No references to `RecipeProcessorFunctionUrl` remain
* [ ] `IncludeDevOrigins` parameter exists with default 'false'
* [ ] `IsDevMode` condition correctly uses !Equals
* [ ] HttpApi resource has CORS configuration with conditional dev origins
* [ ] HttpApi resource has throttle settings (BurstLimit: 10, RateLimit: 1000)
* [ ] HttpApi has StageName: $default
* [ ] All four routes are defined (GET /recipes, POST /recipe/upload, DELETE /recipe/{recipe_key}, POST /recipe/{recipe_key}/image)
* [ ] LambdaIntegration uses PayloadFormatVersion 2.0
* [ ] ApiGatewayInvokePermission grants execute-api:Invoke permission
* [ ] Outputs section includes `ApiGatewayUrl` (not `FunctionUrl`)

**Testing Instructions:**

*Unit tests not applicable for CloudFormation templates. Verification happens via deployment.*

**Manual Verification:**
* Run `sam validate --template backend/template.yaml`
* Check for syntax errors or missing references
* Review CORS configuration matches requirements
* Verify all route paths match API design

**Commit Message Template:**
```text
Author & Commiter: HatmanStack
Email: 82614182+HatmanStack@users.noreply.github.com

feat(infra): migrate from Lambda Function URLs to API Gateway v2

Replace Function URLs with API Gateway v2 HTTP API
Add explicit routes for all endpoints (GET /recipes, POST /recipe/upload, DELETE /recipe/{recipe_key}, POST /recipe/{recipe_key}/image)
Configure centralized CORS with conditional dev origins
Enable rate limiting (10 req/sec burst, 1,000 req/day)
Use $default stage for clean URLs
Update outputs to export API Gateway URL
```

---

### Task 2: Update Lambda Handler for API Gateway Integration

**Goal:** Modify Lambda handler to use API Gateway v2 path parameters, remove CORS handling logic, and ensure compatibility with explicit routes.

**Files to Modify:**
* `backend/lambda_function.py` - Lambda handler function
  * Remove `ALLOWED_ORIGIN` constant (line 39)
  * Remove `add_cors_headers()` function (lines 42-61)
  * Remove all calls to `add_cors_headers()` in response handlers
  * Update route handlers to use `event.get('pathParameters', {})` for recipe_key extraction
  * Update `handle_delete_request()` to accept recipe_key parameter
  * Update `handle_post_image_request()` to accept recipe_key parameter

**Prerequisites:**
* Task 1 completed (SAM template updated)
* Understanding of API Gateway v2 event structure
* Review of Phase 0 ADR-007 (Lambda Event Structure Changes)

**Implementation Steps:**

1. **Remove CORS Handling Code**
   * Delete `ALLOWED_ORIGIN = 'https://savorswipe.hatstack.fun'` constant
   * Delete entire `add_cors_headers()` function (lines 42-61)
   * API Gateway now handles CORS, so this is redundant
   * Lambda responses should only include business logic headers (Content-Type)

2. **Update Response Handlers**
   * Search for all `add_cors_headers()` calls in the file
   * Remove these calls from all return statements
   * Ensure responses still include `statusCode` and `body`
   * Example transformation:
     ```python
     # OLD:
     return add_cors_headers({
         'statusCode': 200,
         'body': json.dumps({'success': True})
     }, event.get('headers', {}).get('origin'))

     # NEW:
     return {
         'statusCode': 200,
         'headers': {'Content-Type': 'application/json'},
         'body': json.dumps({'success': True})
     }
     ```

3. **Update Path Parameter Extraction**
   * Locate `handle_delete_request()` function (currently parses path manually)
   * Change signature to accept `recipe_key` as parameter
   * Update `lambda_handler()` to extract recipe_key from `event.get('pathParameters', {})`
   * Same for `handle_post_image_request()` function
   * Path parameter extraction pattern:
     ```python
     path_params = event.get('pathParameters', {})
     recipe_key = path_params.get('recipe_key')
     if not recipe_key:
         return {
             'statusCode': 400,
             'body': json.dumps({'error': 'Missing recipe_key'})
         }
     ```

4. **Update Route Dispatching Logic**
   * The `lambda_handler()` function currently checks `method` and `path` patterns
   * Update DELETE route handler to use pathParameters instead of regex parsing
   * Update POST /recipe/{recipe_key}/image handler similarly
   * Keep GET /recipes and POST /recipe/upload unchanged (no path parameters)

5. **Remove Origin Validation**
   * Search for any origin checking logic (related to `ALLOWED_ORIGIN`)
   * Remove these checks since API Gateway CORS handles origin validation
   * Lambda should trust that API Gateway has already validated the request

6. **Update Error Responses**
   * Ensure all error responses (400, 404, 500) include `Content-Type` header
   * Remove any CORS headers from error responses
   * Maintain consistent error response format: `{'error': 'message'}`

**Verification Checklist:**
* [ ] `ALLOWED_ORIGIN` constant removed
* [ ] `add_cors_headers()` function removed
* [ ] No calls to `add_cors_headers()` remain in the file
* [ ] All responses include `Content-Type: application/json` header
* [ ] No responses include CORS headers (Access-Control-*)
* [ ] `handle_delete_request()` accepts `recipe_key` parameter
* [ ] `handle_post_image_request()` accepts `recipe_key` parameter
* [ ] `lambda_handler()` extracts recipe_key from `event.get('pathParameters', {})`
* [ ] Missing recipe_key returns 400 error
* [ ] GET /recipes handler unchanged (no path parameters)
* [ ] POST /recipe/upload handler unchanged (no path parameters)

**Testing Instructions:**

**Unit Tests:**
* No new unit tests required (CORS removal doesn't affect business logic)
* Existing unit tests in `backend/tests/test_*.py` should continue to pass
* If any tests mock CORS headers, update them to remove CORS expectations

**Integration Tests (`backend/tests/test_integration_endpoints.py`):**
* Update test event fixtures to use API Gateway v2 format
* Add `pathParameters` to DELETE and POST /recipe/{id}/image tests
* Remove any assertions checking for CORS headers in responses
* Add test cases for missing pathParameters (expect 400)
* Parametrize tests for all four routes

**Example Test Pattern:**
```python
def test_delete_recipe_with_path_parameter():
    event = {
        'requestContext': {
            'http': {
                'method': 'DELETE',
                'path': '/recipe/test-123'
            }
        },
        'pathParameters': {'recipe_key': 'test-123'},
        'headers': {},
        'body': None
    }
    response = lambda_handler(event, {})
    assert response['statusCode'] == 200
    assert 'Access-Control-Allow-Origin' not in response.get('headers', {})
```

**Run Tests:**
* `cd backend && pytest tests/test_integration_endpoints.py -v`
* Ensure all integration tests pass
* Check coverage: `pytest --cov=lambda_function tests/`

**Commit Message Template:**
```text
Author & Commiter: HatmanStack
Email: 82614182+HatmanStack@users.noreply.github.com

refactor(backend): remove CORS handling and use API Gateway path parameters

Remove ALLOWED_ORIGIN constant and add_cors_headers function
Update response handlers to exclude CORS headers
Extract recipe_key from event pathParameters for DELETE and POST routes
Update handle_delete_request and handle_post_image_request signatures
Simplify Lambda code by delegating CORS to API Gateway
```

---

### Task 3: Update Backend Integration Tests

**Goal:** Update backend integration tests to use API Gateway v2 event format, test path parameter extraction, and remove CORS header assertions.

**Files to Modify/Create:**
* `backend/tests/test_integration_endpoints.py` - Integration tests for Lambda handler
  * Update event fixtures to include `pathParameters`
  * Remove CORS header assertions from response checks
  * Add test cases for missing path parameters (400 errors)
  * Add parametrized tests for all four routes
* `backend/tests/conftest.py` - Shared test fixtures
  * Add API Gateway v2 event builder fixture
  * Add parametrized fixture for different routes

**Prerequisites:**
* Task 2 completed (Lambda handler updated)
* Understanding of pytest fixtures and parametrization
* Review existing test patterns in `backend/tests/`

**Implementation Steps:**

1. **Create API Gateway v2 Event Builder Fixture**
   * Add fixture to `conftest.py` for building test events
   * Should accept method, path, path_params, headers, body
   * Returns properly formatted API Gateway v2 event structure
   * Example signature: `build_apigw_event(method, path, path_params=None, body=None)`

2. **Update DELETE Recipe Tests**
   * Locate tests for `handle_delete_request()`
   * Update event to include `pathParameters: {'recipe_key': 'test-key'}`
   * Remove assertions for CORS headers
   * Add test case for missing recipe_key (expect 400)
   * Add test case for invalid recipe_key format (expect 400)

3. **Update POST Recipe Image Tests**
   * Locate tests for `handle_post_image_request()`
   * Update event to include `pathParameters: {'recipe_key': 'test-key'}`
   * Remove CORS header assertions
   * Add test for missing recipe_key (expect 400)

4. **Update GET Recipes Tests**
   * Verify tests don't expect CORS headers
   * No path parameters needed (route has none)
   * Ensure response structure is valid

5. **Update POST Recipe Upload Tests**
   * Verify tests don't expect CORS headers
   * No path parameters needed
   * Ensure multi-file upload tests still pass

6. **Add Parametrized Route Tests**
   * Create parametrized test that verifies all routes are handled correctly
   * Test matrix: (method, path, expected_status)
   * Verify 404 for undefined routes
   * Verify 405 for wrong methods

7. **Remove CORS-Specific Tests**
   * Search for tests specifically checking CORS behavior
   * Remove or update these tests (CORS now handled by API Gateway)
   * If tests verify origin validation, remove them

**Verification Checklist:**
* [ ] `build_apigw_event()` fixture exists in conftest.py
* [ ] All event fixtures use API Gateway v2 format
* [ ] DELETE tests include pathParameters with recipe_key
* [ ] POST /recipe/{id}/image tests include pathParameters
* [ ] GET /recipes tests have no pathParameters
* [ ] POST /recipe/upload tests have no pathParameters
* [ ] No tests assert CORS headers in responses
* [ ] Tests for missing pathParameters return 400
* [ ] Parametrized test covers all four routes
* [ ] All tests pass: `pytest backend/tests/ -v`

**Testing Instructions:**

**Run Backend Tests:**
```bash
cd backend
pytest tests/test_integration_endpoints.py -v
pytest tests/test_lambda_function.py -v
pytest tests/ -v  # Run all tests
```

**Coverage Check:**
```bash
pytest --cov=lambda_function --cov-report=term-missing tests/
```

**CI Simulation:**
```bash
# Ensure tests pass without AWS credentials (using moto mocks)
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN
pytest tests/ -v
```

**Expected Results:**
* All tests pass
* Coverage remains high (>90% for lambda_function.py)
* No tests depend on CORS headers

**Commit Message Template:**
```text
Author & Commiter: HatmanStack
Email: 82614182+HatmanStack@users.noreply.github.com

test(backend): update integration tests for API Gateway v2 event format

Add build_apigw_event fixture for consistent event creation
Update DELETE and POST /recipe/{id}/image tests with pathParameters
Remove CORS header assertions from all response checks
Add test cases for missing path parameters (400 errors)
Add parametrized tests for all four routes
Ensure tests pass with mocked AWS services (moto)
```

---

### Task 4: Update Deployment Scripts

**Goal:** Modify both deployment scripts (bash and Node.js) to extract API Gateway URL from CloudFormation outputs and update `.env` with the new environment variable name.

**Files to Modify:**
* `backend/deploy.sh` - Bash deployment script
  * Update CloudFormation output query from `FunctionUrl` to `ApiGatewayUrl`
  * Update `.env` variable from `EXPO_PUBLIC_LAMBDA_FUNCTION_URL` to `EXPO_PUBLIC_API_GATEWAY_URL`
  * Update echo messages to reference API Gateway
* `scripts/deploy.js` - Node.js deployment script
  * Update CloudFormation output query
  * Update `.env` variable name
  * Update console output messages

**Prerequisites:**
* Task 1 completed (SAM template outputs `ApiGatewayUrl`)
* Understanding of AWS CLI CloudFormation commands
* Understanding of file I/O in bash and Node.js

**Implementation Steps:**

1. **Update backend/deploy.sh**
   * Locate the CloudFormation describe-stacks query (line 95)
   * Change output key from `FunctionUrl` to `ApiGatewayUrl`
   * Update echo messages (lines 101-105) to say "API Gateway URL" instead of "Function URL"
   * Update .env variable name in echo message (line 105)
   * Example:
     ```bash
     # OLD:
     FUNCTION_URL=$(aws cloudformation describe-stacks \
         --stack-name savorswipe-lambda \
         --query 'Stacks[0].Outputs[?OutputKey==`FunctionUrl`].OutputValue' \
         --output text)
     echo "EXPO_PUBLIC_LAMBDA_FUNCTION_URL=$FUNCTION_URL"

     # NEW:
     API_URL=$(aws cloudformation describe-stacks \
         --stack-name savorswipe-lambda \
         --query 'Stacks[0].Outputs[?OutputKey==`ApiGatewayUrl`].OutputValue' \
         --output text)
     echo "EXPO_PUBLIC_API_GATEWAY_URL=$API_URL"
     ```

2. **Update scripts/deploy.js**
   * Locate the CloudFormation outputs parsing (around line 95)
   * Change output key from `FunctionUrl` to `ApiGatewayUrl`
   * Update variable names: `functionUrl` → `apiGatewayUrl`
   * Locate .env file update logic (lines 151-162)
   * Update pattern matching for `EXPO_PUBLIC_LAMBDA_FUNCTION_URL` to `EXPO_PUBLIC_API_GATEWAY_URL`
   * Update the replacement string
   * Update console.log messages to reference API Gateway

3. **Test Script Locally (Dry Run)**
   * Read through both scripts to identify all references
   * Use grep to find any missed occurrences:
     ```bash
     grep -n "LAMBDA_FUNCTION_URL" backend/deploy.sh scripts/deploy.js
     grep -n "FunctionUrl" backend/deploy.sh scripts/deploy.js
     grep -n "Function URL" backend/deploy.sh scripts/deploy.js
     ```
   * Ensure no old references remain

4. **Update Script Comments**
   * Update any comments referencing Function URLs
   * Update script description headers if they mention Function URLs

**Verification Checklist:**
* [ ] `backend/deploy.sh` queries for `ApiGatewayUrl` output
* [ ] `backend/deploy.sh` uses variable name `API_URL` or `API_GATEWAY_URL`
* [ ] `backend/deploy.sh` echo message references API Gateway
* [ ] `backend/deploy.sh` no references to "Function URL" or "FunctionUrl"
* [ ] `scripts/deploy.js` queries for `ApiGatewayUrl` output
* [ ] `scripts/deploy.js` uses variable name `apiGatewayUrl`
* [ ] `scripts/deploy.js` updates `.env` with `EXPO_PUBLIC_API_GATEWAY_URL`
* [ ] `scripts/deploy.js` console messages reference API Gateway
* [ ] `scripts/deploy.js` no references to "LAMBDA_FUNCTION_URL"
* [ ] Grep confirms no missed references in either script

**Testing Instructions:**

**Manual Verification (Pre-Deployment):**
* Run `bash -n backend/deploy.sh` to check bash syntax
* Run `node scripts/deploy.js --help` to verify Node.js script runs
* Review changes with `git diff backend/deploy.sh scripts/deploy.js`

**Actual Deployment Test:**
* After Task 1-3 are complete and committed
* Run `cd backend && ./deploy.sh` (or `npm run deploy` from root)
* Verify script completes successfully
* Check `.env` file contains `EXPO_PUBLIC_API_GATEWAY_URL=https://...`
* Verify URL format matches API Gateway (not Lambda Function URL)
  * API Gateway: `https://abc123.execute-api.us-west-2.amazonaws.com`
  * Function URL: `https://abc123.lambda-url.us-west-2.on.aws/`
* Manually test the URL: `curl https://<api-gateway-url>/recipes`

**Commit Message Template:**
```text
Author & Commiter: HatmanStack
Email: 82614182+HatmanStack@users.noreply.github.com

chore(deploy): update deployment scripts for API Gateway URL

Update backend/deploy.sh to query ApiGatewayUrl output
Update scripts/deploy.js to extract API Gateway URL
Change .env variable from EXPO_PUBLIC_LAMBDA_FUNCTION_URL to EXPO_PUBLIC_API_GATEWAY_URL
Update console messages to reference API Gateway
Remove all references to Function URLs
```

---

### Task 5: Update Frontend Service Files

**Goal:** Rename `EXPO_PUBLIC_LAMBDA_FUNCTION_URL` to `EXPO_PUBLIC_API_GATEWAY_URL` in all frontend service files that make API calls.

**Files to Modify:**
* `services/RecipeService.ts` - Three references (lines 27, 30, 155, 158, 214, 217)
* `services/UploadService.ts` - Two references (lines 250, 252)

**Prerequisites:**
* Task 4 completed (deployment scripts updated)
* Understanding of TypeScript and environment variables
* Review of how Expo handles environment variables

**Implementation Steps:**

1. **Update services/RecipeService.ts**
   * Line 27: Change `const lambdaUrl = process.env.EXPO_PUBLIC_LAMBDA_FUNCTION_URL;`
     to `const apiUrl = process.env.EXPO_PUBLIC_API_GATEWAY_URL;`
   * Line 30: Update error message to reference `EXPO_PUBLIC_API_GATEWAY_URL`
   * Repeat for lines 155, 158, 214, 217 (in different functions)
   * Update variable names from `lambdaUrl` to `apiUrl` for clarity
   * Ensure all fetch calls use the updated variable

2. **Update services/UploadService.ts**
   * Line 250: Change `const LAMBDA_URL = this._testLambdaUrl || process.env.EXPO_PUBLIC_LAMBDA_FUNCTION_URL`
     to `const API_URL = this._testApiUrl || process.env.EXPO_PUBLIC_API_GATEWAY_URL`
   * Line 252: Update error message
   * Update variable name `LAMBDA_URL` to `API_URL` throughout the function
   * Update `_testLambdaUrl` property to `_testApiUrl` (for test mocking)

3. **Update Type Definitions**
   * If UploadService has TypeScript interface with `_testLambdaUrl` property
   * Rename to `_testApiUrl`
   * Check for any JSDoc comments referencing the old name

4. **Search for Other References**
   * Use grep to find any missed references in services:
     ```bash
     grep -rn "LAMBDA_FUNCTION_URL" services/
     grep -rn "lambdaUrl" services/
     ```
   * Update any found references

**Verification Checklist:**
* [ ] `services/RecipeService.ts` uses `EXPO_PUBLIC_API_GATEWAY_URL`
* [ ] Variable names changed from `lambdaUrl` to `apiUrl` in RecipeService
* [ ] Error messages reference new env var name
* [ ] `services/UploadService.ts` uses `EXPO_PUBLIC_API_GATEWAY_URL`
* [ ] Variable names changed from `LAMBDA_URL` to `API_URL` in UploadService
* [ ] `_testLambdaUrl` renamed to `_testApiUrl`
* [ ] No references to `EXPO_PUBLIC_LAMBDA_FUNCTION_URL` remain in services/
* [ ] TypeScript compilation succeeds: `npx tsc --noEmit`

**Testing Instructions:**

**Unit Tests:**
* Tests updated in next task (Task 6)
* For now, verify TypeScript compilation: `npx tsc --noEmit`

**Manual Verification:**
* Update local `.env` with `EXPO_PUBLIC_API_GATEWAY_URL=http://localhost:3000` (placeholder)
* Run app: `npm start`
* Check for env var errors in Metro bundler output
* Verify app starts without crashing

**Commit Message Template:**
```text
Author & Commiter: HatmanStack
Email: 82614182+HatmanStack@users.noreply.github.com

refactor(frontend): rename environment variable to EXPO_PUBLIC_API_GATEWAY_URL

Update RecipeService to use EXPO_PUBLIC_API_GATEWAY_URL
Update UploadService to use EXPO_PUBLIC_API_GATEWAY_URL
Rename variables from lambdaUrl/LAMBDA_URL to apiUrl/API_URL
Update error messages to reference new env var name
Rename _testLambdaUrl to _testApiUrl for test mocking
```

---

### Task 6: Update Frontend Tests

**Goal:** Update all frontend test files to use the new environment variable name, ensuring tests pass with the renamed variable.

**Files to Modify:**
* `jest.setup.js` - Global test setup (line 6)
* `services/__tests__/RecipeService.test.ts` - Service tests (multiple references)
* Any other test files that reference the old env var

**Prerequisites:**
* Task 5 completed (service files updated)
* Understanding of Jest configuration and mocking
* Review of existing test patterns

**Implementation Steps:**

1. **Update jest.setup.js**
   * Line 6: Change `process.env.EXPO_PUBLIC_LAMBDA_FUNCTION_URL = 'https://placeholder-lambda-url.execute-api.us-east-1.amazonaws.com';`
     to `process.env.EXPO_PUBLIC_API_GATEWAY_URL = 'https://placeholder-api-gateway-url.execute-api.us-east-1.amazonaws.com';`
   * This sets default for all tests

2. **Update services/__tests__/RecipeService.test.ts**
   * Find all references to `EXPO_PUBLIC_LAMBDA_FUNCTION_URL`
   * Line 13: Update `Object.defineProperty` for env var mocking
   * Line 21: Update delete statement
   * Lines 55, 59, 445, 450, 546, 550: Update env var name in tests
   * Update test descriptions if they mention "lambda function URL"

3. **Search for Other Test References**
   * Use grep to find any missed references:
     ```bash
     grep -rn "LAMBDA_FUNCTION_URL" . --include="*.test.ts" --include="*.test.tsx"
     ```
   * Update all found references

4. **Update Test Descriptions**
   * Search for test descriptions mentioning "Lambda" or "function URL"
   * Update to "API Gateway" for clarity
   * Example: "should throw error when LAMBDA_FUNCTION_URL not set"
     → "should throw error when API_GATEWAY_URL not set"

5. **Update Mock URLs**
   * Any hardcoded mock URLs in tests should use API Gateway format
   * API Gateway: `https://abc123.execute-api.us-west-2.amazonaws.com`
   * Not Lambda: `https://abc123.lambda-url.us-west-2.on.aws/`

**Verification Checklist:**
* [ ] `jest.setup.js` sets `EXPO_PUBLIC_API_GATEWAY_URL`
* [ ] `services/__tests__/RecipeService.test.ts` uses new env var name
* [ ] All test descriptions updated to reference API Gateway
* [ ] No references to `EXPO_PUBLIC_LAMBDA_FUNCTION_URL` in test files
* [ ] Mock URLs use API Gateway format (execute-api, not lambda-url)
* [ ] All frontend tests pass: `npm test`
* [ ] TypeScript compilation succeeds: `npx tsc --noEmit`

**Testing Instructions:**

**Run Frontend Tests:**
```bash
npm test -- --watchAll=false
```

**Run Specific Test Files:**
```bash
npm test -- services/__tests__/RecipeService.test.ts
npm test -- services/__tests__/UploadService.test.ts
```

**Check Coverage:**
```bash
npm test -- --coverage --watchAll=false
```

**Expected Results:**
* All tests pass
* No errors about missing EXPO_PUBLIC_LAMBDA_FUNCTION_URL
* Coverage remains consistent (no drop)

**Commit Message Template:**
```text
Author & Commiter: HatmanStack
Email: 82614182+HatmanStack@users.noreply.github.com

test(frontend): update tests for renamed environment variable

Update jest.setup.js to set EXPO_PUBLIC_API_GATEWAY_URL
Update RecipeService.test.ts to use new env var name
Update test descriptions to reference API Gateway
Update mock URLs to use API Gateway format
Ensure all frontend tests pass with renamed variable
```

---

### Task 7: Update Documentation

**Goal:** Update all documentation files to reference API Gateway instead of Lambda Function URLs, including setup instructions, environment variable names, and architecture descriptions.

**Files to Modify:**
* `README.md` - Main project README (line 65)
* `DEPLOYMENT.md` - Deployment guide (lines 73, 113)
* `CLAUDE.md` - Claude Code guidance (multiple references)
* `TEST_PICTURE_PICKER.md` - Test documentation (line 8)

**Prerequisites:**
* All previous tasks completed (infrastructure and code updated)
* Understanding of project documentation structure

**Implementation Steps:**

1. **Update README.md**
   * Line 65: Change `EXPO_PUBLIC_LAMBDA_FUNCTION_URL=<lambda url for backend>`
     to `EXPO_PUBLIC_API_GATEWAY_URL=<api gateway url for backend>`
   * Update any architectural descriptions mentioning Lambda Function URLs
   * Update "Backend Architecture" section if it mentions Function URLs

2. **Update DEPLOYMENT.md**
   * Line 73: Update example .env to use `EXPO_PUBLIC_API_GATEWAY_URL`
   * Line 113: Update deployment script output description
   * Add note about API Gateway URL format (execute-api subdomain)
   * Update any troubleshooting sections that reference Function URLs

3. **Update CLAUDE.md**
   * Search for all occurrences of "Lambda Function URL" or "LAMBDA_FUNCTION_URL"
   * Update Environment Configuration section with new variable name
   * Update Backend Architecture section to mention API Gateway v2
   * Add note about explicit routes vs. proxy pattern
   * Update Lambda API Endpoints section to document:
     * GET /recipes (not GET /)
     * POST /recipe/upload (not POST /)
     * DELETE /recipe/{recipe_key}
     * POST /recipe/{recipe_key}/image
   * Update any troubleshooting or common issues sections

4. **Update TEST_PICTURE_PICKER.md**
   * Line 8: Update env var name in setup instructions

5. **Add API Gateway Migration Notes**
   * Consider adding a new section to DEPLOYMENT.md or CLAUDE.md
   * Document the migration from Function URLs to API Gateway
   * Include rollback instructions if needed
   * Document CORS configuration (dev origins parameter)
   * Document rate limiting settings

6. **Update Architecture Diagrams**
   * If any markdown diagrams exist showing Function URL flow
   * Update to show API Gateway → Lambda flow

**Verification Checklist:**
* [ ] `README.md` uses `EXPO_PUBLIC_API_GATEWAY_URL`
* [ ] `DEPLOYMENT.md` uses new env var name
* [ ] `DEPLOYMENT.md` describes API Gateway URL format
* [ ] `CLAUDE.md` updated in all relevant sections
* [ ] `CLAUDE.md` documents explicit routes (GET /recipes, POST /recipe/upload, etc.)
* [ ] `CLAUDE.md` mentions API Gateway v2 in Backend Architecture
* [ ] `TEST_PICTURE_PICKER.md` uses new env var name
* [ ] No references to "Lambda Function URL" or "LAMBDA_FUNCTION_URL" remain
* [ ] All markdown files render correctly (no broken formatting)
* [ ] URLs in examples use API Gateway format (execute-api subdomain)

**Testing Instructions:**

**Manual Review:**
* Read through each updated documentation file
* Verify all environment variable examples are correct
* Check that API Gateway is mentioned where appropriate
* Ensure no outdated Lambda Function URL references remain

**Link Verification:**
* If documentation includes links to AWS console or docs
* Verify links point to API Gateway documentation (not Lambda URLs)

**Grep Verification:**
```bash
grep -rn "LAMBDA_FUNCTION_URL" *.md
grep -rn "Function URL" *.md
grep -rn "lambda-url" *.md
```

**Expected Results:**
* No matches for old environment variable name
* No references to Lambda Function URLs
* All documentation consistent with API Gateway architecture

**Commit Message Template:**
```text
Author & Commiter: HatmanStack
Email: 82614182+HatmanStack@users.noreply.github.com

docs: update documentation for API Gateway migration

Update README.md environment variable name
Update DEPLOYMENT.md with API Gateway URL format
Update CLAUDE.md backend architecture section
Document explicit API routes (GET /recipes, POST /recipe/upload, DELETE /recipe/{key}, POST /recipe/{key}/image)
Update TEST_PICTURE_PICKER.md setup instructions
Remove all references to Lambda Function URLs
Add notes about CORS configuration and rate limiting
```

---

### Task 8: Update CI Configuration

**Goal:** Update GitHub Actions workflow to use the new environment variable name in test configuration.

**Files to Modify:**
* `.github/workflows/*.yml` - CI workflow files (if they reference the env var)

**Prerequisites:**
* Task 6 completed (frontend tests updated)
* Understanding of GitHub Actions workflow syntax

**Implementation Steps:**

1. **Search for Env Var References in CI**
   * Check all workflow files:
     ```bash
     grep -rn "LAMBDA_FUNCTION_URL" .github/workflows/
     ```
   * If no references found, this task may be complete (jest.setup.js handles it)

2. **Update Workflow Files (if needed)**
   * If any workflows set `EXPO_PUBLIC_LAMBDA_FUNCTION_URL` explicitly
   * Update to `EXPO_PUBLIC_API_GATEWAY_URL`
   * Ensure test placeholder URL is API Gateway format

3. **Verify Test Execution**
   * CI should run tests with env var from jest.setup.js
   * No need for explicit env var in workflow unless overriding

4. **Update Workflow Comments**
   * If comments mention Lambda Function URLs
   * Update to reference API Gateway

**Verification Checklist:**
* [ ] No references to `EXPO_PUBLIC_LAMBDA_FUNCTION_URL` in .github/workflows/
* [ ] If env var is set in workflow, it uses `EXPO_PUBLIC_API_GATEWAY_URL`
* [ ] Workflow comments updated to reference API Gateway
* [ ] No changes needed if jest.setup.js handles all test env vars

**Testing Instructions:**

**Local CI Simulation:**
* Run tests without local .env file (simulates CI environment)
  ```bash
  mv .env .env.backup
  npm test -- --watchAll=false
  mv .env.backup .env
  ```
* Tests should pass using jest.setup.js defaults

**GitHub Actions Verification:**
* After committing, push to a test branch
* Verify CI workflow runs successfully
* Check that tests pass in CI environment

**Commit Message Template:**
```text
Author & Commiter: HatmanStack
Email: 82614182+HatmanStack@users.noreply.github.com

ci: update GitHub Actions for renamed environment variable

Update workflow files to use EXPO_PUBLIC_API_GATEWAY_URL
Remove references to EXPO_PUBLIC_LAMBDA_FUNCTION_URL
Ensure CI tests run with correct env var from jest.setup.js
```

---

### Task 9: Deploy and Verify Migration

**Goal:** Deploy the complete migration to AWS, verify all endpoints work correctly, test CORS from production domain, and validate rate limiting.

**Files to Modify/Create:**
* None (deployment and testing only)

**Prerequisites:**
* All previous tasks completed (1-8)
* All tests passing locally
* All commits made with conventional commit format
* AWS credentials configured

**Implementation Steps:**

1. **Pre-Deployment Checks**
   * Run all tests: `npm test -- --watchAll=false && cd backend && pytest tests/ -v`
   * Verify TypeScript compiles: `npx tsc --noEmit`
   * Run linter: `npm run lint`
   * Verify SAM template: `sam validate --template backend/template.yaml`
   * Check git status: all changes committed

2. **Deploy to AWS**
   * Run deployment script: `cd backend && ./deploy.sh`
   * Or: `npm run deploy` (if configured)
   * Provide configuration when prompted (or use .env.deploy)
   * Important: Set `IncludeDevOrigins=false` for production
   * Monitor deployment progress
   * Note the API Gateway URL from output

3. **Update Local .env File**
   * Deployment script should auto-update `.env`
   * Verify: `cat .env | grep EXPO_PUBLIC_API_GATEWAY_URL`
   * URL should be in format: `https://xyz123.execute-api.us-west-2.amazonaws.com`

4. **Verify API Gateway Deployment**
   * AWS Console → API Gateway → APIs
   * Find "savorswipe-lambda-HttpApi-*"
   * Check Routes tab: should see 4 routes (GET /recipes, POST /recipe/upload, DELETE /recipe/{recipe_key}, POST /recipe/{recipe_key}/image)
   * Check CORS tab: should see production origin only (if IncludeDevOrigins=false)
   * Check Throttling: should see 10 burst, 1000 rate

5. **Test GET /recipes Endpoint**
   * From terminal: `curl https://<api-gateway-url>/recipes`
   * Should return JSON with recipe data
   * Verify response includes recipes from S3
   * Check response time (should be reasonable)

6. **Test CORS from Browser**
   * Open production domain: `https://savorswipe.hatstack.fun`
   * Open browser console
   * Verify app loads recipe data without CORS errors
   * Check Network tab: OPTIONS preflight should succeed
   * Verify Access-Control-Allow-Origin header in response

7. **Test Rate Limiting**
   * Write simple script to make rapid requests:
     ```bash
     for i in {1..15}; do
       curl -w "%{http_code}\n" https://<api-gateway-url>/recipes -o /dev/null -s
       sleep 0.05
     done
     ```
   * Should see 200 responses for first 10 requests
   * Should see 429 (Too Many Requests) for requests 11-15
   * Wait 1 second, retry: should work again

8. **Test Upload Endpoint**
   * Use app to upload a test recipe (image or PDF)
   * Verify upload succeeds
   * Check S3: new recipe should appear in jsondata/combined_data.json
   * Verify recipe appears in app after refresh

9. **Test Delete Endpoint**
   * Use app to delete a test recipe (via image picker modal)
   * Verify deletion succeeds
   * Check S3: recipe should be removed from combined_data.json
   * Verify recipe no longer appears in app

10. **Test Image Selection Endpoint**
    * Upload recipe that triggers image picker
    * Select image from grid
    * Verify image selection succeeds
    * Verify recipe appears in swipe queue with selected image

11. **Monitor CloudWatch Metrics**
    * AWS Console → CloudWatch → Metrics
    * Navigate to API Gateway namespace
    * Check for metrics: Count, Latency, 4XXError, 5XXError
    * Should see request count increasing
    * Should see 429 errors if rate limit testing was done

12. **Verify Function URL is Gone**
    * AWS Console → Lambda → Functions → savorswipe-recipe-add
    * Configuration tab → Function URL: should not exist
    * If Function URL still exists, deployment may have failed

13. **Test from Mobile Device**
    * Update Expo app (rebuild if needed)
    * Test swipe functionality
    * Test search functionality
    * Test upload functionality
    * Verify no errors in logs

**Verification Checklist:**
* [ ] Deployment completed successfully
* [ ] API Gateway URL in .env file (format: execute-api subdomain)
* [ ] Four routes visible in API Gateway console
* [ ] CORS configured correctly (production origin only for prod)
* [ ] Rate limiting visible in API Gateway settings
* [ ] GET /recipes returns data via curl
* [ ] CORS works from production domain (no browser errors)
* [ ] Rate limiting triggers 429 after 10 rapid requests
* [ ] Upload endpoint works via app
* [ ] Delete endpoint works via app
* [ ] Image selection endpoint works via app
* [ ] CloudWatch metrics show API Gateway traffic
* [ ] Lambda Function URL no longer exists
* [ ] App functions correctly on mobile device

**Testing Instructions:**

**Automated Verification Script:**
Create a simple test script to verify endpoints:

```bash
#!/bin/bash
API_URL="<your-api-gateway-url>"

echo "Testing GET /recipes..."
curl -s -o /dev/null -w "%{http_code}\n" "$API_URL/recipes"

echo "Testing rate limiting..."
for i in {1..15}; do
  curl -s -o /dev/null -w "%{http_code}\n" "$API_URL/recipes"
done
```

**Manual Testing Checklist:**
* [ ] Open production app, browse recipes (CORS test)
* [ ] Search for recipes (API connectivity)
* [ ] Upload test recipe (POST endpoint)
* [ ] Delete test recipe (DELETE endpoint)
* [ ] Select image for recipe (POST /recipe/{id}/image)
* [ ] No console errors or network failures
* [ ] Rate limit message appears after rapid actions (if triggered)

**Rollback Plan (if needed):**
If deployment fails or critical issues found:
1. Revert git commits: `git revert <commit-range>`
2. Redeploy previous version: `cd backend && ./deploy.sh`
3. Update .env with old Lambda Function URL (if available)
4. Report issues and debug before retrying

**Commit Message Template:**
```text
Author & Commiter: HatmanStack
Email: 82614182+HatmanStack@users.noreply.github.com

chore: verify API Gateway migration deployment

Deploy updated SAM template to AWS
Verify all API Gateway routes functional
Test CORS from production domain
Validate rate limiting (10 req/sec burst, 1000 req/day)
Confirm Lambda Function URL removed
Test all endpoints (GET /recipes, POST /recipe/upload, DELETE /recipe/{key}, POST /recipe/{key}/image)
Monitor CloudWatch metrics for API Gateway traffic
```

---

## Phase Verification

### How to Verify Phase is Complete

**All Tasks Completed:**
* [ ] Task 1: SAM template updated with API Gateway v2
* [ ] Task 2: Lambda handler updated (CORS removed, pathParameters used)
* [ ] Task 3: Backend integration tests updated
* [ ] Task 4: Deployment scripts updated
* [ ] Task 5: Frontend service files updated
* [ ] Task 6: Frontend tests updated
* [ ] Task 7: Documentation updated
* [ ] Task 8: CI configuration updated
* [ ] Task 9: Deployed and verified in production

**Test Suite Results:**
```bash
# Backend tests
cd backend && pytest tests/ -v
# Expected: All tests pass (69 unit tests across 6 modules)

# Frontend tests
npm test -- --watchAll=false
# Expected: All tests pass (50+ tests)

# Linting
npm run lint
# Expected: No errors

# TypeScript
npx tsc --noEmit
# Expected: No errors
```

**Production Verification:**
* [ ] API Gateway URL accessible via curl
* [ ] All four routes return appropriate responses
* [ ] CORS works from production domain
* [ ] Rate limiting triggers after 10 requests/sec
* [ ] Mobile app functions correctly
* [ ] CloudWatch shows API Gateway metrics
* [ ] No Lambda Function URL exists

**Documentation Verification:**
* [ ] No references to `EXPO_PUBLIC_LAMBDA_FUNCTION_URL` in codebase
* [ ] No references to "Lambda Function URL" in documentation
* [ ] All URLs use API Gateway format (execute-api subdomain)

**Git Verification:**
* [ ] All changes committed with conventional commit format
* [ ] Commit messages reference correct scope (infra, backend, frontend, deploy, tests, docs, ci)
* [ ] Each commit is atomic (tests pass after each commit)
* [ ] Commit author and email are HatmanStack

### Integration Points to Test

**Frontend ↔ API Gateway:**
* Recipe loading (GET /recipes)
* Recipe upload (POST /recipe/upload with multi-file)
* Recipe deletion (DELETE /recipe/{recipe_key})
* Image selection (POST /recipe/{recipe_key}/image)

**API Gateway ↔ Lambda:**
* Request routing based on method and path
* Path parameter extraction ({recipe_key})
* CORS headers added automatically
* Rate limiting enforced at API Gateway level

**Lambda ↔ S3:**
* Reading combined_data.json
* Writing updated recipe data
* Uploading images
* Deleting recipe entries

**CloudFront ↔ S3:**
* Image delivery via CloudFront
* Recipe metadata delivery
* No changes needed (existing functionality)

### Known Limitations and Technical Debt

**API Gateway Rate Limiting:**
* Rate limits apply to entire stage, not per-IP
* For per-IP limiting, AWS WAF would be needed (additional cost)
* Current limits (10 req/sec, 1000 req/day) are conservative
* May need adjustment based on real usage patterns

**Dev Origins in Production:**
* Risk of accidentally deploying with `IncludeDevOrigins=true`
* Mitigation: Parameter defaults to `false`, clear documentation
* Consider adding deployment script warning

**No Custom Domain:**
* Using default API Gateway URL (execute-api subdomain)
* Harder to remember than custom domain
* Can add custom domain later if needed (ACM cert + Route53)

**No Access Logs:**
* Only basic CloudWatch metrics enabled
* Can't see individual request details without logs
* Trade-off: cost savings vs. debugging capability
* Can enable access logs later if needed

**Hard Cutover:**
* No gradual traffic shifting or A/B testing
* Rollback requires redeployment
* Mitigation: Thorough testing before deployment

**Function URL Removal:**
* Old Function URL becomes invalid immediately
* No grace period for clients using old URL
* Mitigation: Single client (frontend) with atomic update

## Token Estimate Breakdown

* Task 1 (SAM Template): ~8,000 tokens
* Task 2 (Lambda Handler): ~6,000 tokens
* Task 3 (Backend Tests): ~8,000 tokens
* Task 4 (Deployment Scripts): ~4,000 tokens
* Task 5 (Frontend Services): ~3,000 tokens
* Task 6 (Frontend Tests): ~4,000 tokens
* Task 7 (Documentation): ~5,000 tokens
* Task 8 (CI Config): ~2,000 tokens
* Task 9 (Deploy & Verify): ~10,000 tokens
* Phase overhead (context, discussion): ~40,000 tokens

**Phase 1 Total:** ~90,000 tokens

## Next Steps

This is the final implementation phase. After completion:
1. Monitor production for issues
2. Adjust rate limits if needed based on usage
3. Consider removing dev origins if in production
4. Document any lessons learned
5. Update runbooks or operational docs if needed

**Future Enhancements (Out of Scope):**
* Custom domain with ACM certificate
* Per-route rate limiting (stricter on uploads)
* Access logs for detailed debugging
* X-Ray tracing for distributed tracing
* AWS WAF for per-IP rate limiting
* API versioning (v1, v2 stages)
