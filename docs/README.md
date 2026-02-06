# SavorSwipe Documentation

## Features

- **Swipe Navigation**: Browse recipes by swiping left to discard or right to select.
- **Recipe Search**: Find recipes by title or ingredients with real-time filtering and recent search history.
- **Recipe Details**: View ingredients, directions, and cooking instructions.
- **Multi-File Upload**: Upload multiple recipe images or PDF cookbooks with background processing, duplicate detection, and automatic image search.
- **Image Picker**: Select the best image for uploaded recipes from a 3x3 grid of Google search results.
- **Meal Type Filters**: Filter by category (main dish, dessert, appetizer, breakfast, side dish, beverage).
- **Serving Size Scaling**: Adjust ingredient amounts with fraction normalization.

## Technologies

- **Expo** 54 / React Native / React 19
- **AWS**: Lambda (Python 3.13), S3, API Gateway v2, CloudFront
- **Google Custom Search JSON API**: Recipe image discovery
- **OpenAI Vision API**: OCR for recipe extraction from images and PDFs

## Usage

### Discovering Recipes

1. Launch the app.
2. Swipe right to select a recipe or swipe left to discard.
3. Tap a recipe to view details.

### Searching

1. Tap the hamburger menu (top-left).
2. Select **Search Recipes**.
3. Type a recipe name or ingredient.
4. Tap any result to view full details.

Partial matches work ("choc" finds "chocolate"). Case-insensitive. Recent searches saved automatically.

### Selecting Recipe Images

After uploading, a modal appears with 9 Google image search results:

1. Browse the 3x3 grid of recipe photos.
2. Tap any thumbnail for a full-size preview.
3. Confirm to save the image to the recipe.
4. Use the delete button to remove unwanted recipes.

## Architecture

**Frontend**: Expo/React Native with file-based routing (Expo Router)
- Context-based state management (`RecipeContext`)
- Image prefetch queue (10-15 images, batch fetching)
- Background upload processing with job queue and AsyncStorage persistence
- Discriminated union type system with branded types

**Backend**: AWS Lambda (Python 3.13) with API Gateway v2
- OpenAI Vision API for OCR
- Google Custom Search for recipe images
- Semantic duplicate detection using embeddings (cosine similarity, 0.85 threshold)
- Atomic S3 writes with ETag-based optimistic locking

**Storage**: S3 with CloudFront CDN
- `/images/*.jpg` - Recipe photos
- `/jsondata/combined_data.json` - Recipe metadata
- `/jsondata/recipe_embeddings.json` - Similarity vectors
- `/upload-status/*.json` - Job completion flags (7-day TTL)

## Testing

```bash
npm run check        # Run all lint and tests
npm test             # Frontend tests (watch mode)
npm run test:backend # Backend tests only
npm run lint         # Frontend ESLint + TypeScript
npm run lint:backend # Backend ruff
```

- Frontend: ~300 tests (Jest + React Native Testing Library)
- Backend: ~150 tests (pytest + moto + requests-mock)

See [DEPLOYMENT.md](DEPLOYMENT.md) for deployment configuration and troubleshooting.
