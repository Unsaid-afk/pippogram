import Fastify from 'fastify';
import { Server } from 'socket.io';

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = '0.0.0.0';

const fastify = Fastify({ logger: true });

// In-memory stores (swap for Redis in production)
const presenceCache = new Map<string, string>();
const contextCache = new Map<string, string>();

const io = new Server(fastify.server, {
  cors: { origin: '*' },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// Gamification State
const potatoSessions = new Map<string, { holder: string; timer: NodeJS.Timeout; timeLeft: number }>();
const streaks = new Map<string, number>();

// Root / landing endpoint for friendly checks
fastify.get('/', async (request, reply) => {
  reply.type('text/html').send(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Pippogram Signaling Server</title>
        <style>
          body {
            font-family: system-ui, -apple-system, sans-serif;
            background: #0F0F13;
            color: #E4E4E7;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
          }
          .container {
            text-align: center;
            padding: 2.5rem;
            background: #18181B;
            border-radius: 16px;
            border: 1px solid #27272A;
            box-shadow: 0 10px 30px rgba(0,0,0,0.5);
          }
          h1 {
            color: #8B5CF6;
            margin: 0 0 0.5rem 0;
            font-size: 2rem;
          }
          p {
            color: #A1A1AA;
            margin: 0;
            font-size: 1rem;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🚀 Pippogram Backend</h1>
          <p>Signaling server is online and operational.</p>
        </div>
      </body>
    </html>
  `);
});

// Health-check endpoint
fastify.get('/health', async () => ({ status: 'ok', uptime: process.uptime() }));

io.on('connection', (socket) => {
  const userId = socket.handshake.query.userId as string;

  if (!userId) {
    socket.disconnect();
    return;
  }

  console.log(`[+] User connected: ${userId}`);

  // Set User Online
  presenceCache.set(`presence:${userId}`, 'online');
  socket.join(`user:${userId}`);

  // Context (Active / Quiet / Driving)
  socket.on('set_context', ({ context }) => {
    contextCache.set(`context:${userId}`, context);
  });

  // 1. POKE MECHANIC
  socket.on('poke', ({ toUserId }) => {
    io.to(`user:${toUserId}`).emit('incoming_poke', { from: userId });
  });

  // 2. PTT SIGNALING
  socket.on('ptt_start', ({ toUserId, mediaStreamId }) => {
    const context = contextCache.get(`context:${toUserId}`);

    if (context === 'quiet' || context === 'driving') {
      socket.emit('ptt_status', { status: 'queued_as_voicemail' });
      return;
    }

    io.to(`user:${toUserId}`).emit('ptt_incoming', {
      from: userId,
      streamId: mediaStreamId,
      isVip: true,
    });

    // Update Streak
    const pairId = [userId, toUserId].sort().join(':');
    const currentStreak = streaks.get(pairId) || 0;
    streaks.set(pairId, currentStreak + 1);
    io.to(`user:${userId}`).to(`user:${toUserId}`).emit('streak_update', {
      pairId,
      count: currentStreak + 1,
    });
  });

  socket.on('ptt_audio', ({ toUserId, audioData }) => {
    io.to(`user:${toUserId}`).emit('ptt_audio_data', { from: userId, audioData });
  });

  socket.on('ptt_stop', ({ toUserId }) => {
    io.to(`user:${toUserId}`).emit('ptt_stopped', { from: userId });
  });

  // 3. HOT POTATO MODE
  socket.on('start_hot_potato', ({ groupId }) => {
    if (potatoSessions.has(groupId)) return;

    const session = {
      holder: userId,
      timeLeft: 15,
      timer: setInterval(() => {
        const s = potatoSessions.get(groupId);
        if (!s) return;

        s.timeLeft -= 1;
        io.to(`group:${groupId}`).emit('potato_tick', {
          timeLeft: s.timeLeft,
          holder: s.holder,
        });

        if (s.timeLeft <= 0) {
          clearInterval(s.timer);
          io.to(`group:${groupId}`).emit('potato_explode', { loser: s.holder });
          potatoSessions.delete(groupId);
        }
      }, 1000),
    };

    potatoSessions.set(groupId, session);
    socket.join(`group:${groupId}`);
    io.to(`group:${groupId}`).emit('potato_started', { holder: userId });
  });

  socket.on('join_potato', ({ groupId }) => {
    socket.join(`group:${groupId}`);
  });

  socket.on('pass_potato', ({ groupId, toUserId }) => {
    const session = potatoSessions.get(groupId);
    if (session && session.holder === userId) {
      session.holder = toUserId;
      session.timeLeft = 15;
      io.to(`group:${groupId}`).emit('potato_passed', { from: userId, to: toUserId });
    }
  });

  // 4. PIP-PAD WIDGET EVENTS
  socket.on('doodle_send', ({ toUserId, vectorData }) => {
    io.to(`user:${toUserId}`).emit('doodle_incoming', {
      from: userId,
      vectorData,
    });
  });

  socket.on('doodle_exposed', ({ toUserId }) => {
    // Start server-side 10-second self-destruct countdown
    let timeLeft = 10;
    const timer = setInterval(() => {
      timeLeft -= 1;
      io.to(`user:${userId}`).to(`user:${toUserId}`).emit('doodle_tick', {
        timeLeft,
      });

      if (timeLeft <= 0) {
        clearInterval(timer);
        io.to(`user:${userId}`).to(`user:${toUserId}`).emit('doodle_vanished');
      }
    }, 1000);
  });

  // 5. GAMIFIED PIP POINTS
  const userPoints = new Map<string, number>();
  socket.on('points_award', ({ points, activityType }) => {
    const currentPoints = userPoints.get(userId) || 0;
    const newPoints = currentPoints + points;
    userPoints.set(userId, newPoints);
    io.to(`user:${userId}`).emit('points_updated', {
      points: newPoints,
      activityType,
    });
  });

  // 6. REAL-TIME FRIEND RELATIONSHIPS
  socket.on('friend_request', ({ toUsername }) => {
    console.log(`[Friend Request] From ${userId} to ${toUsername}`);
    io.to(`user:${toUsername}`).emit('incoming_friend_request', {
      from: userId,
    });
  });

  socket.on('friend_accept', ({ toUsername }) => {
    console.log(`[Friend Accept] ${userId} accepted ${toUsername}`);
    io.to(`user:${toUsername}`).emit('friend_request_accepted', {
      from: userId,
    });
  });

  // Cleanup on disconnect
  socket.on('disconnect', () => {
    console.log(`[-] User disconnected: ${userId}`);
    presenceCache.delete(`presence:${userId}`);
    contextCache.delete(`context:${userId}`);
  });
});

fastify.listen({ port: PORT, host: HOST }, (err, address) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`\n🚀 Pippogram Signaling Server running on ${address}\n`);
});
