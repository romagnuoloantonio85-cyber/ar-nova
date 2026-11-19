-- Checklist Quadri FR - v1 - lettura del foglio ogni 15 minuti
select cron.schedule('checklist-sync-15min', '*/15 * * * *', $$
  select net.http_post(
    url := 'https://hlspvqhegnpavanyhkrt.supabase.co/functions/v1/checklist-api',
    headers := jsonb_build_object('Content-Type','application/json',
      'x-checklist-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'checklist_cron_key')),
    body := '{"azione":"sync"}'::jsonb,
    timeout_milliseconds := 60000)
$$);
