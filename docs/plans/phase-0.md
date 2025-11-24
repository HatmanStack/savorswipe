# Phase 0: Foundation

## Overview

This phase establishes the architectural foundation, design decisions, deployment strategy, and testing patterns that apply to all subsequent implementation phases. These decisions form the "law" that guides the entire migration from Lambda Function URLs to API Gateway v2 HTTP API.

## Architecture Decision Records (ADRs)

### ADR-001: API Gateway v2 over Function URLs

**Status:** Accepted

**Context:**
The current implementation uses AWS Lambda Function URLs for direct HTTP access. While simple, Function URLs lack centralized CORS management, rate limiting, and explicit routing visibility.

**Decision:**
Migrate to API Gateway v2 (HTTP API) to gain:
* Centralized CORS configuration (vs. in-Lambda CORS logic)
* Native throttling and rate limiting (10 req/sec burst, 1,000 req/day per IP)
* Explicit route definitions for better API visibility
* CloudWatch metrics for monitoring

**Consequences:**
* Positive: Cleaner Lambda code (no CORS logic), better observability, protection against abuse
* Negative: Slightly increased AWS costs (~$1/million requests), added infrastructure complexity
* Neutral: Event structure changes (Lambda receives API Gateway v2 format)

### ADR-002: Explicit Routes over Proxy+ Pattern

**Status:** Accepted

**Context:**
The current SAM template includes an unused HttpApi event with `/{proxy+}` pattern. Lambda code handles routing internally based on HTTP method and path parsing.

**Decision:**
Define explicit routes in API Gateway:
* `GET /recipes` - Fetch all recipe metadata
* `POST /recipe/upload` - Upload and process recipes
* `DELETE /recipe/{recipe_key}` - Delete a recipe
* `POST /recipe/{recipe_key}/image` - Select image for recipe

**Consequences:**
* Positive: Clear API structure in AWS Console, better documentation, path parameters provided by API Gateway
* Negative: Lambda code must be updated to use `event['pathParameters']` instead of path parsing
* Neutral: More verbose SAM template, but clearer intent

### ADR-003: $default Stage for Clean URLs

**Status:** Accepted

**Context:**
API Gateway stages can be explicit (e.g., `prod`, `v1`) or use the special `$default` stage.

**Decision:**
Use `$default` stage to produce cleaner URLs without stage prefix:
* With $default: `https://abc123.execute-api.us-west-2.amazonaws.com/recipes`
* With prod: `https://abc123.execute-api.us-west-2.amazonaws.com/prod/recipes`

**Consequences:**
* Positive: Cleaner URLs, simpler for frontend
* Negative: No built-in stage separation (must use separate stacks for dev/prod)
* Neutral: Requires explicit `StageName: $default` in SAM template

### ADR-004: Development CORS Origins with Easy Removal

**Status:** Accepted

**Context:**
Production only allows `https://savorswipe.hatstack.fun`. Local development requires localhost origins.

**Decision:**
Use CloudFormation parameter `IncludeDevOrigins` (default: false) to control CORS origins:
* When true: Allow production + localhost:8081 + localhost:19006
* When false: Allow only production origin

Engineers set this parameter via `.env.deploy` file (`INCLUDE_DEV_ORIGINS=true` for local dev) which deployment scripts pass to SAM via `--parameter-overrides`.

**Consequences:**
* Positive: Easy local testing, explicit opt-in for dev origins, safe production default
* Negative: Requires updating .env.deploy for local development
* Mitigation: Clear documentation in deployment scripts and DEPLOYMENT.md

### ADR-005: Basic Rate Limiting Strategy

**Status:** Accepted

**Context:**
API Gateway v2 supports throttling at the stage and route level. Need to balance abuse protection with legitimate usage.

**Decision:**
Conservative rate limits for the entire API stage (applies to ALL traffic, not per-IP):
* Burst: 10 requests/second
* Quota: 1,000 requests/day

Applied uniformly to all routes (no per-route differentiation initially).

**Consequences:**
* Positive: Protection against abuse, simple to implement
* Negative: May need adjustment based on real usage patterns
* Future: Can add per-route limits if needed (e.g., stricter on POST /recipe/upload)

### ADR-006: Environment Variable Rename

