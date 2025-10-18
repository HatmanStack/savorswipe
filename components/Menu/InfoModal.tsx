import React from 'react';
import { Modal, View, Pressable, StyleProp, ViewStyle } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';

interface InfoModalProps {
  visible: boolean;
  onClose: () => void;
  styles: Record<string, StyleProp<ViewStyle>>;
}

export const InfoModal: React.FC<InfoModalProps> = ({ visible, onClose, styles }) => {
  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <ThemedView style={[styles.modalContent, { alignItems: 'center' }]}>
          <ThemedText style={styles.modalTitle}>About This App</ThemedText>
          <ThemedText>
            <p style={{ textAlign: 'center' }}>
              Swipe left to discover mouthwatering food photos and right to
              reveal the complete recipe—ingredients with directions. Upload a
              picture of your own directions, ingredients or recipe to join it
              to the swipe list.
            </p>
          </ThemedText>
          <Pressable style={styles.closeButton} onPress={onClose}>
            <ThemedText>Close</ThemedText>
          </Pressable>
        </ThemedView>
      </View>
    </Modal>
  );
};