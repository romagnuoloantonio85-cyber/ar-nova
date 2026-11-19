// ───────── pagina cablatore ─────────
const S = { me: null, cab: null, oggi: null, giorni: 14, quadri: [], liste: [], gruppi: [] };
let timerSalva = null, salvataggioInCorso = false;

async function avvio() {
  stile();
  app.innerHTML = `<p class="mu">Caricamento…</p>`;
  const u = await mioUtente();
  if (!u) return schermataAccesso("Checklist Quadri FR", "Note & Test Report", avvio);
  if (u.nonAutorizzato || u.ruolo !== "cablatore" || !u.cablatori || u.cablatori.slug !== C.slug) {
    app.innerHTML = `<h1>Checklist Quadri FR</h1><div class="msg">L'email ${esc(u.email || "")} non è abilitata a questa pagina. Chiedi all'amministratore.</div><p><button id="bx">Esci</button></p>`;
    $("#bx").onclick = esci; return;
  }
  S.me = u; S.cab = u.cablatori;
  try { await carica(); } catch (e) { app.innerHTML = `<div class="msg">Errore nel caricamento: ${esc(e.message)}</div><p><button onclick="location.reload()">Riprova</button></p>`; return; }
  const ap = new URLSearchParams(location.search).get("c");
  if (ap) return apriChecklist(ap);
  home();
}

async function carica() {
  const [ora, imp, quadri, liste, gruppi] = await Promise.all([
    oraServer(),
    sb.from("impostazioni").select("chiave, valore").eq("chiave", "giorni_anticipo").maybeSingle(),
    tutte(() => sb.from("quadri").select("*").eq("cablatore_id", S.cab.id).eq("attivo", true).order("commessa")),
    tutte(() => sb.from("checklist").select("id, quadro_id, stato, commessa, descrizione, cliente, compilato_da, aggiornato_il, inviata_il").eq("cablatore_id", S.cab.id).neq("stato", "annullata").order("aggiornato_il", { ascending: false })),
    sb.from("gruppi").select("id, nome, ordine, voci(id, testo, ordine)").eq("cablatore_id", S.cab.id).order("ordine"),
  ]);
  S.oggi = ora.oggi; S.giorni = Number(imp.data?.valore ?? 14);
  S.quadri = quadri; S.liste = liste;
  S.gruppi = (gruppi.data || []).map((g) => ({ ...g, voci: (g.voci || []).sort((a, b) => a.ordine - b.ordine) })).filter((g) => g.voci.length);
}

