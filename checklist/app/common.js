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
  const data = p.nonValida ? `Data non valida (${esc(p.q.data_testo || "")})` : fmtData(p.q.data_collaudo);
  return `<li class="pr"><div><b>${data}</b> · ${esc(p.q.commessa)} · ${esc(p.q.descrizione)}${p.q.cliente ? ` <span class="mu">(${esc(p.q.cliente)})</span>` : ""}</div>
    <div class="mu">Checklist: ${STATI[p.st]}${p.ritardo ? " · <b>In ritardo</b>" : ""}${extra}</div></li>`;
}

function stile() {
  const s = document.createElement("style");
  s.textContent = `
  :root{--bg:#f4f4f5;--card:#fff;--tx:#111;--mu:#555;--bd:#c8c8cc;--btn:#111;--btntx:#fff}
  @media (prefers-color-scheme:dark){:root{--bg:#111;--card:#1c1c1e;--tx:#f2f2f2;--mu:#aaa;--bd:#444;--btn:#f2f2f2;--btntx:#111}}
  *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--tx);font:16px/1.45 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif}
  #app{max-width:820px;margin:0 auto;padding:12px 14px 80px}
  h1{font-size:20px;margin:8px 0 2px}h2{font-size:17px;margin:0 0 8px}h3{font-size:15px;margin:12px 0 6px}
  .card{background:var(--card);border:1px solid var(--bd);border-radius:10px;padding:14px;margin:12px 0}
  .mu{color:var(--mu);font-size:14px}
  button,.btn{font:inherit;border:1px solid var(--tx);background:var(--card);color:var(--tx);border-radius:8px;padding:10px 14px;cursor:pointer;display:inline-block;text-decoration:none}
  button.pri{background:var(--btn);color:var(--btntx);font-weight:700}
  button:disabled{opacity:.5;cursor:default}
  button.picc{padding:5px 9px;font-size:14px}
  input,select,textarea{font:inherit;width:100%;padding:10px;border:1px solid var(--bd);border-radius:8px;background:var(--card);color:var(--tx)}
  textarea{min-height:110px}label{display:block;margin:10px 0 4px;font-weight:600}
  ul{list-style:none;margin:0;padding:0}li.pr{padding:8px 0;border-bottom:1px solid var(--bd)}li.pr:last-child{border:0}
  .voce{padding:10px 0;border-bottom:1px solid var(--bd)}.voce:last-child{border:0}
  .scelte{display:flex;gap:8px;margin-top:6px}.scelte button{flex:1;padding:12px 6px}
  .scelte button[aria-pressed=true]{border-width:3px;font-weight:800}
  .scelte button[aria-pressed=true]::before{content:"✓ "}
  .foto{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:8px;margin:8px 0}
  .foto div{position:relative}.foto img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:6px;border:1px solid var(--bd);display:block}
  .foto button{position:absolute;top:4px;right:4px;padding:2px 7px;font-size:13px}
  .riga{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.riga>*{flex:0 0 auto}
  .msg{border:1px solid var(--tx);border-radius:8px;padding:10px;margin:10px 0}
  table{border-collapse:collapse;width:100%;font-size:14px}th,td{text-align:left;padding:6px;border-bottom:1px solid var(--bd);vertical-align:top}
  .tabs{display:flex;gap:6px;flex-wrap:wrap;margin:10px 0}.tabs button[aria-current=true]{border-width:3px;font-weight:800}
  .scroll{overflow-x:auto}
  .filtri{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}
  .filtri label{margin:0 0 2px;font-size:13px}
  `;
  document.head.appendChild(s);
}

// ───────── accesso con email e codice ─────────
function schermataAccesso(titolo, sottotitolo, dopo) {
  app.innerHTML = `<h1>${esc(titolo)}</h1><p class="mu">${esc(sottotitolo)}</p>
  <div class="card"><h2>Entra</h2>
    <div id="p1"><label for="em">La tua email</label><input id="em" type="email" autocomplete="email" inputmode="email">
      <p><button class="pri" id="bc">Mandami il codice</button></p></div>
    <div id="p2" hidden><p>Ti abbiamo mandato un codice a <b id="emv"></b>. Controlla anche lo spam.</p>
      <label for="cd">Codice ricevuto</label><input id="cd" inputmode="numeric" autocomplete="one-time-code" maxlength="10">
      <p class="riga"><button class="pri" id="bv">Entra</button><button id="bi">Cambia email</button></p></div>
    <div id="am" class="msg" hidden></div></div>`;
  const m = (t) => { $("#am").hidden = !t; $("#am").textContent = t || ""; };
  $("#bc").onclick = async () => {
    const email = $("#em").value.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(email)) return m("Scrivi un'email valida.");
    $("#bc").disabled = true; m("");
    const r = await api("codice", { email });
    $("#bc").disabled = false;
    if (!r.ok) return m(r.msg || "Invio non riuscito");
    $("#emv").textContent = email; $("#p1").hidden = true; $("#p2").hidden = false; $("#cd").focus();
    m("Se l'email è autorizzata, il codice arriva entro un minuto.");
  };
  $("#bi").onclick = () => { $("#p1").hidden = false; $("#p2").hidden = true; m(""); };
  $("#bv").onclick = async () => {
    const token = $("#cd").value.replace(/\D/g, "");
    if (token.length < 6) return m("Scrivi il codice ricevuto per email.");
    $("#bv").disabled = true;
    const { error } = await sb.auth.verifyOtp({ email: $("#emv").textContent, token, type: "email" });
    $("#bv").disabled = false;
    if (error) return m("Codice non corretto o scaduto. Chiedine uno nuovo.");
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
