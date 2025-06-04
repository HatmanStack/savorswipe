import { ImageFile } from '@/types';

const CLOUDFRONT_BASE_URL = process.env.EXPO_PUBLIC_CLOUDFRONT_BASE_URL;

export class ImageService {
  /**
   * Fetches an image file from S3/CloudFront
   */
  static async getImageFromS3(fileName: string): Promise<string> {
    const url = `${CLOUDFRONT_BASE_URL}/${fileName}`;

    try {
      
      const response = await fetch(url);

      if (!response.ok) {
        console.error(`HTTP error ${response.status} while fetching file: ${response.statusText}`);
        const errorText = await response.text();
        console.error('Error details:', errorText);
        throw new Error(`Failed to fetch file from CloudFront. Status: ${response.status}`);
      }

      const fileBody = await response.blob();

      // Create object URL for web environments
      if (typeof window !== 'undefined' && window.URL && window.URL.createObjectURL) {
        return window.URL.createObjectURL(fileBody);
      }

      // For React Native, you might need different handling
      // This is a fallback that may need platform-specific implementation
      return '';
    } catch (error) {
      console.error('Error fetching file from CloudFront:', error);
      throw error;
    }
  }

  /**
   * Converts a recipe key to its image filename
   */
  static getImageFileName(recipeKey: string): string {
    return `images/${recipeKey}.jpg`;
  }

  /**
   * Extracts recipe key from image filename
   */
  static getRecipeKeyFromFileName(fileName: string): string {
    return fileName.replace('images/', '').replace('.jpg', '');
  }

  /**
   * Preloads multiple images for better user experience
   */
  static async preloadImages(recipeKeys: string[]): Promise<ImageFile[]> {
    const imagePromises = recipeKeys.map(async (key) => {
      try {
        const fileName = this.getImageFileName(key);
        const imageUrl = await this.getImageFromS3(fileName);
        return {
          filename: fileName,
          file: imageUrl,
        };
      } catch (error) {
        console.error(`Error preloading image for recipe ${key}:`, error);
        return null;
      }
    });

    const results = await Promise.allSettled(imagePromises);
    return results
      .filter((result): result is PromiseFulfilledResult<ImageFile | null> => 
        result.status === 'fulfilled' && result.value !== null
      )
      .map(result => result.value as ImageFile);
  }

  /**
   * Processes base64 image for upload
   */
  static processImageForUpload(imageUri: string): string {
    // Remove data URL prefix if present
    if (imageUri.startsWith('data:image')) {
      const base64Index = imageUri.indexOf(',');
      return imageUri.substring(base64Index + 1);
    }
    return imageUri;
  }

  /**
   * Creates a queue of images to fetch
   */
  static createImageQueue(recipeKeys: string[], initialCount: number = 3): string[] {
    return recipeKeys.slice(0, initialCount).map(key => this.getImageFileName(key));
  }
}