import React from 'react';
import { Modal, View, Pressable } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { FilterModal } from './FilterModal';

interface MainMenuModalProps {
  visible: boolean;
  onClose: () => void;
  onInfoPress: () => void;
  onUploadPress: () => void;
  styles: any; // TODO: Create proper style types
}

export const MainMenuModal: React.FC<MainMenuModalProps> = ({
  visible,
  onClose,
  onInfoPress,
  onUploadPress,
  styles,
}) => {
  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <ThemedView style={styles.menuContent}>
          <Pressable style={styles.menuItem} onPress={onInfoPress}>
            <ThemedText>About App</ThemedText>
          </Pressable>
          
          <Pressable style={styles.menuItem} onPress={onUploadPress}>
            <ThemedText>Upload Recipe</ThemedText>
          </Pressable>

          <FilterModal styles={styles} />

          <Pressable style={styles.menuItem} onPress={onClose}>
            <ThemedText>Close</ThemedText>
          </Pressable>
        </ThemedView>
      </View>
    </Modal>
  );
};