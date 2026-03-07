import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder-url.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';

export function createSupabaseBrowserClient() {
  // createBrowserClient automatically memoizes the instance based on the URL and key
  return createBrowserClient(supabaseUrl, supabaseKey);
}

// Keep a fallback singleton for non-React pure utility functions ONLY.
export const supabase = createSupabaseBrowserClient();
