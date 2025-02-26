import { S3 } from 'aws-sdk';
import { useEffect, useState, useRef } from 'react';
import { Dimensions } from 'react-native';
import { useRecipe } from '@/context/RecipeContext';

export async function getJsonFromS3() {
    try {
        const params = {
            Bucket: process.env.EXPO_PUBLIC_AWS_S3_BUCKET,
            Key: 'jsondata/combined_data.json',
        };
        const s3 = new S3({
            region: process.env.EXPO_PUBLIC_AWS_REGION_S3,
            accessKeyId:  process.env.EXPO_PUBLIC_AWS_ID,
            secretAccessKey: process.env.EXPO_PUBLIC_AWS_SECRET,
        });
        const file = await s3.getObject(params).promise();
        if (file.Body) {
            const data = JSON.parse(file.Body.toString('utf-8'));
            return data;
        } else {
            console.error('File body is undefined');
            return null;
        }
    } catch (error) {
        console.error('Error fetching JSON from S3:', error);
        throw error;
    }
}

export async function fetchFromS3(fileName: string) {
    try {
        const params = {
            Bucket: process.env.EXPO_PUBLIC_AWS_S3_BUCKET,
            Key: `${fileName}`,
        };
        const s3 = new S3({
            region:  process.env.EXPO_PUBLIC_AWS_REGION_S3,
            accessKeyId: process.env.EXPO_PUBLIC_AWS_ID,
            secretAccessKey: process.env.EXPO_PUBLIC_AWS_SECRET,
        });
        const file = await s3.getObject(params).promise();
        return file.Body; // Return the file body
    } catch (error) {
        console.error('Error fetching file from S3:', error);
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
    const fetchedFilesRef = useRef<{ filename: string, file: string }[]>([]);
    const { firstFile, setFirstFile, allFiles, jsonData, setJsonData, setAllFiles, startImage, setStartImage  } = useRecipe();
    
    const shuffleAndSetKeys = (keysArray?: string[]) => {
        if (!keysArray) {
            if (!jsonData) return; 
            keysArray = Object.keys(jsonData);
        }
        const shuffledKeys = keysArray.sort(() => Math.random() - 0.5);
        setAllFiles(shuffledKeys);
    }
    
    useEffect(() => {
        const fetchFilesIfNeeded = async () => {
            if (getNewList) {
                shuffleAndSetKeys();
            }
        };
        fetchFilesIfNeeded();
    }, [getNewList]);
    
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
            console.log('Start of addFileToFetched',fetchedFilesRef.current); 
            const files = Array.isArray(fileToFetchRef.current) ? fileToFetchRef.current : [fileToFetchRef.current];
            for (const filePath of files) {
                if (typeof filePath === 'string' && filePath) {
                    const file = await fetchFromS3(filePath);
                    if (file && fetchedFilesRef.current.length < 3) {
                        const base64String = file.toString('base64');
                        fetchedFilesRef.current = [
                            ...fetchedFilesRef.current,
                            { filename: filePath, file: `data:image/jpeg;base64,${base64String}` }
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
        console.log('fetchImage:', fetchImage);
    }, [fetchImage]);
    
    useEffect(() => {
        if (!firstFile) {
            setFetchImage((prev: boolean) => !prev); 
            console.log('firstfile not set');
        }else{
            console.log('firstFile has been set:', firstFile);
        }
        
    }, [fetchedFilesRef.current]);

    return null;
}