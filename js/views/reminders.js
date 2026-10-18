// =====================================================================
//  Reminder: interruttore, esecuzione manuale, coda e registro
// =====================================================================
import { esc, fullName, normalizePhone, nextRun, fmtShort, fmtData, fmtOra, fmtLogTime } from "../util.js";
import { $, $$, icon, toast, emptyState, busy } from "../ui.js";
import { sb, store, api, loadSettings, loadQueueCount } from "../data.js";
import { updateChrome } from "../app.js";

let root = null, filter = "";
const DAYS = ["", "lun", "mar", "mer", "gio", "ven", "sab", "dom"];

export function render(main) {
  root = main;
  main.innerHTML = `
    <div class="page">
      <header class="page-head">
        <div><p class="eyebrow">SMS automatici ai clienti</p><h1>Reminder</h1></div>
      </header>
      <dl class="readout" data-readout></dl>
      <div class="two-col wide-left">
        <section class="panel run-panel">
          <div class="run-row">
            <div><h2>Invio automatico</h2><p class="muted small" data-onlabel></p></div>
            <label class="toggle"><input type="checkbox" data-enabled><span class="toggle-track"><span class="toggle-thumb"></span></span></label>
          </div>
          <dl class="kv" data-kv></dl>
          <div class="toolbar">
            <button class="btn btn-primary" data-run>${icon("send")}<span>Esegui ora</span></button>
            <button class="btn btn-quiet" data-reload>${icon("refresh")}<span>Aggiorna</span></button>
          </div>
          <div class="run-result" data-result hidden></div>
        </section>
        <section class="panel">
          <div class="panel-head"><div><h2>In coda</h2><p class="muted small" data-qhint></p></div><span class="badge" data-qcount>0</span></div>
          <div class="mini-list" data-queue></div>
        </section>
      </div>
      <section class="panel">
        <div class="panel-head">
          <div><h2>Registro invii</h2><p class="muted small" data-loghint></p></div>
          <div class="segmented" data-filter>
            <button data-f="" class="on">Tutti</button><button data-f="inviato">Inviati</button><button data-f="errore">Errori</button><button data-f="saltato">Saltati</button><button data-f="info">Esecuzioni</button>
          </div>
        </div>
        <ul class="log" data-log></ul>
      </section>
    </div>`;
  $("[data-enabled]", main).addEventListener("change", onToggle);
  $("[data-run]", main).onclick = (e) => busy(e.currentTarget, runNow);
  $("[data-reload]", main).onclick = (e) => busy(e.currentTarget, async () => { await loadSettings(); await loadQueueCount(); updateChrome(); await drawAll(); });
  $("[data-filter]", main).addEventListener("click", (e) => {
    const b = e.target.closest("[data-f]"); if (!b) return;
    filter = b.dataset.f;
    $$("[data-f]", main).forEach((x) => x.classList.toggle("on", x === b));
    drawLog();
  });
  drawAll();
}
export function refresh() { drawAll(); }

async function drawAll() { drawHeader(); await Promise.all([drawQueue(), drawLog()]); }

function drawHeader() {
  const s = store.settings;
  if (!s || !root) return;
  const n = nextRun(s.schedule_days, s.schedule_hour);
  $("[data-enabled]", root).checked = s.reminders_enabled;
  $("[data-onlabel]", root).textContent = s.reminders_enabled ? "Attivo: i messaggi partono da soli, anche a PC spento." : "Disattivato: l'app non invia nessun messaggio.";
  const days = (s.schedule_days ?? []).map((d) => DAYS[d]).join(", ") || "nessun giorno";
  $("[data-kv]", root).innerHTML = `
    <dt>Pianificazione</dt><dd>${esc(days)} · ore ${String(s.schedule_hour).padStart(2, "0")}:00</dd>
    <dt>Anticipo</dt><dd>appuntamenti nei prossimi ${s.window_days} giorni</dd>
    <dt>Ultima esecuzione</dt><dd>${s.last_run_at ? `${esc(fmtShort(new Date(s.last_run_at)))}<br><span class="muted small">${esc(s.last_run_summary ?? "")}</span>` : "mai"}</dd>`;
  $("[data-readout]", root).innerHTML = `
    <div class="readout-item ${s.reminders_enabled ? "tone-ok" : "tone-warn"}"><dt>Stato</dt><dd class="txt">${s.reminders_enabled ? "Attivo" : "Disattivato"}</dd><div class="readout-note">${s.reminders_enabled ? "invio automatico" : "nessun invio"}</div></div>
    <div class="readout-item tone-accent"><dt>Prossimo invio</dt><dd class="txt">${s.reminders_enabled && n ? esc(fmtShort(n)) : "—"}</dd><div class="readout-note">${esc(days)}</div></div>
    <div class="readout-item tone-check"><dt>In coda</dt><dd>${store.queueCount}</dd><div class="readout-note">prossimi ${s.window_days} giorni</div></div>
    <div class="readout-item tone-first"><dt>Inviati</dt><dd data-sentcount>—</dd><div class="readout-note">ultimi ${s.log_retention_days} giorni</div></div>`;
}

