<h1 align="center">
  <img width="800" src="banner.png" alt="savorswipe-app icon">
</h1>
<h4 align="center">
  <a href="https://www.apache.org/licenses/LICENSE-2.0.html">
    <img src="https://img.shields.io/badge/license-Apache2.0-blue" alt="savorswipe is under the Apache 2.0 liscense" />
  </a>
  <a href="https://github.com/circlemind-ai/fast-graphrag/blob/main/CONTRIBUTING.md">
    <img src="https://img.shields.io/badge/Expo-51+-Purple" alt="Expo Version" />
  </a>
  <a href="https://programmablesearchengine.google.com/about/">
    <img src="https://img.shields.io/badge/Google%20Custom%20Search-green" alt="Google Custom Search" />
  </a>
  <a href="https://platform.openai.com/docs/guides/text-to-speech">
    <img src="https://img.shields.io/badge/OpenAI-Orange" alt="OpenAI OCR" />
  </a>
  <img src="https://img.shields.io/youtube/views/8hmrio2A5Og">
  <img src="https://img.shields.io/badge/python->=3.12.1-Red">
</h4>
<p align="center">
  <p align="center"><b>From Cravings to Cooking - Swipe, Discover, Repeat!<br> <a href="https://savorswipe.fun/"> SavorSwipe » </a> </b> </p>
</p>



# SavorSwipe

SavorSwipe lets you browse through pictures of food until something catches your eye. Once you find a dish you like, simply swipe right to access the recipe! Easily add your own recipes by snapping a photo of the ingredients and directions. 

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
   git clone https://github.com/yourusername/recipe-picker-app.git
   cd recipe-picker-app
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

## Acknowledgments

- Thanks to the Expo team for providing an excellent framework for building mobile applications.
- Inspiration from various recipe apps and user feedback.

---

Happy cooking and enjoy SavorSwipe!