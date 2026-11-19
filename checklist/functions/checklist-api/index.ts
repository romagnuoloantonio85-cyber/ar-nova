// checklist-api - v1
// Azioni: codice (accesso con email e codice), invia, riprova_mail, sync (lettura foglio Google)
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const VERSIONE = "v1";
const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND = Deno.env.get("RESEND_API_KEY") || "";
const GOOGLE_SA = Deno.env.get("GOOGLE_SA_JSON") || "";
const db = createClient(SB_URL, SR, { db: { schema: "checklist" }, auth: { persistSession: false } });
const authc = createClient(SB_URL, SR, { auth: { persistSession: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-checklist-cron",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const emailOk = (e: string) => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(e);

async function sha256(s: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function imp(chiave: string, def: any) {
  const { data } = await db.from("impostazioni").select("valore").eq("chiave", chiave).maybeSingle();
  return data ? data.valore : def;
}

// ───────────── mail ─────────────
async function invia(to: string[], subject: string, html: string, opz: { cc?: string[]; allegati?: any[] } = {}): Promise<string> {
  if (!RESEND) throw new Error("RESEND_API_KEY mancante");
  const from = await imp("mittente", "Checklist Quadri FR <notifiche@ardigitalmarketer.it>");
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, html, ...(opz.cc?.length ? { cc: opz.cc } : {}), ...(opz.allegati?.length ? { attachments: opz.allegati } : {}) }),
  });
  if (!r.ok) {
    const t = await r.text();
    console.error("mail non partita", subject.slice(0, 60), t.slice(0, 300));
    throw new Error("Resend " + r.status + ": " + t.slice(0, 300));
  }
  const j = await r.json().catch(() => ({}));
  return String(j?.id || "");
}

const box = (titolo: string, inner: string) => `<div style="background:#f3f4f6;padding:20px 10px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<div style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #d1d5db;border-radius:10px;padding:22px 20px;color:#111827">
<div style="font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;font-weight:700">Checklist Quadri FR · Note &amp; Test Report</div>
<h1 style="font-size:20px;margin:6px 0 14px">${titolo}</h1>${inner}</div></div>`;

async function avviso(chiave: string, tipo: string, messaggio: string, cablatore_id: string | null, dettagli: any = null, mail = false) {
  const { data: es } = await db.from("avvisi").select("*").eq("chiave", chiave).maybeSingle();
  const ora = new Date().toISOString();
  let daMandare = false;
  if (!es) {
    await db.from("avvisi").insert({ chiave, tipo, messaggio, cablatore_id, dettagli });
    daMandare = mail;
  } else {
    const riaperto = !!es.risolto_il;
    await db.from("avvisi").update({ messaggio, dettagli, ultimo_il: ora, risolto_il: null, ...(riaperto ? { mail_inviata: false } : {}) }).eq("id", es.id);
    daMandare = mail && (riaperto || !es.mail_inviata);
  }
  if (daMandare) {
    try {
      const a = await imp("mail_avvisi", "antonio@ardigitalmarketer.it");
      await invia([a], `Checklist Quadri: ${messaggio}`.slice(0, 150), box("Avviso", `<p style="font-size:15px;line-height:1.5">${esc(messaggio)}</p>
        <p style="font-size:13px;color:#6b7280">Nessun dato è stato modificato. Controlla la pagina admin: app.ardigitalmarketer.it/checklist/admin</p>`));
      await db.from("avvisi").update({ mail_inviata: true }).eq("chiave", chiave);
    } catch (e) { console.error("mail avviso", (e as Error).message); }
  }
}
async function risolvi(prefisso: string, tranne: string[] = []) {
  const { data } = await db.from("avvisi").select("id, chiave").like("chiave", prefisso + "%").is("risolto_il", null);
  const ids = (data || []).filter((a: any) => !tranne.includes(a.chiave)).map((a: any) => a.id);
  if (ids.length) await db.from("avvisi").update({ risolto_il: new Date().toISOString() }).in("id", ids);
}

