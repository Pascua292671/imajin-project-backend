/* // src/databes/config/SupabaseDb.ts
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY; // server-only

if (!SUPABASE_URL) throw new Error("SUPABASE_URL is missing");
if (!SERVICE_ROLE) throw new Error("SUPABASE_SERVICE_ROLE_KEY is missing");

export const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

// Best-effort mirror helper.
// - It should throw so caller can catch + log.
export async function queryWithMirror(table: string, payload: any, onConflict = "id") {
  const { error } = await supabase.from(table).upsert(payload, { onConflict });
  if (error) throw error;
} */


  import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabase: ReturnType<typeof createClient> | null = null;

if (SUPABASE_URL && SERVICE_ROLE) {
  supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });
} else {
  console.warn("⚠️ Supabase mirror disabled: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

export async function queryWithMirror(table: string, payload: any, onConflict = "id") {
  if (!supabase) return; // mirror disabled, do nothing
  const { error } = await supabase.from(table).upsert(payload, { onConflict });
  if (error) throw error;
}