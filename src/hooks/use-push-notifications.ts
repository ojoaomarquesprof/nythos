"use client";

import { useState, useEffect, useCallback } from "react";

interface PushNotificationState {
  isSupported: boolean;
  permission: NotificationPermission | "default";
  subscription: PushSubscription | null;
  isLoading: boolean;
}

export function usePushNotifications() {
  const [state, setState] = useState<PushNotificationState>({
    isSupported: false,
    permission: "default",
    subscription: null,
    isLoading: false,
  });

  useEffect(() => {
    const isSupported =
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;

    setState((prev) => ({
      ...prev,
      isSupported,
      permission: isSupported ? Notification.permission : "default",
    }));

    if (isSupported && Notification.permission === "granted") {
      getExistingSubscription();
    }
  }, []);

  const getExistingSubscription = async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      setState((prev) => ({ ...prev, subscription }));
    } catch (error) {
      console.error("Error getting push subscription:", error);
    }
  };

  const subscribe = useCallback(async () => {
    if (!state.isSupported) return null;

    setState((prev) => ({ ...prev, isLoading: true }));

    try {
      const permission = await Notification.requestPermission();
      setState((prev) => ({ ...prev, permission }));

      if (permission !== "granted") {
        setState((prev) => ({ ...prev, isLoading: false }));
        return null;
      }

      const registration = await navigator.serviceWorker.ready;
      const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

      if (!vapidPublicKey) {
        console.warn("VAPID public key not configured");
        setState((prev) => ({ ...prev, isLoading: false }));
        return null;
      }

      const keyArray = urlBase64ToUint8Array(vapidPublicKey);
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyArray.buffer as ArrayBuffer,
      });

      setState((prev) => ({ ...prev, subscription, isLoading: false }));
      return subscription;
    } catch (error) {
      console.error("Error subscribing to push:", error);
      setState((prev) => ({ ...prev, isLoading: false }));
      return null;
    }
  }, [state.isSupported]);

  const unsubscribe = useCallback(async () => {
    if (!state.subscription) return;

    try {
      await state.subscription.unsubscribe();
      setState((prev) => ({ ...prev, subscription: null }));
    } catch (error) {
      console.error("Error unsubscribing:", error);
    }
  }, [state.subscription]);

  return {
    ...state,
    subscribe,
    unsubscribe,
  };
}

// Helper to convert VAPID key
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
