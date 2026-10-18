// =====================================================================
//  Componenti di interfaccia: icone, modali/fogli, conferma, toast
// =====================================================================
import { esc } from "./util.js";

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const isMobile = () => window.matchMedia("(max-width: 899px)").matches;

/* ---------- icone (tratto 1.75, 24x24) ---------- */
const PATHS = {
  calendar: "M4 8.5h16 M8 3v3 M16 3v3 M6 5h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z",
  users: "M9 11a4 4 0 1 0 0-8a4 4 0 0 0 0 8z M2.5 21a6.5 6.5 0 0 1 13 0 M16 3.2a4 4 0 0 1 0 7.6 M18.5 14.5a6.5 6.5 0 0 1 3 6.5",
  message: "M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-5 4V6a1 1 0 0 1 1-1z M8 10h8 M8 13h5",
  cog: "M12 15a3 3 0 1 0 0-6a3 3 0 0 0 0 6z M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3a1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5a1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8a1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5a1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  plus: "M12 5v14 M5 12h14",
  minus: "M5 12h14",
  left: "M15 18l-6-6l6-6",
  right: "M9 18l6-6l-6-6",
  close: "M6 6l12 12 M18 6L6 18",
  check: "M5 12l5 5L20 7",
  checks: "M2 12l5 5L17 7 M12 16l1 1L23 7",
  clock: "M12 7v5l3 2 M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z",
  pin: "M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z M12 12a2.5 2.5 0 1 0 0-5a2.5 2.5 0 0 0 0 5z",
  phone: "M5 4h4l2 5l-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z",
  search: "M11 18a7 7 0 1 0 0-14a7 7 0 0 0 0 14z M21 21l-4.3-4.3",
  sun: "M12 16a4 4 0 1 0 0-8a4 4 0 0 0 0 8z M12 2v2 M12 20v2 M4.9 4.9l1.4 1.4 M17.7 17.7l1.4 1.4 M2 12h2 M20 12h2 M4.9 19.1l1.4-1.4 M17.7 6.3l1.4-1.4",
  moon: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z",
  logout: "M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4 M10 17l-5-5l5-5 M5 12h11",
  trash: "M4 7h16 M10 11v6 M14 11v6 M6 7l1 13h10l1-13 M9 7V4h6v3",
  send: "M22 2L11 13 M22 2l-7 20l-4-9l-9-4z",
  play: "M7 4l13 8l-13 8z",
  refresh: "M20 11a8 8 0 0 0-14.9-3.5 M4 4v4h4 M4 13a8 8 0 0 0 14.9 3.5 M20 20v-4h-4",
  alert: "M12 9v4 M12 17h.01 M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
  google: "M21 12.2c0-.7-.1-1.4-.2-2H12v3.8h5a4.3 4.3 0 0 1-1.9 2.8v2.3h3A9 9 0 0 0 21 12.2z M12 21a8.9 8.9 0 0 0 6.1-2.2l-3-2.3a5.6 5.6 0 0 1-8.3-2.9H3.7v2.4A9 9 0 0 0 12 21z M6.8 13.6a5.4 5.4 0 0 1 0-3.4V7.8H3.7a9 9 0 0 0 0 8.2z M12 6.6a4.9 4.9 0 0 1 3.4 1.3l2.6-2.6A8.7 8.7 0 0 0 12 3a9 9 0 0 0-8.3 4.8l3.1 2.4A5.4 5.4 0 0 1 12 6.6z",
  link: "M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1 M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1",
  user: "M12 12a4 4 0 1 0 0-8a4 4 0 0 0 0 8z M4 21a8 8 0 0 1 16 0",
  sparkle: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z",
  share: "M12 3v12 M7 8l5-5l5 5 M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6",
  download: "M12 3v12 M7 10l5 5l5-5 M4 20h16",
  hourglass: "M6 3h12 M6 21h12 M7 3c0 5 10 5 10 9s-10 4-10 9 M17 3c0 5-10 5-10 9",
  note: "M5 4h10l4 4v12H5z M15 4v4h4 M8 13h8 M8 16h5",
  chev: "M9 18l6-6l-6-6",
  list: "M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01",
  grid: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
};

export function icon(name, size = 18) {
  const d = (PATHS[name] ?? "").split(" M").map((p, i) => `<path d="${i ? "M" + p : p}"/>`).join("");
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
}

