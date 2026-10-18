// =====================================================================
//  Agenda: giorno / settimana / mese, su misura per PC e telefono
// =====================================================================
import {
  esc, fullName, normalizePhone, startOfDay, addDays, addMonths, startOfWeek, startOfMonth, sameDay,
  minutesOf, fmtWd, fmtDayFull, fmtMonthYear, fmtHM, fmtRange, fmtDur, nextRun, fmtShort, fmtData, fmtOra,
} from "../util.js";
import { $, $$, icon, toast, isMobile, emptyState } from "../ui.js";
import { sb, store, fetchAppointments, lsGet, lsSet } from "../data.js";
import { openAppointment } from "./appointment.js";
import { installBannerHtml, bindInstallBanner, refresh as appRefresh } from "../app.js";

const st = {
  view: lsGet("agendaView", null),     // 'day' | 'week' | 'month'
  cursor: startOfDay(new Date()),
  items: [],
  weekItems: [],
  root: null,
  nowTimer: null,
  scrollTop: null,
};
const H_PX = () => (isMobile() ? 64 : 60);

export function suggestedStart() {
  const d = new Date(st.cursor);
  if (sameDay(d, new Date())) {
    const n = new Date();
    n.setMinutes(Math.ceil(n.getMinutes() / 30) * 30, 0, 0);
    if (n.getHours() < 8) n.setHours(9, 0);
    return n;
  }
  d.setHours(9, 0, 0, 0);
  return d;
}

function view() {
  if (st.view) return st.view;
  return isMobile() ? "day" : "week";
}
function setView(v) { st.view = v; lsSet("agendaView", v); draw(); }

function range() {
  const v = view();
  if (v === "month") {
    const a = startOfWeek(startOfMonth(st.cursor));
    return [a, addDays(a, 42)];
  }
  if (v === "week" || isMobile()) { const a = startOfWeek(st.cursor); return [a, addDays(a, 7)]; }
  return [st.cursor, addDays(st.cursor, 1)];
}

/* ---------------------------------------------------------------------
   Render
   --------------------------------------------------------------------- */
export function render(main) {
  st.root = main;
  main.innerHTML = `
    <div class="page">
      ${installBannerHtml()}
      <header class="page-head">
        <div>
          <p class="eyebrow">${esc(fmtDayFull(new Date()))}<span class="only-m" data-today-sum></span></p>
          <h1>Agenda</h1>
        </div>
        <div class="head-actions only-d">
          <button class="btn btn-primary" data-new>${icon("plus")}<span>Nuovo appuntamento</span></button>
        </div>
      </header>
      <dl class="readout only-d" data-readout>${readoutHtml()}</dl>
      <div class="cal-bar">
        <div class="cal-bar-left">
          <div class="stepper">
            <button class="icon-btn" data-prev aria-label="Precedente">${icon("left")}</button>
            <span class="stepper-label" data-label></span>
            <button class="icon-btn" data-next aria-label="Successivo">${icon("right")}</button>
          </div>
          <button class="btn btn-sm" data-today>Oggi</button>
        </div>
        <div class="segmented" data-views>
          <button data-v="day">Giorno</button>
          <button data-v="week">Settimana</button>
          <button data-v="month">Mese</button>
        </div>
      </div>
      <div data-body></div>
      <div class="legend only-d">
        <span><i class="dot first"></i>Prima visita</span>
        <span><i class="dot check"></i>Check di controllo</span>
        <span><i class="dot none"></i>Senza cliente (nessun reminder)</span>
        <span>${icon("check", 14)} Reminder inviato</span>
      </div>
    </div>`;
  bindInstallBanner(main);
  $("[data-new]", main)?.addEventListener("click", () => openAppointment(null, { start: suggestedStart() }));
  $("[data-prev]", main).onclick = () => step(-1);
  $("[data-next]", main).onclick = () => step(1);
  $("[data-today]", main).onclick = () => { st.cursor = startOfDay(new Date()); draw(); };
  $$("[data-v]", main).forEach((b) => (b.onclick = () => setView(b.dataset.v)));
  bindBodyOnce($("[data-body]", main));
  window.addEventListener("strozzi-changed", onChanged);
  window.addEventListener("resize", onResize);
  draw();
  loadWeekStats();
}

