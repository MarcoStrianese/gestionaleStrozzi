// =====================================================================
//  Studio Strozzi · Appuntamenti — logica dell'interfaccia
// =====================================================================
import {
  esc, normalizePhone, prettyPhone, renderTemplate, smsInfo, fmtData, fmtOra, fmtShort, fmtLogTime,
  toDateInput, toTimeInput, nextRun, initials, fullName,
} from "./util.js";

const APP_VERSION = "1.0.3";
const CFG = window.APP_CONFIG ?? {};
const IS_DESKTOP = !!window.strozziDesktop;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const isMobile = () => window.matchMedia("(max-width: 860px)").matches;

const state = {
  clients: [],
  settings: null,
  recentLocations: [],
  view: "calendar",
  logFilter: "",
  calendar: null,
};
let sb = null;

// ---------------------------------------------------------------------
// Avvio
// ---------------------------------------------------------------------
async function boot() {
  $("#app-version").textContent = APP_VERSION;
  $("#side-version").textContent = `v${APP_VERSION}`;
  const configured = CFG.SUPABASE_URL && !CFG.SUPABASE_URL.includes("INSERISCI") && CFG.SUPABASE_ANON_KEY && !CFG.SUPABASE_ANON_KEY.includes("INSERISCI");
  if (!configured) return show("setup");

  sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: "strozzi-auth" },
  });
  sb.auth.onAuthStateChange((event) => { if (event === "SIGNED_OUT") show("login"); });

  const { data: { session } } = await sb.auth.getSession();
  if (session) await startApp(session);
  else show("login");

  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

function show(which) {
  $("#boot").hidden = true;
  $("#setup").hidden = which !== "setup";
  $("#login").hidden = which !== "login";
  $("#app").hidden = which !== "app";
}

// ---------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------
$("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("#login-btn"), err = $("#login-error");
  let email = $("#login-email").value.trim();
  let password = $("#login-password").value;
  // accesso rapido amministratore: email vuota + codice numerico
  if (!email && /^\d{4,8}$/.test(password) && CFG.ADMIN_EMAIL && !CFG.ADMIN_EMAIL.includes("INSERISCI")) {
    email = CFG.ADMIN_EMAIL;
    password = (CFG.ADMIN_PASSWORD_PREFIX ?? "") + password;
  }
  if (!email) { err.textContent = "Inserisci l'email."; err.hidden = false; return; }
  btn.classList.add("loading"); err.hidden = true;
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  btn.classList.remove("loading");
  if (error) {
    err.textContent = /invalid/i.test(error.message) ? "Credenziali non corrette." : `Errore: ${error.message}`;
    err.hidden = false;
    return;
  }
  $("#login-password").value = "";
  await startApp(data.session);
});

$("#btn-logout").addEventListener("click", async () => {
  if (!await askConfirm("Vuoi uscire? Dovrai rifare l'accesso su questo dispositivo.", "Esci")) return;
  await sb.auth.signOut();
  location.reload();
});

// ---------------------------------------------------------------------
// App
// ---------------------------------------------------------------------
async function startApp(session) {
  show("app");
  $("#account-email").textContent = session.user.email;
  try {
    await Promise.all([loadSettings(), loadClients(), loadRecentLocations()]);
  } catch (e) {
    toast(`Errore di caricamento: ${e.message}`, true);
  }
  initCalendar();
  setView(location.hash.includes("gcal=ok") ? "settings" : (sessionStorageGet("view") || "calendar"));
  if (location.hash.includes("gcal=ok")) {
    history.replaceState(null, "", location.pathname + location.search);
    toast("Google Calendar collegato ✓");
  }
  // aggiornamenti periodici
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshAll(); });
  setInterval(() => { if (!document.hidden) refreshAll(); }, 120_000);
}

async function refreshAll() {
  await Promise.allSettled([loadSettings(), loadClients()]);
  state.calendar?.refetchEvents();
  if (state.view === "reminders") renderReminders();
}

function sessionStorageGet(k) { try { return sessionStorage.getItem(k); } catch { return null; } }
function sessionStorageSet(k, v) { try { sessionStorage.setItem(k, v); } catch { /* ignore */ } }

const TITLES = { calendar: "Calendario", clients: "Clienti", reminders: "Reminder", settings: "Impostazioni" };
function setView(v) {
  state.view = v;
  sessionStorageSet("view", v);
  $$(".view").forEach((s) => (s.hidden = s.id !== `view-${v}`));
  $$(".nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.view === v));
  $("#view-title").textContent = TITLES[v];
  document.body.classList.toggle("on-calendar", v === "calendar");
  if (v === "calendar") setTimeout(() => state.calendar?.updateSize(), 0);
  if (v === "clients") renderClients();
  if (v === "reminders") renderReminders();
  if (v === "settings") { fillSettingsForm(); renderGcal(); }
}
$$(".nav-btn").forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));

// ---------------------------------------------------------------------
// Dati
// ---------------------------------------------------------------------
async function loadSettings() {
  const { data, error } = await sb.from("settings").select("*").eq("id", 1).single();
  if (error) throw error;
  state.settings = data;
  renderStatusPills();
}

async function loadClients() {
  const { data, error } = await sb.from("clients").select("*").order("last_name").order("first_name");
  if (error) throw error;
  state.clients = data ?? [];
}

async function loadRecentLocations() {
  const { data } = await sb.from("appointments").select("location").not("location", "is", null)
    .order("created_at", { ascending: false }).limit(300);
  const seen = new Map();
  for (const r of data ?? []) {
    const l = (r.location ?? "").trim();
    if (l && !seen.has(l.toLowerCase())) seen.set(l.toLowerCase(), l);
    if (seen.size >= 5) break;
  }
  state.recentLocations = [...seen.values()];
}

