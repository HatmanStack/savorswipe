import 'react-native-gesture-handler';
import { StyleSheet, Image, View  } from 'react-native';
import {useState, useEffect, useRef} from 'react';
import { useRouter } from 'expo-router';
import { PanGestureHandler } from 'react-native-gesture-handler'; 
import { useRecipe } from '@/context/RecipeContext';
import Constants from 'expo-constants';
import { S3 } from 'aws-sdk';
import { ThemedText } from '@/components/ThemedText';
import { Animated } from 'react-native'; 


  
export default function HomeScreen() {
  const [fetchedFiles, setFetchedFiles] = useState<{ filename: string; file: string }[]>([]);
  const [getFreshData, setGetFreshData] = useState(false);
  const s3bucket = 'savorswipe-recipe';
  const router = useRouter();
  const { setCurrentRecipe } = useRecipe();
  const translateX = useRef(new Animated.Value(0)).current;

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
    console.log(files);
    return files.Contents?.map((file) => file.Key as string) || []; 
  } catch (error) {
    console.error('Error listing files from S3:', error);
    throw error;
  }
}

useEffect(() => {
  const fetchFiles = async () => {
    try {
      
      const allFiles = await listFilesFromS3();
      const randomFiles = new Set(); // Use a Set to track unique files

      while (randomFiles.size < 3 && randomFiles.size < allFiles.length) {
        const randomIndex = Math.floor(Math.random() * allFiles.length);
        const fileToFetch = allFiles[randomIndex];
        if (!randomFiles.has(fileToFetch)) { // Check if the file has already been fetched
          randomFiles.add(fileToFetch);
          console.log(fileToFetch);
          await addFileToFetchedArray(fileToFetch);
        }
      }
    } catch (error) {
      console.error('Error fetching files:', error);
    }
  };

  fetchFiles();
}, [getFreshData]);

async function addFileToFetchedArray(fileName: string) {
  const file = await fetchFromS3(fileName);
  if (file) { 
    const base64String = file.toString('base64'); // Convert the file to a base64 string
    setFetchedFiles(prevFiles => [...prevFiles, { filename: fileName, file: `data:image/jpeg;base64,${base64String}` }]); // Update state with the new filename and base64 string
  }
}

const firstFile = fetchedFiles[0] || null; // Ensure firstFile is null if fetchedFiles is empty

const handleSwipe = async (direction: 'left' | 'right') => {
  if (direction === 'left') {
    console.log('Left');
    if (fetchedFiles.length > 0) {
      const updatedFiles = fetchedFiles.slice(1); // Remove the first file
      setFetchedFiles(updatedFiles);
      setGetFreshData(!getFreshData); // Update the state
    }
  } else if (direction === 'right') {
    console.log('Right');
    if (fetchedFiles.length > 0) {
      const fileToPopulate = fetchedFiles[0]; 
      if (fileToPopulate) { // Check if fileToPopulate is defined
        console.log(fileToPopulate.filename);
        const recipeId = fileToPopulate.filename.split('/').pop()?.split('.')[0]; // Use optional chaining
        if (recipeId) { // Ensure recipeId is defined before using it
          setCurrentRecipe(recipeId); 
          router.push('/explore');
        }
      }
    }
  }
};

const debounce = (func: (...args: any[]) => void, delay: number) => {
  let timeout: NodeJS.Timeout; // Specify the type for timeout
  return (...args: any[]) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), delay); // Use spread operator instead of apply
  };
};

const debouncedHandleSwipe = debounce(handleSwipe, 300);

return (
  <View style={{ alignItems: 'center', justifyContent: 'center', flex: 1 }}>
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
      <Animated.View style={{ transform: [{ translateX: translateX }] }}>
        {firstFile ? ( // Conditional rendering to handle empty fetchedFiles
          <Image
            source={{ uri: firstFile.file }} 
            style={{ width: 150, height: 150, alignSelf: 'center' }} // Set image size to 150 x 150 and center it
            resizeMode="cover"
          />
        ) : (
          <ThemedText>No files available</ThemedText> // Fallback UI when no files are available
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
