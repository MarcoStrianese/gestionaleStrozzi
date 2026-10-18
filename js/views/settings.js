// =====================================================================
//  Impostazioni: pianificazione, testi SMS, durate, Google Calendar, app
// =====================================================================
import { esc, renderTemplate, smsInfo, fmtData, fmtOra, fmtShort, nextRun } from "../util.js";
import { $, $$, icon, toast, askConfirm, busy } from "../ui.js";
import { sb, store, api, loadSettings, loadQueueCount } from "../data.js";
import { updateChrome, applyTheme, getThemePref, isStandalone, promptInstall, APP_VERSION } from "../app.js";

const IS_DESKTOP = !!window.strozziDesktop;
let root = null, dirty = false;
const DAYN = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

export function render(main) {
  root = main;
  dirty = false;
  const s = store.settings;
  main.innerHTML = `
    <div class="page">
      <header class="page-head"><div><p class="eyebrow">Configurazione</p><h1>Impostazioni</h1></div></header>
      <div class="set-grid">
        <section class="panel">
          <div><h2>Pianificazione invii</h2><p class="muted small">Il server controlla ogni ora: nei giorni e all'ora scelti invia i reminder. Funziona anche a PC spento.</p></div>
          <div class="field"><span class="label">Giorni di invio</span>
            <div class="days-pick" data-days>${DAYN.map((d, i) => `<button type="button" data-d="${i + 1}">${d}</button>`).join("")}</div></div>
          <div class="row-2 collapse">
            <div class="field"><label for="s-hour">Ora di invio</label><select id="s-hour">${Array.from({ length: 24 }, (_, h) => `<option value="${h}">${String(h).padStart(2, "0")}:00</option>`).join("")}</select></div>
            <div class="field"><span class="label">Anticipo</span>
              <div class="num-step" data-step="s-window"><button type="button" class="icon-btn" data-dec>${icon("minus")}</button><input id="s-window" type="number" min="1" max="30"><span class="unit">giorni</span><button type="button" class="icon-btn" data-inc>${icon("plus")}</button></div></div>
          </div>
          <p class="muted small" data-whint></p>
        </section>

        <section class="panel">
          <div><h2>Durate e registro</h2><p class="muted small">Durate proposte quando crei un appuntamento (le puoi sempre cambiare).</p></div>
          <div class="stack-s">
            ${stepRow("s-dfirst", "Prima visita", "min", 5, 480, 5, "first")}
            ${stepRow("s-dcheck", "Check di controllo", "min", 5, 480, 5, "check")}
            ${stepRow("s-ret", "Conserva il registro per", "giorni", 1, 60, 1)}
          </div>
        </section>

        <section class="panel span">
          <div class="panel-head"><div><h2>Testi dei messaggi</h2><p class="muted small">Tocca un segnaposto per inserirlo nel punto del cursore.</p></div>
            <div class="chips" data-ph>${["{nome}", "{cognome}", "{data}", "{ora}", "{luogo}"].map((p) => `<button type="button" class="chip chip-sm mono" data-p="${p}">${p}</button>`).join("")}</div></div>
          <div class="two-col">
            ${tplBlock("s-tfirst", "Prima visita", "first")}
            ${tplBlock("s-tcheck", "Check di controllo", "check")}
          </div>
        </section>

        <section class="panel">
          <div><h2>${icon("google", 18)} Google Calendar</h2><p class="muted small">Sincronizzazione nei due sensi: ciò che è su Google compare qui e viceversa. Avviene da sola ogni ora.</p></div>
          <div class="gcal-box" data-gcal><span class="muted">Verifica collegamento…</span></div>
        </section>

        <section class="panel">
          <div><h2>App</h2><p class="muted small">Aspetto e installazione su questo dispositivo.</p></div>
          <div class="field"><span class="label">Tema</span>
            <div class="segmented" data-theme-seg>
              <button type="button" data-t="system">Automatico</button><button type="button" data-t="light">Chiaro</button><button type="button" data-t="dark">Scuro</button>
            </div></div>
          ${!isStandalone() ? `<div class="field"><span class="label">Telefono</span>
            <button type="button" class="btn" data-install>${icon("download")}<span>Installa come app (schermo intero)</span></button>
            <p class="hint">Così si apre dall'icona del Dr. Strozzi, senza la barra del browser.</p></div>` : ""}
          <p class="muted small">Studio Strozzi · Agenda v${APP_VERSION}${IS_DESKTOP ? " · app Windows" : isStandalone() ? " · app installata" : ""}</p>
        </section>
      </div>
      <div class="save-bar" data-savebar hidden>
        <span class="small"><b>Modifiche non salvate</b></span>
        <div class="head-actions"><button type="button" class="btn btn-quiet btn-sm" data-undo>Annulla</button><button type="button" class="btn btn-primary btn-sm" data-save>${icon("check")}<span>Salva</span></button></div>
      </div>
    </div>`;
  fill(s);
  bind();
  renderGcal();
}
export function refresh() { if (!dirty) fill(store.settings); }

function stepRow(id, label, unit, min, max, stepv, dot = "") {
  return `<div class="run-row"><span>${dot ? `<i class="dot ${dot}"></i> ` : ""}${label}</span>
    <div class="num-step" data-step="${id}" data-min="${min}" data-max="${max}" data-s="${stepv}"><button type="button" class="icon-btn" data-dec>${icon("minus")}</button><input id="${id}" type="number" min="${min}" max="${max}" step="${stepv}"><span class="unit">${unit}</span><button type="button" class="icon-btn" data-inc>${icon("plus")}</button></div></div>`;
}
function tplBlock(id, label, cls) {
  return `<div class="tpl">
    <div class="tpl-head"><h3><i class="dot ${cls}"></i>${label}</h3><span class="counter" data-counter="${id}"></span></div>
    <textarea id="${id}" rows="4"></textarea>
    <div class="phone-preview"><div class="from">Studio Strozzi · SMS</div><div class="bubble" data-preview="${id}"></div></div>
  </div>`;
}

function fill(s) {
  if (!s || !root) return;
  $$("[data-d]", root).forEach((b) => b.classList.toggle("on", (s.schedule_days ?? []).includes(Number(b.dataset.d))));
  $("#s-hour", root).value = String(s.schedule_hour);
  $("#s-window", root).value = s.window_days;
  $("#s-dfirst", root).value = s.duration_first;
  $("#s-dcheck", root).value = s.duration_check;
  $("#s-ret", root).value = s.log_retention_days;
  $("#s-tfirst", root).value = s.template_first;
  $("#s-tcheck", root).value = s.template_check;
  const pref = getThemePref();
  $$("[data-t]", root).forEach((b) => b.classList.toggle("on", b.dataset.t === pref));
  setDirty(false);
  previews();
}

function setDirty(v) { dirty = v; const b = $("[data-savebar]", root); if (b) b.hidden = !v; }

function previews() {
  const sample = new Date(); sample.setDate(sample.getDate() + 3); sample.setHours(10, 30, 0, 0);
  const vars = { nome: "Mario", cognome: "Rossi", data: fmtData(sample), ora: fmtOra(sample), luogo: store.recentLocations[0] ?? "Studio di via Roma", tipo: "" };
  for (const id of ["s-tfirst", "s-tcheck"]) {
    const text = renderTemplate($(`#${id}`, root).value, vars);
    $(`[data-preview="${id}"]`, root).textContent = text || "…";
    const info = smsInfo(text);
    const c = $(`[data-counter="${id}"]`, root);
    c.textContent = `${info.len} caratteri · ${info.segments} SMS${info.gsm ? "" : " (emoji/simboli: 70 per SMS)"}`;
    c.classList.toggle("warn", info.segments > 1);
  }
  const w = Number($("#s-window", root).value) || 0;
  const days = $$("[data-d].on", root).map((b) => Number(b.dataset.d));
  const n = nextRun(days, Number($("#s-hour", root).value));
  $("[data-whint]", root).innerHTML = w
    ? `Ad ogni invio parte un SMS per ogni appuntamento dei prossimi <b>${w} giorni</b> che non l'ha ancora ricevuto. ${n ? `Prossimo invio: <b>${esc(fmtShort(n))}</b>.` : "<b>Nessun giorno selezionato.</b>"}`
    : "";
}