async function api(action, extra = {}) {
  const { data, error } = await sb.functions.invoke("strozzi-api", { body: { action, ...extra } });
  if (error) {
    let msg = error.message;
    try { const j = await error.context.json(); if (j?.error) msg = j.error; } catch { /* ignore */ }
    if (/Failed to send|fetch/i.test(msg)) msg = "Funzione server non raggiungibile: è stata pubblicata? (guida 02)";
    throw new Error(msg);
  }
  return data;
}

function renderStatusPills() {
  const s = state.settings;
  if (!s) return;
  const n = nextRun(s.schedule_days, s.schedule_hour);
  const text = s.reminders_enabled ? (n ? `Reminder attivi · ${fmtShort(n)}` : "Reminder attivi") : "Reminder disattivati";
  for (const el of [$("#side-status"), $("#top-status")]) {
    el.textContent = isMobile() && el.id === "top-status" ? (s.reminders_enabled ? "Attivi" : "Disattivati") : text;
    el.className = "status-pill " + (s.reminders_enabled ? "on" : "off") + (el.id === "top-status" ? " mobile-only" : "");
  }
}

// ---------------------------------------------------------------------
// Calendario
// ---------------------------------------------------------------------
function calendarViews() {
  return isMobile()
    ? { initial: "timeGridDay", right: "timeGridDay,timeGrid3,listWeek" }
    : { initial: "timeGridWeek", right: "timeGridDay,timeGridWeek,dayGridMonth,listWeek" };
}

function initCalendar() {
  if (state.calendar) return;
  const v = calendarViews();
  let wasMobile = isMobile();
  const cal = new FullCalendar.Calendar($("#calendar"), {
    locale: "it",
    timeZone: "local",
    firstDay: 1,
    height: "100%",
    initialView: v.initial,
    headerToolbar: { left: "prev,next today", center: "title", right: v.right },
    buttonText: { today: "Oggi", day: "Giorno", week: "Settimana", month: "Mese", list: "Elenco" },
    views: {
      timeGrid3: { type: "timeGrid", duration: { days: 3 }, buttonText: "3 gg" },
      listWeek: { buttonText: "Elenco" },
    },
    allDaySlot: false,
    nowIndicator: true,
    slotMinTime: "07:00:00",
    slotMaxTime: "21:30:00",
    slotDuration: "00:15:00",
    slotLabelInterval: "01:00",
    slotLabelFormat: { hour: "2-digit", minute: "2-digit", hour12: false },
    eventTimeFormat: { hour: "2-digit", minute: "2-digit", hour12: false },
    scrollTime: "08:00:00",
    expandRows: true,
    dayMaxEvents: true,
    selectable: true,
    selectMirror: false,
    selectLongPressDelay: 350,
    eventLongPressDelay: 400,
    editable: true,
    noEventsContent: "Nessun appuntamento",
    events: fetchEvents,
    eventContent: renderEventContent,
    select: (info) => { cal.unselect(); openAppointment(null, { start: info.start, end: info.end }); },
    eventClick: (info) => openAppointment(info.event.extendedProps.appt),
    eventDrop: (info) => moveEvent(info),
    eventResize: (info) => moveEvent(info),
    windowResize: () => {
      if (isMobile() !== wasMobile) {
        wasMobile = isMobile();
        const nv = calendarViews();
        cal.setOption("headerToolbar", { left: "prev,next today", center: "title", right: nv.right });
        cal.changeView(nv.initial);
        renderStatusPills();
      }
    },
  });
  cal.render();
  state.calendar = cal;
}

async function fetchEvents(info, success, failure) {
  const { data, error } = await sb.from("appointments")
    .select("*, client:clients(id, first_name, last_name, phone)")
    .eq("deleted", false)
    .lt("start_at", info.endStr)
    .gt("end_at", info.startStr)
    .order("start_at");
  if (error) { toast(`Errore calendario: ${error.message}`, true); return failure(error); }
  success((data ?? []).map((a) => ({
    id: a.id,
    start: a.start_at,
    end: a.end_at,
    title: a.client ? fullName(a.client) : (a.title || "Evento"),
    classNames: [a.client ? `t-${a.type}` : "t-none"],
    extendedProps: { appt: a },
  })));
}

function renderEventContent(arg) {
  try { return eventHtml(arg); }
  catch (e) { console.error("renderEventContent", e); return true; } // mai bloccare il calendario
}

function eventHtml(arg) {
  const a = arg.event.extendedProps?.appt;
  // evento "anteprima" (selezione o trascinamento): non ha dati, uso il rendering standard
  if (!a) return { html: `<div class="ev"><div class="ev-time">${esc(arg.timeText)}</div></div>` };
  const name = esc(arg.event.title);
  const ok = a.reminder_sent_at ? `<span class="ev-ok" title="Reminder inviato">✓</span>` : "";
  const warn = !a.client ? ` <span title="Nessun cliente: niente reminder">⚠︎</span>` : "";
  if (arg.view.type.startsWith("list")) {
    const tipo = a.client ? (a.type === "prima_visita" ? "Prima visita" : "Check") : "Senza cliente";
    return { html: `<div class="ev"><strong>${name}</strong>${warn} <span class="muted">· ${tipo}${a.location ? " · " + esc(a.location) : ""}</span> ${ok}</div>` };
  }
  return {
    html: `<div class="ev">${ok}<div class="ev-time">${esc(arg.timeText)}</div><div class="ev-name">${name}${warn}</div>${a.location ? `<div class="ev-loc">${esc(a.location)}</div>` : ""}</div>`,
  };
}