// ───────────── chi chiama ─────────────
function datiToken(t: string): any {
  try { const p = t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"); return JSON.parse(atob(p + "=".repeat((4 - p.length % 4) % 4))); } catch (_) { return {}; }
}
async function chi(req: Request) {
  const tok = (req.headers.get("Authorization") || "").replace("Bearer ", "");
  if (!tok) return null;
  const { data } = await authc.auth.getUser(tok);
  if (!data.user) return null;
  const amr = (datiToken(tok).amr || []) as any[];
  if (!amr.some((a) => ["otp", "magiclink", "email/signup"].includes(a?.method))) return null;
  const { data: u } = await db.from("utenti").select("*").eq("user_id", data.user.id).eq("attivo", true).maybeSingle();
  return u || null;
}
async function troppi(tipo: string, chiave: string, minuti: number, max: number) {
  const da = new Date(Date.now() - minuti * 60e3).toISOString();
  const { count } = await db.from("eventi").select("id", { count: "exact", head: true }).eq("tipo", tipo).eq("chiave", chiave).gte("creato_il", da);
  return (count ?? 0) >= max;
}

// ───────────── Google Sheets ─────────────
function b64url(b: ArrayBuffer | Uint8Array | string) {
  const bytes = typeof b === "string" ? new TextEncoder().encode(b) : new Uint8Array(b as ArrayBuffer);
  let s = ""; for (const x of bytes) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function tokenGoogle(): Promise<string> {
  if (!GOOGLE_SA) throw new Error("Segreto GOOGLE_SA_JSON mancante: account di servizio non configurato");
  const sa = JSON.parse(GOOGLE_SA);
  const pem = String(sa.private_key).replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const ora = Math.floor(Date.now() / 1000);
  const corpo = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(JSON.stringify({
    iss: sa.client_email, scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
    aud: "https://oauth2.googleapis.com/token", iat: ora, exp: ora + 3600,
  }))}`;
  const firma = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(corpo));
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${corpo}.${b64url(firma)}` }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error("Accesso Google non riuscito: " + (j.error_description || j.error || r.status));
  return j.access_token;
}
const norm = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();
const normK = (s: unknown) => norm(s).toLowerCase();

