// =====================================================================
//  Studio Strozzi · Agenda — avvio, login, struttura e navigazione
// =====================================================================
import { esc } from "./util.js";
import { $, $$, icon, toast, openModal, askConfirm, isMobile } from "./ui.js";
import { CFG, configured, sb, store, loadSettings, loadClients, loadRecentLocations, loadQueueCount, lsGet, lsSet } from "./data.js";
import { nextRun, fmtShort } from "./util.js";
import * as agenda from "./views/agenda.js";
import * as clients from "./views/clients.js";
import * as reminders from "./views/reminders.js";
import * as settings from "./views/settings.js";
import { openAppointment } from "./views/appointment.js";

export const APP_VERSION = "2.0.0";
const IS_DESKTOP = !!window.strozziDesktop;
if (IS_DESKTOP) document.documentElement.classList.add("is-desktop");

const VIEWS = {
  agenda: { label: "Agenda", icon: "calendar", mod: agenda },
  clienti: { label: "Clienti", icon: "users", mod: clients },
  reminder: { label: "Reminder", icon: "message", mod: reminders },
  impostazioni: { label: "Impostazioni", icon: "cog", mod: settings },
};
let current = null;

/* ---------------------------------------------------------------------
   Tema
   --------------------------------------------------------------------- */
const mq = window.matchMedia("(prefers-color-scheme: dark)");
export function getThemePref() { return lsGet("theme", "system"); }
export function applyTheme(pref = getThemePref()) {
  lsSet("theme", pref);
  const t = pref === "system" ? (mq.matches ? "dark" : "light") : pref;
  document.documentElement.dataset.theme = t;
  const bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() || (t === "dark" ? "#0f1311" : "#f2f1ec");
  $('meta[name="theme-color"]')?.setAttribute("content", bg);
  window.strozziDesktop?.setTheme?.({ dark: t === "dark", bg });
  $$("[data-theme-toggle]").forEach((b) => (b.innerHTML = icon(t === "dark" ? "sun" : "moon")));
}
mq.addEventListener?.("change", () => { if (getThemePref() === "system") applyTheme(); });
applyTheme();
function toggleTheme() { applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"); }

/* ---------------------------------------------------------------------
   Avvio
   --------------------------------------------------------------------- */
const root = $("#root");

async function boot() {
  if (!configured) return renderGate("Configurazione mancante",
    `Compila il file <code>js/config.js</code> con indirizzo e chiave del progetto Supabase (guida 01), poi ricarica la pagina.`);
  sb.auth.onAuthStateChange((ev) => { if (ev === "SIGNED_OUT") renderLogin(); });
  const { data: { session } } = await sb.auth.getSession();
  if (session) await startApp(session);
  else renderLogin();
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
}

function hideBoot() { $("#boot")?.remove(); }

function renderGate(title, html) {
  hideBoot();
  root.innerHTML = `<div class="gate"><div class="gate-card"><div class="logo"></div><h1>${esc(title)}</h1><p class="muted center">${html}</p></div></div>`;
}

/* ---------------------------------------------------------------------
   Login
   --------------------------------------------------------------------- */
function renderLogin() {
  hideBoot();
  document.body.classList.remove("on-agenda");
  root.innerHTML = `
    ${IS_DESKTOP ? `<div class="titlebar"></div>` : ""}
    <div class="gate">
      <form class="gate-card" id="login-form" autocomplete="on">
        <div class="logo"></div>
        <h1>Bentornato</h1>
        <p class="lead">Agenda e reminder dello Studio Strozzi</p>
        <div class="field"><label for="l-email">Email</label>
          <input id="l-email" type="email" autocomplete="username" inputmode="email"></div>
        <div class="field"><label for="l-pw">Password</label>
          <input id="l-pw" type="password" autocomplete="current-password" required></div>
        <div class="form-error" id="l-err" hidden></div>
        <button class="btn btn-primary btn-lg" type="submit" id="l-btn">Accedi</button>
        <p class="muted small center">Basta farlo una volta: l'accesso resta memorizzato su questo dispositivo.</p>
      </form>
    </div>`;
  $("#login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("#l-err"), btn = $("#l-btn");
    let email = $("#l-email").value.trim(), password = $("#l-pw").value;
    if (!email && /^\d{4,8}$/.test(password) && CFG.ADMIN_EMAIL && !CFG.ADMIN_EMAIL.includes("INSERISCI")) {
      email = CFG.ADMIN_EMAIL;
      password = (CFG.ADMIN_PASSWORD_PREFIX ?? "") + password;
    }
    if (!email) { err.textContent = "Inserisci l'email."; err.hidden = false; return; }
    err.hidden = true;
    btn.classList.add("busy");
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    btn.classList.remove("busy");
    if (error) { err.textContent = /invalid/i.test(error.message) ? "Credenziali non corrette." : `Errore: ${error.message}`; err.hidden = false; return; }
    await startApp(data.session);
  });
  if (!isMobile()) $("#l-email").focus();
}