async function moveEvent(info) {
  const a = info.event.extendedProps.appt;
  const { error } = await sb.from("appointments")
    .update({ start_at: info.event.start.toISOString(), end_at: info.event.end.toISOString() })
    .eq("id", a.id);
  if (error) { info.revert(); return toast(`Impossibile spostare: ${error.message}`, true); }
  toast(a.reminder_sent_at ? "Spostato · il reminder verrà rimandato con il nuovo orario" : "Appuntamento spostato");
  state.calendar.refetchEvents();
}

$("#btn-new-appt").addEventListener("click", () => openAppointment(null));
$("#fab-new").addEventListener("click", () => openAppointment(null));

// ---------------------------------------------------------------------
// Dialog appuntamento
// ---------------------------------------------------------------------
const dlgAppt = $("#dlg-appt");
const appt = { editing: null, clientId: null, newClient: false, durationTouched: false };

function nextRoundedSlot() {
  const d = new Date();
  d.setMinutes(Math.ceil(d.getMinutes() / 30) * 30, 0, 0);
  if (d.getHours() < 8) d.setHours(9, 0);
  return d;
}

function openAppointment(a, preset = {}) {
  appt.editing = a;
  appt.clientId = a?.client_id ?? null;
  appt.newClient = false;
  appt.durationTouched = !!a;
  const s = state.settings ?? { duration_first: 60, duration_check: 30 };

  $("#appt-title").textContent = a ? "Modifica appuntamento" : "Nuovo appuntamento";
  $("#appt-delete").hidden = !a;
  $("#appt-error").hidden = true;
  $("#appt-newclient").hidden = true;
  $("#appt-client-list").hidden = true;

  const client = a?.client ?? null;
  $("#appt-client").value = client ? fullName(client) : "";
  $("#appt-phone").value = client ? prettyPhone(client.phone) : "";
  $("#appt-first").value = ""; $("#appt-last").value = "";

  const type = a?.type ?? "check";
  $$("input[name=appt-type]").forEach((r) => (r.checked = r.value === type));

  const start = a ? new Date(a.start_at) : (preset.start ?? nextRoundedSlot());
  let dur = a ? Math.round((new Date(a.end_at) - new Date(a.start_at)) / 60000)
    : (preset.end && (preset.end - preset.start) / 60000 > 15 ? Math.round((preset.end - preset.start) / 60000) : (type === "prima_visita" ? s.duration_first : s.duration_check));
  if (preset.end && (preset.end - preset.start) / 60000 > 15) appt.durationTouched = true;
  $("#appt-date").value = toDateInput(start);
  $("#appt-time").value = toTimeInput(start);
  setDuration(dur);

  $("#appt-location").value = a?.location ?? (state.recentLocations[0] ?? "");
  $("#appt-notes").value = a?.notes ?? "";
  renderLocationChips();

  const imp = $("#appt-imported");
  if (a && !a.client_id) {
    imp.hidden = false;
    imp.innerHTML = `Evento importato da Google Calendar: <strong>${esc(a.title || "senza titolo")}</strong>.<br>Associa un cliente per poter inviare il reminder.`;
  } else imp.hidden = true;

  renderReminderState();
  validatePhone();
  dlgAppt.showModal();
  if (!a && !isMobile()) setTimeout(() => $("#appt-client").focus(), 50);
}

function setDuration(min) {
  const sel = $("#appt-duration");
  if (![...sel.options].some((o) => Number(o.value) === min)) {
    const o = new Option(`${min} min`, String(min));
    sel.add(o);
  }
  sel.value = String(min);
}

function renderLocationChips() {
  const box = $("#appt-locations");
  box.innerHTML = state.recentLocations.map((l) => `<button type="button" class="chip" data-loc="${esc(l)}">${esc(l)}</button>`).join("");
  const cur = $("#appt-location").value.trim().toLowerCase();
  $$(".chip", box).forEach((c) => c.classList.toggle("active", c.dataset.loc.toLowerCase() === cur));
}
$("#appt-locations").addEventListener("click", (e) => {
  const c = e.target.closest("[data-loc]");
  if (!c) return;
  $("#appt-location").value = c.dataset.loc;
  renderLocationChips();
});
$("#appt-location").addEventListener("input", renderLocationChips);

function renderReminderState() {
  const box = $("#appt-reminder"), a = appt.editing;
  if (!a) { box.hidden = true; return; }
  box.hidden = false;
  if (a.reminder_sent_at) {
    box.innerHTML = `<span>✓ Reminder inviato ${esc(fmtShort(new Date(a.reminder_sent_at)))}</span><button type="button" class="btn ghost" id="appt-resend">Reinvia al prossimo giro</button>`;
    $("#appt-resend").onclick = async () => {
      const { error } = await sb.from("appointments").update({ reminder_sent_at: null }).eq("id", a.id);
      if (error) return toast(error.message, true);
      a.reminder_sent_at = null;
      renderReminderState();
      state.calendar.refetchEvents();
      toast("Il reminder verrà inviato di nuovo al prossimo invio");
    };
  } else {
    const w = state.settings?.window_days ?? 7;
    box.innerHTML = `<span class="muted">Reminder non ancora inviato · partirà al primo invio utile nei ${w} giorni precedenti</span>`;
  }
}

$$("input[name=appt-type]").forEach((r) => r.addEventListener("change", () => {
  if (appt.durationTouched) return;
  const s = state.settings ?? {};
  setDuration(r.value === "prima_visita" ? (s.duration_first ?? 60) : (s.duration_check ?? 30));
}));
$("#appt-duration").addEventListener("change", () => (appt.durationTouched = true));

