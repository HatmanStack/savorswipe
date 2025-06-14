

export default {
    // Basic app information
    name: 'SavorSwipe', // Replace with your app name
    slug: 'savor-swipe', // Unique identifier for your app
    version: '1.0.0', // Version of your app
    orientation: 'portrait', // Orientation of the app
    icon: './assets/images/icon.png', 
    platforms: ["ios", "android", "web"],
    web: {
      favicon: './assets/images/icon.png',
      name: "SavorSwipe",
      orientation: "portrait",
      shortName: "SavorSwipe"
    },
    splash: {
      image: './assets/images/adaptive-icon.png', // Path to your splash screen image
      resizeMode: 'contain', // How the splash image should be resized
      backgroundColor: '#ffffff', // Background color of the splash screen
    },
    updates: {
      fallbackToCacheTimeout: 0, // How long to wait for updates
    },
    assetBundlePatterns: [
      '**/*', // Patterns for assets to bundle
    ],
    ios: {
      supportsTablet: true, // Whether the app supports tablets
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/images/adaptive-icon.png', // Path to adaptive icon
        backgroundColor: '#FFFFFF', // Background color for adaptive icon
      },
    }
  };