async function onToggle(e) {
  const on = e.target.checked;
  const { error } = await sb.from("settings").update({ reminders_enabled: on }).eq("id", 1);
  if (error) { e.target.checked = !on; return toast(error.message, "err"); }
  store.settings.reminders_enabled = on;
  updateChrome();
  drawHeader();
  toast(on ? "Reminder automatici attivati" : "Reminder automatici disattivati");
}

async function runNow() {
  const out = $("[data-result]", root);
  out.hidden = true;
  try {
    const r = await api("run");
    out.className = "run-result";
    let t = r.skipped ? `Nessun invio: ${r.skipped}.` : `✓ ${r.summary}`;
    if (r.gcal?.summary) t += `\nGoogle Calendar: ${r.gcal.summary}`;
    if (r.gcal?.error) t += `\nGoogle Calendar: errore — ${r.gcal.error}`;
    out.textContent = t;
  } catch (ex) {
    out.className = "run-result err";
    out.textContent = `Errore: ${ex.message}`;
  }
  out.hidden = false;
  await loadSettings().catch(() => {});
  await loadQueueCount().catch(() => {});
  updateChrome();
  await drawAll();
  window.dispatchEvent(new Event("strozzi-changed-silent"));
}

async function drawQueue() {
  const s = store.settings;
  if (!s || !root) return;
  const now = new Date(), until = new Date(now.getTime() + s.window_days * 86400000);
  const { data } = await sb.from("appointments").select("id, start_at, type, client:clients(first_name, last_name, phone)")
    .eq("deleted", false).is("reminder_sent_at", null).not("client_id", "is", null)
    .gt("start_at", now.toISOString()).lte("start_at", until.toISOString()).order("start_at").limit(100);
  const rows = data ?? [];
  $("[data-qcount]", root).textContent = rows.length;
  $("[data-qhint]", root).textContent = `Riceveranno l'SMS al prossimo invio (prossimi ${s.window_days} giorni).`;
  $("[data-queue]", root).innerHTML = rows.length
    ? rows.map((a) => `<div class="mini-item"><i class="dot ${a.type === "prima_visita" ? "first" : "check"}"></i><span class="grow">${esc(fullName(a.client))}${normalizePhone(a.client?.phone) ? "" : ` <span class="badge err">numero non valido</span>`}</span><span class="when">${esc(fmtShort(new Date(a.start_at)))}</span></div>`).join("")
    : emptyState("Nessun reminder in attesa", "Tutti gli appuntamenti nel periodo hanno già ricevuto il messaggio.", "checks");
}

async function drawLog() {
  if (!root) return;
  let qy = sb.from("reminder_log").select("*").order("created_at", { ascending: false }).limit(300);
  if (filter) qy = qy.eq("status", filter);
  const { data, error } = await qy;
  const box = $("[data-log]", root);
  const s = store.settings;
  $("[data-loghint]", root).textContent = `Ultimi ${s?.log_retention_days ?? 5} giorni · utile per verificare cosa è partito e a chi.`;
  if (error) { box.innerHTML = `<li>${esc(error.message)}</li>`; return; }
  if (!filter) {
    const sent = (data ?? []).filter((r) => r.status === "inviato").length;
    const sc = $("[data-sentcount]", root); if (sc) sc.textContent = sent;
  }
  if (!data?.length) { box.innerHTML = `<li style="display:block">${emptyState("Nessuna voce", "Qui compariranno i messaggi inviati, gli errori e ogni esecuzione.", "message")}</li>`; return; }
  const LABEL = { inviato: ["ok", "Inviato"], errore: ["err", "Errore"], saltato: ["warn", "Saltato"], info: ["", "Esecuzione"] };
  box.innerHTML = data.map((r) => {
    const [cls, lab] = LABEL[r.status] ?? ["", r.status];
    const who = r.status === "info"
      ? `<span>${esc(r.detail ?? "")}</span><small>${r.trigger_source === "manuale" ? "eseguito a mano" : "automatico"}</small>`
      : `<strong>${esc(r.client_name ?? "—")}</strong><small>${esc(r.phone ?? "")}${r.appointment_at ? ` · appuntamento ${esc(fmtShort(new Date(r.appointment_at)))}` : ""}${r.trigger_source === "manuale" ? " · a mano" : ""}</small>
         ${r.detail ? `<small class="err-detail">${esc(r.detail)}</small>` : ""}
         ${r.message ? `<details><summary>${icon("message", 14)} Testo inviato</summary><div class="bubble">${esc(r.message)}</div></details>` : ""}`;
    return `<li><time>${esc(fmtLogTime(new Date(r.created_at)))}</time><span><span class="badge ${cls}">${lab}</span></span><div class="who">${who}</div></li>`;
  }).join("");
}
