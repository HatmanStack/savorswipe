import Constants from 'expo-constants';
import { S3 } from 'aws-sdk';
import { useEffect, useState } from 'react';
import { Dimensions } from 'react-native';
import { useRecipe } from '@/context/RecipeContext';

interface GetImagesProps {
    getNewList: boolean;
    fetchImage: boolean;
    setFirstFile: (data: any) => void;
    setJsonData: (data: any) => void;
    setImageDimensions: (data: any) => void;
}

export default function GetImages({ getNewList, fetchImage, setFirstFile, setJsonData, setImageDimensions }: GetImagesProps) {
    const s3bucket = Constants.manifest.extra.AWS_S3_BUCKET;
    const [fileToFetch, setFileToFetch] = useState<string>('');
    const [fetchedFiles, setFetchedFiles] = useState<{ filename: string, file: string }[]>([]);
    const { uploadSuccess, setUploadSuccess, allFiles, setAllFiles  } = useRecipe();
    const s3 = new S3({
        region: Constants.manifest.extra.AWS_REGION_S3,
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
            if (returnFiles) {
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

    useEffect(() => {
        const fetchFilesIfNeeded = async () => {
            console.log(`GetNewList: ${getNewList}`)
            if (getNewList) {
                const fileListHolderStandAlone = await listFilesFromS3();
                if (fileListHolderStandAlone && Array.isArray(fileListHolderStandAlone)) {
                    console.log(`FileListHOlderStandAlone ${fileListHolderStandAlone}`)
                    console.log(allFiles)
                    setAllFiles(fileListHolderStandAlone);
                    setTimeout(() => {
                        console.log(allFiles);
                    }, 4000);
                }
            }
        };
        fetchFilesIfNeeded();
    }, [getNewList]);
    

    useEffect(() => {
        const fetchFiles = async () => {
            try {
                setImageDimensions(Dimensions.get('window'));
                const fileListHolder = await listFilesFromS3();
                const combinedJsonData = await getJsonFromS3();
                if (fileListHolder && Array.isArray(fileListHolder)) {
                    setAllFiles(fileListHolder);
                    setJsonData(combinedJsonData);
                    for (let i = 0; i < 3; i++) {
                        const randomIndex = Math.floor(Math.random() * fileListHolder.length);
                        const highestKey = String(Math.max(...Object.keys(combinedJsonData).map(Number)));
                        if(uploadSuccess && i==0){
                            console.log('Refetching JSONData');
                            setFileToFetch(combinedJsonData[highestKey]);
                            setUploadSuccess(false);
                        } else {
                            setFileToFetch(fileListHolder[randomIndex]);
                        }
                    }
                } else {
                    console.error('fileListHolder is undefined or not an array');
                }
            } catch (error) {
                console.error('Error fetching files:', error);
            }
        };
        fetchFiles();
    }, [uploadSuccess]);

    useEffect(() => {
        const addFileToFetchedArray = async () => {
           
            if (typeof fileToFetch === 'string' && fileToFetch) {
                const file = await fetchFromS3(fileToFetch);
                if (file && fetchedFiles.length < 3) {
                    const base64String = file.toString('base64');
                    setFetchedFiles((prevFiles: { filename: string; file: string }[]) => [...prevFiles, { filename: fileToFetch, file: `data:image/jpeg;base64,${base64String}` }]);
                }
                if (typeof fileToFetch === 'string') {
                    setAllFiles(allFiles.filter((_, index) => index !== allFiles.indexOf(fileToFetch)));
                }
            }
        };
        addFileToFetchedArray();
    }, [fileToFetch]);

    useEffect(() => {
        const fetchImages = async () => {
            if (allFiles.length > 0) {
                const randomIndex = Math.floor(Math.random() * allFiles.length);
                setFileToFetch(allFiles[randomIndex]);
                const updatedFiles = fetchedFiles.slice(1); // Remove the first file
                setFetchedFiles(updatedFiles);
            }
        };
        fetchImages();
    }, [fetchImage]);

    useEffect(() => {
        setFirstFile(fetchedFiles[0]);
    }, [fetchedFiles]);

    return (
        <></>
    );
}