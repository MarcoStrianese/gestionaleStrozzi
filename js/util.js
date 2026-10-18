// Funzioni di utilità senza dipendenze (usate dall'app)

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** Normalizza un numero in formato internazionale (+39…). Restituisce null se non valido. */
export function normalizePhone(raw) {
  if (!raw) return null;
  let p = String(raw).replace(/[\s\-.()/]/g, "");
  if (p.startsWith("00")) p = "+" + p.slice(2);
  if (!p.startsWith("+") && /^3\d{8,9}$/.test(p)) p = "+39" + p;
  return /^\+\d{8,15}$/.test(p) ? p : null;
}

export function prettyPhone(p) {
  const n = normalizePhone(p);
  if (!n) return p ?? "";
  if (n.startsWith("+39")) {
    const r = n.slice(3);
    return `+39 ${r.slice(0, 3)} ${r.slice(3, 6)} ${r.slice(6)}`.trim();
  }
  return n;
}

export function renderTemplate(tpl, v) {
  return String(tpl ?? "").replace(/\{(\w+)\}/g, (m, k) => (k.toLowerCase() in v ? v[k.toLowerCase()] : m)).trim();
}

const GSM = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM_EXT = "^{}\\[~]|€";
/** Conta caratteri e segmenti SMS (ogni segmento è fatturato da Twilio come 1 SMS). */
export function smsInfo(text) {
  let gsm = true, len = 0;
  for (const ch of text) {
    if (GSM.includes(ch)) len += 1;
    else if (GSM_EXT.includes(ch)) len += 2;
    else { gsm = false; break; }
  }
  if (!gsm) len = [...text].length;
  const single = gsm ? 160 : 70, multi = gsm ? 153 : 67;
  const segments = len === 0 ? 0 : len <= single ? 1 : Math.ceil(len / multi);
  return { len, segments, gsm };
}

const TZ = "Europe/Rome";
export const fmtData = (d) => new Intl.DateTimeFormat("it-IT", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(d);
export const fmtOra = (d) => new Intl.DateTimeFormat("it-IT", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(d);
export const fmtShort = (d) => new Intl.DateTimeFormat("it-IT", { timeZone: TZ, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(d);
export const fmtLogTime = (d) => new Intl.DateTimeFormat("it-IT", { timeZone: TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(d);

/** yyyy-mm-dd e hh:mm in ora locale del dispositivo */
export const toDateInput = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const toTimeInput = (d) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

/** Prossima esecuzione pianificata (giorni ISO 1-7, ora italiana) */
export function nextRun(days, hour, from = new Date()) {
  if (!days?.length) return null;
  for (let i = 0; i < 8 * 24; i++) {
    const t = new Date(from.getTime() + i * 3600_000);
    t.setMinutes(0, 0, 0);
    if (t <= from) continue;
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short", hour: "2-digit", hourCycle: "h23" }).formatToParts(t).map((x) => [x.type, x.value]));
    const dow = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[p.weekday];
    if (days.includes(dow) && Number(p.hour) === hour) return t;
  }
  return null;
}

export const initials = (c) => ((c.first_name?.[0] ?? "") + (c.last_name?.[0] ?? "")).toUpperCase() || "?";
export const fullName = (c) => (c ? `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() : "");

/* ---------- date (ora locale del dispositivo) ---------- */
export const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const addMonths = (d, n) => { const x = new Date(d); x.setDate(1); x.setMonth(x.getMonth() + n); return x; };
export const startOfWeek = (d) => { const x = startOfDay(d); const wd = (x.getDay() + 6) % 7; return addDays(x, -wd); };
export const startOfMonth = (d) => { const x = startOfDay(d); x.setDate(1); return x; };
export const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
export const dayKey = (d) => toDateInput(d);
export const minutesOf = (d) => d.getHours() * 60 + d.getMinutes();
const F = (o) => new Intl.DateTimeFormat("it-IT", o);
export const fmtWd = (d) => F({ weekday: "short" }).format(d).replace(".", "");
export const fmtWdLong = (d) => F({ weekday: "long" }).format(d);
export const fmtDayMonth = (d) => F({ day: "numeric", month: "long" }).format(d);
export const fmtDayFull = (d) => F({ weekday: "long", day: "numeric", month: "long" }).format(d);
export const fmtMonthYear = (d) => F({ month: "long", year: "numeric" }).format(d);
export const fmtHM = (d) => F({ hour: "2-digit", minute: "2-digit" }).format(d);
export function fmtRange(a, b) {
  const sameM = a.getMonth() === b.getMonth();
  return sameM ? `${a.getDate()} – ${b.getDate()} ${F({ month: "long", year: "numeric" }).format(b)}`
    : `${a.getDate()} ${F({ month: "short" }).format(a)} – ${b.getDate()} ${F({ month: "short", year: "numeric" }).format(b)}`;
}
export function fmtDur(min) { if (min < 60) return `${min}′`; const h = Math.floor(min / 60), m = min % 60; return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`; }
export function relDay(d) {
  const t = startOfDay(new Date()), x = startOfDay(d), diff = Math.round((x - t) / 86400000);
  if (diff === 0) return "oggi"; if (diff === 1) return "domani"; if (diff === -1) return "ieri";
  return fmtDayFull(d);
}
