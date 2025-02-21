import React, { useState, useEffect } from 'react';
import { Linking, StyleSheet, Image, Modal, View, Pressable } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useRecipe } from '@/context/RecipeContext';
import UploadImage from '@/components/UploadRecipe';

type Recipe = {
    Title: string;
    Description: string | string[];
    Ingredients: string | string[];
    Directions: string | string[];
    key: number;
};

interface RecipeContext {
    currentRecipe: Recipe | null | string;
    setFirstFile: (file: { filename: string; file: string; } | null) => void; // Updated type
    setAllFiles: (files: string[]) => void;
    jsonData: Record<string, any>;
    setJsonData: (data: Record<string, any>) => void;
}

export default function Menu() {
    const [menuVisible, setMenuVisible] = useState(false);
    const [infoVisible, setInfoVisible] = useState(false);
    const [uploadVisible, setUploadVisible] = useState(false);
    const [uploadMessage, setUploadMessage] = useState<Record<string, any> | null>(null);
    const [uploadCount, setUploadCount] = useState(0);
    const [uploadText, setUploadText] = useState<string | null>(null);
    const { setFirstFile, setAllFiles, jsonData, setJsonData } = useRecipe() as RecipeContext;
    const buttonSrc = require('@/assets/images/hamburger.png');

    const handleInfoPress = () => {
        setMenuVisible(false);
        setInfoVisible(true);
    };

    const handleUploadPress = () => {
        setMenuVisible(false);
        setUploadCount(prevCount => prevCount + 1);
        setUploadVisible(true);
    };

    useEffect(() => {
        if (uploadMessage) {
            setUploadText(uploadMessage.returnMessage);
            if(uploadMessage.returnMessage.includes("success")){
                const existingKeys = new Set(Object.keys(jsonData));
                const newKeys = new Set(Object.keys(uploadMessage.jsonData));
                const difference = [...newKeys].filter(key => !existingKeys.has(key));
                const sortedDifference = difference.sort((a, b) => Number(b) - Number(a));
                console.log(sortedDifference)
                setAllFiles(sortedDifference);
                setJsonData(uploadMessage.jsonData);
                setFirstFile({"filename": `image/${sortedDifference[0]}.jpg`, "file":`data:image/jpeg;base64,${uploadMessage.encodedImages}`});}
            const timer = setTimeout(() => {
                setUploadText(null);
            }, 2000); // 1 second

            return () => clearTimeout(timer);
        }
    }, [uploadMessage]);

    return (
        <>
            {uploadText && (
                <ThemedText style={styles.uploadMessage}>
                    {uploadText}
                </ThemedText>
            )}
            <Pressable
                style={{ position: 'absolute', top: 20, left: 20, zIndex: 1 }}
                onPress={() => setMenuVisible(!menuVisible)}
            >
                <Image source={buttonSrc} style={{ width: 50, height: 50 }} />
            </Pressable>


            <Modal
                animationType="slide"
                transparent={true}
                visible={menuVisible}
                onRequestClose={() => setMenuVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <ThemedView style={styles.menuContent}>
                        <Pressable style={styles.menuItem} onPress={handleInfoPress}>
                            <ThemedText>About App</ThemedText>
                        </Pressable>
                        <Pressable style={styles.menuItem} onPress={handleUploadPress}>
                            <ThemedText>Upload Recipe</ThemedText>
                        </Pressable>
                        
                        <Pressable style={styles.menuItem} onPress={() => setMenuVisible(false)}>
                            <ThemedText>Close</ThemedText>
                        </Pressable>
                    </ThemedView>
                </View>
            </Modal>

            <Modal
                animationType="slide"
                transparent={true}
                visible={infoVisible}
                onRequestClose={() => setInfoVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <ThemedView style={[styles.modalContent, { alignItems: 'center' }]}>
                        <ThemedText style={styles.modalTitle}>About This App</ThemedText>
                        <ThemedText><p style={{ textAlign: 'center' }}>
                            Swipe through a visually stunning collection of dishes—swipe left to explore mouthwatering photos,
                            and swipe right to instantly access the full recipe, ingredients, and instructions. Got a recipe of
                            your own? Simply upload a picture of your ingredients or directions to add it to the app’s swipe list,
                            making your culinary creations available to others. Plus, you can generate a static link for any recipe to
                            easily share with friends and family. Whether you’re looking for inspiration or sharing your latest food
                            creation, this app makes cooking fun and social!</p>
                        </ThemedText>
                        <Pressable style={styles.closeButton} onPress={() => setInfoVisible(false)}>
                            <ThemedText>Close</ThemedText>
                        </Pressable>
                    </ThemedView>
                </View>
            </Modal>

            
            {uploadVisible && (
                <UploadImage key={uploadCount} setUploadMessage={setUploadMessage} setUploadVisible={setUploadVisible} />
            )}

          
        </>
    );
}

const styles = StyleSheet.create({
    menuButton: {
        position: 'absolute',
        bottom: 20,
        right: 20,
        backgroundColor: 'transparent',
        padding: 15,
        borderRadius: 30,
        elevation: 5,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
    },
    uploadMessage: {
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: [{ translateX: '-50%' }, { translateY: '-50%' }], // Use percentage for centering
        backgroundColor: 'rgba(255, 255, 255, 0.8)', // Semi-transparent background
        padding: 20, // Add padding for spacing
        borderRadius: 10, // Rounded corners
        color: 'red',
        fontSize: 24,
        fontWeight: 'bold',
        textAlign: 'center',
        zIndex: 2,
        shadowColor: '#000', // Shadow color
        shadowOffset: { width: 0, height: 2 }, // Shadow offset
        shadowOpacity: 0.3, // Shadow opacity
        shadowRadius: 4, // Shadow radius
        elevation: 5, // Elevation for Android
    },
    modalOverlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    menuContent: {
        padding: 20,
        borderRadius: 10,
        width: '80%',
        maxWidth: 400,
    },
    modalContent: {
        padding: 20,
        borderRadius: 10,
        width: '90%',
        maxWidth: 500,
        maxHeight: '80%',
    },
    menuItem: {
        padding: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#ccc',
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        marginBottom: 10,
    },
    closeButton: {
        marginTop: 20,
        padding: 10,
        alignItems: 'center',
    },
});
