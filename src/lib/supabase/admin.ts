import 'server-only';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/**
 * Cliente com SERVICE_ROLE — bypassa RLS.
 * Use APENAS em rotas server-side de sistema (sync do Protheus, cron jobs,
 * webhooks autenticados por API key). Nunca exponha ao browser.
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}
