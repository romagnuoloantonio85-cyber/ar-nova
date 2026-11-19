-- Checklist Quadri FR - pubblicazione di una versione delle pagine (esempio v1, commit 5b73170)
-- Per una nuova versione: cambiare commit e numero di versione. La pagina più alta con pubblicata=true è quella servita.
with base as (select 'https://raw.githubusercontent.com/romagnuoloantonio85-cyber/ar-nova/5b73170/checklist/app/' u),
f as (select
  (select content from extensions.http_get((select u from base)||'common.js')) c,
  (select content from extensions.http_get((select u from base)||'cablatore.js')) cab,
  (select content from extensions.http_get((select u from base)||'admin.js')) adm)
insert into checklist.app_versioni (pagina, versione, codice, pubblicata, note)
select 'cablatore', 1, E'(function(){''use strict'';\n' || c || cab || E'\n})();', true, 'v1 – commit 5b73170' from f
union all
select 'admin', 1, E'(function(){''use strict'';\n' || c || adm || E'\n})();', true, 'v1 – commit 5b73170' from f;
-- Tornare indietro: update checklist.app_versioni set pubblicata=false where pagina='cablatore' and versione=N;
