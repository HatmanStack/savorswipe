import React from 'react';
import { Stack } from 'expo-router';
import { useColorScheme } from 'react-native';
import { ThemeProvider } from '@react-navigation/native';
import { DefaultTheme, DarkTheme } from '@react-navigation/native';
import { AppProvider } from '@/context';
import Menu from '@/components/Menu';
import { Toast } from '@/components/Toast';

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AppProvider>
      <Menu />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colorScheme === 'dark' ? '#151718' : '#fff' }
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen
            name="search"
            options={{
              animation: 'slide_from_bottom',
            }}
          />
          <Stack.Screen
            name="recipe/[id]"
            options={{
              animation: 'slide_from_right',
            }}
          />
          <Stack.Screen name="+not-found" />
        </Stack>
        <Toast />
      </AppProvider>
    </ThemeProvider>
  );
}