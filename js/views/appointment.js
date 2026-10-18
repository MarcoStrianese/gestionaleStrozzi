// =====================================================================
//  Foglio "Nuovo / Modifica appuntamento"
// =====================================================================
import { esc, normalizePhone, prettyPhone, fullName, initials, toDateInput, toTimeInput, fmtShort, fmtDur } from "../util.js";
import { $, $$, icon, toast, openModal, askConfirm, isMobile, busy } from "../ui.js";
import { sb, store, loadClients, loadRecentLocations } from "../data.js";

const DURS = [15, 30, 45, 60, 90, 120];
const changed = () => window.dispatchEvent(new Event("strozzi-changed"));

function matches(q) {
  q = q.trim().toLowerCase();
  if (!q) return store.clients.slice(0, 8);
  const qd = q.replace(/\D/g, "");
  return store.clients.filter((c) => {
    const n1 = `${c.first_name} ${c.last_name}`.toLowerCase(), n2 = `${c.last_name} ${c.first_name}`.toLowerCase();
    return n1.includes(q) || n2.includes(q) || (qd.length >= 3 && (c.phone ?? "").replace(/\D/g, "").includes(qd));
  }).slice(0, 8);
}

/**
 * @param a appuntamento esistente (con .client) oppure null
 * @param preset { start: Date, clientId?: string }
 */
