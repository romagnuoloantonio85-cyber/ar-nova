// ───────── parte comune (cablatore + admin) ─────────
const C = window.CHK;
const sb = window.supabase.createClient(C.url, C.key, {
  db: { schema: "checklist" },
  auth: { persistSession: true, autoRefreshToken: true, storageKey: "chk-auth-" + C.pagina },
});
const API = C.url + "/functions/v1/checklist-api";
const app = document.getElementById("app");

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const STATI = { in_corso: "In corso", inviata: "Inviata", annullata: "Annullata", non_iniziata: "Non iniziata" };

function fmtData(d) { if (!d) return ""; const [y, m, g] = String(d).slice(0, 10).split("-"); return `${g}/${m}/${y}`; }
function fmtDataOra(ts) {
  if (!ts) return "";
  return new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(ts));
}
function fmtOra(ts) { return ts ? new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" }).format(new Date(ts)) : ""; }
function aggiungiGiorni(d, n) { const x = new Date(d + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }

async function api(azione, corpo = {}) {
  const { data: s } = await sb.auth.getSession();
  const tok = s.session?.access_token || C.key;
  let r;
  try {
    r = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json", apikey: C.key, Authorization: "Bearer " + tok }, body: JSON.stringify({ azione, ...corpo }) });
  } catch (_) { return { ok: false, msg: "Connessione assente: riprova quando c'è campo." }; }
  return await r.json().catch(() => ({ ok: false, msg: "Risposta non valida dal server" }));
}

async function oraServer() {
  const { data, error } = await sb.rpc("ora_server");
  if (error) throw new Error("Non riesco a leggere l'ora del server");
  return data; // { adesso, oggi }
}

// legge tutte le righe (a blocchi da 1000)
async function tutte(costruisci) {
  let out = [], da = 0;
  for (;;) {
    const { data, error } = await costruisci().range(da, da + 999);
    if (error) throw error;
    out = out.concat(data || []);
    if (!data || data.length < 1000) return out;
    da += 1000;
  }
}

// stato della checklist di un quadro: Inviata se ce n'è una inviata, altrimenti In corso, altrimenti Non iniziata
function statoQuadro(qid, liste) {
  const l = liste.filter((c) => c.quadro_id === qid);
  if (l.some((c) => c.stato === "inviata")) return "inviata";
  if (l.some((c) => c.stato === "in_corso")) return "in_corso";
  return "non_iniziata";
}

// "Prossimi al collaudo": data entro N giorni, più quelli in ritardo (data passata e non inviata), più date non valide
function prossimi(quadri, liste, oggi, giorni) {
  const limite = aggiungiGiorni(oggi, giorni);
  const out = [];
  for (const q of quadri) {
    const st = statoQuadro(q.id, liste);
    if (!q.data_valida) { out.push({ q, st, ritardo: false, nonValida: true }); continue; }
    if (!q.data_collaudo) continue;
    if (q.data_collaudo > limite) continue;
    const ritardo = q.data_collaudo < oggi && st !== "inviata";
    if (q.data_collaudo < oggi && !ritardo) continue;
    out.push({ q, st, ritardo, nonValida: false });
  }
  out.sort((a, b) => (a.nonValida - b.nonValida) || String(a.q.data_collaudo).localeCompare(String(b.q.data_collaudo)) || a.q.commessa.localeCompare(b.q.commessa));
  return out;
}
function rigaProssimo(p, extra = "") {
  const d = p.nonValida ? "Data non valida" : fmtData(p.q.data_collaudo).slice(0, 5);
  return `<div class="el"><div class="el-data">${d}</div><div class="el-info"><b>${esc(p.q.commessa)}</b> · ${esc(p.q.descrizione)}<br>
    <small>${p.q.cliente ? esc(p.q.cliente) + " · " : ""}Checklist: ${STATI[p.st]}${p.ritardo ? " · <b>In ritardo</b>" : ""}${p.nonValida && p.q.data_testo ? ` · nel foglio: "${esc(p.q.data_testo)}"` : ""}</small></div>${extra}</div>`;
}

function stile() {
  const s = document.createElement("style");
  s.textContent = `
  :root{--accent:#0ea5e9;--accent2:#2563eb;--ok:#22c55e;--na:#6b7280;--tx:#111827;--mu:#4b5563;--line:rgba(229,231,235,.92);--danger:#dc2626;--card:#fff;--field:#f9fafb;--r:16px;--sh:0 18px 40px rgba(15,23,42,.12);color-scheme:light;-webkit-text-size-adjust:100%}
  *,*::before,*::after{box-sizing:border-box}
  html{scroll-padding-top:calc(env(safe-area-inset-top,0px) + 90px)}
  body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--tx);background:radial-gradient(circle at top,#e0f2fe 0,#f3f4f6 45%,#eef2ff 100%) fixed;min-height:100vh}
  #app{max-width:640px;margin:0 auto;padding:calc(env(safe-area-inset-top,0px) + 16px) 14px calc(env(safe-area-inset-bottom,0px) + 40px)}
  #app.largo{max-width:1040px}
  .testa{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:14px}
  .testa-sx{display:flex;align-items:center;gap:10px}
  .avatar{width:42px;height:42px;border-radius:50%;background:linear-gradient(135deg,#22c55e,#0ea5e9);color:#fff;font-weight:800;display:flex;align-items:center;justify-content:center;font-size:15px;box-shadow:0 6px 16px rgba(14,165,233,.35);flex:0 0 auto}
  .titolo{font-weight:800;font-size:17px;display:block}.sotto{font-size:13px;color:var(--mu)}
  .tag{font-size:12px;background:rgba(34,197,94,.12);color:#15803d;border:1px solid rgba(34,197,94,.35);padding:6px 10px;border-radius:999px;white-space:nowrap}
  .card{background:var(--card);border-radius:var(--r);box-shadow:var(--sh);padding:18px 16px;border:1px solid var(--line);margin:0 0 14px}
  h1{font-size:19px;margin:0 0 4px}h2{font-size:15px;margin:0 0 10px;color:var(--accent);font-weight:800}h3{font-size:14px;margin:14px 0 6px}
  .sez{color:var(--accent);font-weight:800;font-size:15px;margin:22px 0 10px}
  .mu{color:var(--mu);font-size:13px}
  label{display:block;font-size:13px;font-weight:700;margin:12px 0 6px}
  input,select,textarea{width:100%;font:inherit;font-size:16px;padding:12px;border-radius:12px;border:1px solid #d1d5db;background:var(--field);color:var(--tx)}
  select:disabled{opacity:.5}textarea{min-height:110px;resize:vertical}
  input:focus-visible,select:focus-visible,textarea:focus-visible,button:focus-visible,a:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
  button,.btn{font:inherit;font-size:14px;font-weight:700;border:1px solid var(--accent);background:#fff;color:var(--accent);border-radius:12px;padding:11px 14px;cursor:pointer;display:inline-block;text-decoration:none;text-align:center}
  button.pri{border:0;color:#fff;background:linear-gradient(135deg,#0ea5e9,#2563eb)}
  button.grande{display:block;width:100%;padding:15px 0;font-size:16px;font-weight:800;margin-top:16px}
  button.piena{display:block;width:100%;margin-top:10px}
  button.picc{padding:7px 10px;font-size:13px;border-radius:9px}
  button.grigio{border:1px solid #d1d5db;color:var(--mu)}
  button:disabled,button.bloccato{opacity:.5}
  ul{list-style:none;margin:0;padding:0}
  .riga{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
  .blocco{background:rgba(14,165,233,.07);border:1px solid rgba(14,165,233,.3);border-radius:12px;padding:12px;margin-bottom:14px}
  .blocco-t{font-weight:800;font-size:14px;color:#0369a1;margin-bottom:6px}
  .el{display:flex;align-items:center;gap:8px;padding:9px 0;border-top:1px solid rgba(14,165,233,.2)}.el:first-of-type{border-top:0}
  .el-info{flex:1;min-width:0;font-size:13px;line-height:1.35}.el-info small{color:var(--mu)}
  .el-data{flex:0 0 auto;font-weight:800;font-size:12px;color:#0369a1;background:#fff;border:1px solid rgba(14,165,233,.35);border-radius:8px;padding:4px 7px;text-align:center;min-width:54px}
  .progress{position:sticky;top:calc(env(safe-area-inset-top,0px) + 6px);z-index:5;background:#fff;border:1px solid var(--line);border-radius:12px;padding:10px 12px;margin-bottom:10px;font-size:13px;font-weight:700;display:flex;flex-wrap:wrap;align-items:center;gap:8px 10px;box-shadow:0 6px 14px rgba(15,23,42,.06)}
  .bar{flex:1;min-width:80px;height:8px;background:#e5e7eb;border-radius:99px;overflow:hidden}
  .bar>i{display:block;height:100%;width:0;background:linear-gradient(90deg,#0ea5e9,#22c55e);transition:width .25s}
  .salv{flex-basis:100%;font-size:11px;font-weight:600;color:#15803d;display:flex;justify-content:space-between;gap:8px;align-items:center}
  .salv button{padding:4px 9px;font-size:12px;border-radius:8px}
  .voce{border:1px solid var(--line);border-radius:12px;padding:12px;margin-bottom:10px;background:#fff;transition:border-color .2s,background .2s}
  .voce.fatta{border-color:rgba(34,197,94,.55);background:rgba(34,197,94,.04)}
  .voce.manca{border-color:var(--danger);background:rgba(220,38,38,.03)}
  .voce-t{display:flex;gap:10px;font-size:14px;line-height:1.45}
  .num{flex:0 0 26px;height:26px;border-radius:50%;background:#e0f2fe;color:#0369a1;font-weight:800;font-size:12px;display:flex;align-items:center;justify-content:center}
  .voce.fatta .num{background:var(--ok);color:#fff}
  .esito{display:flex;gap:8px;margin-top:10px;padding-left:36px}
  .esito button{flex:1;padding:11px 0;border-radius:10px;border:1px solid #d1d5db;background:var(--field);font-weight:700;font-size:14px;color:var(--mu)}
  .esito button.sel-ok{background:var(--ok);border-color:var(--ok);color:#fff}
  .esito button.sel-na{background:var(--na);border-color:var(--na);color:#fff}
  .foto-l{display:flex;justify-content:space-between;align-items:center;font-size:13px;font-weight:700;margin-bottom:8px}
  .foto{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:6px}
  .ft,.fadd{aspect-ratio:1;border-radius:12px;position:relative;overflow:hidden;background:var(--field)}
  .ft img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
  .ft .rm{position:absolute;top:5px;right:5px;width:28px;height:28px;border-radius:50%;border:0;background:rgba(17,24,39,.75);color:#fff;font-size:18px;line-height:28px;padding:0}
  .ft .attesa{position:absolute;left:0;right:0;bottom:0;background:rgba(17,24,39,.72);color:#fff;font-size:11px;font-weight:700;padding:4px 6px;text-align:center}
  .fadd{border:2px dashed #cbd5e1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;text-align:center;font-size:22px;font-weight:700;color:var(--accent);cursor:pointer;margin:0}
  .fadd small{font-size:11px;font-weight:600;color:var(--mu)}.fadd input{display:none}
  .grp-manca .fadd{border-color:var(--danger)}
  .msg{background:rgba(220,38,38,.08);border:1px solid rgba(220,38,38,.3);color:#991b1b;padding:10px 12px;border-radius:10px;font-size:13px;margin:10px 0}
  .msg.info{background:rgba(14,165,233,.07);border-color:rgba(14,165,233,.3);color:#0c4a6e}
  .msg ul{margin:4px 0 0}
  .hint{font-size:12px;color:var(--mu);margin-top:6px;text-align:center}
  .vuoto{margin-top:16px;padding:18px 14px;border:2px dashed #cbd5e1;border-radius:12px;text-align:center;font-size:14px;color:var(--mu)}
  .info-q{font-size:13px;color:var(--mu);margin-top:6px}.info-q b{color:var(--tx)}
  .risultati{border:1px solid var(--line);border-radius:12px;margin-top:6px;max-height:260px;overflow:auto;background:#fff}
  .risultati button{display:block;width:100%;text-align:left;border:0;border-bottom:1px solid var(--line);border-radius:0;color:var(--tx);font-weight:600;padding:10px 12px}
  .risultati button small{display:block;color:var(--mu);font-weight:500}
  .fatto h2{margin:0 0 6px;font-size:20px;color:#15803d}
  .riep{width:100%;border-collapse:collapse;margin-top:12px;font-size:14px}
  .riep td{padding:8px 0;border-bottom:1px solid var(--line);vertical-align:top}
  .riep .k{color:#6b7280;font-weight:600;padding-right:12px;white-space:nowrap}.riep .v{text-align:right;font-weight:600}
  table{border-collapse:collapse;width:100%;font-size:14px}th,td{text-align:left;padding:8px 6px;border-bottom:1px solid var(--line);vertical-align:top}th{font-size:12px;color:var(--mu)}
  .scroll{overflow-x:auto}
  .tabs{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 14px}
  .tabs button{border-radius:999px;padding:8px 12px;font-size:13px;border-color:#d1d5db;color:var(--mu)}
  .tabs button[aria-current=true]{border:0;color:#fff;background:linear-gradient(135deg,#0ea5e9,#2563eb)}
  .filtri{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}.filtri label{margin:0 0 4px}
  .kpi{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;margin-bottom:14px}
  .kpi div{background:#fff;border:1px solid var(--line);border-radius:14px;padding:12px;box-shadow:0 6px 14px rgba(15,23,42,.06)}
  .kpi b{display:block;font-size:26px;line-height:1.1}.kpi span{font-size:12px;color:var(--mu);font-weight:600}
  details summary{cursor:pointer;font-weight:700;color:var(--accent);margin:8px 0}
  li.pr{padding:9px 0;border-bottom:1px solid var(--line);font-size:14px}li.pr:last-child{border:0}
  .piede{text-align:center;font-size:11px;color:#9ca3af;margin-top:16px}
  .toast{position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom,0px) + 20px);transform:translateX(-50%);background:#111827;color:#fff;padding:10px 16px;border-radius:999px;font-size:14px;font-weight:600;z-index:30;opacity:0;pointer-events:none;transition:opacity .2s;max-width:90vw;text-align:center}
  .toast.on{opacity:1}
  .velo{position:fixed;inset:0;background:rgba(255,255,255,.88);display:none;align-items:center;justify-content:center;flex-direction:column;gap:12px;z-index:20;font-weight:700}
  .velo.on{display:flex}
  .spin{width:44px;height:44px;border:4px solid #e0f2fe;border-top-color:var(--accent);border-radius:50%;animation:gira 1s linear infinite}
  .carica{display:flex;align-items:center;gap:12px;font-size:14px;color:var(--mu)}.carica .spin{width:22px;height:22px;border-width:3px}
  @keyframes gira{to{transform:rotate(360deg)}}
  @media (prefers-reduced-motion:reduce){.spin{animation-duration:3s}.bar>i{transition:none}}
  `;
  document.head.appendChild(s);
  const t = document.createElement("div"); t.className = "toast"; t.id = "toast"; t.setAttribute("role", "status"); t.setAttribute("aria-live", "polite"); document.body.appendChild(t);
  const v = document.createElement("div"); v.className = "velo"; v.id = "velo"; v.setAttribute("role", "status"); v.innerHTML = `<div class="spin" aria-hidden="true"></div><div id="velo-t">Invio in corso…</div>`; document.body.appendChild(v);
}
function toast(t) { const e = $("#toast"); if (!e) return; e.textContent = t; e.classList.add("on"); clearTimeout(e._t); e._t = setTimeout(() => e.classList.remove("on"), 2200); }
function velo(on, t) { const e = $("#velo"); if (!e) return; if (t) $("#velo-t").textContent = t; e.classList.toggle("on", !!on); }
function testa(sotto, oggi) {
  return `<div class="testa"><div class="testa-sx"><div class="avatar">FR</div><div><span class="titolo">FR Nexus</span><span class="sotto">${esc(sotto)}</span></div></div>${oggi ? `<span class="tag">📅 <b>${fmtData(oggi)}</b></span>` : ""}</div>`;
}
const caricamento = (t) => `<div class="card"><div class="carica" role="status"><div class="spin" aria-hidden="true"></div><div>${esc(t)}</div></div></div>`;
const piede = () => `<div class="piede">FR Impianti Elettrici SRL${C.versione ? " · pagina " + esc(C.versione) : ""}</div>`;

// ───────── accesso con email e codice ─────────
function schermataAccesso(titolo, sottotitolo, dopo) {
  app.innerHTML = `${testa(sottotitolo)}
  <div class="card"><h2>${esc(titolo)}</h2>
    <div id="p1"><label for="em">La tua email</label><input id="em" type="email" autocomplete="email" inputmode="email">
      <button class="pri grande" id="bc">Mandami il codice</button></div>
    <div id="p2" hidden><p>Ti abbiamo mandato un codice a <b id="emv"></b>. Controlla anche lo spam.</p>
      <label for="cd">Codice ricevuto</label><input id="cd" inputmode="numeric" autocomplete="one-time-code" maxlength="10">
      <button class="pri grande" id="bv">Entra</button><button class="piena grigio" id="bi">Cambia email</button></div>
    <div id="am" class="msg info" hidden></div></div>${piede()}`;
  const m = (t, errore) => { $("#am").hidden = !t; $("#am").textContent = t || ""; $("#am").className = errore ? "msg" : "msg info"; };
  $("#bc").onclick = async () => {
    const email = $("#em").value.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(email)) return m("Scrivi un'email valida.", true);
    $("#bc").disabled = true; m("");
    const r = await api("codice", { email });
    $("#bc").disabled = false;
    if (!r.ok) return m(r.msg || "Invio non riuscito", true);
    $("#emv").textContent = email; $("#p1").hidden = true; $("#p2").hidden = false; $("#cd").focus();
    m("Se l'email è autorizzata, il codice arriva entro un minuto.");
  };
  $("#bi").onclick = () => { $("#p1").hidden = false; $("#p2").hidden = true; m(""); };
  $("#bv").onclick = async () => {
    const token = $("#cd").value.replace(/\D/g, "");
    if (token.length < 6) return m("Scrivi il codice ricevuto per email.", true);
    $("#bv").disabled = true;
    const { error } = await sb.auth.verifyOtp({ email: $("#emv").textContent, token, type: "email" });
    $("#bv").disabled = false;
    if (error) return m("Codice non corretto o scaduto. Chiedine uno nuovo.", true);
    dopo();
  };
}

async function mioUtente() {
  const { data: s } = await sb.auth.getSession();
  if (!s.session) return null;
  const { data } = await sb.from("utenti").select("*, cablatori(id, slug, nome, attivo)").eq("user_id", s.session.user.id).eq("attivo", true).maybeSingle();
  return data || { nonAutorizzato: true, email: s.session.user.email };
}
async function esci() { await sb.auth.signOut(); location.reload(); }

// firma temporanea delle foto (1 ora)
async function linkFoto(percorsi) {
  if (!percorsi.length) return {};
  const { data } = await sb.storage.from("checklist-foto").createSignedUrls(percorsi, 3600);
  const out = {}; for (const x of data || []) if (x.signedUrl) out[x.path] = x.signedUrl;
  return out;
}