**Status:** Accepted

**Context:**
Current env var `EXPO_PUBLIC_LAMBDA_FUNCTION_URL` is technically inaccurate after API Gateway migration.

**Decision:**
Rename to `EXPO_PUBLIC_API_GATEWAY_URL` across:
* Frontend code (services, tests)
* Documentation (README, DEPLOYMENT.md, CLAUDE.md)
* Deployment scripts (deploy.sh, scripts/deploy.js)
* CI configuration (jest.setup.js, GitHub Actions)

**Consequences:**
* Positive: Accurate naming, clearer intent
* Negative: Requires coordinated updates across many files
* Mitigation: Atomic commit with all changes together

### ADR-007: Lambda Event Structure Changes

**Status:** Accepted

**Context:**
Lambda Function URLs provide event structure with `requestContext.http.method` and `requestContext.http.path`. API Gateway v2 provides similar structure but with `pathParameters` for route variables.

**Decision:**
Update Lambda handler to:
* Continue using `event['requestContext']['http']['method']` (compatible)
* Continue using `event['requestContext']['http']['path']` for logging
* Use `event.get('pathParameters', {})` for route variables (e.g., `recipe_key`)
* Remove CORS handling (`add_cors_headers` function and `ALLOWED_ORIGIN` constant)

**Consequences:**
* Positive: Cleaner Lambda code, leverages API Gateway features
* Negative: Lambda code is now tightly coupled to API Gateway (can't use Function URLs)
* Neutral: Event structure is similar enough to minimize changes

## Design Decisions

### Deployment Script Architecture

**Current State:**
* Two deployment scripts: `backend/deploy.sh` (bash) and `scripts/deploy.js` (Node.js)
* Both prompt for configuration and save to `.env.deploy`
* Both run `sam build` and `sam deploy`
* Both extract Function URL from CloudFormation outputs
* Both update `.env` with `EXPO_PUBLIC_LAMBDA_FUNCTION_URL`

**New Design:**
* Keep both scripts (bash for simplicity, Node.js for cross-platform)
* Update to extract API Gateway URL from CloudFormation outputs
* Change output key from `FunctionUrl` to `ApiGatewayUrl`
* Update `.env` with `EXPO_PUBLIC_API_GATEWAY_URL`
* No changes to configuration prompting or `samconfig.toml` generation

**Script Flow:**
```text
1. Load config from .env.deploy (or prompt if missing)
2. Save config to .env.deploy for persistence
3. Generate samconfig.toml programmatically
4. Run: sam build --use-container
5. Run: sam deploy (no --guided, use samconfig.toml)
6. Query CloudFormation outputs for ApiGatewayUrl
7. Update .env with EXPO_PUBLIC_API_GATEWAY_URL=<url>
8. Display success message with URL
```

### CORS Configuration

**API Gateway CORS (centralized):**
```yaml
Cors:
  AllowOrigins:
    - https://savorswipe.hatstack.fun
    - !If [IncludeDevOrigins, 'http://localhost:8081', !Ref AWS::NoValue]
    - !If [IncludeDevOrigins, 'http://localhost:19006', !Ref AWS::NoValue]
  AllowMethods:
    - GET
    - POST
    - DELETE
    - OPTIONS
  AllowHeaders:
    - Content-Type
  MaxAge: 300
```

**Lambda CORS (removed):**
* Delete `ALLOWED_ORIGIN` constant
* Delete `add_cors_headers()` function
* Remove all calls to `add_cors_headers()` from response handling

### Rate Limiting Configuration

**Throttle Settings:**
```yaml
ThrottleSettings:
  BurstLimit: 10    # requests per second
  RateLimit: 1000   # requests per day (converted to per-second in AWS)
```

Note: API Gateway measures rate in requests per second, so 1,000 req/day = ~0.0116 req/sec steady state with 10 req/sec burst capacity.

**Applied At:**
* Stage level (applies to all routes uniformly)
* Can be overridden per-route in future if needed

### Route-to-Lambda Integration

**Pattern:**
Each route integrates with the same Lambda function but provides different path parameters:

```yaml
# Example: DELETE /recipe/{recipe_key}
DeleteRecipeRoute:
  Type: AWS::ApiGatewayV2::Route
  Properties:
    ApiId: !Ref HttpApi
    RouteKey: 'DELETE /recipe/{recipe_key}'
    Target: !Sub 'integrations/${LambdaIntegration}'
```

**Lambda Handler:**
```python
def lambda_handler(event, context):
    method = event['requestContext']['http']['method']
    path = event['requestContext']['http']['path']
    path_params = event.get('pathParameters', {})

    if method == 'DELETE' and '/recipe/' in path:
        recipe_key = path_params.get('recipe_key')
        return handle_delete_request(recipe_key)
    # ... other routes
```

## Tech Stack and Libraries

### Infrastructure (No Changes)
* AWS SAM (Serverless Application Model)
* CloudFormation for infrastructure as code
* Python 3.13 runtime for Lambda
* API Gateway v2 (HTTP API) - **NEW**

### Backend (No Changes)
* Python 3.13
* boto3 for AWS SDK
* OpenAI API for OCR
* Google Custom Search API for image search
* moto for AWS mocking in tests
* pytest for unit tests

### Frontend (No Changes)
* Expo / React Native
* TypeScript
* Jest for unit tests
* React Native Testing Library

### Deployment (No Changes)
* AWS SAM CLI
* Bash script (backend/deploy.sh)
* Node.js script (scripts/deploy.js)

## Testing Strategy

### Backend Testing

**Unit Tests (`backend/tests/`):**
* Test individual functions in isolation
* Mock AWS services with moto (S3, CloudWatch)
* Mock external APIs (OpenAI, Google)
* Target: 100% coverage of business logic

**Integration Tests (`backend/tests/test_integration_endpoints.py`):**
* Test Lambda handler with mocked event structures
* Use API Gateway v2 event format (NOT Function URL format)
* Mock S3, but test actual Lambda handler logic
* Verify route handling (GET /recipes, POST /recipe/upload, etc.)
* Verify path parameter extraction works correctly

**Example API Gateway v2 Event:**
```python
{
    'requestContext': {
        'http': {
            'method': 'DELETE',
            'path': '/recipe/test-recipe-123'
        }
    },
    'pathParameters': {
        'recipe_key': 'test-recipe-123'
    },
    'headers': {},
    'body': None
}
```

**Test Patterns:**
* Use pytest fixtures for common event structures
* Parametrize tests for multiple routes
* Assert CORS headers are NOT added by Lambda (API Gateway's job)
* Verify error responses (400, 404, 500) match API Gateway format

### Frontend Testing

**Unit Tests (`services/__tests__/`):**
* Test service methods with mocked fetch responses
* Verify `EXPO_PUBLIC_API_GATEWAY_URL` is used correctly
* Test error handling (network errors, API errors)
* Mock AsyncStorage for UploadPersistence tests

**Integration Tests (`__tests__/integration/`):**
* Test full flows with mocked API Gateway responses
* Verify upload flow works end-to-end (with mocks)
* Test error scenarios (rate limit errors, 500 responses)

**Test Updates Required:**
* Update jest.setup.js to set `EXPO_PUBLIC_API_GATEWAY_URL` instead of `EXPO_PUBLIC_LAMBDA_FUNCTION_URL`
* Update service tests to reference new env var
* No functional changes to test logic (API responses are identical)

### CI Pipeline Testing

**GitHub Actions (`.github/workflows/`):**
* Run `npm run lint` (ESLint)
* Run `npm test` (Jest unit + integration tests with mocks)
* Run `cd backend && pytest` (Python unit + integration tests with moto)
* **DO NOT deploy** - CI is restricted to testing only
* Tests must pass without live AWS resources

**Local Deployment Testing:**
* Manual testing required after `npm run deploy`
* Verify all routes work in production
* Test CORS from production domain
* Test rate limiting (make 11 rapid requests, expect 429 on 11th)

## Shared Patterns and Conventions

### Commit Message Format

```text
Author & Commiter: HatmanStack
Email: 82614182+HatmanStack@users.noreply.github.com

type(scope): brief description

Detail 1
Detail 2
```

**Types:**
* `feat`: New feature
* `fix`: Bug fix
* `refactor`: Code refactoring
* `test`: Adding or updating tests
* `docs`: Documentation changes
* `chore`: Maintenance tasks
* `ci`: CI/CD changes

**Scopes:**
* `infra`: SAM template, CloudFormation
* `backend`: Lambda function code
* `frontend`: React Native code
* `deploy`: Deployment scripts
* `tests`: Test files
* `docs`: Documentation files

### File Naming Conventions

* Test files: `*.test.ts`, `*.test.tsx`, `test_*.py`
* Service files: `*Service.ts` (frontend), `*.py` (backend)
* Component files: `*.tsx` (PascalCase)
* Configuration files: `*.config.js`, `*.yaml`

### Error Handling Patterns

**Backend (Lambda):**
```python
try:
    # Business logic
    return {
        'statusCode': 200,
        'body': json.dumps({'success': True, 'data': result})
    }
except ValueError as e:
    # Client errors
    return {
        'statusCode': 400,
        'body': json.dumps({'error': str(e)})
    }
except Exception as e:
    # Server errors
    return {
        'statusCode': 500,
        'body': json.dumps({'error': 'Internal server error'})
    }
```

**Frontend (Services):**
```typescript
const response = await fetch(url, options);
if (!response.ok) {
    if (response.status === 429) {
        throw new Error('Rate limit exceeded. Please try again later.');
    }
    throw new Error(`API error: ${response.statusText}`);
}
return await response.json();
```

## CloudWatch Metrics Strategy

**Basic Metrics (Free/Low Cost):**
* Request count (per route)
* Latency (p50, p99)
* Error count (4xx, 5xx)
* Throttled requests (429 responses)

**Configuration:**
```yaml
DefaultRouteSettings:
  DetailedMetricsEnabled: true   # Basic metrics
  ThrottlingBurstLimit: 10
  ThrottlingRateLimit: 1000
```

**No Access Logs:**
* Access logs are expensive and verbose
* Basic metrics sufficient for monitoring
* Can enable later if needed for debugging

## Implementation Principles

### Test-Driven Development (TDD)

1. **Write failing test first**
2. **Implement minimal code to pass test**
3. **Refactor for clarity**
4. **Commit with meaningful message**

### Atomic Commits

* Each commit should represent one logical change
* Tests should pass after each commit
* Commit messages should explain "why" not "what"

### DRY (Don't Repeat Yourself)

* Extract common test fixtures to `conftest.py` (backend) or `jest.setup.js` (frontend)
* Reuse event structure builders for integration tests
* Share CORS configuration patterns

### YAGNI (You Aren't Gonna Need It)

* Don't add per-route rate limiting yet (wait for real usage data)
* Don't add custom domain support (use default API Gateway URL)
* Don't add X-Ray tracing (basic metrics sufficient)
* Don't add request/response transformation (Lambda handles it)

## Known Limitations and Trade-offs

### Rate Limiting Granularity

**Limitation:** API Gateway v2 rate limiting is per-stage, not per-IP. The 1,000 req/day limit applies to ALL traffic, not individual IPs.

**Mitigation:** Conservative limits protect the entire API. Can add AWS WAF for per-IP limiting if needed (additional cost).

### CORS Preflight Overhead

**Limitation:** Every cross-origin request from the frontend triggers an OPTIONS preflight request, doubling the request count for writes.

**Mitigation:** MaxAge: 300 caches preflight responses for 5 minutes in browser.

### No Gradual Rollout

**Limitation:** Hard cutover means no A/B testing or gradual traffic shifting.

**Mitigation:** Thorough testing in dev environment before production deployment. Can keep Function URL in template (disabled) for quick rollback if needed.

### Dev Origins in Production Risk

**Limitation:** If `IncludeDevOrigins: true` is accidentally deployed to production, localhost origins will be allowed (security risk).

**Mitigation:**
* Parameter defaults to `false` (safe by default)
* Engineers must explicitly set `INCLUDE_DEV_ORIGINS=true` in `.env.deploy` for local development
* Deployment scripts display the parameter value before deploying (visibility)
* Document clearly in DEPLOYMENT.md

## Token Estimates

This foundation phase is primarily documentation and design decisions. The actual implementation is in Phase 1.

**Phase 0 Total:** ~10,000 tokens

## Next Steps

Proceed to [Phase 1: Complete Migration](./phase-1.md) to begin implementation.
