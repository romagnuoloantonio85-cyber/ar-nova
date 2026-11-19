#!/bin/sh
# Costruisce i pacchetti delle pagine: parte comune + pagina, in una funzione chiusa
cd "$(dirname "$0")"
for p in cablatore admin; do
  { echo "(function(){'use strict';"; cat common.js; cat "$p.js"; echo "})();"; } > "dist-$p.js"
done
