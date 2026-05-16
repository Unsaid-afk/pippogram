import { useState, useRef, useCallback } from 'react';
import { Platform } from 'react-native';

let Audio: any = null;
try {
  Audio = require('expo-av').Audio;
} catch {
  // expo-av not available
}

export const useAudio = () => {
  const [recording, setRecording] = useState<any>(null);
  const [isRecording, setIsRecording] = useState(false);
  const soundRef = useRef<any>(null);

  const startRecording = useCallback(async () => {
    if (!Audio) {
      console.warn('[useAudio] expo-av not available');
      return;
    }

    try {
      // Request permissions
      const perm = await Audio.requestPermissionsAsync();
      if (perm.status !== 'granted') {
        console.warn('[useAudio] Microphone permission not granted');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording: rec } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.LOW_QUALITY
      );
      setRecording(rec);
      setIsRecording(true);
    } catch (err) {
      console.error('[useAudio] Failed to start recording', err);
    }
  }, []);

  const stopRecording = useCallback(async (): Promise<string | null> => {
    setIsRecording(false);
    if (!recording) return null;

    try {
      await recording.stopAndUnloadAsync();
      await Audio?.setAudioModeAsync({
        allowsRecordingIOS: false,
      });
      const uri = recording.getURI();
      setRecording(null);
      return uri;
    } catch (err) {
      console.error('[useAudio] Failed to stop recording', err);
      setRecording(null);
      return null;
    }
  }, [recording]);

  const playAudio = useCallback(async (uri: string) => {
    if (!Audio) return;

    try {
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
      }
      const { sound } = await Audio.Sound.createAsync({ uri });
      soundRef.current = sound;
      
      sound.setOnPlaybackStatusUpdate((status: any) => {
        if (status.didJustFinish) {
          sound.unloadAsync();
          soundRef.current = null;
        }
      });

      await sound.playAsync();
    } catch (err) {
      console.error('[useAudio] Failed to play audio', err);
    }
  }, []);

  return { startRecording, stopRecording, playAudio, isRecording };
};