// --- ricerca cliente
const combo = { items: [], idx: -1 };
function clientMatches(q) {
  q = q.trim().toLowerCase();
  if (!q) return state.clients.slice(0, 8);
  const qd = q.replace(/\D/g, "");
  return state.clients.filter((c) => {
    const n1 = `${c.first_name} ${c.last_name}`.toLowerCase(), n2 = `${c.last_name} ${c.first_name}`.toLowerCase();
    return n1.includes(q) || n2.includes(q) || (qd.length >= 3 && (c.phone ?? "").replace(/\D/g, "").includes(qd));
  }).slice(0, 8);
}
function renderCombo() {
  const q = $("#appt-client").value;
  const list = $("#appt-client-list");
  combo.items = clientMatches(q);
  const exact = combo.items.some((c) => fullName(c).toLowerCase() === q.trim().toLowerCase());
  let html = combo.items.map((c, i) => `<li data-i="${i}" class="${i === combo.idx ? "active" : ""}"><span>${esc(fullName(c))}</span><small>${esc(prettyPhone(c.phone))}</small></li>`).join("");
  if (q.trim() && !exact) html += `<li data-new="1" class="new ${combo.idx === combo.items.length ? "active" : ""}">+ Nuovo cliente «${esc(q.trim())}»</li>`;
  list.innerHTML = html;
  list.hidden = !html;
}
function pickClient(c) {
  appt.clientId = c.id; appt.newClient = false;
  $("#appt-client").value = fullName(c);
  $("#appt-phone").value = prettyPhone(c.phone);
  $("#appt-newclient").hidden = true;
  $("#appt-client-list").hidden = true;
  validatePhone();
}
function pickNewClient() {
  const q = $("#appt-client").value.trim();
  const [first, ...rest] = q.split(/\s+/);
  appt.clientId = null; appt.newClient = true;
  $("#appt-first").value = first ?? ""; $("#appt-last").value = rest.join(" ");
  $("#appt-phone").value = "";
  $("#appt-newclient").hidden = false;
  $("#appt-client-list").hidden = true;
  validatePhone();
  $("#appt-phone").focus();
}
$("#appt-client").addEventListener("input", () => {
  combo.idx = -1;
  if (appt.clientId) { appt.clientId = null; $("#appt-phone").value = ""; }
  appt.newClient = false; $("#appt-newclient").hidden = true;
  renderCombo(); validatePhone();
});
$("#appt-client").addEventListener("focus", renderCombo);
$("#appt-client").addEventListener("blur", () => setTimeout(() => ($("#appt-client-list").hidden = true), 150));
$("#appt-client").addEventListener("keydown", (e) => {
  const total = combo.items.length + ($("#appt-client-list [data-new]") ? 1 : 0);
  if (e.key === "ArrowDown") { combo.idx = Math.min(total - 1, combo.idx + 1); renderCombo(); e.preventDefault(); }
  else if (e.key === "ArrowUp") { combo.idx = Math.max(0, combo.idx - 1); renderCombo(); e.preventDefault(); }
  else if (e.key === "Enter" && !$("#appt-client-list").hidden) {
    e.preventDefault();
    if (combo.idx >= 0 && combo.idx < combo.items.length) pickClient(combo.items[combo.idx]);
    else if (combo.idx === combo.items.length || combo.items.length === 0) pickNewClient();
    else if (combo.items.length) pickClient(combo.items[0]);
  }
});
$("#appt-client-list").addEventListener("mousedown", (e) => {
  const li = e.target.closest("li");
  if (!li) return;
  e.preventDefault();
  if (li.dataset.new) pickNewClient(); else pickClient(combo.items[Number(li.dataset.i)]);
});

function validatePhone(inputSel = "#appt-phone", hintSel = "#appt-phone-hint") {
  const v = $(inputSel).value.trim();
  const hint = $(hintSel);
  const n = normalizePhone(v);
  if (!v) { hint.textContent = ""; hint.className = "hint"; $(inputSel).classList.remove("invalid"); return null; }
  if (n) { hint.textContent = `✓ Verrà usato ${n}`; hint.className = "hint ok"; $(inputSel).classList.remove("invalid"); }
  else { hint.textContent = "Numero non valido (es. 333 1234567 oppure +39…)"; hint.className = "hint bad"; $(inputSel).classList.add("invalid"); }
  return n;
}
$("#appt-phone").addEventListener("input", () => validatePhone());

