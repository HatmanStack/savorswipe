import "react-native-gesture-handler";
import React, {
  useRef,
  useMemo,
  useCallback,
  useState,
  useEffect,
} from "react";
import {
  Image,
  View,
  Animated,
  AccessibilityInfo,
  Platform,
  Pressable,
  StyleSheet,
} from "react-native";
import { PanGestureHandler } from "react-native-gesture-handler";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import Head from "expo-router/head";
import { useRecipe } from "@/context/RecipeContext";
import { useImageQueue } from "@/hooks/useImageQueue";
import { useResponsiveLayout } from "@/hooks";
import { useThemeColor } from "@/hooks/useThemeColor";
import { isNewRecipe } from "@/services/RecipeService";
import NewRecipeBanner from "@/components/NewRecipeBanner";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const holderImg = require("@/assets/images/skillet.png");

// Animation configuration for new recipe pulse effect
const ANIMATION_CONFIG = {
  PULSE_CYCLES: 3, // Number of pulse cycles
  PULSE_SCALE: 1.05, // Scale factor (1.05 = 5% growth, subtle)
  PULSE_DURATION: 300, // Duration per phase (ms)
};

export default function HomeScreen() {
  const router = useRouter();
  const { currentRecipe } = useRecipe();

  // Use new queue hook
  const { currentImage, advanceQueue, isLoading, showImagePickerModal } =
    useImageQueue();

  // Animation value for simple translateX
  const currentImageTranslateX = useRef(new Animated.Value(0)).current;

  // Animation for pulse effect on new recipes
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  const { getImageDimensions, isDesktop } = useResponsiveLayout();
  const imageDimensions = getImageDimensions();
  const iconColor = useThemeColor({}, "icon");
  const stackCardBorder = useThemeColor(
    { light: "rgba(17, 24, 28, 0.14)", dark: "rgba(236, 237, 238, 0.16)" },
    "icon",
  );

  // Determine if current recipe should show "new" banner
  const showBanner = useMemo(() => {
    if (!currentRecipe) return false;
    return isNewRecipe(currentRecipe);
  }, [currentRecipe]);

  // Check for reduced motion preference
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      setReduceMotion(enabled);
    });
  }, []);

  // Helper function to create pulse animation sequence
  const createPulseAnimation = useCallback(() => {
    const cycles = [];
    for (let i = 0; i < ANIMATION_CONFIG.PULSE_CYCLES; i++) {
      cycles.push(
        Animated.timing(pulseAnim, {
          toValue: ANIMATION_CONFIG.PULSE_SCALE,
          duration: ANIMATION_CONFIG.PULSE_DURATION,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1.0,
          duration: ANIMATION_CONFIG.PULSE_DURATION,
          useNativeDriver: true,
        }),
      );
    }
    return Animated.sequence(cycles);
  }, [pulseAnim]);

  // Trigger pulse animation when new recipe is displayed
  useEffect(() => {
    // Only animate if banner is visible and reduced motion is disabled
    if (!showBanner || reduceMotion) {
      return;
    }

    // Reset animation value
    pulseAnim.setValue(1);

    // Start pulse animation
    const animation = createPulseAnimation();
    animation.start();

    // Cleanup function to stop animation
    return () => {
      pulseAnim.stopAnimation();
    };
  }, [
    currentImage?.filename,
    showBanner,
    reduceMotion,
    pulseAnim,
    createPulseAnimation,
  ]);

  // Handle swipe gestures
  const handleSwipe = useCallback(
    (direction: "left" | "right") => {
      // Don't allow swiping while image picker modal is open
      if (showImagePickerModal) {
        return;
      }

      if (direction === "left") {
        // Swipe left: advance to next recipe
        advanceQueue();
      } else if (direction === "right") {
        // Swipe right: navigate to recipe detail
        if (currentRecipe?.key) {
          router.push(`/recipe/${currentRecipe.key}`);
        }
      }
    },
    [advanceQueue, currentRecipe?.key, router, showImagePickerModal],
  );

  // Debounce function (keep existing)
  const debounce = <T extends (...args: never[]) => void>(
    func: T,
    delay: number,
  ): ((...args: Parameters<T>) => void) => {
    let timeout: NodeJS.Timeout | undefined;
    return (...args: Parameters<T>) => {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), delay);
    };
  };

  // Memoize debounced handler, recreating when handleSwipe changes
  const debouncedHandleSwipe = useMemo(
    () => debounce(handleSwipe, 100),
    [handleSwipe],
  );

  // Desktop web has no touchscreen to swipe with: mirror the gesture on the arrow keys
  useEffect(() => {
    if (Platform.OS !== "web") {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        debouncedHandleSwipe("left");
      } else if (event.key === "ArrowRight") {
        debouncedHandleSwipe("right");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [debouncedHandleSwipe]);

  // Show loading state
  if (isLoading || !currentImage) {
    return (
      <View style={{ alignItems: "center", justifyContent: "center", flex: 1 }}>
        <Image source={holderImg} style={{ width: 200, height: 200 }} />
      </View>
    );
  }

  return (
    <View style={{ alignItems: "center", justifyContent: "center", flex: 1 }}>
      {Platform.OS === "web" && (
        <Head>
          <title>SavorSwipe - Swipe, Discover, Cook</title>
          <meta
            name="description"
            content="Discover delicious recipes with a swipe! Swipe right to cook, swipe left to skip. Recipe discovery made fun and easy."
          />
          <link rel="canonical" href="https://savorswipe.hatstack.fun/" />
        </Head>
      )}
      <View style={[styles.deckRow, isDesktop && styles.deckRowDesktop]}>
        {isDesktop && (
          <Pressable
            onPress={() => debouncedHandleSwipe("left")}
            accessibilityRole="button"
            accessibilityLabel="Skip this recipe"
            style={styles.deckArrow}
          >
            <Ionicons name="chevron-back" size={26} color={iconColor} />
          </Pressable>
        )}

        <View style={styles.cardStage}>
          {isDesktop && (
            <>
              <View
                style={[
                  styles.stackCard,
                  {
                    width: imageDimensions.width,
                    height: imageDimensions.height,
                    borderColor: stackCardBorder,
                    transform: [{ rotate: "-5deg" }, { translateY: 8 }],
                  },
                ]}
              />
              <View
                style={[
                  styles.stackCard,
                  {
                    width: imageDimensions.width,
                    height: imageDimensions.height,
                    borderColor: stackCardBorder,
                    transform: [{ rotate: "4deg" }, { translateY: 5 }],
                  },
                ]}
              />
            </>
          )}
          <PanGestureHandler
            onGestureEvent={(event) => {
              if (event.nativeEvent.translationX < -30) {
                debouncedHandleSwipe("left");
              } else if (event.nativeEvent.translationX > 30) {
                debouncedHandleSwipe("right");
              }
            }}
            minDist={30}
            minVelocity={0.5}
          >
            <Animated.View
              style={{
                transform: [
                  { translateX: currentImageTranslateX },
                  { scale: pulseAnim },
                ],
              }}
            >
              <Image
                source={{ uri: currentImage.file }}
                style={[
                  {
                    width: imageDimensions.width,
                    height: imageDimensions.height,
                    alignSelf: "center",
                    resizeMode: "cover",
                  },
                  isDesktop && styles.cardImageDesktop,
                ]}
              />
            </Animated.View>
          </PanGestureHandler>
          <NewRecipeBanner visible={showBanner} />
        </View>

        {isDesktop && (
          <Pressable
            onPress={() => debouncedHandleSwipe("right")}
            accessibilityRole="button"
            accessibilityLabel="View this recipe"
            style={styles.deckArrow}
          >
            <Ionicons name="chevron-forward" size={26} color={iconColor} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  deckRow: {
    alignItems: "center",
    justifyContent: "center",
  },
  deckRowDesktop: {
    flexDirection: "row",
    gap: 28,
  },
  deckArrow: {
    padding: 14,
    borderRadius: 999,
  },
  cardStage: {
    position: "relative",
  },
  stackCard: {
    position: "absolute",
    top: 0,
    left: 0,
    borderRadius: 20,
    borderWidth: 1,
  },
  cardImageDesktop: {
    borderRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 8,
  },
});
