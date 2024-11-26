import 'react-native-gesture-handler';
import { Image, View, Animated, Dimensions } from 'react-native';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import { PanGestureHandler } from 'react-native-gesture-handler';
import { useRecipe } from '@/context/RecipeContext';
import GetImages from '@/components/GetImages';
const holderImg = require('@/assets/images/skillet.png')

export default function HomeScreen() {
  
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });
  const [fetchImage, setFetchImage] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [getNewList, setGetNewList] = useState(false);
  const translateX = useRef(new Animated.Value(0)).current;
  const { setCurrentRecipe, firstFile, allFiles, jsonData } = useRecipe();
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
      setGetNewList(prev => !prev); 
    }
    if (allFiles.length > 40) {
      setGetNewList(false);
    }
    if (direction === 'left') {
      console.log('Left');
      setFetchImage(prev => !prev);
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

  useEffect(() => {
    if (!firstFile) {
      // Trigger any updates or side effects when firstFile is set
      console.log('firstFile has been set:', firstFile);
      // You can add any additional logic here if needed
    }
  }, [firstFile]);

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
      
      <GetImages
        getNewList={getNewList}
        fetchImage={fetchImage}
        setFetchImage={setFetchImage}
        setImageDimensions={setImageDimensions}
      />
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
                width: firstFile ? (isMobile ? imageDimensions.width : 1000) : 200,
                height: firstFile ? (isMobile ? imageDimensions.height : 700) : 200,
                alignSelf: 'center',
                resizeMode: 'cover',
              }}
            />
          
        </Animated.View>
      </PanGestureHandler>
    </View>
  )
}

