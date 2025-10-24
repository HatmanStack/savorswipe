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
      {/* Overlay with tap-to-dismiss */}
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onClose}
      >
        {/* Content card - prevent tap propagation */}
        <TouchableOpacity
          style={styles.contentCard}
          activeOpacity={1}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Header with X close button */}
          <View style={styles.header}>
            <Text style={styles.title}>Upload Errors</Text>
            <TouchableOpacity
              style={styles.closeIconButton}
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityLabel="Close error dialog"
              accessibilityRole="button"
            >
              <Text style={styles.closeIconText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Error List */}
          {errors.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No errors to display</Text>
            </View>
          ) : (
            <FlatList
              data={errors}
              keyExtractor={(item) => `error-${item.file}-${item.title}`}
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
        </TouchableOpacity>
      </TouchableOpacity>
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
  closeIconButton: {
    padding: 4,
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeIconText: {
    fontSize: 24,
    color: '#666',
    fontWeight: '300',
  },
  errorList: {
    flex: 1,
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
})