export function destroy() {
  window.removeEventListener("strozzi-changed", onChanged);
  window.removeEventListener("resize", onResize);
  clearInterval(st.nowTimer);
}
export function refresh() { draw(true); loadWeekStats(); }
function onChanged() { draw(true); loadWeekStats(); appRefresh(); }
let lastMobile = isMobile();
function onResize() { if (isMobile() !== lastMobile) { lastMobile = isMobile(); draw(); } }

function step(dir) {
  const v = view();
  if (v === "month") st.cursor = addMonths(st.cursor, dir);
  else if (v === "week") st.cursor = addDays(st.cursor, 7 * dir);
  else st.cursor = addDays(st.cursor, dir);
  draw();
}

let drawSeq = 0;
async function draw(keepScroll = false) {
  const root = st.root;
  if (!root) return;
  const v = view();
  $$("[data-v]", root).forEach((b) => b.classList.toggle("on", b.dataset.v === v));
  const [a, b] = range();
  $("[data-label]", root).textContent =
    v === "month" ? fmtMonthYear(st.cursor)
      : v === "week" ? fmtRange(a, addDays(b, -1))
        : (isMobile() ? fmtMonthYear(st.cursor) : fmtDayFull(st.cursor));
  const body = $("[data-body]", root);
  const sc = $(".tg-scroll", body);
  if (keepScroll && sc) st.scrollTop = sc.scrollTop;
  const seq = ++drawSeq;
  let items;
  try { items = await fetchAppointments(a, b); }
  catch (e) { body.innerHTML = `<div class="panel">${emptyState("Impossibile caricare l'agenda", esc(e.message), "alert")}</div>`; return; }
  if (seq !== drawSeq) return;
  st.items = items;
  clearInterval(st.nowTimer);
  if (v === "month") body.innerHTML = monthHtml(a);
  else if (isMobile()) body.innerHTML = v === "week" ? weekListHtml(a) : dayMobileHtml(a);
  else body.innerHTML = gridHtml(v === "week" ? 7 : 1, v === "week" ? a : st.cursor);
  bindBody(body, v, a);
}

/* ---------------------------------------------------------------------
   Riepilogo in alto
   --------------------------------------------------------------------- */
async function loadWeekStats() {
  try {
    const a = startOfWeek(new Date());
    st.weekItems = await fetchAppointments(a, addDays(a, 7));
    const el = $("[data-readout]", st.root);
    if (el) el.innerHTML = readoutHtml();
    const ts = $("[data-today-sum]", st.root);
    if (ts) { const n = st.weekItems.filter((x) => sameDay(new Date(x.start_at), new Date())).length; ts.textContent = n ? ` · ${n} ${n === 1 ? "appuntamento" : "appuntamenti"} oggi` : " · giornata libera"; }
  } catch { /* ignore */ }
}

function readoutHtml() {
  const s = store.settings;
  const now = new Date();
  const today = st.weekItems.filter((x) => sameDay(new Date(x.start_at), now));
  const nextToday = today.find((x) => new Date(x.start_at) > now);
  const first = st.weekItems.filter((x) => x.type === "prima_visita").length;
  const n = s ? nextRun(s.schedule_days, s.schedule_hour) : null;
  return `
    <div class="readout-item tone-accent"><dt>Oggi</dt><dd>${today.length}</dd>
      <div class="readout-note">${nextToday ? `prossimo alle ${fmtHM(new Date(nextToday.start_at))}` : today.length ? "giornata conclusa" : "nessun appuntamento"}</div></div>
    <div class="readout-item tone-first"><dt>Questa settimana</dt><dd>${st.weekItems.length}</dd>
      <div class="readout-note">${first} prime visite · ${st.weekItems.length - first} check</div></div>
    <div class="readout-item tone-check"><dt>Reminder in coda</dt><dd>${store.queueCount}</dd>
      <div class="readout-note">prossimi ${s?.window_days ?? 7} giorni</div></div>
    <div class="readout-item ${s?.reminders_enabled ? "tone-ok" : "tone-warn"}"><dt>Prossimo invio</dt>
      <dd class="txt">${s?.reminders_enabled ? (n ? esc(fmtShort(n)) : "—") : "Disattivato"}</dd>
      <div class="readout-note">${s?.reminders_enabled ? "invio automatico attivo" : "attivalo in Reminder"}</div></div>`;
}

