/**
 * Data access layer — all reads and writes go through Supabase.
 * Swap the supabase calls for fetch() to a different API if the backend ever changes.
 */
import { supabase } from './supabase'

// ─── Array tables (venues, artists) ───────────────────────────────────────────

export async function readTable(table) {
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .order('id')
  if (error) throw error
  return data
}

export async function upsertRow(table, row) {
  const { error } = await supabase
    .from(table)
    .upsert(row)
  if (error) throw error
  return readTable(table)
}

export async function insertRow(table, row) {
  const { error } = await supabase
    .from(table)
    .insert(row)
  if (error) throw error
  return readTable(table)
}

// ─── Profiles (one row per user id) ───────────────────────────────────────────

export async function readProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function writeProfile(userId, profileData) {
  const { error } = await supabase
    .from('profiles')
    .upsert({ ...profileData, id: userId })
  if (error) throw error
}
