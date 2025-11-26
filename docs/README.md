<div align="center" style="display: block;margin-left: auto;margin-right: auto;width: 70%;">
<h1>Savor Swipe</h1>

<h4 align="center">
<a href="https://www.apache.org/licenses/LICENSE-2.0.html"><img src="https://img.shields.io/badge/license-Apache2.0-blue" alt="savorswipe is under the Apache 2.0 license" /></a><a href="https://expo.dev"><img src="https://img.shields.io/badge/Expo-54+-orange" alt="Expo Version" /></a><a href="https://programmablesearchengine.google.com/about/"><img src="https://img.shields.io/badge/Google%20Custom%20Search-violet" alt="Google Custom Search" /></a><a href="https://platform.openai.com/docs/guides/vision"><img src="https://img.shields.io/badge/OpenAI-Vision-yellow" alt="OpenAI OCR" /></a><a href="https://docs.aws.amazon.com/lambda/"><img src="https://img.shields.io/badge/AWS-Lambda-green" alt="AWS Lambda Documentation" /></a>
</h4>
<p align="center">
  <p align="center"><b>From Cravings to Cooking - Swipe, Discover, Repeat!<br> <a href="https://savorswipe.hatstack.fun"> SavorSwipe » </a> </b> </p>
</p>
<h1 align="center">
  <img width="400" src="banner.jpg" alt="savorswipe-app icon">
</h1>
<p>Swipe left to discover mouthwatering food photos
and right to reveal the complete recipe—ingredients with directions.
Search for recipes by name or ingredients to find exactly what you're craving.
Upload a picture of your own directions, ingredients or recipe to join it to the swipe list. </p>
</div>
            
## Features

- **Swipe Navigation**: Easily browse through recipes by swiping left to discard or right to select.
- **Recipe Search**: Find recipes by title or ingredients with real-time filtering and recent search history.
- **Recipe Details**: View detailed information about each recipe, including ingredients and cooking instructions.
- **Multi-File Upload**: Upload multiple recipe images or PDF cookbooks at once with background processing, duplicate detection, and automatic image search.
- **Image Picker**: Select the best image to represent your uploaded recipes from a 3x3 grid of Google search results.
- **Meal Type Filters**: Filter recipes by category (main dish, dessert, appetizer, etc.).

## Technologies Used

- **Expo**: A framework and platform for universal React applications.
- **AWS**: Lambda for Dynamic Processing, S3 for Storage, API Gateway v2 for REST API
- **GCP**: Google Custom Search JSON API - Web image search for food 
- **OPENAI**: OCR for adding new recipes

## Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/yourusername/savorswipe.git
   cd savorswipe
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Deploy the backend** (creates S3, Lambda, API Gateway, CloudFront):
   ```bash
   npm run deploy
   ```

   You'll be prompted for:
   - AWS region
   - OpenAI API key (for OCR)
   - Google Custom Search credentials (for recipe images)
   - Include dev origins (CORS wildcard for local testing)

   See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed configuration options.

4. **Start the development server**:
   ```bash
   npm start
   ```
## Usage

### Discovering Recipes

1. Launch the app on your device.
2. Swipe right to select a recipe or swipe left to discard it.
3. Tap on a recipe to view its details, including ingredients and cooking instructions.

### Searching for Recipes

1. Tap the hamburger menu (top-left corner).
2. Select **"Search Recipes"**.
3. Type a recipe name or ingredient (e.g., "chocolate", "chicken", "garlic").
4. Browse results and tap any recipe to view full details.
5. Recent searches are saved for quick access.

**Search Tips**:
- Search by recipe title: "chocolate cake", "pasta primavera"
- Search by ingredient: "garlic", "chicken", "flour"
- Partial matches work: "choc" finds "chocolate"
- Case-insensitive searches
- Clear recent searches using the "Clear All" button

### Selecting Recipe Images

After uploading a recipe, a modal appears with 9 Google image search results:

1. **Browse Images**: View a 3x3 grid of recipe photos found by Google.
2. **Preview**: Tap any thumbnail to see a full-size preview.
3. **Select**: Confirm your choice to save the image to your recipe.
4. **Delete**: Use the ✕ button to delete unwanted recipes (with confirmation).

The selected image will represent your recipe in the swipe interface.

## Architecture

**Frontend**: Expo/React Native app with file-based routing
- Context-based state management
- Image queue with prefetch (10-15 images)
- Background upload processing with job queue
- AsyncStorage for persistence

**Backend**: AWS Lambda (Python 3.12) with API Gateway v2
- OpenAI Vision API for OCR
- Google Custom Search for recipe images
- Semantic duplicate detection using embeddings
- Atomic S3 writes with race condition protection (S3 conditional writes using If-Match on PutObject)

**Storage**: S3 with CloudFront CDN
- `/images/*.jpg` - Recipe photos
- `/jsondata/combined_data.json` - Recipe metadata
- `/jsondata/recipe_embeddings.json` - Similarity vectors

## Testing

```bash
npm run check        # Run all lint and tests
npm test             # Frontend tests (watch mode)
npm run test:backend # Backend tests only
npm run lint         # Frontend ESLint + TypeScript
npm run lint:backend # Backend ruff
```

**Test Coverage**:
- Frontend: 299 tests (services, components, integration)
- Backend: 151 tests (Lambda, OCR, embeddings, upload)

## License

This project is licensed under the Apache License 2.0 - see the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0) for details.
