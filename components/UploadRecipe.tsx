import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from 'expo-image-manipulator';
import { useEffect } from 'react';

export const resizeImage = async (uri: string, maxSize: number) => {
  const manipulatorResult = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: maxSize, height: maxSize } }],
    { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
  );
  return manipulatorResult.base64;
};

const LAMBDA_FUNCTION_URL = process.env.EXPO_PUBLIC_LAMBDA_FUNCTION_URL;

export const callLambdaFunction = async (base64Image: string): Promise<Record<string, any>> => {
  const payload = { base64: base64Image };

  try {
    if (!LAMBDA_FUNCTION_URL) {
      throw new Error("LAMBDA_FUNCTION_URL is not defined in environment variables.");
    }
    const httpResponse = await fetch(LAMBDA_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!httpResponse.ok) {
      const errorText = await httpResponse.text();
      console.error(`Lambda Function URL request failed: ${httpResponse.status}`, errorText);
      throw new Error(`Request failed with status ${httpResponse.status}`);
    }

    const lambdaResponse = await httpResponse.json();

    // Logic adapted from your original S3 SDK Invocation response handling:
    // Assumes Lambda might return a structure like { statusCode: 200, body: "{\"actual\":\"response\"}" }
    if (lambdaResponse && typeof lambdaResponse.statusCode === 'number') {
      if (lambdaResponse.statusCode === 200 && lambdaResponse.body) {
        try {
          // If body is a stringified JSON, parse it. Otherwise, use as is if already object.
          return typeof lambdaResponse.body === 'string' ? JSON.parse(lambdaResponse.body) : lambdaResponse.body;
        } catch (parseError) {
          console.error('Error parsing Lambda response body:', parseError, lambdaResponse.body);
          return { returnMessage: "Upload successful, but failed to parse response body" };
        }
      } else {
         // Non-200 statusCode from Lambda's own response structure
        console.warn(`Lambda returned status ${lambdaResponse.statusCode}:`, lambdaResponse.body);
        return { returnMessage: `Lambda returned status ${lambdaResponse.statusCode}`, details: lambdaResponse.body || "No details provided" };
      }
    } else {
      // If Lambda returns the JSON payload directly (no statusCode wrapper in the primary response)
      return lambdaResponse;
    }

  } catch (error) {
    console.error('Error calling Lambda Function URL:', error);
    return { returnMessage: "Upload Failed", error: error instanceof Error ? error.message : String(error) };
  }
};


const selectAndUploadImage = async (setUploadMessage: (result: Record<string, any> | null) => void, setUploadVisible: (visible: boolean) => void) => {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== "granted") {
    alert("Sorry, we need media library permissions to select an image.");
    setUploadVisible(false);
    return {returnMessage: "Upload Failed"};
  }
  
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    aspect: [4, 3],
    quality: 1,
  });
  
  if (!result.canceled) {
    const imageUri = result.assets[0]?.uri;
    if (imageUri) {
      const resizedImage = await resizeImage(imageUri, 2000); // Resize image to below 6k
      if (resizedImage) {
        
        const lambdaResponse = await callLambdaFunction(resizedImage);
        
        setUploadMessage(lambdaResponse);
        setUploadVisible(false);
        return;
      }
    } else {
      console.error('Base64 image is undefined');
    }
  }
  
  setUploadVisible(false);
  setUploadMessage({returnMessage: "Upload Failed"});
};

type UploadImageProps = {
  setUploadMessage: (message: Record<string, any> | null) => void; 
  setUploadVisible: (visible: boolean) => void;
};

const UploadImage: React.FC<UploadImageProps> = ({ setUploadMessage, setUploadVisible }) => { // Added a comma between props

  useEffect(() => {
    const initiateUpload = async () => {
      await selectAndUploadImage(setUploadMessage, setUploadVisible);
    };
    initiateUpload();
  }, []);
  return null;

};

export default UploadImage;