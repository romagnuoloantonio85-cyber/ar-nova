-- Checklist Quadri FR - v1 - schema, tabelle, sicurezza
-- Tutto nello schema "checklist" (+ funzioni di controllo in "checklist_priv", non esposto).

create schema if not exists checklist;
create schema if not exists checklist_priv;
revoke all on schema checklist from public, anon;
revoke all on schema checklist_priv from public, anon;
grant usage on schema checklist to authenticated, service_role;
grant usage on schema checklist_priv to authenticated, service_role;

-- ───────────────────────── tabelle ─────────────────────────
create table checklist.cablatori (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  nome text not null,
  tipo text not null default 'cablatore' check (tipo in ('cablatore','cantiere')),
  attivo boolean not null default true,
  foglio_id text,
  foglio_scheda text not null default 'Piano consegne',
  colonne jsonb not null default '{"cliente":"CLIENTE","linea":"LINEA","commessa":"COMMESSA","descrizione":"DESCRIZIONE","tipologia":"Tipologia fornitura","data_collaudo":"Data consegna cliente"}',
  filtro_valore text not null default 'Fornitura da effettuare',
  ultimo_sync_il timestamptz,
  ultimo_sync_esito text,
  creato_il timestamptz not null default now()
);

create table checklist.utenti (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(trim(email)) and email ~ '^[^@\s]+@[^@\s]+\.[a-z]{2,}$'),
  user_id uuid unique references auth.users(id) on delete set null,
  ruolo text not null check (ruolo in ('admin','cablatore')),
  cablatore_id uuid references checklist.cablatori(id) on delete cascade,
  nome text,
  attivo boolean not null default true,
  creato_il timestamptz not null default now(),
  check (ruolo = 'admin' or cablatore_id is not null)
);

create table checklist.gruppi (
  id uuid primary key default gen_random_uuid(),
  cablatore_id uuid not null references checklist.cablatori(id) on delete cascade,
  nome text not null check (length(trim(nome)) > 0),
  ordine int not null default 0,
  creato_il timestamptz not null default now()
);

create table checklist.voci (
  id uuid primary key default gen_random_uuid(),
  gruppo_id uuid not null references checklist.gruppi(id) on delete cascade,
  testo text not null check (length(trim(testo)) > 0),
  ordine int not null default 0,
  creato_il timestamptz not null default now()
);

create table checklist.quadri (
  id uuid primary key default gen_random_uuid(),
  cablatore_id uuid not null references checklist.cablatori(id) on delete cascade,
  chiave text not null,
  cliente text not null default '',
  linea text not null default '',
  commessa text not null default '',
  descrizione text not null default '',
  data_collaudo date,
  data_testo text,
  data_valida boolean not null default true,
  riga int,
  attivo boolean not null default true,
  aggiornato_il timestamptz not null default now(),
  unique (cablatore_id, chiave)
);

create table checklist.checklist (
  id uuid primary key default gen_random_uuid(),
  cablatore_id uuid not null references checklist.cablatori(id),
  quadro_id uuid not null references checklist.quadri(id),
  cliente text not null default '',
  linea text not null default '',
  commessa text not null default '',
  descrizione text not null default '',
  stato text not null default 'in_corso' check (stato in ('in_corso','inviata','annullata')),
  compilato_da text not null default '' check (length(compilato_da) <= 120),
  note text not null default '' check (length(note) <= 5000),
  risposte jsonb not null default '{}'::jsonb,
  voci_snapshot jsonb,
  creato_da uuid default auth.uid(),
  creato_il timestamptz not null default now(),
  aggiornato_il timestamptz not null default now(),
  inviata_il timestamptz,
  annullata_il timestamptz,
  mail_stato text check (mail_stato in ('in_invio','inviata','errore')),
  mail_errore text,
  mail_destinatari text[]
);
create unique index checklist_un_in_corso_per_quadro on checklist.checklist(quadro_id) where stato = 'in_corso';
create index on checklist.checklist(cablatore_id, stato);
create index on checklist.checklist(quadro_id);

create table checklist.foto (
  id uuid primary key default gen_random_uuid(),
  checklist_id uuid not null references checklist.checklist(id) on delete cascade,
  cablatore_id uuid not null references checklist.cablatori(id),
  tipo text not null check (tipo in ('interna','esterna')),
  percorso text not null unique,
  byte int,
  creato_il timestamptz not null default now()
);
create index on checklist.foto(checklist_id);

