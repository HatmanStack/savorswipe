import 'react-native-gesture-handler';
import { StyleSheet, Image, View, Animated, Dimensions, Pressable, Alert  } from 'react-native';
import {useState, useEffect, useRef} from 'react';
import { useRouter } from 'expo-router';
import { PanGestureHandler } from 'react-native-gesture-handler'; 
import { useRecipe } from '@/context/RecipeContext';
import Constants from 'expo-constants';
import { S3 } from 'aws-sdk';
import { ThemedText } from '@/components/ThemedText';
import * as ImagePicker from "expo-image-picker";  
import * as ImageManipulator from 'expo-image-manipulator'; 

const buttonSrc = require('@/assets/images/plus.png'); 

export default function HomeScreen() {
  const [fetchedFiles, setFetchedFiles] = useState<{ filename: string, file: string }[]>([]);
  const [allFiles, setAllFiles] = useState<string[]>([]);
  const [jsonData, setJsonData] = useState<Record<string, any> | null>(null);
  const [firstFile, setFirstFile] = useState<{ filename: string, file: string } | null>(null); 
  const [fileToFetch, setFileToFetch] = useState<string>();
  const s3bucket = 'savorswipe-recipe';
  const router = useRouter();
  const { setCurrentRecipe } = useRecipe();
  const translateX = useRef(new Animated.Value(0)).current;
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });
  const [isMobile, setIsMobile] = useState(false); 

  useEffect(() => {
    const checkIfMobile = () => {
      setIsMobile(imageDimensions.width < 768); 
    };
    checkIfMobile(); 
    const onChange = () => checkIfMobile();
    Dimensions.addEventListener('change', onChange);
    
  }, [imageDimensions]);

const s3 = new S3({
  region: Constants.manifest.extra.AWS_REGION,
          accessKeyId: Constants.manifest.extra.AWS_ID,
          secretAccessKey: Constants.manifest.extra.AWS_SECRET
});

async function fetchFromS3(fileName: string) {
  try {
    const params = {
      Bucket: s3bucket,
      Key: `${fileName}`,
    };
    const file = await s3.getObject(params).promise();
    return file.Body; // Return the file body
  } catch (error) {
    console.error('Error fetching file from S3:', error);
    throw error;
  }
}

async function listFilesFromS3() {
  try {
    const params = {
      Bucket: s3bucket,
      Prefix: 'images/',
    };
    const files = await s3.listObjectsV2(params).promise();
    const returnFiles = files.Contents
        ?.map((file) => file.Key as string)
        .filter((fileKey) => !fileKey.endsWith('images/'))
    if(returnFiles){
    const shuffledFiles = returnFiles.sort(() => Math.random() - 0.5); // Randomize the files
    return shuffledFiles;
    }
  } catch (error) {
    console.error('Error listing files from S3:', error);
    throw error;
  }
}

async function getJsonFromS3() {
  try {
    const params = {
      Bucket: s3bucket,
      Key: 'jsondata/combined_data.json',
    };
    const file = await s3.getObject(params).promise();
    if (file.Body) { // Check if file.Body is defined
      const data = JSON.parse(file.Body.toString('utf-8'));
      return data; // Return the parsed JSON data
    } else {
      console.error('File body is undefined');
      return null;
    }
  } catch (error) {
    console.error('Error fetching JSON from S3:', error);
    throw error;
  }
}

async function fetchImages(){
  if (allFiles.length > 0) {
    const randomIndex = Math.floor(Math.random() * allFiles.length);
    setFileToFetch(allFiles[randomIndex]);
  }
}

useEffect(() => {
  const fetchFiles = async () => {
    try {   
      setImageDimensions(Dimensions.get('window')); 
      const fileListHolder = await listFilesFromS3();
      if (fileListHolder && Array.isArray(fileListHolder)) {
      setAllFiles(fileListHolder);
      setJsonData(await getJsonFromS3());
      for (let i = 0; i < 3; i++) {
        const randomIndex = Math.floor(Math.random() * fileListHolder.length);
        setFileToFetch(fileListHolder[randomIndex]);
      }
    } else {
      console.error('fileListHolder is undefined or not an array');
    }
    } catch (error) {
      console.error('Error fetching files:', error);
    }
  };
  fetchFiles();
}, []);

