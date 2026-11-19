// ───────── pagina cablatore (v2) ─────────
const S = { me: null, cab: null, oggi: null, giorni: 14, quadri: [], liste: [], gruppi: [] };
let timerSalva = null, salvataggioInCorso = false;
const MAX_FOTO = 10;

async function avvio() {
  stile();
  app.innerHTML = caricamento("Caricamento elenco quadri…");
  const u = await mioUtente();
  if (!u) return schermataAccesso("Entra nella checklist", "Checklist quadro elettrico", avvio);
  if (u.nonAutorizzato || u.ruolo !== "cablatore" || !u.cablatori || u.cablatori.slug !== C.slug) {
    app.innerHTML = `${testa("Checklist quadro elettrico")}<div class="card"><div class="msg">L'email ${esc(u.email || "")} non è abilitata a questa pagina. Chiedi all'amministratore.</div><button class="piena" id="bx">Esci</button></div>`;
    $("#bx").onclick = esci; return;
  }
  S.me = u; S.cab = u.cablatori;
  try { await carica(); } catch (e) { app.innerHTML = `${testa("Checklist quadro elettrico")}<div class="card"><div class="msg">Errore nel caricamento: ${esc(e.message)}</div><button class="piena" onclick="location.reload()">Riprova</button></div>`; return; }
  codaRiprova();
  const ap = new URLSearchParams(location.search).get("c");
  if (ap) return apriChecklist(ap);
  home();
}

async function carica() {
  const [ora, imp, quadri, liste, gruppi] = await Promise.all([
    oraServer(),
    sb.from("impostazioni").select("chiave, valore").eq("chiave", "giorni_anticipo").maybeSingle(),
    tutte(() => sb.from("quadri").select("*").eq("cablatore_id", S.cab.id).eq("attivo", true).order("commessa")),
    tutte(() => sb.from("checklist").select("id, quadro_id, stato, commessa, descrizione, cliente, linea, compilato_da, risposte, aggiornato_il, inviata_il").eq("cablatore_id", S.cab.id).neq("stato", "annullata").order("aggiornato_il", { ascending: false })),
    sb.from("gruppi").select("id, nome, ordine, voci(id, testo, ordine)").eq("cablatore_id", S.cab.id).order("ordine"),
  ]);
  S.oggi = ora.oggi; S.giorni = Number(imp.data?.valore ?? 14);
  S.quadri = quadri; S.liste = liste;
  S.gruppi = (gruppi.data || []).map((g) => ({ ...g, voci: (g.voci || []).sort((a, b) => a.ordine - b.ordine) })).filter((g) => g.voci.length);
}
const sottotitolo = () => "Checklist quadro — " + (S.cab?.nome || "");
const totVoci = () => S.gruppi.reduce((n, g) => n + g.voci.length, 0);
const fatteDi = (risp) => S.gruppi.flatMap((g) => g.voci).filter((v) => ["ok", "na"].includes(risp?.[v.id])).length;

