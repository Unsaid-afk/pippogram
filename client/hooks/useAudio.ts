import { useState, useRef, useCallback } from 'react';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';

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

  const playAudio = useCallback(async (audioSource: string) => {
    if (!Audio) return;

    try {
      let playUri = audioSource;

      // If the incoming audio is base64 data URL
      if (audioSource.startsWith('data:') && audioSource.includes('base64,')) {
        const base64Data = audioSource.split('base64,')[1];
        const tempUri = `${FileSystem.cacheDirectory}incoming_voice_${Date.now()}.m4a`;
        await FileSystem.writeAsStringAsync(tempUri, base64Data, {
          encoding: FileSystem.EncodingType.Base64,
        });
        playUri = tempUri;
      }

      if (soundRef.current) {
        try { await soundRef.current.unloadAsync(); } catch {}
      }
      
      const { sound } = await Audio.Sound.createAsync({ uri: playUri });
      soundRef.current = sound;
      
      sound.setOnPlaybackStatusUpdate((status: any) => {
        if (status.didJustFinish) {
          sound.unloadAsync().catch(() => {});
          soundRef.current = null;
          // Safely delete the temporary cached file
          if (playUri.startsWith(FileSystem.cacheDirectory)) {
            FileSystem.deleteAsync(playUri, { idempotent: true }).catch(() => {});
          }
        }
      });

      await sound.playAsync();
    } catch (err) {
      console.error('[useAudio] Failed to play audio', err);
    }
  }, []);

  return { startRecording, stopRecording, playAudio, isRecording };
};