/* ---------- toast ---------- */
export function toast(msg, kind = "ok") {
  let box = $(".toasts");
  if (!box) { box = document.createElement("div"); box.className = "toasts"; box.setAttribute("aria-live", "polite"); document.body.append(box); }
  const t = document.createElement("div");
  t.className = `toast toast-${kind}`;
  t.textContent = msg;
  box.append(t);
  setTimeout(() => t.remove(), kind === "err" ? 6500 : 2800);
}

/* ---------- modale / foglio dal basso su telefono ---------- */
let openCount = 0;
export function openModal({ title, body = "", footer = "", size = "", onClose } = {}) {
  const back = document.createElement("div");
  back.className = "modal-backdrop";
  back.innerHTML = `
    <div class="modal ${size === "sm" ? "modal-sm" : ""}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="grabber"></div>
      <header class="modal-head"><h2>${esc(title)}</h2><button type="button" class="icon-btn" data-x aria-label="Chiudi">${icon("close")}</button></header>
      <div class="modal-body"></div>
      ${footer !== null ? `<footer class="modal-foot"></footer>` : ""}
    </div>`;
  const m = $(".modal", back);
  const b = $(".modal-body", back);
  if (typeof body === "string") b.innerHTML = body; else b.append(body);
  const f = $(".modal-foot", back);
  if (f) { if (typeof footer === "string") f.innerHTML = footer; else f.append(footer); if (!f.childNodes.length) f.remove(); }

  let closed = false;
  const close = (result) => {
    if (closed) return;
    closed = true;
    document.removeEventListener("keydown", onKey);
    back.remove();
    openCount--;
    if (!openCount) document.body.style.overflow = "";
    onClose?.(result);
  };
  const onKey = (e) => { if (e.key === "Escape" && back === [...document.querySelectorAll(".modal-backdrop")].pop()) close(); };
  document.addEventListener("keydown", onKey);
  back.addEventListener("mousedown", (e) => { if (e.target === back) close(); });
  $("[data-x]", back).onclick = () => close();
  back.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) close(); });

  // trascinare il foglio verso il basso per chiuderlo (telefono)
  const grab = $(".grabber", back);
  let y0 = null;
  const head = $(".modal-head", back);
  for (const el of [grab, head]) {
    el.addEventListener("touchstart", (e) => { y0 = e.touches[0].clientY; m.style.transition = "none"; }, { passive: true });
    el.addEventListener("touchmove", (e) => { if (y0 == null) return; const dy = Math.max(0, e.touches[0].clientY - y0); m.style.transform = `translateY(${dy}px)`; }, { passive: true });
    el.addEventListener("touchend", (e) => {
      if (y0 == null) return;
      const dy = e.changedTouches[0].clientY - y0; y0 = null;
      m.style.transition = "transform .2s"; m.style.transform = "";
      if (dy > 110) close();
    });
  }

  document.body.append(back);
  openCount++;
  document.body.style.overflow = "hidden";
  if (!isMobile()) setTimeout(() => $("input:not([type=hidden]), textarea, select", b)?.focus(), 30);
  return { el: back, body: b, footer: f, close };
}

/* ---------- conferma (sostituisce window.confirm) ---------- */
export function askConfirm(message, okLabel = "Conferma", danger = true) {
  return new Promise((resolve) => {
    const m = openModal({
      title: "Conferma",
      size: "sm",
      body: `<p style="font-size:15.5px">${esc(message)}</p>`,
      footer: `<button type="button" class="btn btn-quiet" data-no>Annulla</button><button type="button" class="btn ${danger ? "btn-danger" : "btn-primary"}" data-yes>${esc(okLabel)}</button>`,
      onClose: (r) => resolve(r === true),
    });
    $("[data-no]", m.el).onclick = () => m.close(false);
    $("[data-yes]", m.el).onclick = () => m.close(true);
    setTimeout(() => $("[data-no]", m.el).focus(), 30);
  });
}

/* ---------- pulsante "in corso" ---------- */
export async function busy(btn, fn) {
  btn.classList.add("busy");
  btn.disabled = true;
  try { return await fn(); }
  finally { btn.classList.remove("busy"); btn.disabled = false; }
}

export function emptyState(title, body = "", ic = "calendar") {
  return `<div class="empty">${icon(ic, 30)}<p class="empty-title">${esc(title)}</p>${body ? `<div class="empty-body">${body}</div>` : ""}</div>`;
}
