import { pgTable, uuid, varchar, integer, timestamp, boolean, doublePrecision } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: varchar('username', { length: 30 }).unique().notNull(),
  pin: varchar('pin', { length: 8 }).unique().notNull(),
  deviceToken: varchar('device_token'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const friendships = pgTable('friendships', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id),
  friendId: uuid('friend_id').references(() => users.id),
  tier: varchar('tier', { length: 10 }).default('standard'), // 'vip' | 'standard'
  streakCount: integer('streak_count').default(0),
  lastInteraction: timestamp('last_interaction'),
});

export const quietZones = pgTable('quiet_zones', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id),
  name: varchar('name', { length: 50 }),
  lat: doublePrecision('lat'),
  lng: doublePrecision('lng'),
  radius: integer('radius').default(100),
});