/* ---------------------------------------------------------------------
   App
   --------------------------------------------------------------------- */
async function startApp(session) {
  store.user = session.user;
  try {
    await Promise.all([loadSettings(), loadClients(), loadRecentLocations()]);
    await loadQueueCount();
  } catch (e) {
    toast(`Errore di caricamento: ${e.message}`, "err");
  }
  renderShell();
  hideBoot();
  const gcalOk = location.hash.includes("gcal=ok");
  if (gcalOk) { history.replaceState(null, "", location.pathname + location.search + "#/impostazioni"); toast("Google Calendar collegato ✓"); }
  route();
  window.addEventListener("hashchange", route);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
  setInterval(() => { if (!document.hidden) refresh(); }, 120_000);
}

export async function refresh() {
  await Promise.allSettled([loadSettings(), loadClients()]);
  await loadQueueCount().catch(() => {});
  updateChrome();
  current?.mod.refresh?.();
}

function navButtons(cls) {
  return Object.entries(VIEWS).map(([k, v]) =>
    `<button data-nav="${k}" class="${cls}">${icon(v.icon, cls === "tab" ? 22 : 20)}<span>${v.label}</span>${k === "reminder" ? `<span class="count" data-queue hidden></span>` : ""}</button>`).join("");
}

function renderShell() {
  const email = store.user?.email ?? "";
  const initial = (email[0] ?? "?").toUpperCase();
  root.innerHTML = `
    ${IS_DESKTOP ? `<div class="titlebar"></div>` : ""}
    <div class="shell">
      <aside class="rail">
        <div class="brand"><div class="logo"></div><div class="brand-text"><span class="brand-name">Studio <b>Strozzi</b></span><span class="brand-sub">Agenda &amp; reminder</span></div></div>
        <nav class="rail-nav" aria-label="Sezioni">${navButtons("")}</nav>
        <div class="rail-card">
          <span class="status-pill" data-status></span>
          <span class="small" data-next></span>
        </div>
        <div class="rail-foot">
          <button class="me" data-account><span class="avatar">${esc(initial)}</span><span style="min-width:0"><span class="me-name">${esc(email)}</span><span class="me-sub">v${APP_VERSION}</span></span></button>
          <button class="icon-btn" data-theme-toggle aria-label="Cambia tema" title="Cambia tema"></button>
        </div>
      </aside>

      <header class="topbar">
        <div class="brand brand-small"><div class="logo"></div><div class="brand-text"><span class="brand-name">Studio <b>Strozzi</b></span><span class="brand-sub" data-status-m></span></div></div>
        <div class="topbar-actions">
          <button class="icon-btn" data-theme-toggle aria-label="Cambia tema"></button>
          <button class="avatar" data-account aria-label="Account">${esc(initial)}</button>
        </div>
      </header>

      <main class="main" id="main"></main>

      <nav class="tabbar" aria-label="Sezioni">${navButtons("tab")}</nav>
      <button class="fab" id="fab" aria-label="Nuovo appuntamento">${icon("plus", 26)}</button>
    </div>`;
  $$("[data-nav]").forEach((b) => (b.onclick = () => { location.hash = "#/" + b.dataset.nav; }));
  $$("[data-theme-toggle]").forEach((b) => (b.onclick = toggleTheme));
  $$("[data-account]").forEach((b) => (b.onclick = openAccount));
  $("#fab").onclick = () => openAppointment(null, { start: agenda.suggestedStart() });
  applyTheme();
  updateChrome();
}

export function updateChrome() {
  const s = store.settings;
  if (!s) return;
  const n = nextRun(s.schedule_days, s.schedule_hour);
  for (const el of $$("[data-status]")) {
    el.className = "status-pill " + (s.reminders_enabled ? "on" : "off");
    el.textContent = s.reminders_enabled ? "Reminder attivi" : "Reminder disattivati";
  }
  for (const el of $$("[data-next]")) el.textContent = s.reminders_enabled && n ? `Prossimo invio ${fmtShort(n)}` : "Nessun invio automatico";
  for (const el of $$("[data-status-m]")) el.textContent = s.reminders_enabled ? "Reminder attivi" : "Reminder disattivati";
  for (const el of $$("[data-queue]")) { el.textContent = store.queueCount; el.hidden = !store.queueCount; }
}

function route() {
  const key = (location.hash.replace("#/", "").split(/[/?]/)[0] || "agenda");
  const v = VIEWS[key] ?? VIEWS.agenda;
  const k = VIEWS[key] ? key : "agenda";
  current?.mod.destroy?.();
  current = { key: k, mod: v.mod };
  $$("[data-nav]").forEach((b) => b.classList.toggle("on", b.dataset.nav === k));
  document.body.classList.toggle("on-agenda", k === "agenda");
  const main = $("#main");
  main.innerHTML = "";
  window.scrollTo({ top: 0 });
  v.mod.render(main);
}

