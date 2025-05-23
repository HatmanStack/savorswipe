import { useEffect, useRef } from 'react';
import { Dimensions } from 'react-native';
import { useRecipe } from '@/context/RecipeContext';

const CLOUDFRONT_BASE_URL = process.env.EXPO_PUBLIC_CLOUDFRONT_BASE_URL;

export async function getJsonFromS3() {
    // Construct the full URL to the JSON file on CloudFront
    const fileKey = 'jsondata/combined_data.json'; // The path to your file in S3
    const url = `${CLOUDFRONT_BASE_URL}/${fileKey}`;

    try {
        console.log(`Workspaceing JSON from: ${url}`);
        const response = await fetch(url);

        if (!response.ok) {
            // Handle HTTP errors, e.g., 404 Not Found, 403 Forbidden
            console.error(`HTTP error ${response.status} while fetching JSON from CloudFront: ${response.statusText}`);
            const errorText = await response.text(); // Attempt to get more error info
            console.error('Error details:', errorText);
            throw new Error(`Failed to fetch JSON from CloudFront. Status: ${response.status}`);
        }

        const data = await response.json(); // .json() parses the response body as JSON
        return data;

    } catch (error) {
        console.error('Error fetching JSON from CloudFront:', error);
        // Re-throw the error if you want calling code to handle it
        throw error;
    }
}

export async function fetchFromS3(fileName: string): Promise<String> {
    // Construct the full URL to the file on CloudFront
    const url = `${CLOUDFRONT_BASE_URL}/${fileName}`;

    try {
        console.log(`Workspaceing file from: ${url}`);
        const response = await fetch(url);

        if (!response.ok) {
            // Handle HTTP errors
            console.error(`HTTP error ${response.status} while fetching file from CloudFront: ${response.statusText}`);
            const errorText = await response.text(); // Attempt to get more error info
            console.error('Error details:', errorText);
            throw new Error(`Failed to fetch file from CloudFront. Status: ${response.status}`);
        }
        const fileBody = await response.blob()
        // response.blob() is suitable for binary files like images, PDFs, etc.
        // If you expect text, you might use response.text()
        // If you need an ArrayBuffer, use response.arrayBuffer()
        if (typeof window !== 'undefined' && window.URL && window.URL.createObjectURL) {
            return window.URL.createObjectURL(fileBody);
        }

        // For native, convert to base64 (optional, not shown here)
        // You may need to use a library like 'react-native-fs' for native base64 conversion

        // Fallback: return empty string
        return '';

    } catch (error) {
        console.error('Error fetching file from CloudFront:', error);
        // Re-throw the error
        throw error;
    }
}

interface GetImagesProps {
    getNewList: boolean;
    fetchImage: boolean;
    setFetchImage: (data: any) => void;
    setImageDimensions: (data: any) => void;
}

export default function GetImages({ getNewList, fetchImage, setFetchImage, setImageDimensions }: GetImagesProps) {
    const fileToFetchRef = useRef<string | string[]>([]);
    const fetchedFilesRef = useRef<{ filename: string, file: String }[]>([]);
    const { firstFile, setFirstFile, allFiles, jsonData, setJsonData, setAllFiles, startImage, setStartImage, mealTypeFilters  } = useRecipe();
    
    const shuffleAndSetKeys = (keysArray?: string[]) => {
        if (!keysArray) {
            if (!jsonData) return; 
            keysArray = Object.keys(jsonData);
        }
        
        if (jsonData) {
            keysArray = keysArray.filter(key => {
                const recipe = jsonData[key];
                if (mealTypeFilters.length === 0) {
                    return true;
                } 
                return recipe && recipe.Type && 
                    (Array.isArray(recipe.Type) 
                        ? recipe.Type.some(type => mealTypeFilters.includes(type))
                        : mealTypeFilters.includes(recipe.Type));
            });
        }
        const shuffledKeys = keysArray.sort(() => Math.random() - 0.5);
        setAllFiles(shuffledKeys);
    }

    
    useEffect(() => {
        const fetchFilesIfNeeded = async () => {
            shuffleAndSetKeys(); 
        };
        fetchFilesIfNeeded();
    }, [getNewList, mealTypeFilters]);
    
    useEffect(() => {
        const fetchFiles = async () => {
            try {
                setImageDimensions(Dimensions.get('window'));
                const combinedJsonData = await getJsonFromS3();
                setJsonData(combinedJsonData);
                const keysArray = Object.keys(combinedJsonData);
                const holderFilesToFetch = [];
                for (let i = 0; i < 3; i++) {
                    const randomIndex = Math.floor(Math.random() * keysArray.length); 
                    const key = keysArray[randomIndex]; 
                    holderFilesToFetch.push(`images/${key}.jpg`);
                    keysArray.splice(randomIndex, 1); 
                }
                fileToFetchRef.current = holderFilesToFetch;
                shuffleAndSetKeys(keysArray);
                 
            
            } catch (error) {
                console.error('Error fetching files:', error);
            }
        };
        fetchFiles();
    }, []);

    useEffect(() => {
        const addFileToFetchedArray = async () => {
            
            const files = Array.isArray(fileToFetchRef.current) ? fileToFetchRef.current : [fileToFetchRef.current];
            for (const filePath of files) {
                if (typeof filePath === 'string' && filePath) {
                    const fileURL = await fetchFromS3(filePath);
                    if (fileURL && fetchedFilesRef.current.length < 3) {
                        
                        fetchedFilesRef.current = [
                            ...fetchedFilesRef.current,
                            { filename: filePath, file: fileURL }
                        ];
                    }
                    const parsedFileName = filePath.replace('images/', '').replace('.jpg', '');
                    if (allFiles.includes(parsedFileName)) {
                        setAllFiles(allFiles.filter(f => f !== parsedFileName));
                    }
                    if(startImage && fetchedFilesRef.current.length > 0){ // Weird Conditional Rendering Issue
                        setStartImage(fetchedFilesRef.current[0]);   // Weird Conditional Rendering Issue
                    } 
                }
            }
        };
        
        addFileToFetchedArray();
        
    }, [fileToFetchRef.current]);
    
    useEffect(() => {
        const fetchImages = async () => {
            if (allFiles.length > 0) {
                setFirstFile(fetchedFilesRef.current[0]); 
                fileToFetchRef.current = `images/${allFiles[0]}.jpg`;
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
        
    }, [fetchedFilesRef.current]);

    return null;
}