// ───────── home ─────────
function home() {
  history.replaceState(null, "", location.pathname);
  CH = null;
  const pr = prossimi(S.quadri, S.liste, S.oggi, S.giorni);
  const inCorso = S.liste.filter((c) => c.stato === "in_corso");
  const inviate = S.liste.filter((c) => c.stato === "inviata").slice(0, 10);
  const clienti = [...new Set(S.quadri.map((q) => q.cliente))].sort((a, b) => a.localeCompare(b, "it", { numeric: true }));
  const tv = totVoci();
  app.innerHTML = `${testa(sottotitolo(), S.oggi)}
  <div class="card">
    ${pr.length ? `<div class="blocco"><div class="blocco-t">🗓 Prossimi al collaudo · ${S.giorni} giorni</div>
      ${pr.map((p) => rigaProssimo(p, p.nonValida ? "" : `<button class="picc pri" data-apri="${p.q.id}">${p.st === "in_corso" ? "Riprendi" : p.st === "inviata" ? "Vedi" : "Inizia"}</button>`)).join("")}</div>` : ""}
    ${inCorso.length ? `<div class="blocco"><div class="blocco-t">⏸ Checklist in corso</div>
      ${inCorso.map((c) => `<div class="el"><div class="el-info"><b>${esc(c.commessa)}</b> · ${esc(c.descrizione)}<br><small>In corso · ${fatteDi(c.risposte)}/${tv} voci · salvata ${fmtDataOra(c.aggiornato_il)}</small></div><button class="picc pri" data-ch="${c.id}">Riprendi</button></div>`).join("")}</div>` : ""}
    <div class="sez" style="margin-top:2px">Scegli il quadro</div>
    <label for="cerca">🔎 Cerca veloce</label>
    <input id="cerca" type="search" placeholder="Scrivi commessa o descrizione" autocomplete="off">
    <div id="ris"></div>
    <label for="sc">Cliente *</label><select id="sc"><option value="">Scegli il cliente</option>${clienti.map((c) => `<option value="${esc(c)}">${esc(c || "(senza cliente)")}</option>`).join("")}</select>
    <label for="sm">Commessa *</label><select id="sm" disabled><option value="">Scegli prima il cliente</option></select>
    <label for="sd">Descrizione quadro *</label><select id="sd" disabled><option value="">Scegli prima la commessa</option></select>
    <div class="info-q" id="iq" hidden></div>
    <button class="pri grande bloccato" id="ba" disabled>Apri checklist</button>
    ${S.quadri.length ? "" : `<div class="vuoto">L'elenco dei quadri è vuoto: l'amministrazione non ha ancora quadri "Fornitura da effettuare" o il foglio non è stato letto.</div>`}
  </div>
  ${inviate.length ? `<div class="card"><h2>✅ Inviate di recente</h2>${inviate.map((c) => `<div class="el"><div class="el-info"><b>${esc(c.commessa)}</b> · ${esc(c.descrizione)}<br><small>Inviata il ${fmtDataOra(c.inviata_il)}${c.compilato_da ? " · " + esc(c.compilato_da) : ""}</small></div><button class="picc" data-ch="${c.id}">Vedi</button></div>`).join("")}</div>` : ""}
  <div class="riga" style="justify-content:center"><button class="picc" id="br">↻ Aggiorna elenco</button><button class="picc grigio" id="bx">Esci</button></div>
  ${piede()}`;
  const sc = $("#sc"), sm = $("#sm"), sd = $("#sd"), ba = $("#ba"), iq = $("#iq");
  const sblocca = (on) => { ba.disabled = !on; ba.classList.toggle("bloccato", !on); };
  sc.onchange = () => {
    const com = [...new Set(S.quadri.filter((q) => q.cliente === sc.value).map((q) => q.commessa))].sort((a, b) => a.localeCompare(b, "it", { numeric: true }));
    sm.innerHTML = `<option value="">Scegli la commessa</option>` + com.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
    sm.disabled = sc.selectedIndex === 0; sd.disabled = true; sd.innerHTML = `<option value="">Scegli prima la commessa</option>`; sblocca(false); iq.hidden = true;
  };
  sm.onchange = () => {
    const qs = S.quadri.filter((q) => q.cliente === sc.value && q.commessa === sm.value).sort((a, b) => a.descrizione.localeCompare(b.descrizione, "it", { numeric: true }));
    sd.innerHTML = `<option value="">Scegli il quadro</option>` + qs.map((q) => `<option value="${q.id}">${esc(q.descrizione)}</option>`).join("");
    sd.disabled = !sm.value; sblocca(false); iq.hidden = true;
  };
  sd.onchange = () => {
    sblocca(!!sd.value);
    const q = S.quadri.find((x) => x.id === sd.value);
    iq.hidden = !q;
    if (q) iq.innerHTML = `Linea: <b>${esc(q.linea || "—")}</b> · Collaudo: <b>${q.data_valida ? fmtData(q.data_collaudo) || "—" : "Data non valida"}</b> · Checklist: <b>${STATI[statoQuadro(q.id, S.liste)]}</b>`;
  };
  ba.onclick = () => apriQuadro(sd.value);
  $("#cerca").oninput = (e) => {
    const t = e.target.value.trim().toLowerCase();
    const r = $("#ris");
    if (t.length < 2) { r.innerHTML = ""; return; }
    const parole = t.split(/\s+/);
    const trovati = S.quadri.filter((q) => { const s = `${q.commessa} ${q.descrizione} ${q.cliente} ${q.linea}`.toLowerCase(); return parole.every((p) => s.includes(p)); }).slice(0, 30);
    r.innerHTML = `<div class="risultati">${trovati.length ? trovati.map((q) => `<button data-apri="${q.id}">${esc(q.commessa)} · ${esc(q.descrizione)}<small>${esc(q.cliente || "senza cliente")} · Linea ${esc(q.linea || "—")} · ${STATI[statoQuadro(q.id, S.liste)]}</small></button>`).join("") : `<div class="mu" style="padding:10px 12px">Nessun quadro trovato.</div>`}</div>`;
    $$("[data-apri]", r).forEach((b) => (b.onclick = () => apriQuadro(b.dataset.apri)));
  };
  $$("[data-apri]").forEach((b) => (b.onclick = () => apriQuadro(b.dataset.apri)));
  $$("[data-ch]").forEach((b) => (b.onclick = () => apriChecklist(b.dataset.ch)));
  $("#br").onclick = async () => { app.innerHTML = caricamento("Aggiorno l'elenco…"); await carica(); home(); toast("Elenco aggiornato"); };
  $("#bx").onclick = esci;
}

