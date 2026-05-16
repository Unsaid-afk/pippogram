import React, { useState, useEffect, useCallback } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  SafeAreaView, 
  TextInput, 
  TouchableOpacity, 
  ScrollView,
  Dimensions,
  Platform,
} from 'react-native';
import { PttButton } from './components/PttButton';
import { StatusBar } from 'expo-status-bar';
import { socketManager } from './utils/socket';
import { useAudio } from './hooks/useAudio';
import { initializePttFramework, startForegroundService } from './modules/pippogram-ptt';
import Animated, { FadeIn, FadeOut, Layout } from 'react-native-reanimated';

const { width } = Dimensions.get('window');

type MessageType = 'info' | 'error' | 'ptt';
interface LogMessage {
  id: string;
  text: string;
  type: MessageType;
}

const MESSAGE_BG: Record<MessageType, object> = {
  info: {},
  error: { backgroundColor: 'rgba(255, 59, 48, 0.1)' },
  ptt: { backgroundColor: 'rgba(52, 199, 89, 0.1)' },
};

export default function App() {
  const [status, setStatus] = useState<'idle' | 'broadcasting' | 'receiving'>('idle');
  const [userId] = useState<string>(() => Math.floor(1000 + Math.random() * 9000).toString());
  const [targetUserId, setTargetUserId] = useState<string>('');
  const [messages, setMessages] = useState<LogMessage[]>([]);
  const [streak, setStreak] = useState<number>(0);
  const [potatoData, setPotatoData] = useState<{ timeLeft: number; holder: string } | null>(null);
  const [context, setContext] = useState<string>('active');
  const [connected, setConnected] = useState(false);
  
  const { startRecording, stopRecording, playAudio } = useAudio();

  const addMessage = useCallback((text: string, type: MessageType = 'info') => {
    setMessages(prev => [{ id: Date.now().toString() + Math.random(), text, type }, ...prev].slice(0, 5));
  }, []);

  // Initialize native PTT (safe no-op if unavailable)
  useEffect(() => {
    try { initializePttFramework(); } catch {}
    try { startForegroundService(); } catch {}
  }, []);

  // Socket connection
  useEffect(() => {
    socketManager.connect(userId);
    const socket = socketManager.getSocket();
    if (!socket) return;

    socket.on('connect', () => {
      setConnected(true);
      addMessage('Connected to server', 'info');
      socket.emit('set_context', { context });
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    socket.on('ptt_incoming', (data: any) => {
      setStatus('receiving');
      addMessage(`Incoming audio from ${data.from}`, 'ptt');
    });

    socket.on('ptt_audio_data', async (data: any) => {
      if (data.audioData) {
        try { await playAudio(data.audioData); } catch {}
      }
    });

    socket.on('ptt_stopped', () => {
      setStatus('idle');
    });

    socket.on('ptt_status', (data: any) => {
      if (data.status === 'queued_as_voicemail') {
        addMessage('User unavailable — saved as voicemail', 'error');
      }
    });

    socket.on('streak_update', (data: any) => {
      setStreak(data.count);
    });

    socket.on('incoming_poke', (data: any) => {
      addMessage(`👆 Poked by ${data.from}!`, 'info');
    });

    socket.on('potato_started', (data: any) => {
      addMessage(`🥔 Hot Potato started! Holder: ${data.holder}`, 'info');
    });

    socket.on('potato_tick', (data: any) => {
      setPotatoData(data);
    });

    socket.on('potato_passed', (data: any) => {
      addMessage(`🥔 Potato passed from ${data.from} → ${data.to}`, 'info');
    });

    socket.on('potato_explode', (data: any) => {
      const loserText = data.loser === userId ? 'YOU LOST! 💥' : `${data.loser} exploded! 💥`;
      addMessage(loserText, 'error');
      setPotatoData(null);
    });

    return () => {
      socketManager.disconnect();
    };
  }, [userId]);

  // Context changes → tell server
  useEffect(() => {
    const socket = socketManager.getSocket();
    if (socket?.connected) {
      socket.emit('set_context', { context });
    }
  }, [context]);

  const handleStartPtt = async () => {
    if (!targetUserId) {
      addMessage('Enter a Target User ID first', 'error');
      return;
    }
    setStatus('broadcasting');
    await startRecording();
    socketManager.getSocket()?.emit('ptt_start', {
      toUserId: targetUserId,
      mediaStreamId: 'stream-' + Date.now(),
    });
  };

  const handleStopPtt = async () => {
    if (status !== 'broadcasting') return;
    setStatus('idle');
    const uri = await stopRecording();
    const socket = socketManager.getSocket();
    if (uri && socket) {
      socket.emit('ptt_audio', { toUserId: targetUserId, audioData: uri });
    }
    socket?.emit('ptt_stop', { toUserId: targetUserId });
  };

  const handlePoke = () => {
    if (!targetUserId) {
      addMessage('Enter a Target User ID first', 'error');
      return;
    }
    socketManager.getSocket()?.emit('poke', { toUserId: targetUserId });
    addMessage(`Poked ${targetUserId}`, 'info');
  };

  const handleStartPotato = () => {
    socketManager.getSocket()?.emit('start_hot_potato', { groupId: 'global' });
  };

  const handlePassPotato = () => {
    if (!targetUserId) {
      addMessage('Target ID needed to pass!', 'error');
      return;
    }
    socketManager.getSocket()?.emit('pass_potato', { groupId: 'global', toUserId: targetUserId });
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>PIPPOGRAM</Text>
            <View style={styles.headerMeta}>
              <Text style={styles.userId}>ID: <Text style={styles.idHighlight}>{userId}</Text></Text>
              <View style={[styles.dot, connected ? styles.dotOnline : styles.dotOffline]} />
            </View>
          </View>
          {streak > 0 && (
            <Animated.View entering={FadeIn} style={styles.streakBadge}>
              <Text style={styles.streakText}>🔥 {streak}</Text>
            </Animated.View>
          )}
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {/* Hot Potato Banner */}
          {potatoData && (
            <View style={styles.potatoCard}>
              <View style={styles.potatoGradient}>
                <View style={styles.potatoInfo}>
                  <Text style={styles.potatoLabel}>🥔 HOT POTATO</Text>
                  <Text style={styles.potatoHolder}>
                    {potatoData.holder === userId ? 'YOU HAVE IT!' : `Holder: ${potatoData.holder}`}
                  </Text>
                </View>
                <Text style={[styles.potatoTimer, potatoData.timeLeft <= 5 && styles.potatoTimerDanger]}>
                  {potatoData.timeLeft}s
                </Text>
              </View>
              {potatoData.holder === userId && (
                <TouchableOpacity style={styles.passButton} onPress={handlePassPotato} activeOpacity={0.7}>
                  <Text style={styles.passButtonText}>⚡ PASS TO TARGET</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Context Selector */}
          <View style={styles.mainControls}>
            <View style={styles.contextSelector}>
              {(['active', 'quiet', 'driving'] as const).map((ctx) => (
                <TouchableOpacity 
                  key={ctx} 
                  style={[styles.contextBtn, context === ctx && styles.contextBtnActive]}
                  onPress={() => setContext(ctx)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.contextBtnText, context === ctx && styles.contextBtnTextActive]}>
                    {ctx === 'active' ? '🟢' : ctx === 'quiet' ? '🤫' : '🚗'} {ctx.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Target Input */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>TARGET USER</Text>
              <TextInput 
                style={styles.input} 
                value={targetUserId} 
                onChangeText={setTargetUserId} 
                placeholder="Enter friend's ID"
                placeholderTextColor="#555"
                keyboardType="numeric"
                returnKeyType="done"
              />
            </View>

            {/* Poke Button */}
            <TouchableOpacity style={styles.pokeButton} onPress={handlePoke} activeOpacity={0.7}>
              <Text style={styles.pokeButtonText}>👆 POKE</Text>
            </TouchableOpacity>

            {/* Status Indicator */}
            <View style={styles.statusContainer}>
              <Text style={[
                styles.statusText,
                status === 'broadcasting' && { color: '#FF3B30' },
                status === 'receiving' && { color: '#34C759' }
              ]}>
                {status === 'idle' ? 'READY TO TALK' : status.toUpperCase()}
              </Text>
            </View>

            {/* PTT Button */}
            <PttButton status={status} onStart={handleStartPtt} onStop={handleStopPtt} />
            
            {/* Hot Potato Start */}
            {!potatoData && (
              <TouchableOpacity onPress={handleStartPotato} style={styles.gameLink} activeOpacity={0.7}>
                <Text style={styles.gameLinkText}>🥔 Start Hot Potato Game</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Message Log */}
          <View style={styles.messagesContainer}>
            <Text style={styles.messagesTitle}>ACTIVITY</Text>
            {messages.length === 0 && (
              <Text style={styles.emptyText}>No activity yet</Text>
            )}
            {messages.map((msg) => (
              <Animated.View key={msg.id} entering={FadeIn} layout={Layout} style={[styles.message, MESSAGE_BG[msg.type]]}>
                <Text style={styles.messageText}>{msg.text}</Text>
              </Animated.View>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F13',
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'android' ? 40 : 10,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: '#FFF',
    letterSpacing: 2,
  },
  headerMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  userId: {
    color: '#888',
    fontSize: 12,
    fontWeight: '600',
  },
  idHighlight: {
    color: '#007AFF',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: 8,
  },
  dotOnline: {
    backgroundColor: '#34C759',
  },
  dotOffline: {
    backgroundColor: '#FF3B30',
  },
  streakBadge: {
    backgroundColor: 'rgba(255, 215, 0, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.3)',
  },
  streakText: {
    color: '#FFD700',
    fontWeight: 'bold',
    fontSize: 14,
  },
  scrollContent: {
    paddingBottom: 60,
  },
  // Hot Potato
  potatoCard: {
    marginHorizontal: 24,
    marginTop: 20,
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 10,
    backgroundColor: '#2C1810',
    borderWidth: 1,
    borderColor: '#FF3B30',
  },
  potatoGradient: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: 'rgba(255, 59, 48, 0.15)',
  },
  potatoInfo: { flex: 1 },
  potatoLabel: {
    color: '#FF9500',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
  },
  potatoHolder: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 4,
  },
  potatoTimer: {
    color: '#FFF',
    fontSize: 32,
    fontWeight: '900',
  },
  potatoTimerDanger: {
    color: '#FF3B30',
  },
  passButton: {
    padding: 14,
    alignItems: 'center',
    backgroundColor: 'rgba(255,59,48,0.2)',
  },
  passButtonText: {
    color: '#FF3B30',
    fontWeight: 'bold',
    fontSize: 14,
    letterSpacing: 1,
  },
  // Main Controls
  mainControls: {
    alignItems: 'center',
    marginTop: 20,
  },
  contextSelector: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
    width: width - 48,
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  contextBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  contextBtnActive: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  contextBtnText: {
    color: '#555',
    fontSize: 10,
    fontWeight: '900',
  },
  contextBtnTextActive: {
    color: '#FFF',
  },
  inputGroup: {
    width: width - 48,
    backgroundColor: 'rgba(255,255,255,0.03)',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  label: {
    color: '#555',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: 8,
  },
  input: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '600',
    padding: 0,
  },
  pokeButton: {
    marginTop: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingVertical: 10,
    paddingHorizontal: 30,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  pokeButtonText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
  },
  statusContainer: {
    height: 30,
    justifyContent: 'center',
    marginTop: 20,
  },
  statusText: {
    color: '#444',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 3,
  },
  gameLink: {
    marginTop: 10,
    paddingVertical: 8,
  },
  gameLinkText: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '600',
  },
  // Messages
  messagesContainer: {
    marginTop: 30,
    paddingHorizontal: 24,
  },
  messagesTitle: {
    color: '#444',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2,
    marginBottom: 12,
  },
  emptyText: {
    color: '#333',
    fontSize: 13,
    fontStyle: 'italic',
  },
  message: {
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  messageText: {
    color: '#BBB',
    fontSize: 13,
  },
});