let lastTpl = null;
function bind() {
  $("[data-days]", root).addEventListener("click", (e) => { const b = e.target.closest("[data-d]"); if (!b) return; b.classList.toggle("on"); setDirty(true); previews(); });
  root.addEventListener("input", (e) => { if (e.target.closest(".set-grid") && e.target.matches("input, select, textarea") && !e.target.closest("[data-gcal]")) { setDirty(true); previews(); } });
  $("#s-hour", root).addEventListener("change", () => { setDirty(true); previews(); });
  $$("[data-step]", root).forEach((box) => {
    const inp = $("input", box);
    const min = Number(inp.min), max = Number(inp.max), s = Number(inp.step) || 1;
    const set = (v) => { inp.value = Math.max(min, Math.min(max, v)); setDirty(true); previews(); };
    $("[data-dec]", box).onclick = () => set(Number(inp.value) - s);
    $("[data-inc]", box).onclick = () => set(Number(inp.value) + s);
  });
  $$("textarea", root).forEach((t) => t.addEventListener("focus", () => (lastTpl = t)));
  $("[data-ph]", root).addEventListener("click", (e) => {
    const b = e.target.closest("[data-p]"); if (!b) return;
    const t = lastTpl ?? $("#s-tfirst", root), p = b.dataset.p;
    const a = t.selectionStart ?? t.value.length, z = t.selectionEnd ?? t.value.length;
    t.value = t.value.slice(0, a) + p + t.value.slice(z);
    t.focus(); t.selectionStart = t.selectionEnd = a + p.length;
    setDirty(true); previews();
  });
  $$("[data-t]", root).forEach((b) => (b.onclick = () => { applyTheme(b.dataset.t); $$("[data-t]", root).forEach((x) => x.classList.toggle("on", x === b)); }));
  $("[data-install]", root)?.addEventListener("click", promptInstall);
  $("[data-undo]", root).onclick = () => fill(store.settings);
  $("[data-save]", root).onclick = (e) => busy(e.currentTarget, save);
}

