// ───────── pagina admin ─────────
const A = { oggi: null, cab: [], tab: "checklist", filtri: {} };
const CAMPI_COL = [["cliente", "Cliente"], ["linea", "Linea"], ["commessa", "Commessa"], ["descrizione", "Descrizione"], ["tipologia", "Tipologia fornitura"], ["data_collaudo", "Data consegna / collaudo"]];

async function avvio() {
  stile();
  app.innerHTML = `<p class="mu">Caricamento…</p>`;
  const u = await mioUtente();
  if (!u) return schermataAccesso("Checklist Quadri FR · Admin", "Accesso riservato all'amministratore", avvio);
  if (u.nonAutorizzato || u.ruolo !== "admin") {
    app.innerHTML = `<h1>Admin</h1><div class="msg">L'email ${esc(u.email || "")} non è amministratore.</div><p><button id="bx">Esci</button></p>`;
    $("#bx").onclick = esci; return;
  }
  A.oggi = (await oraServer()).oggi;
  await caricaCablatori();
  disegna();
}
async function caricaCablatori() {
  const { data } = await sb.from("cablatori").select("*").order("nome");
  A.cab = data || [];
}
const nomeCab = (id) => A.cab.find((c) => c.id === id)?.nome || "";

const TABS = [["checklist", "Checklist"], ["collaudi", "Prossimi al collaudo"], ["avvisi", "Avvisi"], ["voci", "Voci"], ["cablatori", "Cablatori e accessi"], ["ruoli", "Ruoli"], ["impostazioni", "Impostazioni"]];
async function disegna() {
  const { count } = await sb.from("avvisi").select("id", { count: "exact", head: true }).is("risolto_il", null);
  app.innerHTML = `<h1>Checklist Quadri FR · Admin</h1><p class="mu">Oggi ${fmtData(A.oggi)} · versione pagina ${esc(C.versione || "")}</p>
  ${count ? `<div class="msg"><b>${count} ${count === 1 ? "avviso aperto" : "avvisi aperti"}</b> · <button class="picc" data-tab="avvisi">Vedi</button></div>` : ""}
  <nav class="tabs">${TABS.map(([k, t]) => `<button data-tab="${k}" aria-current="${A.tab === k}">${t}${k === "avvisi" && count ? ` (${count})` : ""}</button>`).join("")}<button id="bx">Esci</button></nav>
  <div id="corpo"><p class="mu">Caricamento…</p></div>`;
  $$("[data-tab]").forEach((b) => (b.onclick = () => { A.tab = b.dataset.tab; disegna(); }));
  $("#bx").onclick = esci;
  const f = { checklist: tabChecklist, collaudi: tabCollaudi, avvisi: tabAvvisi, voci: tabVoci, cablatori: tabCablatori, ruoli: tabRuoli, impostazioni: tabImpostazioni }[A.tab];
  try { await f($("#corpo")); } catch (e) { $("#corpo").innerHTML = `<div class="msg">Errore: ${esc(e.message || e)}</div>`; }
}
const err = (e) => { if (e) { alert("Errore: " + (e.message || e)); return true; } return false; };