$("#appt-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = $("#appt-error");
  const fail = (m) => { err.textContent = m; err.hidden = false; };
  err.hidden = true;
  const a = appt.editing;
  const importedNoClient = a && !a.client_id;
  const phone = normalizePhone($("#appt-phone").value);
  const hasClientInput = appt.clientId || appt.newClient;

  if (!hasClientInput && !importedNoClient) return fail("Seleziona un cliente dall'elenco oppure crea un nuovo cliente.");
  if (hasClientInput && !phone) return fail("Il numero di telefono è obbligatorio: senza numero il reminder non può partire.");
  if (appt.newClient && !$("#appt-first").value.trim()) return fail("Inserisci il nome del nuovo cliente.");
  const date = $("#appt-date").value, time = $("#appt-time").value;
  if (!date || !time) return fail("Indica giorno e ora.");
  const start = new Date(`${date}T${time}`);
  const end = new Date(start.getTime() + Number($("#appt-duration").value) * 60000);
  const type = $("input[name=appt-type]:checked")?.value ?? "check";

  const btn = $("#appt-save");
  btn.classList.add("loading");
  try {
    let clientId = appt.clientId;
    if (appt.newClient) {
      const { data, error } = await sb.from("clients").insert({
        first_name: $("#appt-first").value.trim(), last_name: $("#appt-last").value.trim(), phone,
      }).select().single();
      if (error) throw error;
      clientId = data.id;
    } else if (clientId) {
      const c = state.clients.find((x) => x.id === clientId);
      if (c && normalizePhone(c.phone) !== phone) {
        const { error } = await sb.from("clients").update({ phone }).eq("id", clientId);
        if (error) throw error;
      }
    }
    const row = {
      client_id: clientId ?? null, type, start_at: start.toISOString(), end_at: end.toISOString(),
      location: $("#appt-location").value.trim() || null, notes: $("#appt-notes").value.trim() || null,
    };
    const q = a ? sb.from("appointments").update(row).eq("id", a.id) : sb.from("appointments").insert(row);
    const { error } = await q;
    if (error) throw error;
    dlgAppt.close();
    toast(a ? "Appuntamento aggiornato" : "Appuntamento creato");
    await Promise.all([loadClients(), loadRecentLocations()]);
    state.calendar.refetchEvents();
  } catch (ex) {
    fail(`Salvataggio non riuscito: ${ex.message}`);
  } finally {
    btn.classList.remove("loading");
  }
});

$("#appt-delete").addEventListener("click", async () => {
  const a = appt.editing;
  if (!a || !await askConfirm("Eliminare questo appuntamento?", "Elimina")) return;
  const { error } = await sb.from("appointments").update({ deleted: true }).eq("id", a.id);
  if (error) return toast(error.message, true);
  dlgAppt.close();
  toast("Appuntamento eliminato");
  state.calendar.refetchEvents();
});

$$("dialog [data-close]").forEach((b) => b.addEventListener("click", () => b.closest("dialog").close()));
$$("dialog.sheet").forEach((d) => d.addEventListener("click", (e) => { if (e.target === d) d.close(); }));

// ---------------------------------------------------------------------
// Clienti
// ---------------------------------------------------------------------
$("#client-search").addEventListener("input", renderClients);
$("#btn-new-client").addEventListener("click", () => openClient(null));

function renderClients() {
  const q = $("#client-search").value;
  const filtered = q.trim() ? state.clients.filter((c) => clientMatchesAll(c, q)) : state.clients;
  const box = $("#client-list");
  if (!filtered.length) {
    box.innerHTML = `<div class="empty">${state.clients.length ? "Nessun cliente trovato." : "Ancora nessun cliente. Aggiungine uno, oppure crealo direttamente da un nuovo appuntamento."}</div>`;
    return;
  }
  box.innerHTML = filtered.map((c) => `
    <button class="client-card" data-id="${c.id}">
      <span class="avatar">${esc(initials(c))}</span>
      <span class="meta"><strong>${esc(fullName(c))}</strong><small>${esc(prettyPhone(c.phone))}${normalizePhone(c.phone) ? "" : " ⚠︎ numero non valido"}</small></span>
    </button>`).join("");
}
function clientMatchesAll(c, q) {
  q = q.trim().toLowerCase();
  const qd = q.replace(/\D/g, "");
  const n1 = `${c.first_name} ${c.last_name}`.toLowerCase(), n2 = `${c.last_name} ${c.first_name}`.toLowerCase();
  return n1.includes(q) || n2.includes(q) || (qd.length >= 3 && (c.phone ?? "").replace(/\D/g, "").includes(qd));
}
$("#client-list").addEventListener("click", (e) => {
  const b = e.target.closest("[data-id]");
  if (b) openClient(state.clients.find((c) => c.id === b.dataset.id));
});

const dlgClient = $("#dlg-client");
let editingClient = null;
async function openClient(c) {
  editingClient = c;
  $("#client-title").textContent = c ? "Modifica cliente" : "Nuovo cliente";
  $("#client-delete").hidden = !c;
  $("#client-error").hidden = true;
  $("#cl-first").value = c?.first_name ?? "";
  $("#cl-last").value = c?.last_name ?? "";
  $("#cl-phone").value = c ? prettyPhone(c.phone) : "";
  $("#cl-email").value = c?.email ?? "";
  $("#cl-notes").value = c?.notes ?? "";
  $("#cl-appts").innerHTML = "";
  validatePhone("#cl-phone", "#cl-phone-hint");
  dlgClient.showModal();
  if (c) {
    const { data } = await sb.from("appointments").select("id, start_at, type, location").eq("client_id", c.id)
      .eq("deleted", false).gte("start_at", new Date(Date.now() - 86400_000).toISOString()).order("start_at").limit(5);
    $("#cl-appts").innerHTML = (data ?? []).length
      ? `<span class="muted small">Prossimi appuntamenti</span>` + data.map((a) => `<div class="mini-item"><i class="dot ${a.type === "prima_visita" ? "first" : "check"}"></i>${esc(a.location ?? "")}<span class="when">${esc(fmtShort(new Date(a.start_at)))}</span></div>`).join("")
      : `<span class="muted small">Nessun appuntamento in programma.</span>`;
  }
}
$("#cl-phone").addEventListener("input", () => validatePhone("#cl-phone", "#cl-phone-hint"));

