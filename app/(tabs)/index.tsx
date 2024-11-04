import { StyleSheet, Image,  } from 'react-native';
import {useState, useEffect} from 'react';
import { useRouter } from 'expo-router';
import { ThemedView } from '@/components/ThemedView';
import { PanGestureHandler } from 'react-native-gesture-handler'; 
import { useRecipe } from '@/context/RecipeContext';
import Constants from 'expo-constants';
import { S3 } from 'aws-sdk';
  
export default function HomeScreen() {
  const [fetchedFiles, setFetchedFiles] = useState<string[]>([]);
const s3bucket = 'savorswipe-recipe';
const router = useRouter();
const { setCurrentRecipe } = useRecipe();

const s3 = new S3({
  region: Constants.manifest.extra.AWS_REGION,
          accessKeyId: Constants.manifest.extra.AWS_ID,
          secretAccessKey: Constants.manifest.extra.AWS_SECRET
});

async function fetchFromS3(fileName: string) {
  try {
    const params = {
      Bucket: s3bucket,
      Key: fileName,
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
    };
    const files = await s3.listObjectsV2(params).promise();
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
      const randomFiles = [];

      for (let i = 0; i < 3; i++) {
        const randomIndex = Math.floor(Math.random() * allFiles.length);
        const fileToFetch = allFiles[randomIndex];
        await addFileToFetchedArray(fileToFetch);
      }
    } catch (error) {
      console.error('Error fetching files:', error);
    }
  };

  fetchFiles();
}, []);

async function addFileToFetchedArray(fileName: string) {
  const file = await fetchFromS3( fileName);
  if (file) { 
    fetchedFiles.push(file as string); 
  }
}

const firstFile = fetchedFiles[0]; 

const handleSwipeLeft = async () => {
  if (fetchedFiles.length > 0) {
    const updatedFiles = fetchedFiles.slice(1); // Remove the first file
    setFetchedFiles(updatedFiles); // Update the state
    const allFiles = await listFilesFromS3();
    const randomIndex = Math.floor(Math.random() * allFiles.length);
    const newFileName = allFiles[randomIndex];
    const newFile = await fetchFromS3(newFileName);
    console.log(newFile);
    const newFileString = newFile instanceof Buffer ? newFile.toString('utf-8'): null;
    if(newFileString){
      setFetchedFiles(prevFiles => [...prevFiles, newFileString]);
    } 
  }
};

const handleSwipeRight = async () => {
  if (fetchedFiles.length > 0) {
    const fileToPopulate = fetchedFiles[0]; 
    setCurrentRecipe(fileToPopulate); 
    router.push('/explore');
  }
};

return (
  <PanGestureHandler onGestureEvent={handleSwipeLeft} onEnded={handleSwipeRight}>
  <ThemedView style={styles.card}>
    <Image
      source={{ uri: firstFile }} 
      style={styles.photo}
      resizeMode="cover"
    />
   
  </ThemedView>
  </PanGestureHandler>
);
}

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