// ───────── checklist: elenco, filtri, dettaglio, CSV ─────────
async function cercaChecklist() {
  const f = A.filtri;
  let qy = sb.from("checklist").select("*, foto(tipo)").order("creato_il", { ascending: false }).limit(1000);
  if (f.cab) qy = qy.eq("cablatore_id", f.cab);
  if (f.stato) qy = qy.eq("stato", f.stato);
  if (f.cliente) qy = qy.ilike("cliente", `%${f.cliente}%`);
  if (f.commessa) qy = qy.ilike("commessa", `%${f.commessa}%`);
  if (f.da) qy = qy.gte("creato_il", f.da + "T00:00:00+01:00");
  if (f.a) qy = qy.lte("creato_il", f.a + "T23:59:59+01:00");
  const { data, error } = await qy;
  if (error) throw error;
  return data || [];
}
async function tabChecklist(el) {
  const f = A.filtri;
  el.innerHTML = `<div class="card"><h2>Filtri</h2><div class="filtri">
    <div><label for="fc">Cablatore</label><select id="fc"><option value="">Tutti</option>${A.cab.map((c) => `<option value="${c.id}" ${f.cab === c.id ? "selected" : ""}>${esc(c.nome)}</option>`).join("")}</select></div>
    <div><label for="fcl">Cliente</label><input id="fcl" value="${esc(f.cliente || "")}"></div>
    <div><label for="fco">Commessa</label><input id="fco" value="${esc(f.commessa || "")}"></div>
    <div><label for="fs">Stato</label><select id="fs"><option value="">Tutti</option>${["in_corso", "inviata", "annullata"].map((s) => `<option value="${s}" ${f.stato === s ? "selected" : ""}>${STATI[s]}</option>`).join("")}</select></div>
    <div><label for="fda">Creata dal</label><input id="fda" type="date" value="${esc(f.da || "")}"></div>
    <div><label for="fa">al</label><input id="fa" type="date" value="${esc(f.a || "")}"></div></div>
    <p class="riga"><button class="pri" id="bf">Cerca</button><button id="bz">Azzera</button><button id="bcsv">Esporta CSV</button></p></div>
    <div id="ris"><p class="mu">Cerco…</p></div>`;
  const leggi = () => { A.filtri = { cab: $("#fc").value, cliente: $("#fcl").value.trim(), commessa: $("#fco").value.trim(), stato: $("#fs").value, da: $("#fda").value, a: $("#fa").value }; };
  $("#bf").onclick = () => { leggi(); tabChecklist(el); };
  $("#bz").onclick = () => { A.filtri = {}; tabChecklist(el); };
  const lista = await cercaChecklist();
  $("#bcsv").onclick = () => { leggi(); cercaChecklist().then(csv); };
  $("#ris").innerHTML = lista.length ? `<p class="mu">${lista.length} checklist${lista.length === 1000 ? " (prime 1000: restringi i filtri)" : ""}</p><div class="scroll"><table>
    <tr><th>Creata</th><th>Cablatore</th><th>Cliente</th><th>Commessa</th><th>Descrizione</th><th>Stato</th><th>Inviata</th><th>Mail</th><th></th></tr>
    ${lista.map((c) => `<tr><td>${fmtDataOra(c.creato_il)}</td><td>${esc(nomeCab(c.cablatore_id))}</td><td>${esc(c.cliente)}</td><td>${esc(c.commessa)}</td><td>${esc(c.descrizione)}</td>
      <td>${STATI[c.stato]}</td><td>${fmtDataOra(c.inviata_il)}</td><td>${c.mail_stato === "inviata" ? "Partita" : c.mail_stato === "errore" ? "<b>Non partita</b>" : c.mail_stato === "in_invio" ? "In invio" : ""}</td>
      <td><button class="picc" data-d="${c.id}">Dettaglio</button></td></tr>`).join("")}</table></div>` : `<p class="mu">Nessuna checklist con questi filtri.</p>`;
  $$("[data-d]").forEach((b) => (b.onclick = () => dettaglio(b.dataset.d)));
}
function csv(lista) {
  const c = (v) => { const s = String(v ?? ""); return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const intest = ["ID", "Cablatore", "Cliente", "Linea", "Commessa", "Descrizione", "Stato", "Compilato da", "Creata", "Inviata", "Annullata", "Voci OK", "Voci Non applicabile", "Foto interne", "Foto esterne", "Mail", "Destinatari", "Note"];
  const righe = lista.map((x) => {
    const voci = (x.voci_snapshot?.gruppi || []).flatMap((g) => g.voci);
    const r = x.voci_snapshot ? voci : Object.values(x.risposte || {}).map((e) => ({ esito: e }));
    return [x.id, nomeCab(x.cablatore_id), x.cliente, x.linea, x.commessa, x.descrizione, STATI[x.stato], x.compilato_da, fmtDataOra(x.creato_il), fmtDataOra(x.inviata_il), fmtDataOra(x.annullata_il),
      r.filter((v) => v.esito === "ok").length, r.filter((v) => v.esito === "na").length,
      (x.foto || []).filter((f) => f.tipo === "interna").length, (x.foto || []).filter((f) => f.tipo === "esterna").length,
      x.mail_stato === "inviata" ? "Partita" : x.mail_stato === "errore" ? "Non partita" : "", (x.mail_destinatari || []).join(", "), x.note].map(c).join(";");
  });
  const blob = new Blob(["﻿" + [intest.join(";"), ...righe].join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `checklist-${A.oggi}.csv`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
async function dettaglio(id) {
  const el = $("#corpo");
  el.innerHTML = `<p class="mu">Carico…</p>`;
  const { data: ch } = await sb.from("checklist").select("*").eq("id", id).single();
  const { data: foto } = await sb.from("foto").select("*").eq("checklist_id", id).order("creato_il");
  let gruppi = ch.voci_snapshot?.gruppi;
  if (!gruppi) {
    const { data: g } = await sb.from("gruppi").select("id, nome, ordine, voci(id, testo, ordine)").eq("cablatore_id", ch.cablatore_id).order("ordine");
    gruppi = (g || []).map((x) => ({ nome: x.nome, voci: (x.voci || []).sort((a, b) => a.ordine - b.ordine).map((v) => ({ testo: v.testo, esito: ch.risposte?.[v.id] })) }));
  }
  const link = await linkFoto((foto || []).map((f) => f.percorso));
  const fx = (t) => { const l = (foto || []).filter((f) => f.tipo === t); return l.length ? `<div class="foto">${l.map((f) => `<div><a href="${esc(link[f.percorso] || "#")}" target="_blank" rel="noopener"><img src="${esc(link[f.percorso] || "")}" alt="Foto ${t}"></a></div>`).join("")}</div>` : `<p class="mu">Nessuna.</p>`; };
  el.innerHTML = `<p><button id="bb">← Elenco</button></p>
  <div class="card"><h2>${esc(ch.commessa)} · ${esc(ch.descrizione)}</h2>
    <table><tr><td>Cablatore</td><td>${esc(nomeCab(ch.cablatore_id))}</td></tr><tr><td>Cliente</td><td>${esc(ch.cliente || "-")}</td></tr><tr><td>Linea</td><td>${esc(ch.linea || "-")}</td></tr>
    <tr><td>Stato</td><td><b>${STATI[ch.stato]}</b></td></tr><tr><td>Compilato da</td><td>${esc(ch.compilato_da || "-")}</td></tr>
    <tr><td>Creata</td><td>${fmtDataOra(ch.creato_il)}</td></tr><tr><td>Ultimo salvataggio</td><td>${fmtDataOra(ch.aggiornato_il)}</td></tr>
    ${ch.inviata_il ? `<tr><td>Inviata</td><td>${fmtDataOra(ch.inviata_il)}</td></tr>` : ""}${ch.annullata_il ? `<tr><td>Annullata</td><td>${fmtDataOra(ch.annullata_il)}</td></tr>` : ""}
    ${ch.stato === "inviata" ? `<tr><td>Mail</td><td>${ch.mail_stato === "inviata" ? "Partita a " + esc((ch.mail_destinatari || []).join(", ")) : ch.mail_stato === "errore" ? "<b>Non partita</b>: " + esc(ch.mail_errore || "") : esc(ch.mail_stato || "")}</td></tr>` : ""}</table>
    <p class="riga">${ch.stato === "inviata" ? `<button id="brm">${ch.mail_stato === "errore" ? "Riprova invio mail" : "Rimanda la mail"}</button>` : ""}${ch.stato === "in_corso" ? `<button id="ban">Annulla checklist</button>` : ""}</p>
    ${ch.voci_snapshot ? `<p class="mu">Voci come erano al momento dell'invio.</p>` : `<p class="mu">Checklist non inviata: voci attuali.</p>`}</div>
  ${gruppi.map((g) => `<div class="card"><h2>${esc(g.nome)}</h2><table>${g.voci.map((v) => `<tr><td>${esc(v.testo)}</td><td><b>${v.esito === "ok" ? "OK" : v.esito === "na" ? "Non applicabile" : "Da segnare"}</b></td></tr>`).join("")}</table></div>`).join("")}
  <div class="card"><h2>Note</h2><p style="white-space:pre-wrap">${esc(ch.note || "Nessuna nota")}</p></div>
  <div class="card"><h2>Foto interne</h2>${fx("interna")}<h2>Foto esterne</h2>${fx("esterna")}<p class="mu">I link delle foto valgono 1 ora.</p></div>`;
  $("#bb").onclick = () => tabChecklist(el);
  if ($("#brm")) $("#brm").onclick = async () => { $("#brm").disabled = true; const r = await api("riprova_mail", { id }); alert(r.ok && r.mail ? "Mail partita." : "Mail non partita: " + (r.errore || r.msg || "")); dettaglio(id); };
  if ($("#ban")) $("#ban").onclick = async () => { if (!confirm("Annullare la checklist?")) return; if (!err((await sb.from("checklist").update({ stato: "annullata" }).eq("id", id)).error)) dettaglio(id); };
}

// ───────── prossimi al collaudo ─────────
async function tabCollaudi(el) {
  const { data: imp } = await sb.from("impostazioni").select("valore").eq("chiave", "giorni_anticipo").maybeSingle();
  const giorni = Number(imp?.valore ?? 14);
  const limite = aggiungiGiorni(A.oggi, giorni);
  const quadri = await tutte(() => sb.from("quadri").select("*").eq("attivo", true).or(`data_collaudo.lte.${limite},data_valida.eq.false`));
  const liste = await tutte(() => sb.from("checklist").select("id, quadro_id, stato").neq("stato", "annullata"));
  el.innerHTML = A.cab.map((c) => {
    const pr = prossimi(quadri.filter((q) => q.cablatore_id === c.id), liste, A.oggi, giorni);
    return `<div class="card"><h2>${esc(c.nome)} · prossimi ${giorni} giorni</h2>${pr.length ? `<ul>${pr.map((p) => rigaProssimo(p, p.q.linea ? ` · Linea ${esc(p.q.linea)}` : "")).join("")}</ul>` : `<p class="mu">Nessun quadro.</p>`}</div>`;
  }).join("") || `<p class="mu">Nessun cablatore.</p>`;
}

// ───────── avvisi ─────────
async function tabAvvisi(el) {
  const { data } = await sb.from("avvisi").select("*").order("risolto_il", { ascending: false, nullsFirst: true }).order("ultimo_il", { ascending: false }).limit(300);
  const aperti = (data || []).filter((a) => !a.risolto_il), chiusi = (data || []).filter((a) => a.risolto_il).slice(0, 50);
  const TIPI = { colonna_mancante: "Colonna mancante", data_non_valida: "Data non valida", mail_non_partita: "Mail non partita", lettura_foglio: "Lettura foglio", altro: "Altro" };
  const riga = (a, chiuso) => `<li class="pr"><div><b>${TIPI[a.tipo] || a.tipo}</b> · ${esc(a.messaggio)}</div><div class="mu">Dal ${fmtDataOra(a.creato_il)} · ultimo controllo ${fmtDataOra(a.ultimo_il)}${chiuso ? ` · risolto ${fmtDataOra(a.risolto_il)}` : ` · <button class="picc" data-ris="${a.id}">Segna risolto</button>`}${a.tipo === "mail_non_partita" && a.dettagli?.checklist_id && !chiuso ? ` <button class="picc" data-rm="${a.dettagli.checklist_id}">Riprova mail</button>` : ""}</div></li>`;
  el.innerHTML = `<div class="card"><h2>Aperti (${aperti.length})</h2>${aperti.length ? `<ul>${aperti.map((a) => riga(a, false)).join("")}</ul>` : `<p class="mu">Nessun avviso aperto.</p>`}
    <p class="mu">Colonne mancanti e date non valide si chiudono da sole quando il foglio viene corretto e riletto.</p></div>
    <div class="card"><h2>Risolti di recente</h2>${chiusi.length ? `<ul>${chiusi.map((a) => riga(a, true)).join("")}</ul>` : `<p class="mu">Nessuno.</p>`}</div>`;
  $$("[data-ris]").forEach((b) => (b.onclick = async () => { const { data: o } = await sb.rpc("ora_server"); if (!err((await sb.from("avvisi").update({ risolto_il: o.adesso }).eq("id", b.dataset.ris)).error)) disegna(); }));
  $$("[data-rm]").forEach((b) => (b.onclick = async () => { b.disabled = true; const r = await api("riprova_mail", { id: b.dataset.rm }); alert(r.ok && r.mail ? "Mail partita." : "Mail non partita: " + (r.errore || r.msg || "")); disegna(); }));
}

// ───────── voci ─────────
async function tabVoci(el) {
  if (!A.vociCab) A.vociCab = A.cab[0]?.id;
  if (!A.vociCab) { el.innerHTML = `<p class="mu">Crea prima un cablatore.</p>`; return; }
  const { data } = await sb.from("gruppi").select("id, nome, ordine, voci(id, testo, ordine)").eq("cablatore_id", A.vociCab).order("ordine");
  const G = (data || []).map((g) => ({ ...g, voci: (g.voci || []).sort((a, b) => a.ordine - b.ordine) }));
  el.innerHTML = `<div class="card"><label for="vc">Checklist del cablatore</label><select id="vc">${A.cab.map((c) => `<option value="${c.id}" ${c.id === A.vociCab ? "selected" : ""}>${esc(c.nome)}</option>`).join("")}</select>
    <p class="mu">Le modifiche valgono per le checklist nuove e per quelle In corso. Le checklist Inviate restano come erano.</p></div>
  ${G.map((g, gi) => `<div class="card"><div class="riga"><h2 style="margin:0;flex:1 1 auto">${esc(g.nome)}</h2>
      <button class="picc" data-gsu="${gi}" ${gi === 0 ? "disabled" : ""} aria-label="Sposta su">↑</button><button class="picc" data-ggiu="${gi}" ${gi === G.length - 1 ? "disabled" : ""} aria-label="Sposta giù">↓</button>
      <button class="picc" data-gren="${g.id}">Rinomina</button><button class="picc" data-gdel="${g.id}">Togli gruppo</button></div>
    <table>${g.voci.map((v, vi) => `<tr><td style="width:100%">${esc(v.testo)}</td><td style="white-space:nowrap">
      <button class="picc" data-vsu="${gi}:${vi}" ${vi === 0 ? "disabled" : ""} aria-label="Sposta su">↑</button><button class="picc" data-vgiu="${gi}:${vi}" ${vi === g.voci.length - 1 ? "disabled" : ""} aria-label="Sposta giù">↓</button>
      <button class="picc" data-vren="${v.id}">Rinomina</button><button class="picc" data-vdel="${v.id}">Togli</button></td></tr>`).join("") || `<tr><td class="mu">Nessuna voce.</td></tr>`}</table>
    <div class="riga" style="margin-top:8px"><input data-nv="${g.id}" placeholder="Nuova voce" style="flex:1 1 220px"><button data-av="${g.id}">Aggiungi voce</button></div></div>`).join("")}
  <div class="card"><div class="riga"><input id="ng" placeholder="Nome del nuovo gruppo" style="flex:1 1 220px"><button class="pri" id="bag">Aggiungi gruppo</button></div></div>`;
  const rifai = () => tabVoci(el);
  $("#vc").onchange = (e) => { A.vociCab = e.target.value; rifai(); };
  $("#bag").onclick = async () => { const nome = $("#ng").value.trim(); if (!nome) return; if (!err((await sb.from("gruppi").insert({ cablatore_id: A.vociCab, nome, ordine: (G.at(-1)?.ordine ?? 0) + 10 })).error)) rifai(); };
  $$("[data-av]").forEach((b) => (b.onclick = async () => {
    const g = G.find((x) => x.id === b.dataset.av); const testo = $(`[data-nv="${g.id}"]`).value.trim(); if (!testo) return;
    if (!err((await sb.from("voci").insert({ gruppo_id: g.id, testo, ordine: (g.voci.at(-1)?.ordine ?? 0) + 10 })).error)) rifai();
  }));
  $$("[data-nv]").forEach((i) => (i.onkeydown = (e) => { if (e.key === "Enter") $(`[data-av="${i.dataset.nv}"]`).click(); }));
  $$("[data-gren]").forEach((b) => (b.onclick = async () => { const g = G.find((x) => x.id === b.dataset.gren); const n = prompt("Nuovo nome del gruppo", g.nome); if (n && n.trim()) if (!err((await sb.from("gruppi").update({ nome: n.trim() }).eq("id", g.id)).error)) rifai(); }));
  $$("[data-gdel]").forEach((b) => (b.onclick = async () => { const g = G.find((x) => x.id === b.dataset.gdel); if (!confirm(`Togliere il gruppo "${g.nome}" e le sue ${g.voci.length} voci?`)) return; if (!err((await sb.from("gruppi").delete().eq("id", g.id)).error)) rifai(); }));
  $$("[data-vren]").forEach((b) => (b.onclick = async () => { const v = G.flatMap((g) => g.voci).find((x) => x.id === b.dataset.vren); const n = prompt("Nuovo testo della voce", v.testo); if (n && n.trim()) if (!err((await sb.from("voci").update({ testo: n.trim() }).eq("id", v.id)).error)) rifai(); }));
  $$("[data-vdel]").forEach((b) => (b.onclick = async () => { const v = G.flatMap((g) => g.voci).find((x) => x.id === b.dataset.vdel); if (!confirm(`Togliere la voce "${v.testo}"?`)) return; if (!err((await sb.from("voci").delete().eq("id", v.id)).error)) rifai(); }));
  // riordino: rinumera tutto l'elenco con passi da 10, così due voci non restano mai con lo stesso ordine
  const riordina = async (tab, lista, i, j) => {
    const l = [...lista]; [l[i], l[j]] = [l[j], l[i]];
    for (let k = 0; k < l.length; k++) if (l[k].ordine !== (k + 1) * 10) { const { error } = await sb.from(tab).update({ ordine: (k + 1) * 10 }).eq("id", l[k].id); if (err(error)) return; }
    rifai();
  };
  $$("[data-gsu]").forEach((b) => (b.onclick = () => { const i = +b.dataset.gsu; riordina("gruppi", G, i, i - 1); }));
  $$("[data-ggiu]").forEach((b) => (b.onclick = () => { const i = +b.dataset.ggiu; riordina("gruppi", G, i, i + 1); }));
  $$("[data-vsu]").forEach((b) => (b.onclick = () => { const [g, i] = b.dataset.vsu.split(":").map(Number); riordina("voci", G[g].voci, i, i - 1); }));
  $$("[data-vgiu]").forEach((b) => (b.onclick = () => { const [g, i] = b.dataset.vgiu.split(":").map(Number); riordina("voci", G[g].voci, i, i + 1); }));
}

// ───────── cablatori, colonne del Gantt e accessi ─────────
async function tabCablatori(el) {
  await caricaCablatori();
  const { data: ut } = await sb.from("utenti").select("*").order("email");
  el.innerHTML = A.cab.map((c) => `<div class="card"><h2>${esc(c.nome)} ${c.attivo ? "" : "· Disattivato"}</h2>
    <p>Link: <b>app.ardigitalmarketer.it/checklist/${esc(c.slug)}</b></p>
    <p class="mu">Ultima lettura del foglio: ${c.ultimo_sync_il ? fmtDataOra(c.ultimo_sync_il) + " · " + esc(c.ultimo_sync_esito || "") : "mai"}</p>
    <p><button class="pri" data-sync="${c.id}">Aggiorna ora</button></p>
    <details><summary>Impostazioni del foglio e colonne</summary>
      <label>Nome</label><input data-k="nome" data-c="${c.id}" value="${esc(c.nome)}">
      <label>ID del file Google Sheets</label><input data-k="foglio_id" data-c="${c.id}" value="${esc(c.foglio_id || "")}">
      <label>Nome della scheda</label><input data-k="foglio_scheda" data-c="${c.id}" value="${esc(c.foglio_scheda)}">
      <label>Valore della tipologia da mostrare</label><input data-k="filtro_valore" data-c="${c.id}" value="${esc(c.filtro_valore)}">
      <h3>Nomi delle colonne (intestazione della riga 1)</h3>
      ${CAMPI_COL.map(([k, t]) => `<label>${t}</label><input data-col="${k}" data-c="${c.id}" value="${esc(c.colonne?.[k] || "")}">`).join("")}
      <label><input type="checkbox" data-k="attivo" data-c="${c.id}" ${c.attivo ? "checked" : ""} style="width:auto"> Attivo</label>
      <p><button class="pri" data-salva="${c.id}">Salva</button></p></details>
    <h3>Persone abilitate</h3>
    <table>${(ut || []).filter((u) => u.cablatore_id === c.id).map((u) => `<tr><td>${esc(u.email)}</td><td>${esc(u.nome || "")}</td><td>${u.attivo ? "Abilitata" : "Disabilitata"}</td>
      <td style="white-space:nowrap"><button class="picc" data-ua="${u.id}" data-on="${u.attivo}">${u.attivo ? "Disabilita" : "Abilita"}</button> <button class="picc" data-ud="${u.id}">Togli</button></td></tr>`).join("") || `<tr><td class="mu">Nessuna: aggiungi l'email di chi compila.</td></tr>`}</table>
    <div class="riga" style="margin-top:8px"><input data-ne="${c.id}" type="email" placeholder="email" style="flex:1 1 200px"><input data-nn="${c.id}" placeholder="nome (facoltativo)" style="flex:1 1 140px"><button data-au="${c.id}">Abilita email</button></div></div>`).join("")
  + `<div class="card"><h2>Amministratori</h2><table>${(ut || []).filter((u) => u.ruolo === "admin").map((u) => `<tr><td>${esc(u.email)}</td><td>${u.attivo ? "Abilitato" : "Disabilitato"}</td></tr>`).join("")}</table></div>
  <div class="card"><h2>Nuovo cablatore o cantiere</h2>
    <label>Nome</label><input id="nn"><label>Codice del link (minuscole, numeri, trattini)</label><input id="ns" placeholder="es. rossi">
    <label>Tipo</label><select id="nt"><option value="cablatore">Cablatore</option><option value="cantiere">Cantiere navale</option></select>
    <p class="mu">Dopo la creazione imposta foglio e colonne, aggiungi le voci e le email abilitate. Il link app.ardigitalmarketer.it/checklist/codice funziona subito.</p>
    <p><button class="pri" id="bnc">Crea</button></p></div>`;
  const rifai = () => tabCablatori(el);
  $$("[data-sync]").forEach((b) => (b.onclick = async () => {
    b.disabled = true; b.textContent = "Leggo il foglio…";
    const r = await api("sync", { cablatore_id: b.dataset.sync });
    alert(r.ok ? Object.values(r.esiti || {}).join("\n") || "Fatto" : r.msg || "Errore"); rifai();
  }));
  $$("[data-salva]").forEach((b) => (b.onclick = async () => {
    const id = b.dataset.salva, c = A.cab.find((x) => x.id === id);
    const v = (k) => $(`[data-k="${k}"][data-c="${id}"]`);
    const colonne = { ...(c.colonne || {}) };
    $$(`[data-col][data-c="${id}"]`).forEach((i) => (colonne[i.dataset.col] = i.value.trim()));
    const { error } = await sb.from("cablatori").update({ nome: v("nome").value.trim(), foglio_id: v("foglio_id").value.trim() || null, foglio_scheda: v("foglio_scheda").value.trim(), filtro_valore: v("filtro_valore").value.trim(), attivo: v("attivo").checked, colonne }).eq("id", id);
    if (!err(error)) { alert("Salvato. Tocca \"Aggiorna ora\" per rileggere il foglio con le nuove impostazioni."); rifai(); }
  }));
  $$("[data-au]").forEach((b) => (b.onclick = async () => {
    const id = b.dataset.au, email = $(`[data-ne="${id}"]`).value.trim().toLowerCase(), nome = $(`[data-nn="${id}"]`).value.trim();
    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(email)) return alert("Email non valida");
    if (!err((await sb.from("utenti").insert({ email, nome: nome || null, ruolo: "cablatore", cablatore_id: id })).error)) rifai();
  }));
  $$("[data-ua]").forEach((b) => (b.onclick = async () => { if (!err((await sb.from("utenti").update({ attivo: b.dataset.on !== "true" }).eq("id", b.dataset.ua)).error)) rifai(); }));
  $$("[data-ud]").forEach((b) => (b.onclick = async () => { if (confirm("Togliere questa email?")) if (!err((await sb.from("utenti").delete().eq("id", b.dataset.ud)).error)) rifai(); }));
  $("#bnc").onclick = async () => {
    const nome = $("#nn").value.trim(), slug = $("#ns").value.trim().toLowerCase();
    if (!nome || !/^[a-z0-9-]{2,40}$/.test(slug) || slug === "admin") return alert("Scrivi un nome e un codice valido (non \"admin\").");
    if (!err((await sb.from("cablatori").insert({ nome, slug, tipo: $("#nt").value })).error)) rifai();
  };
}

// ───────── ruoli ─────────
async function tabRuoli(el) {
  const { data } = await sb.from("ruoli").select("*").order("linea");
  el.innerHTML = `<div class="card"><h2>Ruoli: linea → email</h2><p class="mu">Alla linea del quadro arriva la mail del report. Più email separate da virgola. Le persone in copia si impostano in Impostazioni.</p>
  <table><tr><th>Linea</th><th>Email</th><th></th></tr>${(data || []).map((r) => `<tr><td><input data-rl="${r.id}" value="${esc(r.linea)}"></td><td><input data-re="${r.id}" value="${esc((r.email || []).join(", "))}"></td>
    <td style="white-space:nowrap"><button class="picc" data-rs="${r.id}">Salva</button> <button class="picc" data-rd="${r.id}">Togli</button></td></tr>`).join("")}
  <tr><td><input id="nl" placeholder="Linea"></td><td><input id="ne" placeholder="email, email"></td><td><button class="picc pri" id="bnr">Aggiungi</button></td></tr></table></div>`;
  const lista = (s) => s.split(/[,;\s]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
  const valide = (l) => l.every((e) => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(e));
  const rifai = () => tabRuoli(el);
  $$("[data-rs]").forEach((b) => (b.onclick = async () => { const id = b.dataset.rs, l = lista($(`[data-re="${id}"]`).value); if (!valide(l)) return alert("Una email non è valida"); if (!err((await sb.from("ruoli").update({ linea: $(`[data-rl="${id}"]`).value.trim(), email: l }).eq("id", id)).error)) rifai(); }));
  $$("[data-rd]").forEach((b) => (b.onclick = async () => { if (confirm("Togliere questa linea?")) if (!err((await sb.from("ruoli").delete().eq("id", b.dataset.rd)).error)) rifai(); }));
  $("#bnr").onclick = async () => { const linea = $("#nl").value.trim(), l = lista($("#ne").value); if (!linea || !l.length || !valide(l)) return alert("Scrivi linea ed email valide"); if (!err((await sb.from("ruoli").insert({ linea, email: l })).error)) rifai(); };
}

// ───────── impostazioni ─────────
async function tabImpostazioni(el) {
  const { data } = await sb.from("impostazioni").select("*");
  const v = (k, d) => (data || []).find((x) => x.chiave === k)?.valore ?? d;
  const { data: ver } = await sb.from("app_versioni").select("pagina, versione, pubblicata, creato_il, note").order("versione", { ascending: false }).limit(20);
  el.innerHTML = `<div class="card"><h2>Impostazioni</h2>
    <label for="ig">Giorni di anticipo per "Prossimi al collaudo"</label><input id="ig" type="number" min="1" max="120" value="${esc(v("giorni_anticipo", 14))}">
    <label for="ic">Sempre in copia nelle mail del report (separate da virgola)</label><input id="ic" value="${esc((v("mail_copia", []) || []).join(", "))}">
    <label for="ia">Email per gli avvisi (colonne mancanti, foglio non leggibile)</label><input id="ia" value="${esc(v("mail_avvisi", ""))}">
    <p><button class="pri" id="bis">Salva</button></p></div>
  <div class="card"><h2>Versioni delle pagine</h2><table><tr><th>Pagina</th><th>Versione</th><th>Stato</th><th>Creata</th><th>Note</th></tr>
    ${(ver || []).map((x) => `<tr><td>${x.pagina}</td><td>v${x.versione}</td><td>${x.pubblicata ? "Pubblicata" : "Non pubblicata"}</td><td>${fmtDataOra(x.creato_il)}</td><td>${esc(x.note || "")}</td></tr>`).join("")}</table></div>`;
  $("#bis").onclick = async () => {
    const g = parseInt($("#ig").value, 10);
    const copia = $("#ic").value.split(/[,;\s]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
    const av = $("#ia").value.trim().toLowerCase();
    const ok = (e) => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(e);
    if (!(g >= 1 && g <= 120)) return alert("Giorni: da 1 a 120");
    if (!copia.every(ok) || (av && !ok(av))) return alert("Una email non è valida");
    const e1 = await sb.from("impostazioni").update({ valore: g }).eq("chiave", "giorni_anticipo");
    const e2 = await sb.from("impostazioni").update({ valore: copia }).eq("chiave", "mail_copia");
    const e3 = await sb.from("impostazioni").update({ valore: av }).eq("chiave", "mail_avvisi");
    if (!err(e1.error || e2.error || e3.error)) alert("Salvato.");
  };
}

avvio();
