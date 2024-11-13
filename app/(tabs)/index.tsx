import 'react-native-gesture-handler';
import { StyleSheet, Image, View, Animated, Dimensions, Pressable } from 'react-native';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import { PanGestureHandler } from 'react-native-gesture-handler';
import { useRecipe } from '@/context/RecipeContext';
import { ThemedText } from '@/components/ThemedText';
import GetImages from '@/components/GetImages';
import UploadImage from '@/components/UploadRecipe';
const buttonSrc = require('@/assets/images/plus.png');
const holderImg = require('@/assets/images/skillet.svg')

export default function HomeScreen() {
  const [jsonData, setJsonData] = useState<Record<string, any> | null>(null);
  const [firstFile, setFirstFile] = useState<{ filename: string, file: string } | null>(null);
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [fetchImage, setFetchImage] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [getNewList, setGetNewList] = useState(false);
  const translateX = useRef(new Animated.Value(0)).current;
  const { setCurrentRecipe, uploadSuccess, setUploadSuccess, allFiles, setAllFiles  } = useRecipe();
  const router = useRouter();


  useEffect(() => {
    const checkIfMobile = () => {
      setIsMobile(imageDimensions.width < 768);
    };
    checkIfMobile();
    const onChange = () => checkIfMobile();
    Dimensions.addEventListener('change', onChange);

  }, [imageDimensions]);

  const handleSwipe = async (direction: 'left' | 'right') => {
    setImageDimensions(Dimensions.get('window'));
    if (allFiles.length < 3) {
      setGetNewList(true);
      console.log(allFiles);
    }
    if (allFiles.length > 40) {
      setGetNewList(false);
    }
    if (direction === 'left') {
      console.log('Left');
      setFetchImage(!fetchImage);
    } else if (direction === 'right') {
      console.log('Right');
      const fileToPopulate = firstFile;
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
  };

  const debounce = (func: (...args: any[]) => void, delay: number) => {
    let timeout: NodeJS.Timeout; // Specify the type for timeout
    return (...args: any[]) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), delay); // Use spread operator instead of apply
    };
  };

  const debouncedHandleSwipe = debounce(handleSwipe, 100);
 

  const handleUpload = async () => {
    try {
      const uploadResponse = await UploadImage();
      if (uploadResponse === 'Success') {
        setUploadSuccess(true);
        setUploadMessage('Upload Success');
      } else {
        setUploadMessage('Upload Failed');
      }

      setTimeout(() => {
        setUploadMessage(null);
      }, 1000);

    } catch (error) {
      console.error('Error during image upload:', error);
    }
  };

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', flex: 1 }}>
      {uploadMessage && (
        <ThemedText style={{ position: 'absolute', top: 50, textAlign: 'center', width: '100%' }}>
          {uploadMessage}
        </ThemedText>
      )}
      <GetImages
        getNewList={getNewList}
        fetchImage={fetchImage}
        setFirstFile={setFirstFile}
        setJsonData={setJsonData}
        setImageDimensions={setImageDimensions}
      />
      <Pressable style={{ position: 'absolute', top: 20, left: 20, zIndex: 1 }} onPress={handleUpload}>
        <Image source={buttonSrc} style={{ width: 50, height: 50 }} />
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
          
            <Image
              source={firstFile ? { uri: firstFile.file } : holderImg} 
              style={{
                width: isMobile ? imageDimensions.width : 1000,
                height: isMobile ? imageDimensions.height : 700,
                alignSelf: 'center',
                resizeMode: 'cover',
              }}
            />
          
        </Animated.View>
      </PanGestureHandler>
    </View>
  )
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
