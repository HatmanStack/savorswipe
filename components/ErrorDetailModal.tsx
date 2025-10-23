/**
 * Error Detail Modal Component
 * Displays detailed upload error information
 */

import React from 'react'
import {
  Modal,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native'
import { UploadError } from '@/types/upload'

interface ErrorDetailModalProps {
  visible: boolean
  errors: UploadError[]
  onClose: () => void
}

export const ErrorDetailModal: React.FC<ErrorDetailModalProps> = ({
  visible,
  errors,
  onClose,
}) => {
  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.contentCard}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Upload Errors</Text>
          </View>

          {/* Error List */}
          {errors.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No errors to display</Text>
            </View>
          ) : (
            <FlatList
              data={errors}
              keyExtractor={(item, index) => `error-${index}`}
              renderItem={({ item }) => (
                <View style={styles.errorItem}>
                  <Text style={styles.errorText}>
                    <Text style={styles.errorLabel}>File {item.file}:</Text>{' '}
                    {item.title}
                  </Text>
                  <Text style={styles.errorReason}>{item.reason}</Text>
                </View>
              )}
              style={styles.errorList}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
            />
          )}

          {/* Close Button */}
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  contentCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    width: '100%',
    maxWidth: 500,
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  errorList: {
    flex: 1,
    marginBottom: 16,
  },
  errorItem: {
    paddingVertical: 12,
  },
  errorText: {
    fontSize: 14,
    color: '#333',
    marginBottom: 4,
  },
  errorLabel: {
    fontWeight: 'bold',
    color: '#666',
  },
  errorReason: {
    fontSize: 13,
    color: '#666',
    fontStyle: 'italic',
  },
  separator: {
    height: 1,
    backgroundColor: '#e0e0e0',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
  },
  closeButton: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  closeButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
})