/* ---------------------------------------------------------------------
   Utilità comuni
   --------------------------------------------------------------------- */
const tclass = (a) => (a.client ? (a.type === "prima_visita" ? "first" : "check") : "none");
const tlabel = (a) => (a.client ? (a.type === "prima_visita" ? "Prima visita" : "Check") : "Senza cliente");
const nameOf = (a) => (a.client ? fullName(a.client) : (a.title || "Evento"));
const dur = (a) => Math.round((new Date(a.end_at) - new Date(a.start_at)) / 60000);
const itemsOn = (d) => st.items.filter((x) => sameDay(new Date(x.start_at), d));
const findItem = (id) => st.items.find((x) => x.id === id);

function cardHtml(a) {
  const s = new Date(a.start_at);
  const past = new Date(a.end_at) < new Date();
  const noPhone = a.client && !normalizePhone(a.client.phone);
  const side = !a.client
    ? `<span class="wait-ico" title="Senza cliente: nessun reminder">${icon("alert", 15)}</span>`
    : a.reminder_sent_at
      ? `<span class="sent-ico" title="Reminder inviato">${icon("check", 15)}</span>`
      : `<span class="wait-ico" title="Reminder in attesa">${icon("hourglass", 15)}</span>`;
  return `
    <button class="acard ${tclass(a)} ${past ? "past" : ""}" data-id="${a.id}">
      <span class="acard-time"><b>${fmtHM(s)}</b><small>${fmtDur(dur(a))}</small></span>
      <span class="acard-main">
        <span class="acard-name">${esc(nameOf(a))}</span>
        <span class="acard-meta"><span class="badge ${tclass(a) === "none" ? "" : tclass(a)}">${tlabel(a)}</span>
          ${a.location ? `<span class="loc">${icon("pin", 13)}${esc(a.location)}</span>` : ""}
          ${noPhone ? `<span class="badge err">numero non valido</span>` : ""}</span>
      </span>
      <span class="acard-side">${side}</span>
    </button>`;
}

/* ---------------------------------------------------------------------
   Telefono: striscia settimana + elenco del giorno
   --------------------------------------------------------------------- */
function stripHtml(weekStart) {
  const today = new Date();
  let html = `<div class="strip">`;
  for (let i = 0; i < 7; i++) {
    const d = addDays(weekStart, i);
    const its = itemsOn(d);
    const dots = its.slice(0, 4).map((x) => `<i class="${tclass(x)}"></i>`).join("");
    html += `<button class="strip-day ${sameDay(d, today) ? "today" : ""} ${sameDay(d, st.cursor) ? "sel" : ""}" data-day="${i}">
      <span class="wd">${esc(fmtWd(d))}</span><span class="dn">${d.getDate()}</span><span class="dots">${dots}</span></button>`;
  }
  return html + `</div>`;
}

function dayMobileHtml(weekStart) {
  const its = itemsOn(st.cursor);
  const head = `<div class="agenda-day-head ${sameDay(st.cursor, new Date()) ? "today" : ""}"><span>${esc(fmtDayFull(st.cursor))}</span><span>${its.length ? `${its.length} ${its.length === 1 ? "appuntamento" : "appuntamenti"}` : ""}</span></div>`;
  return `<div class="panel" data-swipe>${stripHtml(weekStart)}
      <div>${head}<div class="agenda-list">${its.length ? its.map(cardHtml).join("") : emptyState("Giornata libera", "Tocca <b>+</b> per aggiungere un appuntamento.")}</div></div>
    </div>`;
}

function weekListHtml(weekStart) {
  let html = `<div class="agenda">`;
  for (let i = 0; i < 7; i++) {
    const d = addDays(weekStart, i);
    const its = itemsOn(d);
    html += `<section><div class="agenda-day-head ${sameDay(d, new Date()) ? "today" : ""}"><span>${esc(fmtDayFull(d))}</span><span>${its.length || ""}</span></div>
      <div class="agenda-list">${its.length ? its.map(cardHtml).join("") : `<p class="faint small" style="padding:2px 4px 6px">Nessun appuntamento</p>`}</div></section>`;
  }
  return html + `</div>`;
}

/* ---------------------------------------------------------------------
   PC: griglia oraria (giorno / settimana)
   --------------------------------------------------------------------- */
