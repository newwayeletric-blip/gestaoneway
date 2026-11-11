#!/bin/sh
# Cópia diária do banco do sistema de gestão (pb_data), feita com o
# servidor ligado (sqlite .backup é seguro com o banco em uso). Guarda 14 dias.
# No VPS: /usr/local/bin/gestaoneway-backup.sh, com o cron
#   /etc/cron.d/gestaoneway-backup:
#   30 6 * * * root /usr/local/bin/gestaoneway-backup.sh >/var/log/gestaoneway-backup.log 2>&1
# (06:30 UTC = 03:30 em Brasília). Precisa do pacote sqlite3.
set -eu
D=/docker/gestaoneway/pb_data
OUT=/root/backups/gestaoneway
mkdir -p "$OUT"; chmod 700 "$OUT"
TS=$(date -u +%Y%m%d-%H%M)
TMP=$(mktemp -d)
trap "rm -rf $TMP" EXIT
sqlite3 "$D/data.db" ".backup $TMP/data.db"
[ -f "$D/auxiliary.db" ] && sqlite3 "$D/auxiliary.db" ".backup $TMP/auxiliary.db"
[ -d "$D/storage" ] && cp -a "$D/storage" "$TMP/storage"
tar -C "$TMP" -czf "$OUT/gestaoneway-$TS.tar.gz" .
chmod 600 "$OUT/gestaoneway-$TS.tar.gz"
find "$OUT" -name "gestaoneway-*.tar.gz" -mtime +14 -delete
