/**
 * Toast Notification Component
 * Displays sequential toast messages with queue management
 */

import React, { useState, useEffect, useRef } from 'react'
import { Animated, StyleSheet, Text, TouchableOpacity } from 'react-native'

interface ToastMessage {
  id: string
  message: string
  onTap?: () => void
  tappable?: boolean
}

interface ToastProps {
  duration?: number // Default 5000ms
}

// Internal queue management
let toastQueue: ToastMessage[] = []
const queueUpdateListeners: Set<() => void> = new Set()

const notifyQueueUpdate = () => {
  queueUpdateListeners.forEach((listener) => listener())
}

// Imperative API
export const ToastQueue = {
  show: (message: string, options?: { onTap?: () => void; tappable?: boolean }) => {
    const toast: ToastMessage = {
      id: `toast-${Date.now()}-${Math.random()}`,
      message,
      onTap: options?.onTap,
      tappable: options?.tappable || false,
    }
    toastQueue.push(toast)
    notifyQueueUpdate()
  },

  clear: () => {
    toastQueue = []
    notifyQueueUpdate()
  },
}

export const Toast: React.FC<ToastProps> = ({ duration = 5000 }) => {
  const [currentToast, setCurrentToast] = useState<ToastMessage | null>(null)
  const [internalQueue, setInternalQueue] = useState<ToastMessage[]>([])
  const fadeAnim = useRef(new Animated.Value(0)).current
  const isDisplaying = useRef(false)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  // Subscribe to queue updates
  useEffect(() => {
    const updateQueue = () => {
      setInternalQueue([...toastQueue])
    }

    queueUpdateListeners.add(updateQueue)
    return () => {
      queueUpdateListeners.delete(updateQueue)
    }
  }, [])

  // Process queue
  useEffect(() => {
    if (isDisplaying.current || internalQueue.length === 0 || currentToast !== null) {
      return
    }

    // Dequeue first message
    const nextToast = internalQueue[0]
    toastQueue = toastQueue.filter((t) => t.id !== nextToast.id)
    setCurrentToast(nextToast)
    isDisplaying.current = true

    // Fade in animation
    fadeAnim.setValue(0)
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start()

    // Clear any existing timer before setting a new one
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }

    // Set auto-hide timer
    timerRef.current = setTimeout(() => {
      // Fade out animation
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => {
        setCurrentToast(null)
        isDisplaying.current = false
        // Trigger queue update to process next toast
        setInternalQueue([...toastQueue])
      })
    }, duration)
  }, [currentToast, internalQueue, duration, fadeAnim])

  // Cleanup timer on unmount only
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [])

  if (!currentToast) {
    return null
  }

  const toastContent = (
    <Animated.View style={[styles.toast, { opacity: fadeAnim }]}>
      <Text style={styles.toastText}>{currentToast.message}</Text>
    </Animated.View>
  )

  if (currentToast.tappable && currentToast.onTap) {
    return (
      <TouchableOpacity onPress={currentToast.onTap} activeOpacity={0.8}>
        {toastContent}
      </TouchableOpacity>
    )
  }

  return toastContent
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    bottom: 100,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    borderRadius: 8,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  toastText: {
    color: 'white',
    fontSize: 14,
    textAlign: 'center',
  },
})