function home() {
  history.replaceState(null, "", location.pathname);
  const pr = prossimi(S.quadri, S.liste, S.oggi, S.giorni);
  const inCorso = S.liste.filter((c) => c.stato === "in_corso");
  const inviate = S.liste.filter((c) => c.stato === "inviata").slice(0, 15);
  const clienti = [...new Set(S.quadri.map((q) => q.cliente))].sort((a, b) => a.localeCompare(b));
  app.innerHTML = `
  <h1>Checklist Quadri FR · ${esc(S.cab.nome)}</h1><p class="mu">Note & Test Report · oggi ${fmtData(S.oggi)}</p>
  <div class="card"><h2>Prossimi al collaudo (${S.giorni} giorni)</h2>
    ${pr.length ? `<ul>${pr.map((p) => rigaProssimo(p, p.nonValida ? "" : ` · <button class="picc" data-apri="${p.q.id}">Apri</button>`)).join("")}</ul>` : `<p class="mu">Nessun quadro in collaudo nei prossimi ${S.giorni} giorni.</p>`}
  </div>
  <div class="card"><h2>Compila una checklist</h2>
    <label for="sc">Cliente</label><select id="sc"><option value="">Scegli…</option>${clienti.map((c) => `<option value="${esc(c)}">${esc(c || "(senza cliente)")}</option>`).join("")}</select>
    <label for="sm">Commessa</label><select id="sm" disabled><option value="">Scegli prima il cliente</option></select>
    <label for="sd">Descrizione</label><select id="sd" disabled><option value="">Scegli prima la commessa</option></select>
    <p><button class="pri" id="ba" disabled>Apri checklist</button></p>
    ${S.quadri.length ? "" : `<p class="mu">L'elenco dei quadri è vuoto: l'amministrazione non ha ancora quadri "da fornire" o il foglio non è stato letto.</p>`}
  </div>
  <div class="card"><h2>In corso</h2>${inCorso.length ? `<ul>${inCorso.map((c) => `<li class="pr"><div><b>${esc(c.commessa)}</b> · ${esc(c.descrizione)}</div><div class="mu">In corso · ultimo salvataggio ${fmtDataOra(c.aggiornato_il)} · <button class="picc" data-ch="${c.id}">Continua</button></div></li>`).join("")}</ul>` : `<p class="mu">Nessuna checklist in corso.</p>`}</div>
  <div class="card"><h2>Inviate di recente</h2>${inviate.length ? `<ul>${inviate.map((c) => `<li class="pr"><div><b>${esc(c.commessa)}</b> · ${esc(c.descrizione)}</div><div class="mu">Inviata il ${fmtDataOra(c.inviata_il)} · <button class="picc" data-ch="${c.id}">Vedi</button></div></li>`).join("")}</ul>` : `<p class="mu">Nessuna.</p>`}</div>
  <p class="riga"><button id="br">Aggiorna elenco</button><button id="bx">Esci</button></p>
  <p class="mu">Versione pagina ${esc(C.versione || "")}</p>`;
  const sc = $("#sc"), sm = $("#sm"), sd = $("#sd"), ba = $("#ba");
  sc.onchange = () => {
    const com = [...new Set(S.quadri.filter((q) => q.cliente === sc.value).map((q) => q.commessa))].sort((a, b) => a.localeCompare(b));
    sm.innerHTML = `<option value="">Scegli…</option>` + com.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
    sm.disabled = sc.selectedIndex === 0; sd.disabled = true; sd.innerHTML = `<option value="">Scegli prima la commessa</option>`; ba.disabled = true;
  };
  sm.onchange = () => {
    const qs = S.quadri.filter((q) => q.cliente === sc.value && q.commessa === sm.value).sort((a, b) => a.descrizione.localeCompare(b.descrizione));
    sd.innerHTML = `<option value="">Scegli…</option>` + qs.map((q) => `<option value="${q.id}">${esc(q.descrizione)} · ${STATI[statoQuadro(q.id, S.liste)]}</option>`).join("");
    sd.disabled = !sm.value; ba.disabled = true;
  };
  sd.onchange = () => { ba.disabled = !sd.value; };
  ba.onclick = () => apriQuadro(sd.value);
  $$("[data-apri]").forEach((b) => (b.onclick = () => apriQuadro(b.dataset.apri)));
  $$("[data-ch]").forEach((b) => (b.onclick = () => apriChecklist(b.dataset.ch)));
  $("#br").onclick = async () => { app.innerHTML = `<p class="mu">Aggiorno…</p>`; await carica(); home(); };
  $("#bx").onclick = esci;
}

async function apriQuadro(qid) {
  const inc = S.liste.find((c) => c.quadro_id === qid && c.stato === "in_corso");
  if (inc) return apriChecklist(inc.id);
  const inv = S.liste.find((c) => c.quadro_id === qid && c.stato === "inviata");
  if (inv && !confirm(`Per questo quadro c'è già una checklist Inviata il ${fmtDataOra(inv.inviata_il)}.\nVuoi iniziarne una nuova?`)) return;
  const { data, error } = await sb.from("checklist").insert({ cablatore_id: S.cab.id, quadro_id: qid }).select("id").single();
  if (error) {
    await carica();
    const ora = S.liste.find((c) => c.quadro_id === qid && c.stato === "in_corso");
    if (ora) return apriChecklist(ora.id);
    return alert("Non riesco a creare la checklist: " + error.message);
  }
  await carica();
  apriChecklist(data.id);
}

// ───────── compilazione ─────────
let CH = null, BOZZA = null, FOTO = [];
const chiaveBozza = (id) => "chk-bozza-" + id;

