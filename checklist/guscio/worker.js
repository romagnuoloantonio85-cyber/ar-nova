// Checklist Quadri FR - guscio v1 (Cloudflare Worker)
// Serve app.ardigitalmarketer.it/checklist/<codice> e /checklist/admin.
// La pagina è leggera: carica l'ultima versione dell'app da Supabase (funzione checklist-app).
// Contiene solo l'indirizzo del progetto e la chiave PUBBLICA (publishable): nessuna chiave segreta.
const SB_URL = "https://hlspvqhegnpavanyhkrt.supabase.co";
const SB_KEY = "sb_publishable_Tw96fsQ-Q5_RE2lLBU2zVg_aUCT7rUl";
const SUPABASE_JS = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js";

const icona = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="96" fill="#111"/><path d="M150 270l70 70 145-170" fill="none" stroke="#fff" stroke-width="48" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function pagina(slug, tipo) {
  const titolo = tipo === "admin" ? "Checklist Admin" : "Checklist Quadri";
  return `<!doctype html><html lang="it"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow">
<meta name="theme-color" content="#111111">
<meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="${titolo}">
<link rel="manifest" href="/checklist/${slug}/manifest.webmanifest">
<link rel="icon" href="/checklist/${slug}/icona.svg"><link rel="apple-touch-icon" href="/checklist/${slug}/icona.svg">
<title>${titolo}</title>
<style>body{margin:0;background:#f4f4f5;color:#111;font:16px -apple-system,Segoe UI,Roboto,Arial,sans-serif}@media (prefers-color-scheme:dark){body{background:#111;color:#f2f2f2}}#app{max-width:820px;margin:0 auto;padding:16px}</style>
<script src="${SUPABASE_JS}"></script>
</head><body><div id="app"><p>Caricamento…</p></div>
<script>
(async function () {
  window.CHK = { url: ${JSON.stringify(SB_URL)}, key: ${JSON.stringify(SB_KEY)}, slug: ${JSON.stringify(slug)}, pagina: ${JSON.stringify(tipo)} };
  var K = "chk-app-" + window.CHK.pagina, codice = null, ver = "";
  try {
    var r = await fetch(window.CHK.url + "/functions/v1/checklist-app?p=" + window.CHK.pagina + "&t=" + Date.now(), { cache: "no-store" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    codice = await r.text(); ver = r.headers.get("X-Checklist-Versione") || "";
    try { localStorage.setItem(K, JSON.stringify({ codice: codice, ver: ver })); } catch (e) {}
  } catch (e) {
    try { var c = JSON.parse(localStorage.getItem(K) || "null"); if (c) { codice = c.codice; ver = c.ver + " (copia sul telefono)"; } } catch (e2) {}
  }
  if (!codice || !window.supabase) { document.getElementById("app").innerHTML = "<p>Non riesco a caricare la pagina. Controlla la connessione e riprova.</p><p><button onclick='location.reload()'>Riprova</button></p>"; return; }
  window.CHK.versione = ver ? "v" + ver : "";
  var s = document.createElement("script");
  s.src = URL.createObjectURL(new Blob([codice], { type: "text/javascript" }));
  document.body.appendChild(s);
})();
</script></body></html>`;
}

export default {
  async fetch(req) {
    const u = new URL(req.url);
    const m = u.pathname.match(/^\/checklist\/([a-z0-9-]{2,40})\/?(manifest\.webmanifest|icona\.svg)?$/);
    if (!m) return new Response("Pagina non trovata", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    const slug = m[1], tipo = slug === "admin" ? "admin" : "cablatore";
    const sic = { "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "X-Frame-Options": "DENY" };
    if (m[2] === "icona.svg") return new Response(icona, { headers: { ...sic, "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=86400" } });
    if (m[2] === "manifest.webmanifest") {
      return new Response(JSON.stringify({
        name: tipo === "admin" ? "Checklist Quadri · Admin" : "Checklist Quadri FR", short_name: tipo === "admin" ? "Checklist Admin" : "Checklist",
        start_url: `/checklist/${slug}`, scope: `/checklist/${slug}`, display: "standalone", background_color: "#f4f4f5", theme_color: "#111111",
        icons: [{ src: `/checklist/${slug}/icona.svg`, sizes: "any", type: "image/svg+xml", purpose: "any" }],
      }), { headers: { ...sic, "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" } });
    }
    return new Response(pagina(slug, tipo), { headers: { ...sic, "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" } });
  },
};