export function openAppointment(a, preset = {}) {
  const s = store.settings ?? { duration_first: 60, duration_check: 30, window_days: 7 };
  const st = {
    clientId: a?.client_id ?? preset.clientId ?? null,
    newClient: false,
    type: a?.type ?? "check",
    dur: a ? Math.round((new Date(a.end_at) - new Date(a.start_at)) / 60000) : (s.duration_check ?? 30),
    durTouched: !!a,
  };
  const start = a ? new Date(a.start_at) : (preset.start ?? new Date());
  const imported = a && !a.client_id;

  const m = openModal({
    title: a ? "Modifica appuntamento" : "Nuovo appuntamento",
    body: `
      ${imported ? `<div class="notice">Evento importato da Google Calendar: <b>${esc(a.title || "senza titolo")}</b>. Associa un cliente per poter inviare il reminder.</div>` : ""}
      <div class="field">
        <span class="label">Cliente</span>
        <div data-client-slot></div>
      </div>
      <div class="row-2 collapse" data-newclient hidden>
        <div class="field"><label for="ap-first">Nome</label><input id="ap-first" autocomplete="off"></div>
        <div class="field"><label for="ap-last">Cognome</label><input id="ap-last" autocomplete="off"></div>
      </div>
      <div class="field" data-phone-field>
        <label for="ap-phone">${icon("phone", 14)} Telefono <span class="req">obbligatorio per il reminder</span></label>
        <input id="ap-phone" type="tel" inputmode="tel" placeholder="333 123 4567" autocomplete="off">
        <div class="hint" id="ap-phone-hint"></div>
      </div>
      <div class="field">
        <span class="label">Tipo di visita</span>
        <div class="typepick">
          <button type="button" class="first" data-type="prima_visita"><i class="dot"></i><span>Prima visita<small>${fmtDur(s.duration_first)} di default</small></span></button>
          <button type="button" class="check" data-type="check"><i class="dot"></i><span>Check di controllo<small>${fmtDur(s.duration_check)} di default</small></span></button>
        </div>
      </div>
      <div class="row-2">
        <div class="field"><label for="ap-date">Giorno</label><input id="ap-date" type="date" required></div>
        <div class="field"><label for="ap-time">Ora</label><input id="ap-time" type="time" step="300" required></div>
      </div>
      <div class="field"><span class="label">${icon("clock", 14)} Durata</span><div class="chips" data-durs></div></div>
      <div class="field">
        <label for="ap-loc">${icon("pin", 14)} Luogo</label>
        <input id="ap-loc" placeholder="Studio…" autocomplete="off">
        <div class="chips" data-locs></div>
      </div>
      <div class="field"><label for="ap-notes">${icon("note", 14)} Note</label><textarea id="ap-notes" rows="2" placeholder="Facoltative"></textarea></div>
      <div data-reminder></div>
      <div class="form-error" data-err hidden></div>`,
    footer: `
      ${a ? `<button type="button" class="btn btn-danger" data-del>${icon("trash")}<span>Elimina</span></button>` : ""}
      <button type="button" class="btn btn-quiet" data-close>Annulla</button>
      <button type="button" class="btn btn-primary" data-save>${icon("check")}<span>${a ? "Salva" : "Crea appuntamento"}</span></button>`,
  });
  const el = m.el;
  const q = (sel) => $(sel, el);

  q("#ap-date").value = toDateInput(start);
  q("#ap-time").value = toTimeInput(start);
  q("#ap-loc").value = a?.location ?? (store.recentLocations[0] ?? "");
  q("#ap-notes").value = a?.notes ?? "";

  /* ---- cliente ---- */
  const phone = q("#ap-phone");
  function validatePhone() {
    const v = phone.value.trim(), n = normalizePhone(v), h = q("#ap-phone-hint");
    phone.classList.toggle("invalid", !!v && !n);
    h.className = "hint " + (!v ? "" : n ? "ok" : "bad");
    h.textContent = !v ? "" : n ? `✓ I reminder andranno a ${n}` : "Numero non valido (es. 333 1234567 oppure +39…)";
    return n;
  }
  phone.addEventListener("input", validatePhone);

  function renderClient() {
    const slot = q("[data-client-slot]");
    const c = store.clients.find((x) => x.id === st.clientId);
    q("[data-newclient]").hidden = !st.newClient;
    q("[data-phone-field]").hidden = !c && !st.newClient && !imported;
    if (c) {
      slot.innerHTML = `<div class="picked"><span class="avatar">${esc(initials(c))}</span><div class="grow"><b>${esc(fullName(c))}</b><small>${esc(prettyPhone(c.phone))}</small></div><button type="button" class="btn btn-quiet btn-sm" data-change>Cambia</button></div>`;
      if (!phone.value) phone.value = prettyPhone(c.phone);
      $("[data-change]", slot).onclick = () => { st.clientId = null; phone.value = ""; renderClient(); setTimeout(() => q("#ap-client")?.focus(), 10); };
    } else {
      slot.innerHTML = `<div class="combo"><input id="ap-client" placeholder="Cerca un cliente o scrivi un nuovo nome…" autocomplete="off"><ul class="combo-list" hidden></ul></div>`;
      bindCombo($("#ap-client", slot), $(".combo-list", slot));
    }
    validatePhone();
  }

  function bindCombo(inp, list) {
    let idx = -1, items = [];
    const draw = () => {
      const val = inp.value;
      items = matches(val);
      const exact = items.some((c) => fullName(c).toLowerCase() === val.trim().toLowerCase());
      let html = items.map((c, i) => `<li data-i="${i}" class="${i === idx ? "active" : ""}"><span class="avatar">${esc(initials(c))}</span><span class="grow">${esc(fullName(c))}<small>${esc(prettyPhone(c.phone))}</small></span></li>`).join("");
      if (val.trim() && !exact) html += `<li data-new class="new ${idx === items.length ? "active" : ""}">${icon("plus")}<span class="grow">Nuovo cliente «${esc(val.trim())}»</span></li>`;
      list.innerHTML = html;
      list.hidden = !html;
    };
    const pick = (c) => { st.clientId = c.id; st.newClient = false; phone.value = prettyPhone(c.phone); renderClient(); };
    const pickNew = () => {
      const [f, ...r] = inp.value.trim().split(/\s+/);
      st.newClient = true; st.clientId = null;
      q("#ap-first").value = f ?? ""; q("#ap-last").value = r.join(" ");
      list.hidden = true;
      q("[data-newclient]").hidden = false; q("[data-phone-field]").hidden = false;
      phone.focus();
    };
    inp.addEventListener("input", () => { idx = -1; st.newClient = false; q("[data-newclient]").hidden = true; q("[data-phone-field]").hidden = !imported; draw(); });
    inp.addEventListener("focus", draw);
    inp.addEventListener("blur", () => setTimeout(() => (list.hidden = true), 160));
    inp.addEventListener("keydown", (e) => {
      const total = items.length + (list.querySelector("[data-new]") ? 1 : 0);
      if (e.key === "ArrowDown") { idx = Math.min(total - 1, idx + 1); draw(); e.preventDefault(); }
      else if (e.key === "ArrowUp") { idx = Math.max(0, idx - 1); draw(); e.preventDefault(); }
      else if (e.key === "Enter") {
        e.preventDefault();
        if (idx >= 0 && idx < items.length) pick(items[idx]);
        else if (idx === items.length || !items.length) { if (inp.value.trim()) pickNew(); }
        else pick(items[0]);
      }
    });
    list.addEventListener("mousedown", (e) => {
      const li = e.target.closest("li");
      if (!li) return;
      e.preventDefault();
      if (li.dataset.new != null) pickNew(); else pick(items[Number(li.dataset.i)]);
    });
  }
  renderClient();

  /* ---- tipo e durata ---- */
  function renderType() { $$("[data-type]", el).forEach((b) => b.classList.toggle("on", b.dataset.type === st.type)); }
  function renderDurs() {
    const list = DURS.includes(st.dur) ? DURS : [...DURS, st.dur].sort((x, y) => x - y);
    q("[data-durs]").innerHTML = list.map((d) => `<button type="button" class="chip ${d === st.dur ? "on" : ""}" data-dur="${d}">${fmtDur(d)}</button>`).join("");
  }
  $$("[data-type]", el).forEach((b) => (b.onclick = () => {
    st.type = b.dataset.type;
    if (!st.durTouched) st.dur = st.type === "prima_visita" ? s.duration_first : s.duration_check;
    renderType(); renderDurs();
  }));
  q("[data-durs]").addEventListener("click", (e) => { const c = e.target.closest("[data-dur]"); if (!c) return; st.dur = Number(c.dataset.dur); st.durTouched = true; renderDurs(); });
  renderType(); renderDurs();

  /* ---- luoghi ---- */
  function renderLocs() {
    const cur = q("#ap-loc").value.trim().toLowerCase();
    q("[data-locs]").innerHTML = store.recentLocations.map((l) => `<button type="button" class="chip chip-sm ${l.toLowerCase() === cur ? "on" : ""}" data-loc="${esc(l)}">${esc(l)}</button>`).join("");
  }
  q("[data-locs]").addEventListener("click", (e) => { const c = e.target.closest("[data-loc]"); if (!c) return; q("#ap-loc").value = c.dataset.loc; renderLocs(); });
  q("#ap-loc").addEventListener("input", renderLocs);
  renderLocs();

  /* ---- stato reminder ---- */
  function renderReminder() {
    const box = q("[data-reminder]");
    if (!a) { box.innerHTML = ""; return; }
    if (a.reminder_sent_at) {
      box.innerHTML = `<div class="reminder-state"><span class="sent-ico">${icon("check", 15)}</span><span class="grow">Reminder inviato ${esc(fmtShort(new Date(a.reminder_sent_at)))}</span><button type="button" class="btn btn-sm" data-resend>${icon("refresh", 16)}<span>Reinvia al prossimo giro</span></button></div>`;
      q("[data-resend]").onclick = async () => {
        const { error } = await sb.from("appointments").update({ reminder_sent_at: null }).eq("id", a.id);
        if (error) return toast(error.message, "err");
        a.reminder_sent_at = null; renderReminder(); changed();
        toast("Il reminder partirà di nuovo al prossimo invio");
      };
    } else {
      box.innerHTML = `<div class="reminder-state"><span class="wait-ico">${icon("hourglass", 15)}</span><span class="grow muted">Reminder non ancora inviato · parte al primo invio utile nei ${s.window_days} giorni precedenti</span></div>`;
    }
  }
  renderReminder();

  /* ---- salvataggio ---- */
  const fail = (msg) => { const e = q("[data-err]"); e.textContent = msg; e.hidden = false; e.scrollIntoView({ block: "nearest", behavior: "smooth" }); };
  q("[data-save]").onclick = (ev) => busy(ev.currentTarget, async () => {
    q("[data-err]").hidden = true;
    const n = normalizePhone(phone.value);
    const hasClient = st.clientId || st.newClient;
    if (!hasClient && !imported) return fail("Seleziona un cliente dall'elenco oppure crea un nuovo cliente.");
    if (hasClient && !n) return fail("Il numero di telefono è obbligatorio: senza numero il reminder non può partire.");
    if (st.newClient && !q("#ap-first").value.trim()) return fail("Inserisci il nome del nuovo cliente.");
    const date = q("#ap-date").value, time = q("#ap-time").value;
    if (!date || !time) return fail("Indica giorno e ora.");
    const startAt = new Date(`${date}T${time}`);
    const endAt = new Date(startAt.getTime() + st.dur * 60000);
    try {
      let clientId = st.clientId;
      if (st.newClient) {
        const { data, error } = await sb.from("clients").insert({ first_name: q("#ap-first").value.trim(), last_name: q("#ap-last").value.trim(), phone: n }).select().single();
        if (error) throw error;
        clientId = data.id;
      } else if (clientId) {
        const c = store.clients.find((x) => x.id === clientId);
        if (c && normalizePhone(c.phone) !== n) {
          const { error } = await sb.from("clients").update({ phone: n }).eq("id", clientId);
          if (error) throw error;
        }
      }
      const row = {
        client_id: clientId ?? null, type: st.type, start_at: startAt.toISOString(), end_at: endAt.toISOString(),
        location: q("#ap-loc").value.trim() || null, notes: q("#ap-notes").value.trim() || null,
      };
      const { error } = a ? await sb.from("appointments").update(row).eq("id", a.id) : await sb.from("appointments").insert(row);
      if (error) throw error;
      m.close();
      toast(a ? "Appuntamento aggiornato" : "Appuntamento creato");
      await Promise.all([loadClients(), loadRecentLocations()]);
      changed();
    } catch (ex) {
      fail(`Salvataggio non riuscito: ${ex.message}`);
    }
  });

  q("[data-del]")?.addEventListener("click", async () => {
    if (!(await askConfirm(`Eliminare l'appuntamento di ${a.client ? fullName(a.client) : a.title || "questo evento"}?`, "Elimina"))) return;
    const { error } = await sb.from("appointments").update({ deleted: true }).eq("id", a.id);
    if (error) return toast(error.message, "err");
    m.close();
    toast("Appuntamento eliminato");
    changed();
  });

  if (!a && !preset.clientId && !isMobile()) setTimeout(() => q("#ap-client")?.focus(), 40);
}