function hoursBounds(days, start) {
  let h0 = 7, h1 = 21;
  for (const a of st.items) {
    const s = new Date(a.start_at), e = new Date(a.end_at);
    if (s < start || s >= addDays(start, days)) continue;
    h0 = Math.min(h0, s.getHours());
    h1 = Math.max(h1, e.getHours() + (e.getMinutes() ? 1 : 0));
  }
  return [h0, Math.min(24, h1)];
}

function layoutDay(its) {
  // colonne affiancate per gli appuntamenti sovrapposti
  const evs = its.map((a) => ({ a, s: minutesOf(new Date(a.start_at)), e: Math.max(minutesOf(new Date(a.start_at)) + 15, minutesOf(new Date(a.end_at)) || 1440) }))
    .sort((x, y) => x.s - y.s || y.e - x.e);
  const out = [];
  let cluster = [], clusterEnd = -1;
  const flush = () => {
    const lanes = [];
    for (const ev of cluster) {
      let l = lanes.findIndex((end) => end <= ev.s);
      if (l === -1) { l = lanes.length; lanes.push(ev.e); } else lanes[l] = ev.e;
      ev.lane = l;
    }
    for (const ev of cluster) { ev.lanes = lanes.length; out.push(ev); }
    cluster = [];
  };
  for (const ev of evs) {
    if (ev.s >= clusterEnd && cluster.length) flush();
    cluster.push(ev);
    clusterEnd = Math.max(clusterEnd, ev.e);
  }
  if (cluster.length) flush();
  return out;
}

function gridHtml(days, start) {
  const [h0, h1] = hoursBounds(days, start);
  const hp = H_PX();
  const today = new Date();
  let head = `<div class="tg-head"><div></div>`;
  for (let i = 0; i < days; i++) {
    const d = addDays(start, i);
    const n = itemsOn(d).length;
    head += `<button class="tg-dayhead ${sameDay(d, today) ? "today" : ""}" data-goday="${i}" title="Apri il giorno">
      <span class="wd">${esc(fmtWd(d))}</span><span class="dn">${d.getDate()}</span><span class="cnt">${n ? `${n} app.` : ""}</span></button>`;
  }
  head += `</div>`;
  let hours = `<div class="tg-hours">`;
  for (let h = h0; h < h1; h++) hours += `<div class="tg-hour"><span>${String(h).padStart(2, "0")}:00</span></div>`;
  hours += `</div>`;
  let cols = "";
  for (let i = 0; i < days; i++) {
    const d = addDays(start, i);
    const wd = d.getDay();
    let evHtml = "";
    for (const ev of layoutDay(itemsOn(d))) {
      const top = ((ev.s - h0 * 60) / 60) * hp;
      const height = Math.max(22, ((ev.e - ev.s) / 60) * hp - 3);
      const w = 100 / ev.lanes;
      const a = ev.a;
      const sent = a.reminder_sent_at ? `<span class="sent" title="Reminder inviato">✓</span>` : "";
      evHtml += `<div class="ev ${tclass(a)} ${height < 46 ? "compact" : ""}" data-id="${a.id}"
          style="top:${top}px;height:${height}px;left:calc(${ev.lane * w}% + 3px);width:calc(${w}% - 6px)">
          <div class="t"><span>${fmtHM(new Date(a.start_at))} – ${fmtHM(new Date(a.end_at))}</span>${sent}</div>
          <div class="n">${esc(nameOf(a))}${height < 46 && sent ? " ✓" : ""}</div>
          ${a.location ? `<div class="l">${esc(a.location)}</div>` : ""}
        </div>`;
    }
    cols += `<div class="tg-col ${sameDay(d, today) ? "today" : ""} ${wd === 0 || wd === 6 ? "weekend" : ""}" data-col="${i}">${evHtml}</div>`;
  }
  return `<div class="panel flush"><div class="tg" style="--days:${days};--hour:${hp}px" data-h0="${h0}" data-h1="${h1}">
    ${head}<div class="tg-scroll"><div class="tg-body">${hours}${cols}</div></div></div></div>`;
}

/* ---------------------------------------------------------------------
   Mese
   --------------------------------------------------------------------- */