$("#client-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = $("#client-error");
  const phone = normalizePhone($("#cl-phone").value);
  const first = $("#cl-first").value.trim();
  if (!first) { err.textContent = "Il nome è obbligatorio."; err.hidden = false; return; }
  if (!phone) { err.textContent = "Numero di telefono non valido."; err.hidden = false; return; }
  const row = { first_name: first, last_name: $("#cl-last").value.trim(), phone, email: $("#cl-email").value.trim() || null, notes: $("#cl-notes").value.trim() || null };
  const { error } = editingClient
    ? await sb.from("clients").update(row).eq("id", editingClient.id)
    : await sb.from("clients").insert(row);
  if (error) { err.textContent = error.message; err.hidden = false; return; }
  dlgClient.close();
  toast("Cliente salvato");
  await loadClients();
  renderClients();
  state.calendar?.refetchEvents();
});

$("#client-delete").addEventListener("click", async () => {
  if (!editingClient || !await askConfirm(`Eliminare ${fullName(editingClient)}? I suoi appuntamenti resteranno in calendario ma senza cliente (e senza reminder).`, "Elimina")) return;
  const { error } = await sb.from("clients").delete().eq("id", editingClient.id);
  if (error) return toast(error.message, true);
  dlgClient.close();
  await loadClients();
  renderClients();
  state.calendar?.refetchEvents();
  toast("Cliente eliminato");
});

// ---------------------------------------------------------------------
// Reminder: stato, coda, registro
// ---------------------------------------------------------------------
$("#rem-enabled").addEventListener("change", async (e) => {
  const on = e.target.checked;
  const { error } = await sb.from("settings").update({ reminders_enabled: on }).eq("id", 1);
  if (error) { e.target.checked = !on; return toast(error.message, true); }
  state.settings.reminders_enabled = on;
  renderStatusPills();
  renderReminderHeader();
  toast(on ? "Reminder automatici ATTIVATI" : "Reminder automatici disattivati");
});

$("#btn-run-now").addEventListener("click", async () => {
  const btn = $("#btn-run-now"), out = $("#run-result");
  btn.classList.add("loading");
  out.hidden = true;
  try {
    const r = await api("run");
    out.className = "run-result";
    out.textContent = r.skipped ? `Nessun invio: ${r.skipped}.` : `✓ ${r.summary}`;
    if (r.gcal?.summary) out.textContent += `\nGoogle Calendar: ${r.gcal.summary}`;
    if (r.gcal?.error) out.textContent += `\nGoogle Calendar: ERRORE ${r.gcal.error}`;
  } catch (ex) {
    out.className = "run-result err";
    out.textContent = `Errore: ${ex.message}`;
  } finally {
    out.hidden = false;
    out.style.whiteSpace = "pre-line";
    btn.classList.remove("loading");
    await loadSettings().catch(() => {});
    renderReminders();
    state.calendar?.refetchEvents();
  }
});
$("#btn-refresh-log").addEventListener("click", async () => { await loadSettings().catch(() => {}); renderReminders(); });
$("#log-filter").addEventListener("click", (e) => {
  const c = e.target.closest("[data-f]");
  if (!c) return;
  state.logFilter = c.dataset.f;
  $$("#log-filter .chip").forEach((x) => x.classList.toggle("active", x === c));
  renderLog();
});

function renderReminderHeader() {
  const s = state.settings;
  if (!s) return;
  $("#rem-enabled").checked = s.reminders_enabled;
  $("#rem-enabled-label").textContent = s.reminders_enabled
    ? "Attivi: i messaggi partono da soli secondo la pianificazione."
    : "Disattivati: l'app non invia nessun messaggio.";
  const dayNames = ["", "lun", "mar", "mer", "gio", "ven", "sab", "dom"];
  const n = nextRun(s.schedule_days, s.schedule_hour);
  $("#rem-next").textContent = s.reminders_enabled
    ? (n ? `${fmtData(n)} alle ${fmtOra(n)}` : "nessun giorno selezionato")
    : `— (pianificato: ${(s.schedule_days ?? []).map((d) => dayNames[d]).join(", ") || "nessun giorno"} ore ${String(s.schedule_hour).padStart(2, "0")}:00)`;
  $("#rem-window").textContent = `appuntamenti nei prossimi ${s.window_days} giorni`;
  $("#rem-last").textContent = s.last_run_at ? `${fmtShort(new Date(s.last_run_at))} · ${s.last_run_summary ?? ""}` : "mai";
}

async function renderReminders() {
  renderReminderHeader();
  renderQueue();
  renderLog();
}

async function renderQueue() {
  const s = state.settings;
  if (!s) return;
  const now = new Date();
  const until = new Date(now.getTime() + s.window_days * 86400_000);
  const { data } = await sb.from("appointments")
    .select("id, start_at, type, client:clients(first_name, last_name, phone)")
    .eq("deleted", false).is("reminder_sent_at", null).not("client_id", "is", null)
    .gt("start_at", now.toISOString()).lte("start_at", until.toISOString()).order("start_at").limit(100);
  const rows = data ?? [];
  $("#queue-count").textContent = rows.length;
  $("#queue-hint").textContent = `Appuntamenti nei prossimi ${s.window_days} giorni che non hanno ancora ricevuto il reminder.`;
  $("#queue-list").innerHTML = rows.length
    ? rows.map((a) => `<div class="mini-item"><i class="dot ${a.type === "prima_visita" ? "first" : "check"}"></i><span>${esc(fullName(a.client))}${normalizePhone(a.client?.phone) ? "" : " ⚠︎"}</span><span class="when">${esc(fmtShort(new Date(a.start_at)))}</span></div>`).join("")
    : `<div class="empty">Nessun reminder in attesa.</div>`;
}