useEffect(() => {
  const addFileToFetchedArray = async () => {
    if (fileToFetch) {
      const file = await fetchFromS3(fileToFetch);
      if (file && fetchedFiles.length < 3) { 
        const base64String = file.toString('base64');
        setFetchedFiles(prevFiles => [...prevFiles, { filename: fileToFetch, file: `data:image/jpeg;base64,${base64String}` }]);
      }
      setAllFiles(allFiles.filter((_, index) => index !== allFiles.indexOf(fileToFetch)));
    }
  };
  addFileToFetchedArray();
}, [fileToFetch]);
useEffect(() => {
  setFirstFile(fetchedFiles[0]);
}, [fetchedFiles]);


const handleSwipe = async (direction: 'left' | 'right') => {
  setImageDimensions(Dimensions.get('window'));
  if(allFiles.length < 3 ){
    const fetchedFilesFromS3 = await listFilesFromS3();
    setAllFiles(fetchedFilesFromS3 || []);
    console.log("Getting Fresh Eyes");
  }
  if (direction === 'left') {
    console.log('Left');
    if (fetchedFiles.length > 0) {
      const updatedFiles = fetchedFiles.slice(1); // Remove the first file
      setFetchedFiles(updatedFiles);
      fetchImages(); 
    }
  } else if (direction === 'right') {
    console.log('Right');
    if (fetchedFiles.length > 0) {
      const fileToPopulate = fetchedFiles[0]; 
      if (fileToPopulate) { // Check if fileToPopulate is defined
        console.log(fileToPopulate.filename);
        const recipeId = fileToPopulate.filename.split('/').pop()?.split('.')[0]; // Use optional chaining
        if (recipeId) { // Ensure recipeId is defined before using it
          if (jsonData && jsonData[recipeId]) { // Check if jsonData is defined and recipeId exists as a key
            setCurrentRecipe(jsonData[recipeId]); 
            router.push('/explore');
          } else {
            console.error('jsonData is undefined'); // Optional: log an error if jsonData is not available
          }
        }
      }
    }
  }
};

const callLambdaFunction = async (base64Image: string) => {
  const AWS = require('aws-sdk');
  const lambda = new AWS.Lambda({
    region: 'us-west-2',
    accessKeyId: Constants.manifest.extra.AWS_ID,
    secretAccessKey: Constants.manifest.extra.AWS_SECRET
  });

  const params = {
    FunctionName: 'savorswipe-recipe-add',
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

const selectImage = async () => {
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
      if(resizedImage){
      const lambdaResponse = await callLambdaFunction(resizedImage);
      console.log('Lambda Response:', lambdaResponse);
      }
    } else {
      console.error('Base64 image is undefined');
    }
  }
};

const resizeImage = async (uri: string, maxSize: number) => {
  const manipulatorResult = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: maxSize, height: maxSize } }],
    { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
  );
  return manipulatorResult.base64; // Return the base64 string of the resized image
};

const debounce = (func: (...args: any[]) => void, delay: number) => {
  let timeout: NodeJS.Timeout; // Specify the type for timeout
  return (...args: any[]) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), delay); // Use spread operator instead of apply
  };
};

const debouncedHandleSwipe = debounce(handleSwipe, 100);

return (
  <View style={{ alignItems: 'center', justifyContent: 'center', flex: 1 }}>
    <Pressable style={{ position: 'absolute', top: 20, left: 20, zIndex: 1 }} onPress={selectImage}>
      <Image source={buttonSrc } style={{ width: 50, height: 50 }} />
    </Pressable>
    <PanGestureHandler 
      onGestureEvent={(event) => {
        if (event.nativeEvent.translationX < -30) {
          debouncedHandleSwipe('left');
        } else if (event.nativeEvent.translationX > 30) {
          debouncedHandleSwipe('right');
        }
      }} 
      minDist={30} 
      minVelocity={0.5}
    >
      <Animated.View style={{ transform: [{ translateX }] }}>
      {firstFile ? (
        <Image
          source={{ uri: firstFile.file }}
          style={{
            width: isMobile ? imageDimensions.width : 1000, 
            height: isMobile ? imageDimensions.height : 700, 
            alignSelf: 'center',
            resizeMode: 'cover',
          }}
        />
      ) : (
          <ThemedText>No files available</ThemedText> 
        )}
      </Animated.View>
    </PanGestureHandler>
  </View>
)}

const styles = StyleSheet.create({
  card: {
    borderRadius: 10,
    overflow: 'hidden',
    elevation: 3, // For Android shadow
    shadowColor: '#000', // For iOS shadow
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    margin: 10,
  },
  photo: {
    width: '100%',
    height: 200, // Adjust height as needed
  },
});
