import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from 'expo-image-manipulator';
import Constants from 'expo-constants';
import { useEffect } from 'react';

const resizeImage = async (uri: string, maxSize: number) => {
  const manipulatorResult = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: maxSize, height: maxSize } }],
    { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
  );
  return manipulatorResult.base64; // Return the base64 string of the resized image
};

const callLambdaFunction = async (base64Image: string): Promise<string> => {
  const AWS = require('aws-sdk');
  const lambda = new AWS.Lambda({
    region: Constants.manifest.extra.AWS_REGION_LAMBDA,
    accessKeyId: Constants.manifest.extra.AWS_ID,
    secretAccessKey: Constants.manifest.extra.AWS_SECRET
  });

  const params = {
    FunctionName: Constants.manifest.extra.AWS_LAMBDA_FUNCTION,
    InvocationType: 'RequestResponse',
    Payload: JSON.stringify({
      base64: base64Image
    })
  };

  try {
    const data: AWS.Lambda.InvocationResponse = await lambda.invoke(params).promise();
    console.log('Uploading To Lambda');
    const response = JSON.parse(data.Payload as string);
    if (response.statusCode === 200) {
      const responseBody = JSON.parse(response.body); 
      return responseBody;
    }
    return "Upload Failed";
  } catch (error) {
    console.error('Error invoking Lambda function:', error);
    return "Upload Failed";
  }
}


const selectAndUploadImage = async (setUploadMessage: (result: string | null) => void, setUploadVisible: (visible: boolean) => void) => {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== "granted") {
    alert("Sorry, we need media library permissions to select an image.");
    setUploadVisible(false);
    return 'Upload Failed';
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
  console.log("status2")
  setUploadVisible(false);
  setUploadMessage("Upload Failed");
};

type UploadImageProps = {
  setUploadMessage: (message: string | null) => void; 
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