function monthHtml(gridStart) {
  const today = new Date();
  let html = `<div class="panel flush"><div class="mg">`;
  for (let i = 0; i < 7; i++) html += `<div class="mg-wd">${esc(fmtWd(addDays(gridStart, i)))}</div>`;
  for (let i = 0; i < 42; i++) {
    const d = addDays(gridStart, i);
    const its = itemsOn(d);
    const out = d.getMonth() !== st.cursor.getMonth();
    html += `<div class="mg-cell ${out ? "out" : ""} ${sameDay(d, today) ? "today" : ""}" data-mday="${i}">
      <span class="mg-num">${d.getDate()}</span>
      ${its.slice(0, 3).map((a) => `<div class="mg-item" data-id="${a.id}"><i class="dot ${tclass(a)}"></i><span class="tm">${fmtHM(new Date(a.start_at))}</span><span class="nm">${esc(nameOf(a))}</span></div>`).join("")}
      ${its.length > 3 ? `<div class="mg-more">+${its.length - 3} altri</div>` : ""}
      <div class="mg-dots">${its.slice(0, 6).map((a) => `<i class="${tclass(a)}"></i>`).join("")}</div>
    </div>`;
  }
  html += `</div></div>`;
  if (isMobile()) {
    const sel = itemsOn(st.cursor);
    html += `<div class="panel"><div class="agenda-day-head"><span>${esc(fmtDayFull(st.cursor))}</span><span>${sel.length || ""}</span></div>
      <div class="agenda-list">${sel.length ? sel.map(cardHtml).join("") : emptyState("Giornata libera")}</div></div>`;
  }
  return html;
}

/* ---------------------------------------------------------------------
   Interazioni
   --------------------------------------------------------------------- */
