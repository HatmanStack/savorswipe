import React from 'react';
import { Pressable, Image } from 'react-native';

interface MenuButtonProps {
  onPress: () => void;
}

export const MenuButton: React.FC<MenuButtonProps> = ({ onPress }) => {
  const buttonSrc = require('@/assets/images/hamburger_bg.png');

  return (
    <Pressable
      style={{ position: 'absolute', top: 20, left: 20, zIndex: 1 }}
      onPress={onPress}
    >
      <Image source={buttonSrc} style={{ width: 50, height: 50 }} />
    </Pressable>
  );
};