async function apriQuadro(qid) {
  const inc = S.liste.find((c) => c.quadro_id === qid && c.stato === "in_corso");
  if (inc) return apriChecklist(inc.id);
  const inv = S.liste.find((c) => c.quadro_id === qid && c.stato === "inviata");
  if (inv && !confirm(`Per questo quadro c'è già una checklist Inviata il ${fmtDataOra(inv.inviata_il)}.\n\nOK = iniziane una nuova\nAnnulla = torna indietro`)) return;
  const { data, error } = await sb.from("checklist").insert({ cablatore_id: S.cab.id, quadro_id: qid }).select("id").single();
  if (error) {
    await carica();
    const ora = S.liste.find((c) => c.quadro_id === qid && c.stato === "in_corso");
    if (ora) return apriChecklist(ora.id);
    return toast("Non riesco a creare la checklist: " + error.message);
  }
  await carica();
  apriChecklist(data.id);
}

// ───────── compilazione ─────────
let CH = null, BOZZA = null, FOTO = [];
const chiaveBozza = (id) => "chk-bozza-" + id;

async function apriChecklist(id) {
  app.innerHTML = caricamento("Apro la checklist…");
  const { data: ch, error } = await sb.from("checklist").select("*").eq("id", id).maybeSingle();
  if (error || !ch) { toast("Checklist non trovata"); return home(); }
  history.replaceState(null, "", location.pathname + "?c=" + id);
  CH = ch;
  const { data: f } = await sb.from("foto").select("*").eq("checklist_id", id).order("creato_il");
  FOTO = f || [];
  if (ch.stato !== "in_corso") return vediInviata();
  let loc = null; try { loc = JSON.parse(localStorage.getItem(chiaveBozza(id)) || "null"); } catch (_) {}
  BOZZA = { risposte: { ...(ch.risposte || {}) }, compilato_da: ch.compilato_da || "", note: ch.note || "", sporca: false };
  if (loc && loc.sporca) { BOZZA = loc; salva(); }
  if (!BOZZA.compilato_da) { try { BOZZA.compilato_da = localStorage.getItem("chk-compilato-da") || ""; if (BOZZA.compilato_da) BOZZA.sporca = true; } catch (_) {} }
  disegnaCompilazione();
  codaRiprova();
}

