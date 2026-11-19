-- Checklist Quadri FR - v1 - dati iniziali (applicato il 19/11/2026)
insert into checklist.cablatori (slug, nome, foglio_id, foglio_scheda)
values ('mannarini', 'Mannarini', '10NvJxKpjupHClky9qjAPjKEieeldT8vI7JZsMuDLjGw', 'Piano consegne');
insert into checklist.utenti (email, ruolo, nome) values ('antonio@ardigitalmarketer.it', 'admin', 'Antonio');
insert into checklist.impostazioni (chiave, valore, pubblica) values
 ('giorni_anticipo', '14', true),
 ('mail_copia', '["antonio@ardigitalmarketer.it"]', false),
 ('mail_avvisi', '"antonio@ardigitalmarketer.it"', false),
 ('mittente', '"Checklist Quadri FR <notifiche@ardigitalmarketer.it>"', false);
-- Ruoli importati dalla scheda "Ruoli" del foglio
insert into checklist.ruoli (linea, email) values
 ('VIPER 130', array['antonio.romagnuolo@hotmail.it']),
 ('R96', array['romagnuolo.antonio85@gmail.com']);
-- chiave del richiamo automatico: in chiaro solo nel Vault, nel database solo l'impronta SHA-256
do $$
declare k text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  perform vault.create_secret(k, 'checklist_cron_key', 'Chiave del richiamo automatico checklist-api (sync)');
  insert into checklist.segreti (chiave, valore) values ('cron_key_sha256', encode(extensions.digest(k, 'sha256'), 'hex'));
end $$;
