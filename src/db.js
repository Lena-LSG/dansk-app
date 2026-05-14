/**
 * db.js — Local SQLite cache layer
 *
 * Supabase is the source of truth. This module provides:
 *   - A local SQLite cache for questions (offline access)
 *   - A local SQLite buffer for progress (fast writes, synced to Supabase)
 *
 * All functions are async. Consumers should not care whether data
 * came from SQLite or Supabase — that detail lives here.
 *
 * See DANSK_ARCHITECTURE.md for full design rationale.
 */

import * as SQLite from 'expo-sqlite';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

const DB_NAME = 'dansk.db';
const VERSION_KEY = 'dk_question_version';

let _db = null;

// ── INIT ──────────────────────────────────────────────────────────────────────

/**
 * Open the SQLite database and create tables if they don't exist.
 * Call once on app startup before any other db functions.
 */
export const initDb = async () => {
  // TODO: open DB with SQLite.openDatabaseAsync
  // TODO: create questions table
  // TODO: create progress table
  // TODO: create sync_queue table
};

// ── QUESTIONS ─────────────────────────────────────────────────────────────────

/**
 * Check remote question_version against locally stored version.
 * If different (or no local cache), fetch all questions from Supabase
 * and replace local SQLite cache entirely.
 * If network unavailable, use existing local cache silently.
 *
 * @returns {boolean} true if questions were refreshed from Supabase
 */
export const syncQuestions = async () => {
  // TODO: fetch remote version from question_version table
  // TODO: compare to AsyncStorage VERSION_KEY
  // TODO: if same → return false (cache is fresh)
  // TODO: if different → fetch all questions from Supabase
  // TODO:   → delete all rows from local questions table
  // TODO:   → insert all fetched questions
  // TODO:   → update AsyncStorage VERSION_KEY
  // TODO:   → return true
  // TODO: if network error → return false (use existing cache)
};

/**
 * Read all questions from local SQLite cache.
 * Returns questions in the same shape as the old Q array from questions.js,
 * so App.js requires minimal changes.
 *
 * @returns {Array} array of question objects
 */
export const getQuestions = async () => {
  // TODO: query all rows from local questions table
  // TODO: map rows back to { id, cat, type, en: [...], da: [...] } shape
  // TODO: return array
};

/**
 * Read questions filtered by category and/or type.
 *
 * @param {string|null} category - category slug or null for all
 * @param {string|null} type - "cur", "val", "news" or null for all
 * @returns {Array}
 */
export const getQuestionsByFilter = async (category = null, type = null) => {
  // TODO: query with WHERE clause based on params
};

// ── PROGRESS ──────────────────────────────────────────────────────────────────

/**
 * Read all progress rows for the current user from local SQLite.
 * Returns as { [questionId]: cardObject } — same shape as old getProgress().
 *
 * @returns {Object}
 */
export const getLocalProgress = async () => {
  // TODO: query all progress rows from SQLite
  // TODO: map to { [id]: { n, ef, interval, due, wrong, seen, last } }
};

/**
 * Write a single SM-2 progress update to local SQLite immediately.
 * Also adds the update to the sync queue for background Supabase sync.
 *
 * @param {string} questionId
 * @param {Object} card - SM-2 card state after update
 */
export const writeLocalProgress = async (questionId, card) => {
  // TODO: upsert into local progress table
  // TODO: add to sync_queue table with timestamp
};

/**
 * Pull all progress for the current user from Supabase and
 * overwrite local SQLite. Used on fresh install or new device.
 *
 * @param {string} userId
 */
export const pullProgressFromSupabase = async (userId) => {
  // TODO: fetch all progress rows from Supabase for userId
  // TODO: delete all local progress rows
  // TODO: insert fetched rows into local SQLite
};

// ── SYNC QUEUE ────────────────────────────────────────────────────────────────

/**
 * Flush all pending progress writes from the sync queue to Supabase.
 * Uses exponential backoff on failure.
 * Should be called on app resume and periodically in background.
 *
 * Conflict resolution: if local write timestamp > remote last_seen, local wins.
 * Otherwise Supabase wins.
 */
export const flushSyncQueue = async () => {
  // TODO: read all rows from sync_queue table
  // TODO: if empty → return
  // TODO: batch upsert to Supabase progress table with conflict resolution
  // TODO: on success → delete flushed rows from sync_queue
  // TODO: on failure → exponential backoff and retry
  //   backoff schedule: 5s → 30s → 2min → 15min
};

/**
 * Return the number of pending items in the sync queue.
 * Useful for showing a sync indicator in the UI.
 *
 * @returns {number}
 */
export const getSyncQueueLength = async () => {
  // TODO: count rows in sync_queue
};

// ── UTILITIES ─────────────────────────────────────────────────────────────────

/**
 * Clear all local data — questions, progress, sync queue, version.
 * Used on sign-out or account reset.
 */
export const clearLocalDb = async () => {
  // TODO: delete all rows from questions, progress, sync_queue tables
  // TODO: remove VERSION_KEY from AsyncStorage
};
