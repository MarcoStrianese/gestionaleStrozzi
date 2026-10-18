// =====================================================================
//  Clienti: anagrafica
// =====================================================================
import { esc, normalizePhone, prettyPhone, fullName, initials, fmtShort, relDay, fmtHM } from "../util.js";
import { $, $$, icon, toast, openModal, askConfirm, emptyState, busy } from "../ui.js";
import { sb, store, loadClients } from "../data.js";
import { openAppointment } from "./appointment.js";

let root = null, q = "", stats = new Map();

export function render(main) {
  root = main;
  main.innerHTML = `
    <div class="page">
      <header class="page-head">
        <div><p class="eyebrow">Anagrafica</p><h1>Clienti</h1></div>
        <div class="head-actions"><button class="btn btn-primary" data-new>${icon("plus")}<span>Nuovo cliente</span></button></div>
      </header>
      <div class="toolbar">
        <label class="search">${icon("search")}<input type="search" placeholder="Cerca per nome o telefono…" data-q value="${esc(q)}" autocomplete="off"></label>
        <span class="muted small" data-count></span>
      </div>
      <div class="panel flush" data-list></div>
    </div>`;
  $("[data-new]", main).onclick = () => openClient(null);
  $("[data-q]", main).addEventListener("input", (e) => { q = e.target.value; draw(); });
  $("[data-list]", main).addEventListener("click", (e) => {
    const r = e.target.closest("[data-id]");
    if (r) openClient(store.clients.find((c) => c.id === r.dataset.id));
  });
  window.addEventListener("strozzi-changed", onChanged);
  draw();
  loadStats();
}
export function destroy() { window.removeEventListener("strozzi-changed", onChanged); }
export function refresh() { draw(); loadStats(); }
async function onChanged() { await loadClients().catch(() => {}); refresh(); }

async function loadStats() {
  const since = new Date(Date.now() - 400 * 86400000).toISOString();
  const { data } = await sb.from("appointments").select("client_id, start_at").eq("deleted", false).not("client_id", "is", null).gte("start_at", since).order("start_at");
  stats = new Map();
  const now = new Date();
  for (const r of data ?? []) {
    const s = stats.get(r.client_id) ?? { visits: 0, next: null, last: null };
    const d = new Date(r.start_at);
    if (d < now) { s.visits++; s.last = d; } else if (!s.next) s.next = d;
    stats.set(r.client_id, s);
  }
  draw();
}

function filtered() {
  const t = q.trim().toLowerCase();
  if (!t) return store.clients;
  const td = t.replace(/\D/g, "");
  return store.clients.filter((c) => {
    const n1 = `${c.first_name} ${c.last_name}`.toLowerCase(), n2 = `${c.last_name} ${c.first_name}`.toLowerCase();
    return n1.includes(t) || n2.includes(t) || (td.length >= 3 && (c.phone ?? "").replace(/\D/g, "").includes(td));
  });
}

function draw() {
  if (!root) return;
  const list = filtered();
  $("[data-count]", root).textContent = `${list.length} ${list.length === 1 ? "cliente" : "clienti"}`;
  const box = $("[data-list]", root);
  if (!list.length) {
    box.innerHTML = emptyState(store.clients.length ? "Nessun cliente trovato" : "Ancora nessun cliente",
      store.clients.length ? "Prova con un altro nome o numero." : "Aggiungine uno, oppure crealo direttamente da un nuovo appuntamento.", "users");
    return;
  }
  const sorted = [...list].sort((a, b) => (a.last_name || a.first_name).localeCompare(b.last_name || b.first_name, "it"));
  let html = `<div class="clist-head"><span></span><span>Nome</span><span class="hide-m">Telefono</span><span class="hide-m">Prossimo appuntamento</span><span></span></div><div class="clist">`;
  let letter = "";
  for (const c of sorted) {
    const L = ((c.last_name || c.first_name)[0] ?? "#").toUpperCase();
    if (L !== letter && !q && sorted.length > 12) { letter = L; html += `<div class="letter">${esc(L)}</div>`; }
    const s = stats.get(c.id);
    const bad = !normalizePhone(c.phone);
    html += `<button class="crow" data-id="${c.id}">
      <span class="avatar">${esc(initials(c))}</span>
      <span style="min-width:0"><span class="nm" style="display:block">${esc(fullName(c))}</span>
        <span class="sub" style="display:block"><span class="only-m">${esc(prettyPhone(c.phone))} · </span>${s?.visits ? `${s.visits} ${s.visits === 1 ? "visita" : "visite"}` : "Nessuna visita"}${s?.next ? ` · prossima ${esc(relDay(s.next))}` : ""}</span></span>
      <span class="sub hide-m">${bad ? `<span class="badge err">numero non valido</span>` : esc(prettyPhone(c.phone))}</span>
      <span class="sub hide-m">${s?.next ? `${esc(relDay(s.next))} · ${fmtHM(s.next)}` : "—"}</span>
      <span class="chev">${icon("chev")}</span>
    </button>`;
  }
  box.innerHTML = html + `</div>`;
}

