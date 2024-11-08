import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from 'expo-image-manipulator';
import Constants from 'expo-constants';
import React from 'react';
import { Alert } from 'react-native';

const resizeImage = async (uri: string, maxSize: number) => {
  const manipulatorResult = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: maxSize, height: maxSize } }],
    { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
  );
  return manipulatorResult.base64; // Return the base64 string of the resized image
};

const callLambdaFunction = async (base64Image: string) => {
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
    const response = JSON.parse(data.Payload as string).body;
    if (typeof response === 'string') {
      Alert.alert("Upload Successful", "Your image has been uploaded successfully.");
    } else {
      Alert.alert("Upload Failed", "There was an issue with the response.");
    }
  } catch (error) {
    console.error('Error invoking Lambda function:', error);
    Alert.alert("Upload Failed", "There was an error invoking the Lambda function.");
  }
}

const UploadImage = async () => {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== "granted") {
    alert("Sorry, we need media library permissions to select an image.");
    return;
  }
  console.log("Selecting image");
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    aspect: [4, 3],
    quality: 1,
  });

  if (!result.canceled) {
    console.log(result);
    const imageUri = result.assets[0]?.uri;
    if (imageUri) {
      const resizedImage = await resizeImage(imageUri, 2000); // Resize image to below 6k
      console.log(resizedImage); // Convert to base64 format
      if (resizedImage) {
        const lambdaResponse = await callLambdaFunction(resizedImage);
        console.log('Lambda Response:', lambdaResponse);
      }
    } else {
      console.error('Base64 image is undefined');
    }
  }


};

export default UploadImage; // Change the default export to UploadImage