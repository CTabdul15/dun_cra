import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_KEY
);


window.supabase = supabase // Für Debugging
export default supabase
