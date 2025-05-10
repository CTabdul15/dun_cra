import { createClient } from '@supabase/supabase-js';

// Get environment variables with fallbacks
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY || '';

// Validate required config
if (!supabaseUrl) {
  console.error('Missing VITE_SUPABASE_URL environment variable');
  throw new Error('supabaseUrl is required. Check your .env file and ensure VITE_SUPABASE_URL is set.');
}

if (!supabaseKey) {
  console.error('Missing VITE_SUPABASE_KEY environment variable');
  throw new Error('supabaseKey is required. Check your .env file and ensure VITE_SUPABASE_KEY is set.');
}

// Initialize Supabase client
const supabase = createClient(supabaseUrl, supabaseKey);

export default supabase;