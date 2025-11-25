import React, { useState } from 'react';
import { StyleSheet } from 'react-native';
import { MenuButton } from './MenuButton';
import { MainMenuModal } from './MainMenuModal';
import { InfoModal } from './InfoModal';
import { UploadModal } from './UploadModal';

export const MenuContainer: React.FC = () => {
  const [menuVisible, setMenuVisible] = useState(false);
  const [infoVisible, setInfoVisible] = useState(false);
  const [uploadVisible, setUploadVisible] = useState(false);
  const [uploadCount, setUploadCount] = useState(0);

  const handleInfoPress = () => {
    setMenuVisible(false);
    setInfoVisible(true);
  };

  const handleUploadPress = () => {
    setMenuVisible(false);
    setUploadCount((prevCount) => prevCount + 1);
    setUploadVisible(true);
  };

  const closeUpload = () => {
    setUploadVisible(false);
  };

  return (
    <>
      <MenuButton onPress={() => setMenuVisible(!menuVisible)} />

      <MainMenuModal
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        onInfoPress={handleInfoPress}
        onUploadPress={handleUploadPress}
        styles={styles}
      />

      <InfoModal
        visible={infoVisible}
        onClose={() => setInfoVisible(false)}
        styles={styles}
      />

      <UploadModal
        visible={uploadVisible}
        onClose={closeUpload}
        uploadCount={uploadCount}
        styles={styles}
      />
    </>
  );
};

const styles = StyleSheet.create({
  uploadMessage: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: '-50%' }, { translateY: '-50%' }],
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    padding: 20,
    borderRadius: 10,
    color: 'red',
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    zIndex: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
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
  filterSection: {
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    overflow: 'hidden',
  },
  dropdownHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  dropdownIcon: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  checkboxContainer: {
    padding: 12,
    paddingTop: 8,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
});