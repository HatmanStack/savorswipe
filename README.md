<div align="center" style="display: block;margin-left: auto;margin-right: auto;width: 70%;">
<h1>Savor Swipe</h1>

<h4 align="center">
<a href="https://www.apache.org/licenses/LICENSE-2.0.html"><img src="https://img.shields.io/badge/license-Apache2.0-blue" alt="savorswipe is under the Apache 2.0 liscense" /></a><a href="https://github.com/circlemind-ai/fast-graphrag/blob/main/CONTRIBUTING.md"><img src="https://img.shields.io/badge/Expo-51+-orange" alt="Expo Version" /></a><a href="https://programmablesearchengine.google.com/about/"><img src="https://img.shields.io/badge/Google%20Custom%20Search-violet" alt="Google Custom Search" /></a><a href="https://platform.openai.com/docs/guides/vision"><img src="https://img.shields.io/badge/OpenAI-Vision-yellow" alt="OpenAI OCR" /></a><a href="https://docs.aws.amazon.com/lambda/"><img src="https://img.shields.io/badge/AWS-Lambda-green" alt="AWS Lambda Documentation" /></a><a href="https://coderabbit.ai/github/:org/:repo"><img src="https://img.shields.io/coderabbit/prs/github/hatmanstack/savorswipe" alt="CoderRabbit PR Reviews" /></a>
</h4>
<p align="center">
  <p align="center"><b>From Cravings to Cooking - Swipe, Discover, Repeat!<br> <a href="https://savorswipe.fun/"> SavorSwipe » </a> </b> </p>
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
- **Recipe Upload**: Upload photos of recipes for OCR processing and automatic recipe extraction.
- **Meal Type Filters**: Filter recipes by category (main dish, dessert, appetizer, etc.).

## Technologies Used

- **Expo**: A framework and platform for universal React applications.
- **AWS**: Lambda for Dynamic Processing, S3 for Storage
- **GPC**: Custom Search JSON API - Web image search for food 
- **OPENAI**: OCR for adding new recipes

## Installation

To get started with the SavorSwipe, follow these steps:

1. **Clone the repository**:
   ```bash
   git clone https://github.com/yourusername/savorswipe.git
   cd savorswipe
   ```

2. **Install dependencies**:
   ```bash
   npm install 
   ```

3. **Create the backend Services**
   - s3 bucket to hold recipes
      - Two folders /images and /jsondata
   - Lambda Function
      - With the Environmental Variables
      ```bash
      API_KEY=<openai key for image ocr>
      SEARCH_ID=<custom search engine ID for Google Custom Search JSON API>
      SEARCH_KEY=<GPC API key to access Search Engine>
      AWS_S3_BUCKET=<to store images and recipes>
      ```

5. **Add .env File**
   ```bash
   EXPO_PUBLIC_CLOUDFRONT_BASE_URL=<cloudfront distro fronting s3 image bucket>
   EXPO_PUBLIC_LAMBDA_FUNCTION_URL=<lambda url for backend>
   ```

5. **Start the development server**:
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

## License

This project is licensed under the Apache License 2.0 - see the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0) for details.

