// checklist-app - v1
// Serve il codice dell'ultima versione pubblicata di una pagina (sistema a guscio).
// GET ?p=cablatore|admin            -> codice JavaScript
// GET ?p=cablatore|admin&info=1     -> { versione }
// Contiene solo codice dell'interfaccia: nessun dato e nessuna chiave.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  db: { schema: "checklist" }, auth: { persistSession: false },
});
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Expose-Headers": "X-Checklist-Versione" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const u = new URL(req.url);
  const p = u.searchParams.get("p");
  if (p !== "cablatore" && p !== "admin") return new Response("pagina sconosciuta", { status: 400, headers: CORS });
  const { data, error } = await db.from("app_versioni").select("versione, codice").eq("pagina", p).eq("pubblicata", true)
    .order("versione", { ascending: false }).limit(1).maybeSingle();
  if (error || !data) return new Response("versione non disponibile", { status: 503, headers: CORS });
  if (u.searchParams.get("info")) return new Response(JSON.stringify({ versione: data.versione }), { headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" } });
  return new Response(data.codice, {
    headers: { ...CORS, "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "no-store", "X-Checklist-Versione": String(data.versione) },
  });
});
