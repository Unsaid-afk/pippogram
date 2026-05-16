import { Platform } from 'react-native';

// Safely try to load the native module; fall back to a no-op stub on
// platforms where the native binary hasn't been linked (Web, Expo Go).
let PippogramPttModule: any;

try {
  if (Platform.OS !== 'web') {
    PippogramPttModule = require('./src/PippogramPttModule').default;
  }
} catch {
  // Native module not available (Expo Go, web, etc.)
  PippogramPttModule = null;
}

export function startForegroundService(): void {
  if (Platform.OS === 'android' && PippogramPttModule?.startForegroundService) {
    PippogramPttModule.startForegroundService();
  }
}

export function initializePttFramework(): void {
  if (PippogramPttModule?.initializePttFramework) {
    PippogramPttModule.initializePttFramework();
  } else {
    console.log('[PippogramPtt] Framework init skipped (no native module)');
  }
}

export interface PttSubscription {
  remove(): void;
}

export function addPttListener(_listener: (event: any) => void): PttSubscription {
  // In Expo Go or web the native emitter is unavailable, so return a no-op.
  if (!PippogramPttModule) {
    return { remove: () => {} };
  }

  try {
    const { EventEmitter } = require('expo-modules-core');
    const emitter = new EventEmitter(PippogramPttModule);
    return emitter.addListener('onPttIncoming', _listener);
  } catch {
    return { remove: () => {} };
  }
}