async function apriChecklist(id) {
  app.innerHTML = `<p class="mu">Apro la checklist…</p>`;
  const { data: ch, error } = await sb.from("checklist").select("*").eq("id", id).maybeSingle();
  if (error || !ch) { alert("Checklist non trovata"); return home(); }
  history.replaceState(null, "", location.pathname + "?c=" + id);
  CH = ch;
  const { data: f } = await sb.from("foto").select("*").eq("checklist_id", id).order("creato_il");
  FOTO = f || [];
  if (ch.stato !== "in_corso") return vediInviata();
  let loc = null; try { loc = JSON.parse(localStorage.getItem(chiaveBozza(id)) || "null"); } catch (_) {}
  BOZZA = { risposte: { ...(ch.risposte || {}) }, compilato_da: ch.compilato_da || "", note: ch.note || "", sporca: false };
  if (loc && loc.sporca) { BOZZA = loc; salva(); }
  if (!BOZZA.compilato_da) { try { BOZZA.compilato_da = localStorage.getItem("chk-compilato-da") || ""; } catch (_) {} }
  disegnaCompilazione();
}

function q() { return S.quadri.find((x) => x.id === CH.quadro_id) || {}; }

function disegnaCompilazione() {
  const qq = q();
  app.innerHTML = `
  <p><button id="bh">← Elenco</button></p>
  <h1>${esc(CH.commessa)} · ${esc(CH.descrizione)}</h1>
  <p class="mu">Cliente: ${esc(CH.cliente || "-")} · Linea: ${esc(CH.linea || "-")} · Collaudo: ${qq.data_valida === false ? "Data non valida" : fmtData(qq.data_collaudo) || "-"}</p>
  <p><b>Stato: In corso</b> · <span id="sv" class="mu">Salvato</span></p>
  ${S.gruppi.length ? S.gruppi.map((g) => `<div class="card"><h2>${esc(g.nome)}</h2>${g.voci.map((v) => `
    <div class="voce" data-voce="${v.id}"><div>${esc(v.testo)}</div>
      <div class="scelte"><button data-v="ok" aria-pressed="${BOZZA.risposte[v.id] === "ok"}">OK</button><button data-v="na" aria-pressed="${BOZZA.risposte[v.id] === "na"}">Non applicabile</button></div></div>`).join("")}</div>`).join("")
    : `<div class="msg">La checklist non ha ancora voci: avvisa l'amministratore.</div>`}
  <div class="card">
    <label for="cd">Compilato da</label><input id="cd" maxlength="120" value="${esc(BOZZA.compilato_da)}" autocomplete="name">
    <label for="nt">Note</label><textarea id="nt" maxlength="5000">${esc(BOZZA.note)}</textarea>
  </div>
  ${["interna", "esterna"].map((t) => `<div class="card"><h2>Foto ${t === "interna" ? "interne" : "esterne"}</h2>
    <div class="foto" id="f-${t}"></div>
    <label class="btn" style="font-weight:600">Aggiungi foto ${t === "interna" ? "interne" : "esterne"}<input type="file" accept="image/*" multiple hidden data-tipo="${t}"></label>
    <p class="mu" id="fs-${t}"></p></div>`).join("")}
  <div id="mancano"></div>
  <p class="riga"><button class="pri" id="bi">Invia checklist</button><button id="ban">Annulla checklist</button></p>`;
  $("#bh").onclick = async () => { await salva(); await carica(); home(); };
  $$(".voce").forEach((el) => $$("button", el).forEach((b) => (b.onclick = () => {
    BOZZA.risposte[el.dataset.voce] = b.dataset.v;
    $$("button", el).forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    cambia();
  })));
  $("#cd").oninput = (e) => { BOZZA.compilato_da = e.target.value; try { localStorage.setItem("chk-compilato-da", e.target.value); } catch (_) {} cambia(); };
  $("#nt").oninput = (e) => { BOZZA.note = e.target.value; cambia(); };
  $$("input[type=file]").forEach((i) => (i.onchange = () => aggiungiFoto(i.dataset.tipo, [...i.files]).then(() => (i.value = ""))));
  $("#bi").onclick = inviaChecklist;
  $("#ban").onclick = annulla;
  disegnaFoto();
}

function scriviLocale() { try { localStorage.setItem(chiaveBozza(CH.id), JSON.stringify(BOZZA)); } catch (_) {} }
function cambia() {
  BOZZA.sporca = true; scriviLocale();
  const sv = $("#sv"); if (sv) sv.textContent = "Salvataggio…";
  clearTimeout(timerSalva); timerSalva = setTimeout(salva, 1200);
}
async function salva() {
  if (!CH || !BOZZA || !BOZZA.sporca) return true;
  if (salvataggioInCorso) { clearTimeout(timerSalva); timerSalva = setTimeout(salva, 800); return false; }
  salvataggioInCorso = true;
  const invio = { risposte: BOZZA.risposte, compilato_da: BOZZA.compilato_da.slice(0, 120), note: BOZZA.note.slice(0, 5000) };
  const prima = JSON.stringify(invio);
  const { data, error } = await sb.from("checklist").update(invio).eq("id", CH.id).select("aggiornato_il").maybeSingle();
  salvataggioInCorso = false;
  const sv = $("#sv");
  if (error || !data) {
    if (sv) sv.textContent = "Salvato sul telefono, non ancora sul server: riprovo…";
    clearTimeout(timerSalva); timerSalva = setTimeout(salva, 5000); return false;
  }
  const ora = JSON.stringify({ risposte: BOZZA.risposte, compilato_da: BOZZA.compilato_da.slice(0, 120), note: BOZZA.note.slice(0, 5000) });
  if (ora === prima) { BOZZA.sporca = false; scriviLocale(); }
  if (sv) sv.textContent = "Salvato alle " + fmtOra(data.aggiornato_il);
  return true;
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") salva(); });
window.addEventListener("pagehide", () => salva());
window.addEventListener("online", () => salva());

// ───────── foto ─────────
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
async function aggiungiFoto(tipo, files) {
  const st = $("#fs-" + tipo);
  let n = 0;
  for (const f of files) {
    n++; st.textContent = `Preparo e carico la foto ${n} di ${files.length}…`;
    try {
      const blob = await comprimi(f);
      const percorso = `${S.cab.id}/${CH.id}/${crypto.randomUUID()}.jpg`;
      const up = await sb.storage.from("checklist-foto").upload(percorso, blob, { contentType: "image/jpeg", upsert: false });
      if (up.error) throw up.error;
      const { data, error } = await sb.from("foto").insert({ checklist_id: CH.id, cablatore_id: S.cab.id, tipo, percorso, byte: blob.size }).select("*").single();
      if (error) { await sb.storage.from("checklist-foto").remove([percorso]); throw error; }
      FOTO.push(data);
    } catch (e) {
      st.textContent = `Foto ${n} non caricata (${e.message || e}). Controlla la connessione e riprova.`;
      await disegnaFoto(); return;
    }
  }
  st.textContent = files.length ? `${files.length === 1 ? "Foto caricata" : files.length + " foto caricate"}.` : "";
  await disegnaFoto();
}
async function disegnaFoto(sola = false) {
  const link = await linkFoto(FOTO.map((f) => f.percorso));
  for (const t of ["interna", "esterna"]) {
    const el = $("#f-" + t); if (!el) continue;
    const l = FOTO.filter((f) => f.tipo === t);
    el.innerHTML = l.length ? l.map((f) => `<div><a href="${esc(link[f.percorso] || "#")}" target="_blank" rel="noopener"><img src="${esc(link[f.percorso] || "")}" alt="Foto ${t}"></a>${sola ? "" : `<button data-tf="${f.id}" aria-label="Togli foto">✕</button>`}</div>`).join("") : `<p class="mu">Nessuna foto.</p>`;
  }
  $$("[data-tf]").forEach((b) => (b.onclick = async () => {
    if (!confirm("Togliere questa foto?")) return;
    const f = FOTO.find((x) => x.id === b.dataset.tf);
    const { error } = await sb.from("foto").delete().eq("id", f.id);
    if (error) return alert("Non riesco a toglierla: " + error.message);
    await sb.storage.from("checklist-foto").remove([f.percorso]);
    FOTO = FOTO.filter((x) => x.id !== f.id); disegnaFoto();
  }));
}

