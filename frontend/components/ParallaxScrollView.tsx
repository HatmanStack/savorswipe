import React, { type PropsWithChildren, type ReactElement } from "react";
import { StyleSheet, useColorScheme, View, Platform } from "react-native";
import Animated, {
  interpolate,
  useAnimatedRef,
  useAnimatedStyle,
  useScrollViewOffset,
} from "react-native-reanimated";
import { Colors } from "@/constants/Colors";
import { ThemedView } from "@/components/ThemedView";

const HEADER_HEIGHT = 450;

type Props = PropsWithChildren<{
  headerImage: ReactElement;
  headerBackgroundColor?: { dark: string; light: string };
  headerText: ReactElement;
}>;

export default function ParallaxScrollView({
  children,
  headerImage,
  headerText,
}: Props) {
  const colorScheme = useColorScheme() ?? "light";
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollOffset = useScrollViewOffset(scrollRef);
  const headerAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        {
          translateY: interpolate(
            scrollOffset.value,
            [-HEADER_HEIGHT, 0, HEADER_HEIGHT],
            [-HEADER_HEIGHT / 2, 0, HEADER_HEIGHT * 0.75]
          ),
        },
        {
          scale: interpolate(
            scrollOffset.value,
            [-HEADER_HEIGHT, 0, HEADER_HEIGHT],
            [2, 1, 1]
          ),
        },
      ],
    };
  });

  return (
    <ThemedView style={styles.container}>
      <Animated.ScrollView ref={scrollRef} scrollEventThrottle={16}>
        <Animated.View
          style={[
            styles.header,
            { backgroundColor: Colors[colorScheme].background },
            headerAnimatedStyle,
          ]}
        >
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center"}}>
            {headerImage}
            <View
              style={{
                flex: 1,
                alignItems: "center",
                margin: Platform.OS === "android" ? 20 : 100,
              }}
            >
              {headerText}
            </View>
          </View>
        </Animated.View>

        <ThemedView style={styles.content}>{children}</ThemedView>
      </Animated.ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    height: HEADER_HEIGHT,
    overflow: "hidden",
    justifyContent: "flex-end",
  },
  content: {
    flex: 1,
    padding: 32,
    gap: 16,
    overflow: "visible",
  },
});
