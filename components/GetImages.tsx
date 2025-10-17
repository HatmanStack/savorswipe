import { useEffect, useRef } from 'react';
import { Dimensions } from 'react-native';
import { useRecipe } from '@/context/RecipeContext';
import { RecipeService, ImageService } from '@/services';
import { ImageFile, GetImagesProps } from '@/types';

export default function GetImages({ getNewList, fetchImage, setFetchImage, setImageDimensions }: GetImagesProps) {
    const fileToFetchRef = useRef<string | string[]>([]);
    const fetchedFilesRef = useRef<ImageFile[]>([]);
    const { firstFile, setFirstFile, allFiles, jsonData, setJsonData, setAllFiles, startImage, setStartImage, mealTypeFilters } = useRecipe();
    
    const shuffleAndSetKeys = (keysArray?: string[]) => {
        if (!keysArray) {
            if (!jsonData) {
                return; 
            }
            keysArray = Object.keys(jsonData);
        }
        
        if (jsonData) {
            keysArray = RecipeService.filterRecipesByMealType(jsonData, mealTypeFilters);
        }
        const shuffledKeys = RecipeService.shuffleRecipeKeys(keysArray);
        setAllFiles(shuffledKeys);
    }

    
    useEffect(() => {
        const fetchFilesIfNeeded = async () => {
            // Only reshuffle if we have existing data, don't re-fetch JSON
            if (jsonData) {
                shuffleAndSetKeys(); 
            }
        };
        fetchFilesIfNeeded();
    }, [getNewList, mealTypeFilters]);
    
    useEffect(() => {
        const fetchFiles = async () => {
            try {
                setImageDimensions(Dimensions.get('window'));
                
                // Only fetch JSON if we don't already have it
                if (!jsonData) {
                    const combinedJsonData = await RecipeService.getRecipesFromS3();
                    setJsonData(combinedJsonData);
                    const keysArray = Object.keys(combinedJsonData);
                    const holderFilesToFetch = [];
                    
                    // Initialize with 3 random recipe keys
                    for (let i = 0; i < 3; i++) {
                        const randomIndex = Math.floor(Math.random() * keysArray.length); 
                        const key = keysArray[randomIndex]; 
                        holderFilesToFetch.push(ImageService.getImageFileName(key));
                        keysArray.splice(randomIndex, 1); 
                    }
                    fileToFetchRef.current = holderFilesToFetch;
                    shuffleAndSetKeys(keysArray);
                }

            } catch {
                // Silently fail if fetch fails
            }
        };
        fetchFiles();
    }, []);

    useEffect(() => {
        const addFileToFetchedArray = async () => {
            const files = Array.isArray(fileToFetchRef.current) ? fileToFetchRef.current : [fileToFetchRef.current];
            for (const filePath of files) {
                if (typeof filePath === 'string' && filePath) {
                    try {
                        const fileURL = await ImageService.getImageFromS3(filePath);
                        if (fileURL && fetchedFilesRef.current.length < 3) {
                            fetchedFilesRef.current = [
                                ...fetchedFilesRef.current,
                                { filename: filePath, file: fileURL }
                            ];
                        }
                        
                        const parsedFileName = ImageService.getRecipeKeyFromFileName(filePath);
                        if (allFiles.includes(parsedFileName)) {
                            const newAllFiles = allFiles.filter(f => f !== parsedFileName);
                            setAllFiles(newAllFiles);
                        }
                        
                        // TODO: Remove this conditional rendering workaround
                        if (startImage && fetchedFilesRef.current.length > 0) {
                            setStartImage(fetchedFilesRef.current[0]);
                        }
                    } catch {
                        // Silently fail if image fetch fails
                    }
                }
            }
        };
        
        addFileToFetchedArray();
    }, [fileToFetchRef.current]);
    
    useEffect(() => {
        const fetchImages = async () => {
            if (allFiles.length > 0) {
                // Set the current image from the queue
                setFirstFile(fetchedFilesRef.current[0]); 
                
                // Prepare the next image to fetch
                fileToFetchRef.current = ImageService.getImageFileName(allFiles[0]);
                
                // Remove the current image from the queue
                const updatedFiles = fetchedFilesRef.current.slice(1);
                fetchedFilesRef.current = updatedFiles;
            }
        };
        fetchImages();
    }, [fetchImage]);
    
    useEffect(() => {
        if (!firstFile) {
            setFetchImage((prev: boolean) => !prev); 
        }
    }, [fetchedFilesRef.current, firstFile, setFetchImage]);

    return null;
}