async function save() {
  const days = $$("[data-d].on", root).map((b) => Number(b.dataset.d));
  const row = {
    schedule_days: days,
    schedule_hour: Number($("#s-hour", root).value),
    window_days: Number($("#s-window", root).value),
    duration_first: Number($("#s-dfirst", root).value),
    duration_check: Number($("#s-dcheck", root).value),
    log_retention_days: Number($("#s-ret", root).value),
    template_first: $("#s-tfirst", root).value.trim(),
    template_check: $("#s-tcheck", root).value.trim(),
  };
  if (!(row.window_days >= 1 && row.window_days <= 30)) return toast("L'anticipo deve essere tra 1 e 30 giorni", "err");
  if (!row.template_first || !row.template_check) return toast("I testi dei messaggi non possono essere vuoti", "err");
  if (!days.length && !(await askConfirm("Nessun giorno selezionato: i reminder automatici non partiranno mai. Salvare comunque?", "Salva", false))) return;
  const { error } = await sb.from("settings").update(row).eq("id", 1);
  if (error) return toast(`Errore: ${error.message}`, "err");
  await loadSettings();
  await loadQueueCount().catch(() => {});
  updateChrome();
  fill(store.settings);
  toast("Impostazioni salvate");
}

/* ---------------------------------------------------------------------
   Google Calendar
   --------------------------------------------------------------------- */