create table checklist.ruoli (
  id uuid primary key default gen_random_uuid(),
  linea text not null unique check (length(trim(linea)) > 0),
  email text[] not null default '{}',
  creato_il timestamptz not null default now()
);

create table checklist.impostazioni (
  chiave text primary key,
  valore jsonb not null,
  pubblica boolean not null default false,
  aggiornato_il timestamptz not null default now()
);

create table checklist.avvisi (
  id uuid primary key default gen_random_uuid(),
  chiave text not null unique,
  tipo text not null check (tipo in ('colonna_mancante','data_non_valida','mail_non_partita','lettura_foglio','altro')),
  cablatore_id uuid references checklist.cablatori(id) on delete cascade,
  messaggio text not null,
  dettagli jsonb,
  creato_il timestamptz not null default now(),
  ultimo_il timestamptz not null default now(),
  risolto_il timestamptz,
  mail_inviata boolean not null default false
);

-- solo per il server (nessuna regola => nessun accesso dalle pagine)
create table checklist.segreti (chiave text primary key, valore text not null);
create table checklist.eventi (
  id bigint generated always as identity primary key,
  tipo text not null, chiave text, creato_il timestamptz not null default now()
);
create index on checklist.eventi(tipo, chiave, creato_il);

-- versioni delle pagine (sistema a guscio)
create table checklist.app_versioni (
  id bigint generated always as identity primary key,
  pagina text not null check (pagina in ('cablatore','admin')),
  versione int not null,
  codice text not null,
  pubblicata boolean not null default false,
  note text,
  creato_il timestamptz not null default now(),
  unique (pagina, versione)
);

-- ───────────────────── funzioni di controllo ─────────────────────
-- sessione aperta con codice via email (non con password di altre app)
create or replace function checklist_priv.sessione_ok() returns boolean
language sql stable security invoker set search_path = '' as $$
  select coalesce((
    select bool_or(a->>'method' in ('otp','magiclink','email/signup'))
    from jsonb_array_elements(coalesce(auth.jwt()->'amr','[]'::jsonb)) a), false)
$$;

create or replace function checklist_priv.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select checklist_priv.sessione_ok() and exists (
    select 1 from checklist.utenti u
    where u.user_id = auth.uid() and u.ruolo = 'admin' and u.attivo)
$$;

create or replace function checklist_priv.mio_cablatore() returns uuid
language sql stable security definer set search_path = '' as $$
  select u.cablatore_id from checklist.utenti u
  join checklist.cablatori c on c.id = u.cablatore_id and c.attivo
  where checklist_priv.sessione_ok() and u.user_id = auth.uid() and u.ruolo = 'cablatore' and u.attivo
  limit 1
$$;

revoke all on function checklist_priv.sessione_ok() from public, anon;
revoke all on function checklist_priv.is_admin() from public, anon;
revoke all on function checklist_priv.mio_cablatore() from public, anon;
grant execute on function checklist_priv.sessione_ok() to authenticated, service_role;
grant execute on function checklist_priv.is_admin() to authenticated, service_role;
grant execute on function checklist_priv.mio_cablatore() to authenticated, service_role;

