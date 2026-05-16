import React from 'react';
import { StyleSheet, Pressable, Vibration, View, Text } from 'react-native';
import Animated, { 
  useAnimatedStyle, 
  withSpring, 
  useSharedValue, 
  withRepeat, 
  withTiming,
} from 'react-native-reanimated';

interface PttButtonProps {
  onStart: () => void;
  onStop: () => void;
  status: 'idle' | 'broadcasting' | 'receiving';
}

const STATUS_COLORS = {
  idle: '#333',
  broadcasting: '#FF3B30',
  receiving: '#34C759',
};

const STATUS_ICONS = {
  idle: '🎙',
  broadcasting: '🔴',
  receiving: '🟢',
};

export const PttButton: React.FC<PttButtonProps> = ({ onStart, onStop, status }) => {
  const scale = useSharedValue(1);
  const pulse = useSharedValue(1);

  React.useEffect(() => {
    if (status !== 'idle') {
      pulse.value = withRepeat(withTiming(1.08, { duration: 800 }), -1, true);
    } else {
      pulse.value = withSpring(1);
    }
  }, [status]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value * pulse.value }],
    backgroundColor: STATUS_COLORS[status],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(1.08);
    try { Vibration.vibrate(15); } catch {}
    onStart();
  };

  const handlePressOut = () => {
    scale.value = withSpring(1);
    onStop();
  };

  return (
    <View style={styles.wrapper}>
      <Pressable onPressIn={handlePressIn} onPressOut={handlePressOut} style={styles.container}>
        <Animated.View style={[styles.circle, animatedStyle]}>
          <Text style={styles.icon}>{STATUS_ICONS[status]}</Text>
          <Text style={styles.holdLabel}>
            {status === 'idle' ? 'HOLD TO TALK' : status === 'broadcasting' ? 'RELEASE' : 'LISTENING'}
          </Text>
        </Animated.View>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    padding: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: {
    width: 160,
    height: 160,
    borderRadius: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circle: { 
    width: 140, 
    height: 140, 
    borderRadius: 70, 
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 15,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: 32,
    marginBottom: 4,
  },
  holdLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
  },
});