function q() { return S.quadri.find((x) => x.id === CH.quadro_id) || {}; }

function disegnaCompilazione() {
  const qq = q();
  let n = 0;
  app.innerHTML = `${testa(sottotitolo(), S.oggi)}
  <div class="card">
    <button class="picc" id="bh">← Elenco</button>
    <h1 style="margin-top:12px">${esc(CH.commessa)} · ${esc(CH.descrizione)}</h1>
    <table class="riep"><tr><td class="k">Cliente</td><td class="v">${esc(CH.cliente || "—")}</td></tr><tr><td class="k">Linea</td><td class="v">${esc(CH.linea || "—")}</td></tr>
      <tr><td class="k">Collaudo</td><td class="v">${qq.data_valida === false ? "Data non valida" : fmtData(qq.data_collaudo) || "—"}</td></tr><tr><td class="k">Stato</td><td class="v">In corso</td></tr></table>
    <div class="sez">Dati di chi compila</div>
    <label for="cd" style="margin-top:0">Compilato da *</label><input id="cd" maxlength="120" value="${esc(BOZZA.compilato_da)}" autocomplete="name" placeholder="Nome e cognome">
    ${S.gruppi.map((g) => `<div class="sez">${esc(g.nome)}</div>
      ${g === S.gruppi[0] ? `<div class="progress" id="prog"><span id="cnt">0/0</span><div class="bar"><i id="barra"></i></div><span class="salv"><span id="sv">Salvataggio automatico attivo</span><button class="picc" id="bvai" hidden>Vai alla prima mancante</button></span></div>` : ""}
      ${g.voci.map((v) => { n++; return `<div class="voce" data-voce="${v.id}"><div class="voce-t"><div class="num">${n}</div><div>${esc(v.testo)}</div></div>
        <div class="esito"><button data-v="ok">✓ OK</button><button data-v="na">Non applicabile</button></div></div>`; }).join("")}`).join("")
      || `<div class="msg">La checklist non ha ancora voci: avvisa l'amministratore.</div>`}
    <div class="sez">Note</div>
    <textarea id="nt" maxlength="5000" placeholder="Osservazioni, anomalie risolte, materiale da completare…">${esc(BOZZA.note)}</textarea>
    <div class="sez">Foto del quadro</div>
    ${["interna", "esterna"].map((t) => `<div id="g-${t}"><div class="foto-l">📷 ${t === "interna" ? "Interno" : "Esterno"} * <span class="mu" id="c-${t}"></span></div>
      <div class="foto" id="f-${t}"></div><div class="mu" id="fs-${t}"></div></div>`).join("")}
    <div id="mancano"></div>
    <button class="pri grande" id="bi">Invia checklist</button>
    <div class="hint" id="hint"></div>
    <button class="piena grigio" id="ban">Annulla checklist</button>
  </div>${piede()}`;
  $("#bh").onclick = async () => { await salva(); await carica(); home(); };
  $$(".voce").forEach((el) => $$("button", el).forEach((b) => (b.onclick = () => {
    BOZZA.risposte[el.dataset.voce] = b.dataset.v;
    segnaVoce(el);
    cambia(); aggiornaAvanzamento();
    // passa da sola alla voce successiva ancora da segnare
    const dopo = $$(".voce").slice($$(".voce").indexOf(el) + 1).find((x) => !BOZZA.risposte[x.dataset.voce]);
    if (dopo && !BOZZA.risposte[dopo.dataset.voce]) setTimeout(() => dopo.scrollIntoView({ behavior: "smooth", block: "center" }), 150);
  })));
  $$(".voce").forEach(segnaVoce);
  $("#cd").oninput = (e) => { BOZZA.compilato_da = e.target.value; try { localStorage.setItem("chk-compilato-da", e.target.value.trim()); } catch (_) {} cambia(); aggiornaAvanzamento(); };
  $("#nt").oninput = (e) => { BOZZA.note = e.target.value; cambia(); };
  if ($("#bvai")) $("#bvai").onclick = vaiAllaMancante;
  $("#bi").onclick = inviaChecklist;
  $("#ban").onclick = annulla;
  disegnaFoto();
  aggiornaAvanzamento();
  if (BOZZA.sporca) cambia();
}
function segnaVoce(el) {
  const v = BOZZA.risposte[el.dataset.voce];
  $$("button", el).forEach((x) => { x.classList.toggle("sel-ok", v === "ok" && x.dataset.v === "ok"); x.classList.toggle("sel-na", v === "na" && x.dataset.v === "na"); x.setAttribute("aria-pressed", String(x.dataset.v === v)); });
  el.classList.toggle("fatta", !!v); if (v) el.classList.remove("manca");
}
function aggiornaAvanzamento() {
  const tot = totVoci(), fatte = fatteDi(BOZZA.risposte);
  if ($("#cnt")) { $("#cnt").textContent = `${fatte}/${tot}`; $("#barra").style.width = (tot ? (fatte / tot) * 100 : 0) + "%"; }
  const { m } = cosaManca();
  if ($("#bvai")) $("#bvai").hidden = fatte >= tot;
  $("#bi").classList.toggle("bloccato", m.length > 0);
  $("#hint").textContent = m.length ? "Per inviare: " + m.join(" · ") : "Tutto pronto: puoi inviare.";
}
function vaiAllaMancante() {
  const el = $$(".voce").find((x) => !BOZZA.risposte[x.dataset.voce]);
  if (el) { el.classList.add("manca"); el.scrollIntoView({ behavior: "smooth", block: "center" }); }
}

function scriviLocale() { try { localStorage.setItem(chiaveBozza(CH.id), JSON.stringify(BOZZA)); } catch (_) {} }
function cambia() {
  BOZZA.sporca = true; scriviLocale();
  const sv = $("#sv"); if (sv) sv.textContent = "Salvataggio…";
  clearTimeout(timerSalva); timerSalva = setTimeout(salva, 1000);
}
async function salva() {
  if (!CH || !BOZZA || !BOZZA.sporca || CH.stato !== "in_corso") return true;
  if (salvataggioInCorso) { clearTimeout(timerSalva); timerSalva = setTimeout(salva, 800); return false; }
  salvataggioInCorso = true;
  const invio = { risposte: BOZZA.risposte, compilato_da: BOZZA.compilato_da.slice(0, 120), note: BOZZA.note.slice(0, 5000) };
  const prima = JSON.stringify(invio);
  const { data, error } = await sb.from("checklist").update(invio).eq("id", CH.id).select("aggiornato_il").maybeSingle();
  salvataggioInCorso = false;
  const sv = $("#sv");
  if (error || !data) {
    if (sv) sv.textContent = "Salvata sul telefono · la mando al server appena c'è campo";
    clearTimeout(timerSalva); timerSalva = setTimeout(salva, 5000); return false;
  }
  const ora = JSON.stringify({ risposte: BOZZA.risposte, compilato_da: BOZZA.compilato_da.slice(0, 120), note: BOZZA.note.slice(0, 5000) });
  if (ora === prima) { BOZZA.sporca = false; scriviLocale(); }
  if (sv) sv.textContent = "✓ Salvata alle " + fmtOra(data.aggiornato_il);
  return true;
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") salva(); });
window.addEventListener("pagehide", () => salva());
window.addEventListener("online", () => { salva(); codaRiprova(); });

// ───────── foto: compressione, coda sul telefono, caricamento in sottofondo ─────────
async function comprimi(file) {
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: "from-image" }); }
  catch (_) {
    bmp = await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = URL.createObjectURL(file); });
  }
  const w0 = bmp.width, h0 = bmp.height;
  let max = 1600, qual = 0.8, blob = null;
  for (let t = 0; t < 8; t++) {
    const k = Math.min(1, max / Math.max(w0, h0));
    const cv = document.createElement("canvas"); cv.width = Math.round(w0 * k); cv.height = Math.round(h0 * k);
    cv.getContext("2d").drawImage(bmp, 0, 0, cv.width, cv.height);
    blob = await new Promise((ok) => cv.toBlob(ok, "image/jpeg", qual));
    if (blob && blob.size <= 320 * 1024) break;
    if (qual > 0.56) qual -= 0.08; else max = Math.round(max * 0.8);
  }
  return blob;
}
// coda in IndexedDB: le foto restano sul telefono finché non sono caricate
let dbP = null;
function apriDB() {
  return dbP || (dbP = new Promise((ok, ko) => {
    const r = indexedDB.open("chk-foto", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("coda", { keyPath: "percorso" });
    r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error);
  }));
}
async function coda(modo, fn) {
  try {
    const db = await apriDB();
    return await new Promise((ok, ko) => { const t = db.transaction("coda", modo); let out; const rq = fn(t.objectStore("coda")); rq.onsuccess = () => (out = rq.result); t.oncomplete = () => ok(out); t.onerror = () => ko(t.error); });
  } catch (_) { return modo === "readonly" ? [] : null; }
}
const inCoda = async (chId) => ((await coda("readonly", (s) => s.getAll())) || []).filter((x) => !chId || x.checklist_id === chId);
let caricando = false;
async function codaRiprova() {
  if (caricando) return; caricando = true;
  try {
    for (const x of await inCoda()) {
      const up = await sb.storage.from("checklist-foto").upload(x.percorso, x.blob, { contentType: "image/jpeg", upsert: true });
      if (up.error && !/exists|duplicate/i.test(up.error.message)) { if (/row-level|policy|not allowed|403/i.test(up.error.message)) await coda("readwrite", (s) => s.delete(x.percorso)); continue; }
      const { data, error } = await sb.from("foto").insert({ checklist_id: x.checklist_id, cablatore_id: S.cab.id, tipo: x.tipo, percorso: x.percorso, byte: x.blob.size }).select("*").single();
      if (error && !/duplicate|unique/i.test(error.message)) continue;
      await coda("readwrite", (s) => s.delete(x.percorso));
      if (CH && data && data.checklist_id === CH.id && !FOTO.some((f) => f.percorso === data.percorso)) FOTO.push(data);
    }
  } finally { caricando = false; }
  if (CH && CH.stato === "in_corso" && $("#f-interna")) { await disegnaFoto(); aggiornaAvanzamento(); }
}
setInterval(() => { if (navigator.onLine) codaRiprova(); }, 20000);

async function aggiungiFoto(tipo, files) {
  const st = $("#fs-" + tipo);
  const gia = FOTO.filter((f) => f.tipo === tipo).length + (await inCoda(CH.id)).filter((x) => x.tipo === tipo).length;
  files = files.slice(0, Math.max(0, MAX_FOTO - gia));
  let n = 0;
  for (const f of files) {
    n++; st.textContent = `Preparo la foto ${n} di ${files.length}…`;
    try {
      const blob = await comprimi(f);
      const percorso = `${S.cab.id}/${CH.id}/${crypto.randomUUID()}.jpg`;
      await coda("readwrite", (s) => s.put({ percorso, checklist_id: CH.id, tipo, blob, creata: Date.now() }));
    } catch (e) { st.textContent = `Foto ${n} non leggibile: riprova.`; }
  }
  st.textContent = "";
  await disegnaFoto();
  codaRiprova();
}
async function disegnaFoto(sola = false) {
  const link = await linkFoto(FOTO.map((f) => f.percorso));
  const attesa = sola ? [] : await inCoda(CH.id);
  for (const t of ["interna", "esterna"]) {
    const el = $("#f-" + t); if (!el) continue;
    const l = FOTO.filter((f) => f.tipo === t), a = attesa.filter((x) => x.tipo === t);
    const tot = l.length + a.length;
    el.innerHTML = l.map((f) => `<div class="ft"><a href="${esc(link[f.percorso] || "#")}" target="_blank" rel="noopener"><img src="${esc(link[f.percorso] || "")}" alt="Foto ${t}"></a>${sola ? "" : `<button class="rm" data-tf="${f.id}" aria-label="Togli foto">×</button>`}</div>`).join("")
      + a.map((x) => `<div class="ft"><img src="${URL.createObjectURL(x.blob)}" alt="Foto ${t} in caricamento"><div class="attesa">${navigator.onLine ? "Caricamento…" : "In attesa di rete"}</div><button class="rm" data-tc="${esc(x.percorso)}" aria-label="Togli foto">×</button></div>`).join("")
      + (!sola && tot < MAX_FOTO ? `<label class="fadd"><input type="file" accept="image/*" multiple data-tipo="${t}"><span>＋</span><small>Aggiungi foto</small></label>` : "")
      + (sola && !l.length ? `<p class="mu">Nessuna.</p>` : "");
    if ($("#c-" + t)) $("#c-" + t).textContent = `${tot}/${MAX_FOTO}`;
    $("#g-" + t)?.classList.toggle("grp-manca", false);
  }
  $$("input[type=file]").forEach((i) => (i.onchange = () => aggiungiFoto(i.dataset.tipo, [...i.files]).then(() => (i.value = ""))));
  $$("[data-tf]").forEach((b) => (b.onclick = async () => {
    if (!confirm("Togliere questa foto?")) return;
    const f = FOTO.find((x) => x.id === b.dataset.tf);
    const { error } = await sb.from("foto").delete().eq("id", f.id);
    if (error) return toast("Non riesco a toglierla: " + error.message);
    await sb.storage.from("checklist-foto").remove([f.percorso]);
    FOTO = FOTO.filter((x) => x.id !== f.id); await disegnaFoto(); aggiornaAvanzamento();
  }));
  $$("[data-tc]").forEach((b) => (b.onclick = async () => { if (!confirm("Togliere questa foto?")) return; await coda("readwrite", (s) => s.delete(b.dataset.tc)); await disegnaFoto(); aggiornaAvanzamento(); }));
}