async function renderGcal() {
  const box = $("[data-gcal]", root);
  if (!box) return;
  let st;
  try { st = await api("gcal-status"); }
  catch (ex) { box.innerHTML = `<p class="form-error">${esc(ex.message)}</p>`; return; }
  if (!st.configured) {
    box.innerHTML = `<p class="muted small">Non ancora configurato: servono GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET (guida 04).</p>`;
    return;
  }
  if (!st.connected) {
    box.innerHTML = `<p class="muted">Non collegato.</p><div><button class="btn btn-primary" data-gc-connect>${icon("link")}<span>Collega Google Calendar</span></button></div>`;
    $("[data-gc-connect]", box).onclick = connectGoogle;
    return;
  }
  box.innerHTML = `
    <dl class="kv">
      <dt>Account</dt><dd>${esc(st.email ?? "—")}</dd>
      <dt>Calendario</dt><dd><select data-gc-cal><option value="${esc(st.calendar_id)}">${esc(st.calendar_id === "primary" ? "Principale" : st.calendar_id)}</option></select></dd>
      <dt>Ultima sync</dt><dd>${st.last_sync_at ? esc(fmtShort(new Date(st.last_sync_at))) : "mai"}${st.last_sync_result ? `<br><span class="muted small">${esc(st.last_sync_result)}</span>` : ""}</dd>
    </dl>
    <div class="toolbar">
      <button class="btn btn-primary btn-sm" data-gc-sync>${icon("refresh", 16)}<span>Sincronizza ora</span></button>
      <button class="btn btn-quiet btn-sm" data-gc-re>Ricollega</button>
      <button class="btn btn-danger btn-sm" data-gc-off>Scollega</button>
    </div>`;
  $("[data-gc-sync]", box).onclick = (e) => busy(e.currentTarget, async () => {
    try { const r = await api("gcal-sync"); toast(`Sincronizzato · ${r.summary}`); window.dispatchEvent(new Event("strozzi-changed")); }
    catch (ex) { toast(ex.message, "err"); }
    renderGcal();
  });
  $("[data-gc-re]", box).onclick = connectGoogle;
  $("[data-gc-off]", box).onclick = async () => {
    if (!(await askConfirm("Scollegare Google Calendar? Gli appuntamenti restano nell'app.", "Scollega"))) return;
    try { await api("gcal-disconnect"); toast("Google Calendar scollegato"); } catch (ex) { toast(ex.message, "err"); }
    renderGcal();
  };
  try {
    const { items } = await api("gcal-calendars");
    const sel = $("[data-gc-cal]", box);
    if (!sel) return;
    sel.innerHTML = items.map((c) => `<option value="${esc(c.primary ? "primary" : c.id)}">${esc(c.summary)}${c.primary ? " (principale)" : ""}</option>`).join("");
    sel.value = st.calendar_id;
    sel.onchange = async () => {
      if (!(await askConfirm("Cambiare calendario? Gli appuntamenti dell'app verranno ricreati sul nuovo calendario.", "Cambia", false))) { sel.value = st.calendar_id; return; }
      try { const r = await api("gcal-set-calendar", { calendar_id: sel.value }); toast(`Calendario cambiato · ${r.summary}`); window.dispatchEvent(new Event("strozzi-changed")); }
      catch (ex) { toast(ex.message, "err"); }
      renderGcal();
    };
  } catch { /* elenco non disponibile */ }
}

async function connectGoogle() {
  try {
    const returnTo = location.protocol === "https:" ? location.href.split("#")[0] : "";
    const { url } = await api("gcal-auth-url", { return_to: returnTo });
    if (IS_DESKTOP || !returnTo) {
      window.open(url, "_blank");
      const box = $("[data-gcal]", root);
      box.insertAdjacentHTML("beforeend", `<div class="notice">Completa il collegamento nella finestra del browser che si è aperta, poi torna qui. <button class="btn btn-sm" data-gc-check style="margin-top:8px">Aggiorna stato</button></div>`);
      $("[data-gc-check]", box).onclick = renderGcal;
    } else location.href = url;
  } catch (ex) { toast(ex.message, "err"); }
}