function bindBodyOnce(body) {
  // un solo gestore per tutta la vita della pagina (il contenuto cambia, il contenitore no)
  body.addEventListener("click", (e) => {
    const v = view();
    const rangeStart = range()[0];
    const item = e.target.closest(".acard, .mg-item");
    if (item) { e.stopPropagation(); const a = findItem(item.dataset.id); if (a) openAppointment(a); return; }
    const sd = e.target.closest("[data-day]");
    if (sd) { st.cursor = addDays(rangeStart, Number(sd.dataset.day)); draw(); return; }
    const gd = e.target.closest("[data-goday]");
    if (gd) { st.cursor = addDays(v === "week" ? rangeStart : st.cursor, Number(gd.dataset.goday)); setView("day"); return; }
    const md = e.target.closest("[data-mday]");
    if (md) {
      st.cursor = addDays(rangeStart, Number(md.dataset.mday));
      if (isMobile()) draw(); else setView("day");
    }
  });

  // scorrimento orizzontale (telefono): giorno/settimana/mese precedente o successivo
  let x0 = null, y0 = null;
  body.addEventListener("touchstart", (e) => { if (e.target.closest(".tg-scroll")) { x0 = null; return; } x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
  body.addEventListener("touchend", (e) => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
    x0 = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
  });
}

function bindBody(body, v, rangeStart) {
  const tg = $(".tg", body);
  if (tg) bindGrid(tg, v === "week" ? rangeStart : st.cursor);
}

function bindGrid(tg, start) {
  const h0 = Number(tg.dataset.h0), h1 = Number(tg.dataset.h1);
  const hp = H_PX();
  const scroll = $(".tg-scroll", tg);
  const snap = (min) => Math.max(h0 * 60, Math.min(h1 * 60 - 15, Math.round(min / 15) * 15));
  const minAt = (col, clientY) => h0 * 60 + ((clientY - col.getBoundingClientRect().top) / hp) * 60;
  const hm = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

  // posizione iniziale
  if (st.scrollTop != null) { scroll.scrollTop = st.scrollTop; st.scrollTop = null; }
  else {
    const firstMin = Math.min(...st.items.filter((a) => new Date(a.start_at) >= start).map((a) => minutesOf(new Date(a.start_at))), 8 * 60);
    scroll.scrollTop = Math.max(0, ((firstMin - h0 * 60) / 60) * hp - 24);
  }

  // linea "adesso"
  const drawNow = () => {
    $$(".tg-now", tg).forEach((x) => x.remove());
    const now = new Date();
    const idx = $$(".tg-col", tg).findIndex((_, i) => sameDay(addDays(start, i), now));
    const m = minutesOf(now);
    if (idx < 0 || m < h0 * 60 || m > h1 * 60) return;
    const line = document.createElement("div");
    line.className = "tg-now";
    line.style.top = `${((m - h0 * 60) / 60) * hp}px`;
    $$(".tg-col", tg)[idx].append(line);
  };
  drawNow();
  st.nowTimer = setInterval(drawNow, 60_000);

  // anteprima slot al passaggio del mouse + clic per nuovo appuntamento
  let hover = null;
  for (const col of $$(".tg-col", tg)) {
    col.addEventListener("mousemove", (e) => {
      if (e.target.closest(".ev") || drag) { hover?.remove(); hover = null; return; }
      const m = snap(minAt(col, e.clientY) - 7);
      if (!hover) { hover = document.createElement("div"); hover.className = "tg-hover"; }
      if (hover.parentNode !== col) col.append(hover);
      hover.style.top = `${((m - h0 * 60) / 60) * hp}px`;
      hover.style.height = `${(30 / 60) * hp - 3}px`;
      hover.textContent = `+ ${hm(m)}`;
    });
    col.addEventListener("mouseleave", () => { hover?.remove(); hover = null; });
    col.addEventListener("click", (e) => {
      if (e.target.closest(".ev") || justDragged) return;
      const m = snap(minAt(col, e.clientY) - 7);
      const d = addDays(start, Number(col.dataset.col));
      d.setHours(Math.floor(m / 60), m % 60, 0, 0);
      openAppointment(null, { start: d });
    });
  }

  // trascinamento (solo mouse): sposta giorno/ora
  let drag = null, justDragged = false;
  tg.addEventListener("pointerdown", (e) => {
    const el = e.target.closest(".ev");
    if (!el || e.button !== 0) return;
    const a = findItem(el.dataset.id);
    if (!a) return;
    if (e.pointerType !== "mouse") { return; }
    const col = el.parentElement;
    const offsetMin = minAt(col, e.clientY) - minutesOf(new Date(a.start_at));
    drag = { el, a, x0: e.clientX, y0: e.clientY, offsetMin, moved: false, col, min: minutesOf(new Date(a.start_at)) };
    try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  });
  tg.addEventListener("pointermove", (e) => {
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 5) return;
    drag.moved = true;
    drag.el.classList.add("dragging");
    hover?.remove(); hover = null;
    const cols = $$(".tg-col", tg);
    const col = cols.find((c) => { const r = c.getBoundingClientRect(); return e.clientX >= r.left && e.clientX < r.right; }) ?? drag.col;
    const m = snap(minAt(col, e.clientY) - drag.offsetMin);
    if (col !== drag.el.parentElement) { col.append(drag.el); drag.el.style.left = "3px"; drag.el.style.width = "calc(100% - 6px)"; }
    drag.col = col; drag.min = m;
    drag.el.style.top = `${((m - h0 * 60) / 60) * hp}px`;
    const t = $(".t span", drag.el);
    if (t) t.textContent = `${hm(m)} – ${hm(m + dur(drag.a))}`;
  });
  tg.addEventListener("pointerup", async () => {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (!d.moved) { openAppointment(d.a); return; }
    justDragged = true; setTimeout(() => (justDragged = false), 50);
    const day = addDays(start, Number(d.col.dataset.col));
    const ns = new Date(day); ns.setHours(Math.floor(d.min / 60), d.min % 60, 0, 0);
    const ne = new Date(ns.getTime() + dur(d.a) * 60000);
    if (ns.getTime() === new Date(d.a.start_at).getTime()) { draw(true); return; }
    const { error } = await sb.from("appointments").update({ start_at: ns.toISOString(), end_at: ne.toISOString() }).eq("id", d.a.id);
    if (error) { toast(`Impossibile spostare: ${error.message}`, "err"); draw(true); return; }
    toast(d.a.reminder_sent_at ? `Spostato a ${fmtData(ns)} ${fmtOra(ns)} · il reminder verrà rimandato` : `Spostato a ${fmtData(ns)} ${fmtOra(ns)}`);
    window.dispatchEvent(new Event("strozzi-changed"));
  });
  // clic semplice su evento con dito/penna
  tg.addEventListener("click", (e) => {
    const el = e.target.closest(".ev");
    if (!el || justDragged) return;
    if (e.pointerType === "mouse" || e.detail === 0) return; // gestito da pointerup
    const a = findItem(el.dataset.id);
    if (a) openAppointment(a);
  });
}