async function renderLog() {
  let q = sb.from("reminder_log").select("*").order("created_at", { ascending: false }).limit(300);
  if (state.logFilter) q = q.eq("status", state.logFilter);
  const { data, error } = await q;
  const box = $("#log-list");
  if (error) { box.innerHTML = `<div class="empty">Errore: ${esc(error.message)}</div>`; return; }
  if (!data?.length) { box.innerHTML = `<div class="empty">Nessuna voce negli ultimi ${state.settings?.log_retention_days ?? 5} giorni.</div>`; return; }
  box.innerHTML = data.map((r) => {
    const who = r.status === "info"
      ? `<span>${esc(r.detail ?? "")}</span> <small>${r.trigger_source === "manuale" ? "eseguito a mano" : "automatico"}</small>`
      : `<strong>${esc(r.client_name ?? "—")}</strong> <small>${esc(r.phone ?? "")}${r.appointment_at ? " · appuntamento " + esc(fmtShort(new Date(r.appointment_at))) : ""}${r.trigger_source === "manuale" ? " · a mano" : ""}</small>
         ${r.detail ? `<small style="color:var(--danger)">${esc(r.detail)}</small>` : ""}
         ${r.message ? `<details><summary>Testo inviato</summary><div class="msg">${esc(r.message)}</div></details>` : ""}`;
    return `<div class="log-row"><time>${esc(fmtLogTime(new Date(r.created_at)))}</time><span><span class="st ${r.status}">${r.status === "info" ? "esecuz." : r.status}</span></span><div class="who">${who}</div></div>`;
  }).join("");
}

// ---------------------------------------------------------------------
// Impostazioni
// ---------------------------------------------------------------------
const hourSel = $("#set-hour");
for (let h = 0; h < 24; h++) hourSel.add(new Option(`${String(h).padStart(2, "0")}:00`, String(h)));
let lastFocusedTpl = $("#set-tpl-first");

function fillSettingsForm() {
  const s = state.settings;
  if (!s) return;
  $$("#set-days .chip").forEach((c) => c.classList.toggle("active", (s.schedule_days ?? []).includes(Number(c.dataset.d))));
  hourSel.value = String(s.schedule_hour);
  $("#set-window").value = s.window_days;
  $("#set-tpl-first").value = s.template_first;
  $("#set-tpl-check").value = s.template_check;
  $("#set-dur-first").value = s.duration_first;
  $("#set-dur-check").value = s.duration_check;
  $("#set-retention").value = s.log_retention_days;
  $("#settings-dirty").textContent = "";
  updatePreviews();
}

$("#set-days").addEventListener("click", (e) => {
  const c = e.target.closest("[data-d]");
  if (!c) return;
  c.classList.toggle("active");
  markDirty();
});
$("#settings-form").addEventListener("input", (e) => { markDirty(); if (e.target.tagName === "TEXTAREA" || e.target.id === "set-window") updatePreviews(); });
$$("#settings-form textarea").forEach((t) => t.addEventListener("focus", () => (lastFocusedTpl = t)));
$("#placeholders").addEventListener("click", (e) => {
  const c = e.target.closest("[data-ph]");
  if (!c) return;
  const t = lastFocusedTpl, ph = c.dataset.ph;
  const a = t.selectionStart ?? t.value.length, b = t.selectionEnd ?? t.value.length;
  t.value = t.value.slice(0, a) + ph + t.value.slice(b);
  t.focus();
  t.selectionStart = t.selectionEnd = a + ph.length;
  markDirty(); updatePreviews();
});
function markDirty() { $("#settings-dirty").textContent = "Modifiche non salvate"; }

function updatePreviews() {
  const sample = new Date(); sample.setDate(sample.getDate() + 3); sample.setHours(10, 30, 0, 0);
  const vars = { nome: "Mario", cognome: "Rossi", data: fmtData(sample), ora: fmtOra(sample), luogo: state.recentLocations[0] ?? "Studio di via Roma", tipo: "" };
  for (const id of ["set-tpl-first", "set-tpl-check"]) {
    const text = renderTemplate($(`#${id}`).value, vars);
    $(`[data-preview="${id}"]`).textContent = text;
    const info = smsInfo(text);
    const c = $(`.counter[data-for="${id}"]`);
    c.textContent = `${info.len} caratteri · ${info.segments} SMS${info.gsm ? "" : " (caratteri speciali/emoji: 70 per SMS)"}`;
    c.classList.toggle("warn", info.segments > 1);
  }
  const w = Number($("#set-window").value) || 0;
  $("#set-window-hint").textContent = w ? `Ad ogni invio parte un SMS per ogni appuntamento dei prossimi ${w} giorni che non l'ha ancora ricevuto. Ogni cliente riceve un solo reminder per appuntamento.` : "";
}

$("#settings-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const days = $$("#set-days .chip.active").map((c) => Number(c.dataset.d));
  const row = {
    schedule_days: days,
    schedule_hour: Number(hourSel.value),
    window_days: Number($("#set-window").value),
    template_first: $("#set-tpl-first").value.trim(),
    template_check: $("#set-tpl-check").value.trim(),
    duration_first: Number($("#set-dur-first").value),
    duration_check: Number($("#set-dur-check").value),
    log_retention_days: Number($("#set-retention").value),
  };
  if (!days.length && !await askConfirm("Nessun giorno selezionato: i reminder automatici non partiranno mai. Salvare comunque?", "Salva")) return;
  if (row.window_days < 1 || row.window_days > 30) return toast("L'anticipo deve essere tra 1 e 30 giorni", true);
  if (!row.template_first || !row.template_check) return toast("I template non possono essere vuoti", true);
  const btn = $("#btn-save-settings");
  btn.classList.add("loading");
  const { error } = await sb.from("settings").update(row).eq("id", 1);
  btn.classList.remove("loading");
  if (error) return toast(`Errore: ${error.message}`, true);
  await loadSettings();
  $("#settings-dirty").textContent = "";
  toast("Impostazioni salvate ✓");
});

