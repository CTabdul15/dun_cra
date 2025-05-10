
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

// Get environment variables with fallbacks
const supabaseUrl = 'https://ejrvyvyxyvysccpbrisq.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVqcnZ5dnl4eXZ5c2NjcGJyaXNxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY4MDkzNzYsImV4cCI6MjA2MjM4NTM3Nn0.q8cHoC6tOPDZPzNRYd09YhKcAxKPiq2gS3FID2rP-ic';

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