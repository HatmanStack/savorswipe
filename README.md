<div align="center" style="display: block;margin-left: auto;margin-right: auto;width: 70%;">
<h1>Savor Swipe</h1>

<h4 align="center">
  <a href="https://www.apache.org/licenses/LICENSE-2.0.html">
    <img src="https://img.shields.io/badge/license-Apache2.0-blue" alt="savorswipe is under the Apache 2.0 liscense" />
  </a>
  <a href="https://github.com/circlemind-ai/fast-graphrag/blob/main/CONTRIBUTING.md">
    <img src="https://img.shields.io/badge/Expo-51+-orange" alt="Expo Version" />
  </a>
  <a href="https://programmablesearchengine.google.com/about/">
    <img src="https://img.shields.io/badge/Google%20Custom%20Search-violet" alt="Google Custom Search" />
  </a>
  <a href="https://platform.openai.com/docs/guides/vision">
    <img src="https://img.shields.io/badge/OpenAI-Vision-yellow" alt="OpenAI OCR" />
  </a>
  <a href="https://docs.aws.amazon.com/lambda/">
    <img src="https://img.shields.io/badge/AWS-Lambda-green" alt="AWS Lambda Documentation" />
  </a>
</h4>
<p align="center">
  <p align="center"><b>From Cravings to Cooking - Swipe, Discover, Repeat!<br> <a href="https://savorswipe.fun/"> SavorSwipe » </a> </b> </p>
</p>
<h1 align="center">
  <img width="400" src="banner.jpg" alt="savorswipe-app icon">
</h1>
<p>Swipe left to discover mouthwatering food photos 
and right to reveal the complete recipe—ingredients with directions. 
Upload a picture of your own directions, ingredients or recipe to join it to the swipe list. </p>
</div>
            
## Features

- **Swipe Navigation**: Easily browse through recipes by swiping left to discard or right to select.
- **Recipe Details**: View detailed information about each recipe, including ingredients and cooking instructions.

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
   npm install -g yarn
   yarn
   ```

3. **Start the development server**:
   ```bash
   npm start
   ```

4. **Create the backend Services**
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
   AWS_REGION_S3=<>
   AWS_REGION_LAMBDA=<>
   AWS_ID=<>
   AWS_SECRET=<>
   AWS_LAMBDA_FUNCTION=<>
   AWS_S3_BUCKET=<>
   ```

## Usage

1. Launch the app on your device.
2. Swipe right to select a recipe or swipe left to discard it.
3. Tap on a recipe to view its details, including ingredients and cooking instructions.

## License

This project is licensed under the Apache License 2.0 - see the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0) for details.