// --- Google Calendar
async function renderGcal() {
  const box = $("#gcal-box");
  box.innerHTML = `<span class="muted">Verifica collegamento…</span>`;
  let st;
  try { st = await api("gcal-status"); }
  catch (ex) { box.innerHTML = `<p class="error-text">${esc(ex.message)}</p>`; return; }
  if (!st.configured) {
    box.innerHTML = `<p class="muted">Non ancora configurato: inserisci GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET nei secrets (vedi <em>guida/04_Google_Calendar.md</em>).</p>`;
    return;
  }
  if (!st.connected) {
    box.innerHTML = `<p>Non collegato.</p><div class="row gap"><button class="btn primary" id="gcal-connect">Collega Google Calendar</button></div>`;
    $("#gcal-connect").onclick = connectGoogle;
    return;
  }
  box.innerHTML = `
    <dl class="kv">
      <dt>Account</dt><dd>${esc(st.email ?? "—")}</dd>
      <dt>Calendario</dt><dd><select id="gcal-cal"><option value="${esc(st.calendar_id)}">${esc(st.calendar_id === "primary" ? "Principale" : st.calendar_id)}</option></select></dd>
      <dt>Ultima sync</dt><dd>${st.last_sync_at ? esc(fmtShort(new Date(st.last_sync_at))) : "mai"}${st.last_sync_result ? `<br><small class="muted">${esc(st.last_sync_result)}</small>` : ""}</dd>
    </dl>
    <div class="row gap">
      <button class="btn primary" id="gcal-sync">Sincronizza ora</button>
      <button class="btn ghost" id="gcal-reconnect">Ricollega</button>
      <button class="btn ghost danger" id="gcal-disconnect">Scollega</button>
    </div>`;
  $("#gcal-sync").onclick = async (e) => {
    e.target.classList.add("loading");
    try { const r = await api("gcal-sync"); toast(`Sincronizzato: ${r.summary}`); state.calendar?.refetchEvents(); }
    catch (ex) { toast(ex.message, true); }
    renderGcal();
  };
  $("#gcal-reconnect").onclick = connectGoogle;
  $("#gcal-disconnect").onclick = async () => {
    if (!await askConfirm("Scollegare Google Calendar? Gli appuntamenti restano nell'app.", "Scollega")) return;
    try { await api("gcal-disconnect"); toast("Google Calendar scollegato"); } catch (ex) { toast(ex.message, true); }
    renderGcal();
  };
  // elenco calendari
  try {
    const { items } = await api("gcal-calendars");
    const sel = $("#gcal-cal");
    if (!sel) return;
    sel.innerHTML = items.map((c) => `<option value="${esc(c.primary ? "primary" : c.id)}">${esc(c.summary)}${c.primary ? " (principale)" : ""}</option>`).join("");
    sel.value = st.calendar_id;
    sel.onchange = async () => {
      if (!await askConfirm("Cambiare calendario? Gli appuntamenti dell'app verranno ricreati sul nuovo calendario.", "Cambia")) { sel.value = st.calendar_id; return; }
      try { const r = await api("gcal-set-calendar", { calendar_id: sel.value }); toast(`Calendario cambiato: ${r.summary}`); state.calendar?.refetchEvents(); }
      catch (ex) { toast(ex.message, true); }
      renderGcal();
    };
  } catch { /* elenco non disponibile: resta il valore attuale */ }
}

async function connectGoogle() {
  try {
    const returnTo = location.protocol === "https:" ? location.href.split("#")[0] : "";
    const { url } = await api("gcal-auth-url", { return_to: returnTo });
    if (IS_DESKTOP || !returnTo) {
      window.open(url, "_blank");
      $("#gcal-box").insertAdjacentHTML("beforeend", `<p class="notice" style="margin-top:12px">Completa il collegamento nella finestra del browser che si è aperta, poi torna qui e premi <button class="btn ghost" id="gcal-check">Aggiorna stato</button></p>`);
      $("#gcal-check").onclick = renderGcal;
    } else {
      location.href = url;
    }
  } catch (ex) { toast(ex.message, true); }
}

// ---------------------------------------------------------------------
// Conferma interna (sostituisce window.confirm: su Windows/Electron la
// finestra di sistema fa perdere la tastiera ai campi di testo)
// ---------------------------------------------------------------------
function askConfirm(message, okLabel = "Conferma") {
  return new Promise((resolve) => {
    const d = $("#dlg-confirm");
    $("#confirm-text").textContent = message;
    $("#confirm-ok").textContent = okLabel;
    const done = (v) => { d.close(); resolve(v); };
    $("#confirm-ok").onclick = () => done(true);
    $("#confirm-cancel").onclick = () => done(false);
    d.oncancel = (e) => { e.preventDefault(); done(false); };
    d.showModal();
    $("#confirm-cancel").focus();
  });
}

// ---------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------
let toastTimer;
function toast(msg, isErr = false) {
  const t = $("#toast");
  t.textContent = msg;
  t.className = "toast show" + (isErr ? " err" : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = "toast"), isErr ? 6000 : 3000);
}

window.addEventListener("error", (e) => toast(`Errore: ${e.message}`, true));
window.addEventListener("unhandledrejection", (e) => toast(`Errore: ${e.reason?.message ?? e.reason}`, true));

boot().catch((e) => {
  console.error(e);
  show("login");
  toast(`Errore di avvio: ${e.message}`, true);
});