// ───────── invio e annullamento ─────────
function cosaManca() {
  const m = [];
  const voci = S.gruppi.flatMap((g) => g.voci);
  if (!voci.length) m.push("la checklist non ha voci");
  const senza = voci.filter((v) => !["ok", "na"].includes(BOZZA.risposte[v.id]));
  if (senza.length) m.push(senza.length === 1 ? "manca 1 voce" : `mancano ${senza.length} voci`);
  if (!BOZZA.compilato_da.trim()) m.push('scrivi "Compilato da"');
  if (!FOTO.some((f) => f.tipo === "interna")) m.push("almeno una foto interna caricata");
  if (!FOTO.some((f) => f.tipo === "esterna")) m.push("almeno una foto esterna caricata");
  return { m, primaVoce: senza[0]?.id };
}
async function inviaChecklist() {
  const { m, primaVoce } = cosaManca();
  const box = $("#mancano");
  const attesa = await inCoda(CH.id);
  if (m.length || attesa.length) {
    box.innerHTML = `<div class="msg"><b>Prima di inviare:</b><ul>${m.map((x) => `<li>· ${esc(x)}</li>`).join("")}${attesa.length ? `<li>· ${attesa.length} foto in attesa di caricamento: aspetta che ci sia campo</li>` : ""}</ul></div>`;
    $$(".voce").forEach((el) => el.classList.toggle("manca", !BOZZA.risposte[el.dataset.voce]));
    ["interna", "esterna"].forEach((t) => $("#g-" + t)?.classList.toggle("grp-manca", !FOTO.some((f) => f.tipo === t)));
    if (primaVoce) document.querySelector(`[data-voce="${primaVoce}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    else if (!BOZZA.compilato_da.trim()) $("#cd").focus();
    else box.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  if (!confirm("Inviare la checklist? Dopo l'invio non si può più modificare.")) return;
  box.innerHTML = ""; velo(true, "Invio in corso…");
  BOZZA.sporca = true;
  if (!(await salva())) { velo(false); box.innerHTML = `<div class="msg">Non riesco a salvare sul server: controlla la connessione e riprova.</div>`; return; }
  const r = await api("invia", { id: CH.id });
  velo(false);
  if (!r.ok) { box.innerHTML = `<div class="msg">${esc(r.msg || "Invio non riuscito")}</div>`; return; }
  try { localStorage.removeItem(chiaveBozza(CH.id)); } catch (_) {}
  await carica();
  await apriChecklist(CH.id);
  $("#esito").innerHTML = `<div class="fatto"><h2>✅ Checklist inviata</h2><p class="mu">Inviata il ${fmtDataOra(r.inviata_il)} · ${r.mail ? "mail del report spedita." : "la mail del report non è partita: l'amministratore è stato avvisato."}</p></div>`;
  window.scrollTo({ top: 0, behavior: "smooth" });
}
async function annulla() {
  if (!confirm("Annullare questa checklist? Resterà nello storico come Annullata.")) return;
  clearTimeout(timerSalva);
  const { error } = await sb.from("checklist").update({ stato: "annullata" }).eq("id", CH.id);
  if (error) return toast("Non riesco ad annullarla: " + error.message);
  try { localStorage.removeItem(chiaveBozza(CH.id)); } catch (_) {}
  for (const x of await inCoda(CH.id)) await coda("readwrite", (s) => s.delete(x.percorso));
  CH = null; await carica(); home(); toast("Checklist annullata");
}

function vediInviata() {
  const snap = CH.voci_snapshot?.gruppi || [];
  let n = 0;
  app.innerHTML = `${testa(sottotitolo(), S.oggi)}
  <div class="card"><div id="esito"></div>
    <button class="picc" id="bh">← Elenco</button>
    <h1 style="margin-top:12px">${esc(CH.commessa)} · ${esc(CH.descrizione)}</h1>
    <table class="riep"><tr><td class="k">Cliente</td><td class="v">${esc(CH.cliente || "—")}</td></tr><tr><td class="k">Linea</td><td class="v">${esc(CH.linea || "—")}</td></tr>
      <tr><td class="k">Stato</td><td class="v">${STATI[CH.stato]}</td></tr>
      ${CH.inviata_il ? `<tr><td class="k">Inviata il</td><td class="v">${fmtDataOra(CH.inviata_il)}</td></tr>` : ""}${CH.annullata_il ? `<tr><td class="k">Annullata il</td><td class="v">${fmtDataOra(CH.annullata_il)}</td></tr>` : ""}
      <tr><td class="k">Compilato da</td><td class="v">${esc(CH.compilato_da || "—")}</td></tr></table>
    ${snap.map((g) => `<div class="sez">${esc(g.nome)}</div>${g.voci.map((v) => { n++; return `<div class="voce fatta"><div class="voce-t"><div class="num">${n}</div><div>${esc(v.testo)}<br><b>${v.esito === "ok" ? "✓ OK" : "Non applicabile"}</b></div></div></div>`; }).join("")}`).join("")}
    <div class="sez">Note</div><p style="white-space:pre-wrap;margin:0">${esc(CH.note || "Nessuna nota")}</p>
    <div class="sez">Foto del quadro</div>
    <div class="foto-l">📷 Interno</div><div class="foto" id="f-interna"></div>
    <div class="foto-l">📷 Esterno</div><div class="foto" id="f-esterna"></div>
    <button class="piena" id="bn">Compila un'altra checklist</button>
  </div>${piede()}`;
  $("#bh").onclick = () => home();
  $("#bn").onclick = () => home();
  disegnaFoto(true);
}

avvio();
