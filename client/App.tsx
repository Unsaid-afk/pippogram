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
  Vibration,
} from 'react-native';
import { PttButton } from './components/PttButton';
import { StatusBar } from 'expo-status-bar';
import { socketManager } from './utils/socket';
import { useAudio } from './hooks/useAudio';
import { initializePttFramework, startForegroundService } from './modules/pippogram-ptt';
import Animated, { FadeIn, FadeOut, Layout } from 'react-native-reanimated';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';

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
  const [pokeFrom, setPokeFrom] = useState<string | null>(null);
  
  // Gamification & Pip-Pad Drawing states
  const [pipPoints, setPipPoints] = useState<number>(0);
  const [pointsLedger, setPointsLedger] = useState<Array<{ activity: string; points: number; id: string }>>([]);
  const [localDoodle, setLocalDoodle] = useState<Array<{ x: number; y: number }>>([]);
  const [incomingDoodle, setIncomingDoodle] = useState<Array<{ x: number; y: number }> | null>(null);
  const [doodleFrom, setDoodleFrom] = useState<string | null>(null);
  const [doodleTimeLeft, setDoodleTimeLeft] = useState<number | null>(null);
  
  const { startRecording, stopRecording, playAudio } = useAudio();

  const addMessage = useCallback((text: string, type: MessageType = 'info') => {
    setMessages(prev => [{ id: Date.now().toString() + Math.random(), text, type }, ...prev].slice(0, 5));
  }, []);

  // Initialize native PTT and request permissions on first install/launch
  useEffect(() => {
    async function requestAllPermissions() {
      try {
        const { status } = await Audio.requestPermissionsAsync();
        if (status === 'granted') {
          addMessage('🎙️ Mic permission granted!', 'info');
        } else {
          addMessage('⚠️ Mic permission denied! Talk won\'t work.', 'error');
        }
      } catch (err) {
        console.error('Failed to request microphone permission:', err);
      }
    }

    requestAllPermissions();
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
      try {
        Vibration.vibrate([0, 300, 100, 300]);
      } catch {}
      setPokeFrom(data.from);
      setTimeout(() => {
        setPokeFrom(curr => curr === data.from ? null : curr);
      }, 5000);
      
      // Auto-award 5 points for receiving a poke
      socketManager.getSocket()?.emit('points_award', { points: 5, activityType: '🎙️ Poke Received' });
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

    // 4. PIP-PAD DOODLE WIDGET LISTENERS
    socket.on('doodle_incoming', (data: any) => {
      addMessage(`🎨 Incoming Pip-Pad Doodle from ${data.from}!`, 'info');
      try {
        Vibration.vibrate([0, 200, 50, 200]);
      } catch {}
      setIncomingDoodle(data.vectorData);
      setDoodleFrom(data.from);
      setDoodleTimeLeft(10);
      
      // Notify server that recipient is actively looking, initiating self-destruct countdown!
      socketManager.getSocket()?.emit('doodle_exposed', { toUserId: data.from });
    });

    socket.on('doodle_tick', (data: any) => {
      setDoodleTimeLeft(data.timeLeft);
    });

    socket.on('doodle_vanished', () => {
      setIncomingDoodle(null);
      setDoodleFrom(null);
      setDoodleTimeLeft(null);
      addMessage('🔥 Doodle vanished (ephemeral self-destructed)!', 'error');
      try { Vibration.vibrate(100); } catch {}
      
      // Award 25 points for checking doodle!
      socketManager.getSocket()?.emit('points_award', { points: 25, activityType: '⚡ Checked Doodle' });
    });

    // 5. GAMIFICATION LEDGER
    socket.on('points_updated', (data: any) => {
      setPipPoints(data.points);
      setPointsLedger(prev => [
        { activity: data.activityType, points: data.points, id: Date.now().toString() + Math.random() },
        ...prev
      ].slice(0, 4));
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
      try {
        const base64Audio = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const audioDataUrl = `data:audio/x-m4a;base64,${base64Audio}`;
        socket.emit('ptt_audio', { toUserId: targetUserId, audioData: audioDataUrl });
      } catch (err) {
        console.error('Failed to read audio file as base64:', err);
      }
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
    
    // Award 5 points for poking
    socketManager.getSocket()?.emit('points_award', { points: 5, activityType: '🎙️ Poke Sent' });
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

  // Pip-Pad Doodle handlers
  const handleDoodleTouchMove = (evt: any) => {
    const { locationX, locationY } = evt.nativeEvent;
    if (locationX >= 0 && locationX <= 260 && locationY >= 0 && locationY <= 220) {
      setLocalDoodle(prev => [...prev, { x: Math.floor(locationX), y: Math.floor(locationY) }]);
    }
  };

  const handleDoodleSend = () => {
    if (!targetUserId) {
      addMessage('Enter a Target User ID first', 'error');
      return;
    }
    if (localDoodle.length === 0) {
      addMessage('Draw something on the canvas first!', 'error');
      return;
    }
    
    // Emit doodle vector list to recipient
    socketManager.getSocket()?.emit('doodle_send', {
      toUserId: targetUserId,
      vectorData: localDoodle,
    });
    
    addMessage(`🎨 Doodle sent to ${targetUserId}!`, 'info');
    try { Vibration.vibrate(50); } catch {}
    setLocalDoodle([]);
    
    // Award 25 points for sending a doodle!
    socketManager.getSocket()?.emit('points_award', { points: 25, activityType: '⚡ Doodle Sent' });
  };

  const handleDoodleClear = () => {
    setLocalDoodle([]);
    try { Vibration.vibrate(15); } catch {}
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
          <View style={styles.headerScoreGroup}>
            {streak > 0 && (
              <Animated.View entering={FadeIn} style={styles.streakBadge}>
                <Text style={styles.streakText}>🔥 {streak}</Text>
              </Animated.View>
            )}
            <View style={styles.pointsBadge}>
              <Text style={styles.pointsText}>✨ {pipPoints} XP</Text>
            </View>
          </View>
        </View>

        {/* Animated Poke Notification Banner */}
        {pokeFrom && (
          <Animated.View 
            entering={FadeIn.duration(300)} 
            exiting={FadeOut.duration(300)} 
            style={styles.notificationBanner}
          >
            <Text style={styles.notificationText}>👆 <Text style={{fontWeight: 'bold', color: '#FFF'}}>{pokeFrom}</Text> poked you!</Text>
            <TouchableOpacity 
              style={styles.pokeBackBtn} 
              onPress={() => {
                setTargetUserId(pokeFrom);
                socketManager.getSocket()?.emit('poke', { toUserId: pokeFrom });
                addMessage(`Poked back ${pokeFrom}`, 'info');
                setPokeFrom(null);
              }}
            >
              <Text style={styles.pokeBackBtnText}>POKE BACK</Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* Ephemeral Incoming Pip-Pad Doodle Card */}
        {incomingDoodle && (
          <Animated.View entering={FadeIn.duration(350)} exiting={FadeOut.duration(350)} style={styles.incomingDoodleCard}>
            <View style={styles.doodleCardHeader}>
              <Text style={styles.doodleCardTitle}>🎨 PIP-PAD FROM {doodleFrom}</Text>
              <View style={styles.doodleCardTimerBadge}>
                <Text style={styles.doodleCardTimerText}>💥 {doodleTimeLeft}s</Text>
              </View>
            </View>
            <View style={styles.doodleCanvasViewer}>
              {incomingDoodle.map((pt, i) => (
                <View 
                  key={i} 
                  style={[
                    styles.doodleDot, 
                    { left: pt.x, top: pt.y, backgroundColor: '#8B5CF6' }
                  ]} 
                />
              ))}
            </View>
            <Text style={styles.doodleCardFooter}>This doodle is ephemeral and will self-destruct shortly!</Text>
          </Animated.View>
        )}

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

          {/* Pip-Pad Interactive Doodle Sandbox */}
          <View style={styles.doodleBox}>
            <Text style={styles.doodleBoxLabel}>🎨 WIDGET PIP-PAD SANDBOX</Text>
            <Text style={styles.doodleBoxDesc}>Draw a live doodle directly onto target friend's widget screen!</Text>
            
            <View 
              style={styles.doodleCanvas} 
              onStartShouldSetResponder={() => true}
              onMoveShouldSetResponder={() => true}
              onResponderMove={handleDoodleTouchMove}
            >
              {localDoodle.map((pt, i) => (
                <View 
                  key={i} 
                  style={[
                    styles.doodleDot, 
                    { left: pt.x, top: pt.y, backgroundColor: '#FFF' }
                  ]} 
                />
              ))}
              {localDoodle.length === 0 && (
                <Text style={styles.canvasPlaceholder}>DRAG FINGER HERE TO SKETCH</Text>
              )}
            </View>

            <View style={styles.doodleBtnGroup}>
              <TouchableOpacity style={styles.doodleClearBtn} onPress={handleDoodleClear} activeOpacity={0.7}>
                <Text style={styles.doodleClearBtnText}>WIPE 🧹</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.doodleSendBtn} onPress={handleDoodleSend} activeOpacity={0.7}>
                <Text style={styles.doodleSendBtnText}>SEND DOODLE ⚡</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Gamified Pip XP Ledger */}
          {pointsLedger.length > 0 && (
            <View style={styles.ledgerSection}>
              <Text style={styles.ledgerTitle}>✨ PIP XP LEDGER (AUDIT)</Text>
              {pointsLedger.map((item) => (
                <View key={item.id} style={styles.ledgerItem}>
                  <Text style={styles.ledgerActivity}>{item.activity}</Text>
                  <View style={styles.ledgerPointsBadge}>
                    <Text style={styles.ledgerPointsText}>+{item.points} XP</Text>
                  </View>
                </View>
              ))}
            </View>
          )}

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
  notificationBanner: {
    position: 'absolute',
    top: Platform.OS === 'android' ? 100 : 70,
    left: 24,
    right: 24,
    backgroundColor: '#8B5CF6',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 9999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  notificationText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  pokeBackBtn: {
    backgroundColor: '#FFF',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginLeft: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  pokeBackBtnText: {
    color: '#8B5CF6',
    fontWeight: '900',
    fontSize: 11,
    letterSpacing: 0.5,
  },
  headerScoreGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pointsBadge: {
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.3)',
    marginLeft: 8,
  },
  pointsText: {
    color: '#A78BFA',
    fontWeight: 'bold',
    fontSize: 14,
  },
  incomingDoodleCard: {
    marginHorizontal: 24,
    marginTop: 20,
    backgroundColor: '#1E1B4B',
    borderRadius: 24,
    borderWidth: 2,
    borderColor: '#8B5CF6',
    padding: 20,
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  doodleCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  doodleCardTitle: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
  },
  doodleCardTimerBadge: {
    backgroundColor: '#FF3B30',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  doodleCardTimerText: {
    color: '#FFF',
    fontWeight: '900',
    fontSize: 12,
  },
  doodleCanvasViewer: {
    width: 260,
    height: 220,
    backgroundColor: '#0F0F13',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    overflow: 'hidden',
    alignSelf: 'center',
    position: 'relative',
  },
  doodleDot: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  doodleCardFooter: {
    color: '#818CF8',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 12,
    fontWeight: '600',
  },
  doodleBox: {
    width: width - 48,
    backgroundColor: '#1C1917',
    padding: 20,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: '#FF9500',
    marginTop: 24,
    alignSelf: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  doodleBoxLabel: {
    color: '#FF9500',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  doodleBoxDesc: {
    color: '#A8A29E',
    fontSize: 12,
    marginBottom: 16,
  },
  doodleCanvas: {
    width: 260,
    height: 220,
    backgroundColor: '#0C0A09',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#44403C',
    alignSelf: 'center',
    position: 'relative',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  canvasPlaceholder: {
    color: '#44403C',
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  doodleBtnGroup: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
    width: 260,
    alignSelf: 'center',
  },
  doodleClearBtn: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  doodleClearBtnText: {
    color: '#D6D3D1',
    fontWeight: 'bold',
    fontSize: 13,
  },
  doodleSendBtn: {
    backgroundColor: '#FF9500',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    shadowColor: '#FF9500',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  doodleSendBtnText: {
    color: '#000',
    fontWeight: '900',
    fontSize: 13,
    letterSpacing: 0.5,
  },
  ledgerSection: {
    width: width - 48,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    borderRadius: 20,
    padding: 20,
    marginTop: 24,
    alignSelf: 'center',
  },
  ledgerTitle: {
    color: '#555',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2,
    marginBottom: 12,
  },
  ledgerItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.02)',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  ledgerActivity: {
    color: '#BBB',
    fontSize: 12,
    fontWeight: '600',
  },
  ledgerPointsBadge: {
    backgroundColor: 'rgba(52, 199, 89, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  ledgerPointsText: {
    color: '#34C759',
    fontSize: 11,
    fontWeight: 'bold',
  },
});
