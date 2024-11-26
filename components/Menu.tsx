import React, { useState, useEffect } from 'react';
import { StyleSheet, Image, Modal, View, Pressable } from 'react-native';
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

export default function Menu() {
    const [menuVisible, setMenuVisible] = useState(false);
    const [infoVisible, setInfoVisible] = useState(false);
    const [uploadVisible, setUploadVisible] = useState(false);
    const [recipeInfoVisible, setRecipeInfoVisible] = useState(false);
    const [uploadCount, setUploadCount] = useState(0);
    const { currentRecipe, uploadMessage, setUploadMessage } = useRecipe() as { currentRecipe: Recipe | null | string; uploadMessage: string | null; setUploadMessage: (message: string | null) => void };
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

    const handleRecipeInfoPress = () => {
        setMenuVisible(false);
        setRecipeInfoVisible(true);
    };

    useEffect(() => {
        console.log(`uploadMessage useEffect ${uploadMessage}`);
        if (uploadMessage) {
            const timer = setTimeout(() => {
                setUploadMessage(null);
            }, 2000); // 1 second

            return () => clearTimeout(timer);
        }
    }, [uploadMessage]);

    return (
        <>
            {uploadMessage && (
                <ThemedText style={styles.uploadMessage}>
                    {uploadMessage}
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
                        <Pressable
                            style={styles.menuItem}
                            onPress={handleRecipeInfoPress}
                        >
                            <ThemedText>Recipe Information Link</ThemedText>
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

            <Modal
                animationType="slide"
                transparent={true}
                visible={recipeInfoVisible}
                onRequestClose={() => setRecipeInfoVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <ThemedView style={[styles.modalContent, { alignItems: 'center' }]}>
                        <ThemedText style={styles.modalTitle}>
                            {currentRecipe && typeof currentRecipe !== 'string' ? (
                                <>
                                    <ThemedText >
                                        <p style={{ textAlign: 'center' }}> {currentRecipe.Title} </p>
                                    </ThemedText>

                                    <ThemedText >
                                        <p style={{ textAlign: 'center' }}>{`https://savorswipe.fun/recipe/${currentRecipe.key}`}</p>
                                    </ThemedText>
                                </>
                            ) : (
                                <ThemedText>Select a Recipe By Swiping Right</ThemedText>
                            )}
                        </ThemedText>
                        <Pressable style={styles.closeButton} onPress={() => setRecipeInfoVisible(false)}>
                            <ThemedText>Close</ThemedText>
                        </Pressable>
                    </ThemedView>
                </View>
            </Modal>
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
