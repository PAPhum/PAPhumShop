import { createClient } from '@supabase/supabase-js';

/**
 * Service-role client — ใช้ได้เฉพาะฝั่ง server (Route Handler / script) เท่านั้น
 * ห้าม import เข้า Client Component เพราะจะทำให้ service role key รั่ว
 */
export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error('ยังไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY');
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
