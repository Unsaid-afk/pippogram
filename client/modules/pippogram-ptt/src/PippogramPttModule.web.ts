import { EventEmitter } from 'expo-modules-core';

const PippogramPttModule = {
  initializePttFramework: () => {
    console.log('[Web] Pippogram PTT Framework: No-op on web');
  },
  startForegroundService: () => {
    console.log('[Web] Foreground Service: No-op on web');
  },
  addListener: (eventName: string, listener: (...args: any[]) => void) => {
    console.log(`[Web] Subscribed to ${eventName}`);
  },
  removeListeners: (eventName: string) => {
    console.log(`[Web] Unsubscribed from ${eventName}`);
  }
};

export default PippogramPttModule;