-- orologio del server (le pagine non usano l'ora del telefono)
create or replace function checklist.ora_server() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('adesso', now(), 'oggi', (now() at time zone 'Europe/Rome')::date)
$$;
revoke all on function checklist.ora_server() from public, anon;
grant execute on function checklist.ora_server() to authenticated, service_role;

-- ───────────────────── trigger ─────────────────────
create or replace function checklist_priv.tr_checklist() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare q record;
begin
  if tg_op = 'INSERT' then
    select * into q from checklist.quadri where id = new.quadro_id;
    if not found or q.cablatore_id <> new.cablatore_id then
      raise exception 'Quadro non valido';
    end if;
    new.cliente := q.cliente; new.linea := q.linea; new.commessa := q.commessa; new.descrizione := q.descrizione;
    new.stato := 'in_corso'; new.inviata_il := null; new.voci_snapshot := null;
    new.creato_il := now(); new.aggiornato_il := now();
    return new;
  end if;
  if old.stato <> 'in_corso' and auth.role() is distinct from 'service_role' then
    raise exception 'Checklist non modificabile (%)', old.stato;
  end if;
  if new.stato = 'inviata' and old.stato <> 'inviata' then new.inviata_il := now(); end if;
  if new.stato = 'annullata' and old.stato <> 'annullata' then new.annullata_il := now(); end if;
  new.aggiornato_il := now();
  return new;
end $$;
create trigger tr_checklist before insert or update on checklist.checklist
  for each row execute function checklist_priv.tr_checklist();

create or replace function checklist_priv.tr_aggiornato() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin new.aggiornato_il := now(); return new; end $$;
create trigger tr_aggiornato before update on checklist.impostazioni
  for each row execute function checklist_priv.tr_aggiornato();

revoke all on function checklist_priv.tr_checklist() from public, anon;
revoke all on function checklist_priv.tr_aggiornato() from public, anon;
grant execute on function checklist_priv.tr_checklist() to authenticated, service_role;
grant execute on function checklist_priv.tr_aggiornato() to authenticated, service_role;

-- ───────────────────── permessi e RLS ─────────────────────
revoke all on all tables in schema checklist from public, anon, authenticated;
grant all on all tables in schema checklist to service_role;
grant usage, select on all sequences in schema checklist to service_role;

alter table checklist.cablatori enable row level security;
alter table checklist.utenti enable row level security;
alter table checklist.gruppi enable row level security;
alter table checklist.voci enable row level security;
alter table checklist.quadri enable row level security;
alter table checklist.checklist enable row level security;
alter table checklist.foto enable row level security;
alter table checklist.ruoli enable row level security;
alter table checklist.impostazioni enable row level security;
alter table checklist.avvisi enable row level security;
alter table checklist.segreti enable row level security;
alter table checklist.eventi enable row level security;
alter table checklist.app_versioni enable row level security;

-- cablatori
grant select, insert, update, delete on checklist.cablatori to authenticated;
create policy cab_leggi on checklist.cablatori for select to authenticated
  using (checklist_priv.is_admin() or id = checklist_priv.mio_cablatore());
create policy cab_admin_ins on checklist.cablatori for insert to authenticated with check (checklist_priv.is_admin());
create policy cab_admin_upd on checklist.cablatori for update to authenticated using (checklist_priv.is_admin()) with check (checklist_priv.is_admin());
create policy cab_admin_del on checklist.cablatori for delete to authenticated using (checklist_priv.is_admin());

-- utenti
grant select, insert, delete on checklist.utenti to authenticated;
grant update (ruolo, cablatore_id, nome, attivo) on checklist.utenti to authenticated;
create policy ut_leggi on checklist.utenti for select to authenticated
  using (user_id = (select auth.uid()) or checklist_priv.is_admin());
create policy ut_admin_ins on checklist.utenti for insert to authenticated with check (checklist_priv.is_admin() and user_id is null);
create policy ut_admin_upd on checklist.utenti for update to authenticated using (checklist_priv.is_admin()) with check (checklist_priv.is_admin());
create policy ut_admin_del on checklist.utenti for delete to authenticated using (checklist_priv.is_admin() and user_id is distinct from (select auth.uid()));

-- gruppi e voci
grant select, insert, update, delete on checklist.gruppi, checklist.voci to authenticated;
create policy gr_leggi on checklist.gruppi for select to authenticated
  using (checklist_priv.is_admin() or cablatore_id = checklist_priv.mio_cablatore());
create policy gr_admin_ins on checklist.gruppi for insert to authenticated with check (checklist_priv.is_admin());
create policy gr_admin_upd on checklist.gruppi for update to authenticated using (checklist_priv.is_admin()) with check (checklist_priv.is_admin());
create policy gr_admin_del on checklist.gruppi for delete to authenticated using (checklist_priv.is_admin());
create policy vo_leggi on checklist.voci for select to authenticated
  using (checklist_priv.is_admin() or exists (select 1 from checklist.gruppi g where g.id = gruppo_id and g.cablatore_id = checklist_priv.mio_cablatore()));
create policy vo_admin_ins on checklist.voci for insert to authenticated with check (checklist_priv.is_admin());
create policy vo_admin_upd on checklist.voci for update to authenticated using (checklist_priv.is_admin()) with check (checklist_priv.is_admin());
create policy vo_admin_del on checklist.voci for delete to authenticated using (checklist_priv.is_admin());

-- quadri: scrive solo il server (lettura del foglio)
grant select on checklist.quadri to authenticated;
create policy qu_leggi on checklist.quadri for select to authenticated
  using (checklist_priv.is_admin() or cablatore_id = checklist_priv.mio_cablatore());

-- checklist
grant select on checklist.checklist to authenticated;
grant insert (cablatore_id, quadro_id, compilato_da, note, risposte) on checklist.checklist to authenticated;
grant update (compilato_da, note, risposte, stato) on checklist.checklist to authenticated;
create policy ch_leggi on checklist.checklist for select to authenticated
  using (checklist_priv.is_admin() or cablatore_id = checklist_priv.mio_cablatore());
create policy ch_cab_ins on checklist.checklist for insert to authenticated
  with check (cablatore_id = checklist_priv.mio_cablatore());
create policy ch_cab_upd on checklist.checklist for update to authenticated
  using (cablatore_id = checklist_priv.mio_cablatore() and stato = 'in_corso')
  with check (cablatore_id = checklist_priv.mio_cablatore() and stato in ('in_corso','annullata'));
create policy ch_admin_upd on checklist.checklist for update to authenticated
  using (checklist_priv.is_admin() and stato = 'in_corso')
  with check (checklist_priv.is_admin() and stato in ('in_corso','annullata'));

-- foto
grant select, insert, delete on checklist.foto to authenticated;
create policy fo_leggi on checklist.foto for select to authenticated
  using (checklist_priv.is_admin() or cablatore_id = checklist_priv.mio_cablatore());
create policy fo_cab_ins on checklist.foto for insert to authenticated
  with check (cablatore_id = checklist_priv.mio_cablatore()
    and percorso like cablatore_id::text || '/' || checklist_id::text || '/%'
    and exists (select 1 from checklist.checklist c where c.id = checklist_id and c.cablatore_id = checklist_priv.mio_cablatore() and c.stato = 'in_corso'));
create policy fo_cab_del on checklist.foto for delete to authenticated
  using (cablatore_id = checklist_priv.mio_cablatore()
    and exists (select 1 from checklist.checklist c where c.id = checklist_id and c.stato = 'in_corso'));

-- ruoli
grant select, insert, update, delete on checklist.ruoli to authenticated;
create policy ru_admin_sel on checklist.ruoli for select to authenticated using (checklist_priv.is_admin());
create policy ru_admin_ins on checklist.ruoli for insert to authenticated with check (checklist_priv.is_admin());
create policy ru_admin_upd on checklist.ruoli for update to authenticated using (checklist_priv.is_admin()) with check (checklist_priv.is_admin());
create policy ru_admin_del on checklist.ruoli for delete to authenticated using (checklist_priv.is_admin());

-- impostazioni
grant select, insert, update on checklist.impostazioni to authenticated;
create policy im_leggi on checklist.impostazioni for select to authenticated
  using (checklist_priv.is_admin() or (pubblica and checklist_priv.mio_cablatore() is not null));
create policy im_admin_ins on checklist.impostazioni for insert to authenticated with check (checklist_priv.is_admin());
create policy im_admin_upd on checklist.impostazioni for update to authenticated using (checklist_priv.is_admin()) with check (checklist_priv.is_admin());

-- avvisi
grant select on checklist.avvisi to authenticated;
grant update (risolto_il) on checklist.avvisi to authenticated;
create policy av_admin_sel on checklist.avvisi for select to authenticated using (checklist_priv.is_admin());
create policy av_admin_upd on checklist.avvisi for update to authenticated using (checklist_priv.is_admin()) with check (checklist_priv.is_admin());

-- app_versioni: l'admin vede lo storico; il codice viene servito dalla funzione checklist-app
grant select on checklist.app_versioni to authenticated;
create policy ap_admin_sel on checklist.app_versioni for select to authenticated using (checklist_priv.is_admin());

-- segreti, eventi: nessuna regola (solo server)

-- ───────────────────── storage ─────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('checklist-foto', 'checklist-foto', false, 3145728, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy "checklist foto leggi" on storage.objects for select to authenticated
  using (bucket_id = 'checklist-foto' and (checklist_priv.is_admin()
    or (storage.foldername(name))[1] = checklist_priv.mio_cablatore()::text));
create policy "checklist foto carica" on storage.objects for insert to authenticated
  with check (bucket_id = 'checklist-foto'
    and (storage.foldername(name))[1] = checklist_priv.mio_cablatore()::text
    and exists (select 1 from checklist.checklist c
      where c.id::text = (storage.foldername(name))[2] and c.cablatore_id = checklist_priv.mio_cablatore() and c.stato = 'in_corso'));
create policy "checklist foto togli" on storage.objects for delete to authenticated
  using (bucket_id = 'checklist-foto'
    and (storage.foldername(name))[1] = checklist_priv.mio_cablatore()::text
    and exists (select 1 from checklist.checklist c
      where c.id::text = (storage.foldername(name))[2] and c.cablatore_id = checklist_priv.mio_cablatore() and c.stato = 'in_corso'));