/* ---------------------------------------------------------------------
   Account
   --------------------------------------------------------------------- */
function openAccount() {
  const pref = getThemePref();
  const m = openModal({
    title: "Il tuo account",
    size: "sm",
    body: `
      <div style="display:flex;gap:14px;align-items:center">
        <span class="avatar avatar-lg">${esc((store.user?.email?.[0] ?? "?").toUpperCase())}</span>
        <div style="min-width:0"><div class="strong" style="overflow:hidden;text-overflow:ellipsis">${esc(store.user?.email ?? "")}</div><div class="muted small">Studio Strozzi · v${APP_VERSION}</div></div>
      </div>
      <div class="field"><span class="label">Aspetto</span>
        <div class="segmented" data-theme-seg>
          <button type="button" data-t="system" class="${pref === "system" ? "on" : ""}">Automatico</button>
          <button type="button" data-t="light" class="${pref === "light" ? "on" : ""}">Chiaro</button>
          <button type="button" data-t="dark" class="${pref === "dark" ? "on" : ""}">Scuro</button>
        </div>
      </div>`,
    footer: `<button type="button" class="btn btn-danger" data-logout>${icon("logout")}<span>Esci da questo dispositivo</span></button>`,
  });
  $$("[data-t]", m.el).forEach((b) => (b.onclick = () => { applyTheme(b.dataset.t); $$("[data-t]", m.el).forEach((x) => x.classList.toggle("on", x === b)); }));
  $("[data-logout]", m.el).onclick = async () => {
    if (!(await askConfirm("Vuoi uscire? Dovrai rifare l'accesso su questo dispositivo.", "Esci"))) return;
    m.close();
    await sb.auth.signOut();
    location.reload();
  };
}

/* ---------------------------------------------------------------------
   Installazione come app (niente barra del browser)
   --------------------------------------------------------------------- */
let deferredInstall = null;
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferredInstall = e; window.dispatchEvent(new Event("strozzi-install-ready")); });
export const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true || IS_DESKTOP;
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
export function canPromptInstall() { return !!deferredInstall; }
export async function promptInstall() {
  if (deferredInstall) {
    deferredInstall.prompt();
    const r = await deferredInstall.userChoice.catch(() => null);
    deferredInstall = null;
    if (r?.outcome === "accepted") toast("App installata: aprila dalla schermata Home");
    return;
  }
  openModal({
    title: "Installa sul telefono",
    size: "sm",
    body: isIOS()
      ? `<p class="muted">Su iPhone l'app si installa da Safari e poi si apre a schermo intero, senza barra del browser.</p>
         <ol class="install-steps"><li>Apri questa pagina in <b>Safari</b></li><li>Tocca <b>Condividi</b> ${icon("share", 16)} in basso</li><li>Scegli <b>Aggiungi alla schermata Home</b></li><li>Apri l'app dall'icona del Dr. Strozzi</li></ol>`
      : `<p class="muted">L'app si installa da Chrome e poi si apre a schermo intero, senza barra del browser.</p>
         <ol class="install-steps"><li>Apri questa pagina in <b>Chrome</b></li><li>Tocca il menu <b>⋮</b> in alto a destra</li><li>Scegli <b>Installa app</b> (o <b>Aggiungi a schermata Home</b>)</li><li>Apri l'app dall'icona del Dr. Strozzi</li></ol>`,
    footer: `<button type="button" class="btn btn-primary" data-close>Ho capito</button>`,
  });
}
export function installBannerHtml() {
  if (isStandalone() || !isMobile() || lsGet("installDismissed", false)) return "";
  return `<div class="install-banner" data-install-banner>
      <div class="logo"></div>
      <div class="txt"><b>Installa l'app</b><span class="muted">Schermo intero, senza browser</span></div>
      <button class="btn btn-primary btn-sm" data-install>Installa</button>
      <button class="icon-btn" data-install-x aria-label="Chiudi">${icon("close", 16)}</button>
    </div>`;
}
export function bindInstallBanner(scope) {
  const b = $("[data-install-banner]", scope);
  if (!b) return;
  $("[data-install]", b).onclick = promptInstall;
  $("[data-install-x]", b).onclick = () => { lsSet("installDismissed", true); b.remove(); };
}

/* ---------------------------------------------------------------------
   Errori imprevisti: mai in silenzio
   --------------------------------------------------------------------- */
window.addEventListener("error", (e) => toast(`Errore: ${e.message}`, "err"));
window.addEventListener("unhandledrejection", (e) => toast(`Errore: ${e.reason?.message ?? e.reason}`, "err"));

boot().catch((e) => { console.error(e); renderLogin(); toast(`Errore di avvio: ${e.message}`, "err"); });
