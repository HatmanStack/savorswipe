import { useState, useEffect, useCallback } from 'react';
import { Dimensions } from 'react-native';
import { ImageDimensions } from '@/types';

interface ResponsiveLayoutConfig {
  mobileBreakpoint?: number;
  tabletBreakpoint?: number;
}

export const useResponsiveLayout = (config: ResponsiveLayoutConfig = {}) => {
  const { mobileBreakpoint = 768, tabletBreakpoint = 1024 } = config;
  
  const [dimensions, setDimensions] = useState<ImageDimensions>(() => Dimensions.get('window'));
  
  const updateDimensions = useCallback(() => {
    setDimensions(Dimensions.get('window'));
  }, []);

  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', updateDimensions);
    return () => {
      subscription?.remove();
    };
  }, [updateDimensions]);

  const isMobile = dimensions.width < mobileBreakpoint;
  const isTablet = dimensions.width >= mobileBreakpoint && dimensions.width < tabletBreakpoint;
  const isDesktop = dimensions.width >= tabletBreakpoint;

  const getImageDimensions = useCallback((baseWidth: number = 1000, baseHeight: number = 700) => {
    if (isMobile) {
      return {
        width: dimensions.width,
        height: dimensions.height,
      };
    }
    return {
      width: Math.min(baseWidth, dimensions.width),
      height: Math.min(baseHeight, dimensions.height),
    };
  }, [dimensions, isMobile]);

  const getContentWidth = useCallback(() => {
    if (isMobile) return dimensions.width;
    if (isTablet) return Math.min(dimensions.width * 0.9, 800);
    return Math.min(dimensions.width * 0.8, 1200);
  }, [dimensions, isMobile, isTablet]);

  return {
    dimensions,
    isMobile,
    isTablet,
    isDesktop,
    getImageDimensions,
    getContentWidth,
    updateDimensions,
  };
};