// data del foglio -> {data: 'YYYY-MM-DD' | null, valida}
function leggiData(v: unknown): { data: string | null; valida: boolean; testo: string } {
  const testo = norm(v);
  if (testo === "") return { data: null, valida: true, testo };
  let y = 0, m = 0, d = 0;
  if (typeof v === "number") {
    const ms = Date.UTC(1899, 11, 30) + Math.round(v) * 864e5;
    const x = new Date(ms); y = x.getUTCFullYear(); m = x.getUTCMonth() + 1; d = x.getUTCDate();
  } else {
    let r = testo.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2}|\d{4})$/);
    if (r) { d = +r[1]; m = +r[2]; y = +r[3]; if (y < 100) y += 2000; }
    else if ((r = testo.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) { y = +r[1]; m = +r[2]; d = +r[3]; }
    else return { data: null, valida: false, testo };
  }
  const x = new Date(Date.UTC(y, m - 1, d));
  if (x.getUTCFullYear() !== y || x.getUTCMonth() !== m - 1 || x.getUTCDate() !== d || y < 2000 || y > 2100) return { data: null, valida: false, testo };
  return { data: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`, valida: true, testo };
}

const CAMPI: Record<string, string> = { cliente: "Cliente", linea: "Linea", commessa: "Commessa", descrizione: "Descrizione", tipologia: "Tipologia fornitura", data_collaudo: "Data collaudo" };

async function syncCablatore(c: any) {
  const pre = `cab:${c.id}:`;
  const fine = async (esito: string) => { await db.from("cablatori").update({ ultimo_sync_il: new Date().toISOString(), ultimo_sync_esito: esito }).eq("id", c.id); return esito; };
  if (!c.foglio_id) return await fine("Nessun foglio impostato");
  let valori: any[][];
  try {
    const tk = await tokenGoogle();
    const rng = encodeURIComponent(`'${String(c.foglio_scheda).replace(/'/g, "''")}'`);
    const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(c.foglio_id)}/values/${rng}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`, { headers: { Authorization: `Bearer ${tk}` } });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error?.message || `errore ${r.status}`);
    valori = j.values || [];
  } catch (e) {
    const msg = `${c.nome}: non riesco a leggere il foglio (${(e as Error).message})`;
    await avviso(`${pre}lettura`, "lettura_foglio", msg, c.id, null, true);
    return await fine("Errore: " + (e as Error).message);
  }
  await risolvi(`${pre}lettura`);

  const intest = (valori[0] || []).map(normK);
  const idx: Record<string, number> = {};
  const mancanti: string[] = [];
  for (const campo of Object.keys(CAMPI)) {
    const nome = normK(c.colonne?.[campo]);
    const i = nome ? intest.indexOf(nome) : -1;
    if (i < 0) mancanti.push(campo); else idx[campo] = i;
  }
  if (mancanti.length) {
    for (const campo of mancanti) {
      const nome = c.colonne?.[campo] || "(non impostata)";
      await avviso(`${pre}colonna:${campo}`, "colonna_mancante", `${c.nome}: colonna "${nome}" (${CAMPI[campo]}) non trovata nella scheda "${c.foglio_scheda}"`, c.id, { campo, nome }, true);
    }
    await risolvi(`${pre}colonna:`, mancanti.map((m) => `${pre}colonna:${m}`));
    return await fine(`Colonne mancanti: ${mancanti.map((m) => c.colonne?.[m] || m).join(", ")}. Nessun dato aggiornato.`);
  }
  await risolvi(`${pre}colonna:`);

  const filtro = normK(c.filtro_valore);
  const mappa = new Map<string, any>();
  for (let r = 1; r < valori.length; r++) {
    const riga = valori[r] || [];
    if (normK(riga[idx.tipologia]) !== filtro) continue;
    const cliente = norm(riga[idx.cliente]), commessa = norm(riga[idx.commessa]), descrizione = norm(riga[idx.descrizione]);
    if (!commessa && !descrizione) continue;
    const chiave = [cliente, commessa, descrizione].map(normK).join("|");
    if (mappa.has(chiave)) continue;
    const dt = leggiData(riga[idx.data_collaudo]);
    mappa.set(chiave, {
      cablatore_id: c.id, chiave, cliente, commessa, descrizione, linea: norm(riga[idx.linea]),
      data_collaudo: dt.data, data_testo: dt.testo || null, data_valida: dt.valida, riga: r + 1, attivo: true,
      aggiornato_il: new Date().toISOString(),
    });
  }
  const righe = [...mappa.values()];
  for (let i = 0; i < righe.length; i += 500) {
    const { error } = await db.from("quadri").upsert(righe.slice(i, i + 500), { onConflict: "cablatore_id,chiave" });
    if (error) throw error;
  }
  const { data: esistenti } = await db.from("quadri").select("id, chiave").eq("cablatore_id", c.id).eq("attivo", true);
  const vecchi = (esistenti || []).filter((q: any) => !mappa.has(q.chiave)).map((q: any) => q.id);
  for (let i = 0; i < vecchi.length; i += 200) await db.from("quadri").update({ attivo: false }).in("id", vecchi.slice(i, i + 200));

  const invalide = righe.filter((q) => !q.data_valida);
  const chiaviInv: string[] = [];
  for (const q of invalide) {
    const k = `${pre}data:${q.chiave}`; chiaviInv.push(k);
    await avviso(k, "data_non_valida", `${c.nome}: data non valida "${q.data_testo}" per ${q.commessa} · ${q.descrizione} (riga ${q.riga})`, c.id, { riga: q.riga, testo: q.data_testo });
  }
  await risolvi(`${pre}data:`, chiaviInv);
  return await fine(`OK: ${righe.length} quadri da fornire${invalide.length ? `, ${invalide.length} con data non valida` : ""}`);
}

// ───────────── report ─────────────
function dataOra(iso: string) {
  return new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", dateStyle: "full", timeStyle: "short" }).format(new Date(iso));
}
async function mandaReport(ch: any) {
  const { data: cab } = await db.from("cablatori").select("nome").eq("id", ch.cablatore_id).single();
  const { data: ru } = await db.from("ruoli").select("linea, email");
  const linea = normK(ch.linea);
  const dest = new Set<string>();
  for (const r of ru || []) if (normK(r.linea) === linea) for (const e of r.email || []) if (emailOk(String(e).toLowerCase())) dest.add(String(e).toLowerCase());
  const copia: string[] = ((await imp("mail_copia", [])) as string[]).map((e) => String(e).toLowerCase()).filter(emailOk);
  let to = [...dest];
  let cc = copia.filter((e) => !dest.has(e));
  let senzaRuolo = false;
  if (!to.length) { senzaRuolo = true; to = cc.length ? cc : []; cc = []; }
  if (!to.length) throw new Error("Nessun destinatario: aggiungi la linea in Ruoli o una mail in copia");

  const snap = ch.voci_snapshot || { gruppi: [] };
  const righe = (snap.gruppi || []).map((g: any) => `
    <tr><td colspan="2" style="padding:10px 6px 4px;font-weight:700;font-size:14px;border-bottom:1px solid #d1d5db">${esc(g.nome)}</td></tr>
    ${(g.voci || []).map((v: any) => `<tr><td style="padding:5px 6px;font-size:14px;border-bottom:1px solid #f3f4f6">${esc(v.testo)}</td>
      <td style="padding:5px 6px;font-size:14px;white-space:nowrap;border-bottom:1px solid #f3f4f6;font-weight:600">${v.esito === "ok" ? "OK" : "Non applicabile"}</td></tr>`).join("")}`).join("");

  const { data: foto } = await db.from("foto").select("*").eq("checklist_id", ch.id).order("creato_il");
  const allegati: any[] = [];
  let n = { interna: 0, esterna: 0 } as Record<string, number>;
  for (const f of foto || []) {
    const { data: blob } = await db.storage.from("checklist-foto").download(f.percorso);
    if (!blob) continue;
    n[f.tipo]++;
    const buf = new Uint8Array(await blob.arrayBuffer());
    let s = ""; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    allegati.push({ filename: `${f.tipo}-${n[f.tipo]}.jpg`, content: btoa(s) });
  }
  const info = (k: string, v: string) => `<tr><td style="padding:3px 10px 3px 0;color:#6b7280;font-size:14px;white-space:nowrap">${k}</td><td style="padding:3px 0;font-size:14px;font-weight:600">${esc(v)}</td></tr>`;
  const html = box(`${esc(ch.commessa)} · ${esc(ch.descrizione)}`, `
    ${senzaRuolo ? `<p style="font-size:13px;border:1px solid #9ca3af;padding:8px;border-radius:6px">Attenzione: nessun responsabile impostato in Ruoli per la linea "${esc(ch.linea || "(vuota)")}". Mail inviata solo alle persone in copia.</p>` : ""}
    <table style="border-collapse:collapse;margin-bottom:12px">
      ${info("Cablatore", cab?.nome || "")}${info("Cliente", ch.cliente || "-")}${info("Linea", ch.linea || "-")}
      ${info("Commessa", ch.commessa)}${info("Descrizione", ch.descrizione)}${info("Compilato da", ch.compilato_da)}
      ${info("Inviata il", dataOra(ch.inviata_il))}${info("Stato", "Inviata")}
    </table>
    <table style="border-collapse:collapse;width:100%">${righe}</table>
    <h2 style="font-size:15px;margin:16px 0 6px">Note</h2>
    <p style="font-size:14px;white-space:pre-wrap;margin:0">${esc(ch.note || "Nessuna nota")}</p>
    <p style="font-size:13px;color:#6b7280;margin-top:16px">Foto allegate: ${n.interna} interne, ${n.esterna} esterne.</p>`);
  await invia(to, `Note & Test Report · ${ch.commessa} · ${ch.descrizione}`.slice(0, 180), html, { cc, allegati });
  return [...to, ...cc];
}

async function inviaMailEStato(ch: any) {
  await db.from("checklist").update({ mail_stato: "in_invio", mail_errore: null }).eq("id", ch.id);
  try {
    const dest = await mandaReport(ch);
    await db.from("checklist").update({ mail_stato: "inviata", mail_destinatari: dest, mail_errore: null }).eq("id", ch.id);
    await risolvi(`mail:${ch.id}`);
    return { mail: true };
  } catch (e) {
    const m = (e as Error).message;
    await db.from("checklist").update({ mail_stato: "errore", mail_errore: m.slice(0, 500) }).eq("id", ch.id);
    await avviso(`mail:${ch.id}`, "mail_non_partita", `Mail del report non partita: ${ch.commessa} · ${ch.descrizione} (${m.slice(0, 160)})`, ch.cablatore_id, { checklist_id: ch.id });
    return { mail: false, errore: m };
  }
}

// ───────────── server ─────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const b = await req.json().catch(() => ({}));

    if (b.azione === "versione") return json({ ok: true, versione: VERSIONE });

    // invio del codice di accesso: solo alle email autorizzate, risposta uguale per tutti
    if (b.azione === "codice") {
      const email = String(b.email || "").trim().toLowerCase().slice(0, 120);
      if (!emailOk(email)) return json({ ok: false, msg: "Email non valida" }, 400);
      if (await troppi("codice", email, 60, 5)) return json({ ok: false, msg: "Troppe richieste: riprova tra un'ora o usa l'ultimo codice ricevuto." }, 429);
      await db.from("eventi").insert({ tipo: "codice", chiave: email });
      const { data: u } = await db.from("utenti").select("*").eq("email", email).eq("attivo", true).maybeSingle();
      if (!u) return json({ ok: true });
      const cu = await authc.auth.admin.createUser({ email, email_confirm: true });
      if (cu.error && !/already|registered|exists/i.test(cu.error.message)) throw cu.error;
      const gl = await authc.auth.admin.generateLink({ type: "magiclink", email });
      if (gl.error) throw gl.error;
      const otp = String(gl.data.properties?.email_otp || "");
      if (gl.data.user && u.user_id !== gl.data.user.id) await db.from("utenti").update({ user_id: gl.data.user.id }).eq("id", u.id);
      await invia([email], `${otp} è il tuo codice per la Checklist Quadri`, box("Codice di accesso", `
        <p style="font-size:15px">Scrivi questo codice nella pagina della checklist:</p>
        <p style="font-size:30px;letter-spacing:.2em;font-weight:800;margin:10px 0 16px">${esc(otp)}</p>
        <p style="font-size:13px;color:#6b7280">Il codice vale per poco tempo e si usa una volta sola. Se non l'hai chiesto tu, ignora questa email.</p>`));
      return json({ ok: true });
    }

    // lettura del foglio: dal richiamo automatico (chiave) o dall'admin (pulsante "Aggiorna ora")
    if (b.azione === "sync") {
      const k = req.headers.get("x-checklist-cron") || "";
      let ok = false;
      if (k) {
        const { data: s } = await db.from("segreti").select("valore").eq("chiave", "cron_key_sha256").maybeSingle();
        ok = !!s && (await sha256(k)) === s.valore;
      } else {
        const u = await chi(req);
        ok = u?.ruolo === "admin";
      }
      if (!ok) return json({ ok: false, msg: "Non autorizzato" }, 403);
      let q = db.from("cablatori").select("*").eq("attivo", true);
      if (b.cablatore_id) q = q.eq("id", b.cablatore_id);
      const { data: cabs } = await q;
      const esiti: Record<string, string> = {};
      for (const c of cabs || []) {
        try { esiti[c.nome] = await syncCablatore(c); }
        catch (e) { esiti[c.nome] = "Errore: " + (e as Error).message; console.error("sync", c.slug, (e as Error).message); }
      }
      return json({ ok: true, esiti });
    }

    const u = await chi(req);
    if (!u) return json({ ok: false, msg: "Accesso scaduto: entra di nuovo con email e codice." }, 401);

    if (b.azione === "invia") {
      const { data: ch } = await db.from("checklist").select("*").eq("id", String(b.id || "")).maybeSingle();
      if (!ch || (u.ruolo !== "admin" && ch.cablatore_id !== u.cablatore_id)) return json({ ok: false, msg: "Checklist non trovata" }, 404);
      if (ch.stato !== "in_corso") return json({ ok: false, msg: `Questa checklist è già ${ch.stato === "inviata" ? "Inviata" : "Annullata"}.` }, 409);
      const errori: string[] = [];
      if (!norm(ch.compilato_da)) errori.push("Scrivi chi ha compilato");
      const { data: gruppi } = await db.from("gruppi").select("id, nome, ordine, voci(id, testo, ordine)").eq("cablatore_id", ch.cablatore_id).order("ordine");
      const gs = (gruppi || []).map((g: any) => ({ ...g, voci: (g.voci || []).sort((a: any, c: any) => a.ordine - c.ordine) })).filter((g: any) => g.voci.length);
      const tutte = gs.flatMap((g: any) => g.voci);
      if (!tutte.length) errori.push("La checklist non ha ancora voci: avvisa l'amministratore");
      const risp = ch.risposte || {};
      const senza = tutte.filter((v: any) => !["ok", "na"].includes(risp[v.id]));
      if (senza.length) errori.push(senza.length === 1 ? "Manca 1 voce da segnare" : `Mancano ${senza.length} voci da segnare`);
      const { data: foto } = await db.from("foto").select("tipo").eq("checklist_id", ch.id);
      if (!(foto || []).some((f: any) => f.tipo === "interna")) errori.push("Serve almeno una foto interna");
      if (!(foto || []).some((f: any) => f.tipo === "esterna")) errori.push("Serve almeno una foto esterna");
      if (errori.length) return json({ ok: false, msg: errori.join(". "), errori }, 400);
      const snapshot = {
        versione: VERSIONE,
        gruppi: gs.map((g: any) => ({ id: g.id, nome: g.nome, voci: g.voci.map((v: any) => ({ id: v.id, testo: v.testo, esito: risp[v.id] })) })),
      };
      const { data: agg, error } = await db.from("checklist").update({ stato: "inviata", voci_snapshot: snapshot }).eq("id", ch.id).eq("stato", "in_corso").select("*").maybeSingle();
      if (error) throw error;
      if (!agg) return json({ ok: false, msg: "Questa checklist è già stata inviata." }, 409);
      const esito = await inviaMailEStato(agg);
      return json({ ok: true, inviata_il: agg.inviata_il, ...esito });
    }

    if (b.azione === "riprova_mail") {
      if (u.ruolo !== "admin") return json({ ok: false, msg: "Non autorizzato" }, 403);
      const { data: ch } = await db.from("checklist").select("*").eq("id", String(b.id || "")).maybeSingle();
      if (!ch || ch.stato !== "inviata") return json({ ok: false, msg: "Checklist non inviata" }, 400);
      return json({ ok: true, ...(await inviaMailEStato(ch)) });
    }

    return json({ ok: false, msg: "Azione sconosciuta" }, 400);
  } catch (e) {
    console.error("errore", (e as Error).message);
    return json({ ok: false, msg: "Errore del server: " + String((e as Error).message || e).slice(0, 300) }, 500);
  }
});