export async function openClient(c) {
  const m = openModal({
    title: c ? fullName(c) : "Nuovo cliente",
    body: `
      ${c ? `<div style="display:flex;gap:14px;align-items:center"><span class="avatar avatar-lg">${esc(initials(c))}</span><div><div class="strong">${esc(fullName(c))}</div><div class="muted small">Cliente dal ${new Date(c.created_at).toLocaleDateString("it-IT", { month: "long", year: "numeric" })}</div></div></div>` : ""}
      <div class="row-2">
        <div class="field"><label for="cl-first">Nome</label><input id="cl-first" required></div>
        <div class="field"><label for="cl-last">Cognome</label><input id="cl-last"></div>
      </div>
      <div class="field"><label for="cl-phone">${icon("phone", 14)} Telefono <span class="req">obbligatorio</span></label><input id="cl-phone" type="tel" inputmode="tel" placeholder="333 123 4567"><div class="hint" id="cl-hint"></div></div>
      <div class="field"><label for="cl-email">Email <span class="req">facoltativa</span></label><input id="cl-email" type="email" inputmode="email"></div>
      <div class="field"><label for="cl-notes">Note</label><textarea id="cl-notes" rows="3"></textarea></div>
      ${c ? `<div class="field"><span class="label">Appuntamenti in programma</span><div class="mini-list" data-appts><span class="muted small">Caricamento…</span></div></div>` : ""}
      <div class="form-error" data-err hidden></div>`,
    footer: `
      ${c ? `<button type="button" class="btn btn-danger" data-del>${icon("trash")}<span>Elimina</span></button>` : ""}
      ${c ? `<button type="button" class="btn" data-newappt>${icon("calendar")}<span>Fissa appuntamento</span></button>` : `<button type="button" class="btn btn-quiet" data-close>Annulla</button>`}
      <button type="button" class="btn btn-primary" data-save>${icon("check")}<span>Salva</span></button>`,
  });
  const el = m.el, $q = (s) => $(s, el);
  $q("#cl-first").value = c?.first_name ?? "";
  $q("#cl-last").value = c?.last_name ?? "";
  $q("#cl-phone").value = c ? prettyPhone(c.phone) : "";
  $q("#cl-email").value = c?.email ?? "";
  $q("#cl-notes").value = c?.notes ?? "";
  const vp = () => {
    const v = $q("#cl-phone").value.trim(), n = normalizePhone(v), h = $q("#cl-hint");
    $q("#cl-phone").classList.toggle("invalid", !!v && !n);
    h.className = "hint " + (!v ? "" : n ? "ok" : "bad");
    h.textContent = !v ? "" : n ? `✓ ${n}` : "Numero non valido";
  };
  $q("#cl-phone").addEventListener("input", vp); vp();

  if (c) {
    const { data } = await sb.from("appointments").select("*, client:clients(id, first_name, last_name, phone)").eq("client_id", c.id).eq("deleted", false)
      .gte("start_at", new Date(Date.now() - 86400000).toISOString()).order("start_at").limit(6);
    const box = $q("[data-appts]");
    if (box) {
      box.innerHTML = (data ?? []).length
        ? data.map((a) => `<button type="button" class="mini-item" data-a="${a.id}" style="border:0;font:inherit;color:inherit;cursor:pointer;text-align:left"><i class="dot ${a.type === "prima_visita" ? "first" : "check"}"></i><span class="grow">${a.type === "prima_visita" ? "Prima visita" : "Check"}${a.location ? " · " + esc(a.location) : ""}</span><span class="when">${esc(fmtShort(new Date(a.start_at)))}</span></button>`).join("")
        : `<span class="muted small">Nessun appuntamento in programma.</span>`;
      box.onclick = (e) => { const b = e.target.closest("[data-a]"); if (!b) return; const a = data.find((x) => x.id === b.dataset.a); m.close(); openAppointment(a); };
    }
  }

  $q("[data-newappt]")?.addEventListener("click", () => {
    m.close();
    const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0);
    openAppointment(null, { start: d, clientId: c.id });
  });

  $q("[data-save]").onclick = (ev) => busy(ev.currentTarget, async () => {
    const err = $q("[data-err]");
    const fail = (t) => { err.textContent = t; err.hidden = false; };
    const first = $q("#cl-first").value.trim(), phone = normalizePhone($q("#cl-phone").value);
    if (!first) return fail("Il nome è obbligatorio.");
    if (!phone) return fail("Numero di telefono non valido.");
    const row = { first_name: first, last_name: $q("#cl-last").value.trim(), phone, email: $q("#cl-email").value.trim() || null, notes: $q("#cl-notes").value.trim() || null };
    const { error } = c ? await sb.from("clients").update(row).eq("id", c.id) : await sb.from("clients").insert(row);
    if (error) return fail(error.message);
    m.close();
    toast("Cliente salvato");
    await loadClients();
    window.dispatchEvent(new Event("strozzi-changed"));
  });

  $q("[data-del]")?.addEventListener("click", async () => {
    if (!(await askConfirm(`Eliminare ${fullName(c)}? I suoi appuntamenti restano in agenda ma senza cliente (e senza reminder).`, "Elimina"))) return;
    const { error } = await sb.from("clients").delete().eq("id", c.id);
    if (error) return toast(error.message, "err");
    m.close();
    toast("Cliente eliminato");
    await loadClients();
    window.dispatchEvent(new Event("strozzi-changed"));
  });
}
