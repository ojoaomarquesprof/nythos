"use client";

import { useSyncExternalStore } from "react";

function subscribeToNetworkStatus(onStoreChange: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }

  window.addEventListener("online", onStoreChange);
  window.addEventListener("offline", onStoreChange);

  return () => {
    window.removeEventListener("online", onStoreChange);
    window.removeEventListener("offline", onStoreChange);
  };
}

function getNetworkSnapshot() {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

function getServerNetworkSnapshot() {
  return true;
}

export function useNetworkStatus() {
  return useSyncExternalStore(
    subscribeToNetworkStatus,
    getNetworkSnapshot,
    getServerNetworkSnapshot
  );
}