// ───────── invio e annullamento ─────────
function cosaManca() {
  const m = [];
  const voci = S.gruppi.flatMap((g) => g.voci);
  if (!voci.length) m.push("La checklist non ha voci");
  const senza = voci.filter((v) => !["ok", "na"].includes(BOZZA.risposte[v.id]));
  if (senza.length) m.push(`Mancano ${senza.length} voci da segnare (OK o Non applicabile)`);
  if (!BOZZA.compilato_da.trim()) m.push('Scrivi "Compilato da"');
  if (!FOTO.some((f) => f.tipo === "interna")) m.push("Aggiungi almeno una foto interna");
  if (!FOTO.some((f) => f.tipo === "esterna")) m.push("Aggiungi almeno una foto esterna");
  return { m, primaVoce: senza[0]?.id };
}
async function inviaChecklist() {
  const { m, primaVoce } = cosaManca();
  const box = $("#mancano");
  if (m.length) {
    box.innerHTML = `<div class="msg"><b>Prima di inviare:</b><ul>${m.map((x) => `<li>· ${esc(x)}</li>`).join("")}</ul></div>`;
    if (primaVoce) document.querySelector(`[data-voce="${primaVoce}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  if (!confirm("Inviare la checklist? Dopo l'invio non si può più modificare.")) return;
  $("#bi").disabled = true; box.innerHTML = `<div class="msg">Invio in corso…</div>`;
  BOZZA.sporca = true;
  if (!(await salva())) { $("#bi").disabled = false; box.innerHTML = `<div class="msg">Non riesco a salvare sul server: controlla la connessione e riprova.</div>`; return; }
  const r = await api("invia", { id: CH.id });
  if (!r.ok) { $("#bi").disabled = false; box.innerHTML = `<div class="msg">${esc(r.msg || "Invio non riuscito")}</div>`; return; }
  try { localStorage.removeItem(chiaveBozza(CH.id)); } catch (_) {}
  await carica();
  await apriChecklist(CH.id);
  $("#esito").innerHTML = `<div class="msg"><b>Checklist inviata il ${fmtDataOra(r.inviata_il)}.</b> ${r.mail ? "Mail del report spedita." : "La mail del report non è partita: l'amministratore è stato avvisato."}</div>`;
}
async function annulla() {
  if (!confirm("Annullare questa checklist? Resterà nello storico come Annullata.")) return;
  clearTimeout(timerSalva);
  const { error } = await sb.from("checklist").update({ stato: "annullata" }).eq("id", CH.id);
  if (error) return alert("Non riesco ad annullarla: " + error.message);
  try { localStorage.removeItem(chiaveBozza(CH.id)); } catch (_) {}
  CH = null; await carica(); home();
}

function vediInviata() {
  const snap = CH.voci_snapshot?.gruppi || [];
  app.innerHTML = `<p><button id="bh">← Elenco</button></p>
  <h1>${esc(CH.commessa)} · ${esc(CH.descrizione)}</h1>
  <p class="mu">Cliente: ${esc(CH.cliente || "-")} · Linea: ${esc(CH.linea || "-")}</p>
  <div id="esito"></div>
  <p><b>Stato: ${STATI[CH.stato]}</b>${CH.inviata_il ? ` · inviata il ${fmtDataOra(CH.inviata_il)}` : ""}${CH.annullata_il ? ` · annullata il ${fmtDataOra(CH.annullata_il)}` : ""}</p>
  <p class="mu">Compilato da: ${esc(CH.compilato_da || "-")}</p>
  ${snap.map((g) => `<div class="card"><h2>${esc(g.nome)}</h2><table>${g.voci.map((v) => `<tr><td>${esc(v.testo)}</td><td><b>${v.esito === "ok" ? "OK" : "Non applicabile"}</b></td></tr>`).join("")}</table></div>`).join("")}
  <div class="card"><h2>Note</h2><p style="white-space:pre-wrap">${esc(CH.note || "Nessuna nota")}</p></div>
  <div class="card"><h2>Foto interne</h2><div class="foto" id="f-interna"></div><h2>Foto esterne</h2><div class="foto" id="f-esterna"></div></div>`;
  $("#bh").onclick = () => home();
  disegnaFoto(true);
}

avvio();
