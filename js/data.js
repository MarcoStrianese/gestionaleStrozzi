// =====================================================================
//  Accesso ai dati (Supabase) e stato condiviso dell'app
// =====================================================================
export const CFG = window.APP_CONFIG ?? {};
export const configured = !!(CFG.SUPABASE_URL && !CFG.SUPABASE_URL.includes("INSERISCI") && CFG.SUPABASE_ANON_KEY && !CFG.SUPABASE_ANON_KEY.includes("INSERISCI"));

export const sb = configured
  ? window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: "strozzi-auth" },
    })
  : null;

export const store = {
  user: null,
  settings: null,
  clients: [],
  recentLocations: [],
  queueCount: 0,
  listeners: new Set(),
  emit() { for (const f of this.listeners) f(); },
};

export async function loadSettings() {
  const { data, error } = await sb.from("settings").select("*").eq("id", 1).single();
  if (error) throw error;
  store.settings = data;
}

export async function loadClients() {
  const { data, error } = await sb.from("clients").select("*").order("last_name").order("first_name");
  if (error) throw error;
  store.clients = data ?? [];
}

export async function loadRecentLocations() {
  const { data } = await sb.from("appointments").select("location").not("location", "is", null)
    .order("created_at", { ascending: false }).limit(300);
  const seen = new Map();
  for (const r of data ?? []) {
    const l = (r.location ?? "").trim();
    if (l && !seen.has(l.toLowerCase())) seen.set(l.toLowerCase(), l);
    if (seen.size >= 5) break;
  }
  store.recentLocations = [...seen.values()];
}

export async function loadQueueCount() {
  const s = store.settings;
  if (!s) return;
  const now = new Date();
  const until = new Date(now.getTime() + s.window_days * 86400_000);
  const { count } = await sb.from("appointments").select("id", { count: "exact", head: true })
    .eq("deleted", false).is("reminder_sent_at", null).not("client_id", "is", null)
    .gt("start_at", now.toISOString()).lte("start_at", until.toISOString());
  store.queueCount = count ?? 0;
}

/** Appuntamenti (non eliminati) che si sovrappongono all'intervallo [from, to) */
export async function fetchAppointments(from, to) {
  const { data, error } = await sb.from("appointments")
    .select("*, client:clients(id, first_name, last_name, phone)")
    .eq("deleted", false)
    .lt("start_at", to.toISOString())
    .gt("end_at", from.toISOString())
    .order("start_at");
  if (error) throw error;
  return data ?? [];
}

/** Chiamata alla funzione server */
export async function api(action, extra = {}) {
  const { data, error } = await sb.functions.invoke("strozzi-api", { body: { action, ...extra } });
  if (error) {
    let msg = error.message;
    try { const j = await error.context.json(); if (j?.error) msg = j.error; } catch { /* ignore */ }
    if (/Failed to send|fetch/i.test(msg)) msg = "Funzione server non raggiungibile: è stata pubblicata? (guida 02)";
    throw new Error(msg);
  }
  return data;
}

export function lsGet(k, d = null) { try { const v = localStorage.getItem("strozzi." + k); return v == null ? d : JSON.parse(v); } catch { return d; } }
export function lsSet(k, v) { try { localStorage.setItem("strozzi." + k, JSON.stringify(v)); } catch { /* ignore */ } }
