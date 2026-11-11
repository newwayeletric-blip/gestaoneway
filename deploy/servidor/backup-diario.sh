#!/bin/sh
# Cópias do banco do sistema de gestão (pb_data), feitas com o servidor
# ligado (sqlite .backup é seguro com o banco em uso). Cada cópia tem o banco
# inteiro e é conferida (integrity_check) antes de ser guardada.
#   hora: guarda as 48 últimas;  dia: as 30 últimas, e a do dia 1 vai também
#   para mes/, que guarda as 24 últimas.
# Com o backup.env (gestaoneway-nuvem), cada cópia também sobe para a nuvem,
# em copias/<tipo>/; lá, hora fica 3 dias, dia 45 dias e mes 800 dias.
# A limpeza é por quantidade, não por data: se as cópias pararem de sair,
# as últimas boas continuam lá.
# No VPS (instalado pelo publicar.sh): /usr/local/bin/gestaoneway-backup.sh,
# com /etc/cron.d/gestaoneway-backup:
#   15 * * * * root /usr/local/bin/gestaoneway-backup.sh hora >>/var/log/gestaoneway-backup.log 2>&1
#   30 6 * * * root /usr/local/bin/gestaoneway-backup.sh dia >>/var/log/gestaoneway-backup.log 2>&1
# (06:30 UTC = 03:30 em Brasília). Precisa do pacote sqlite3.
set -eu
TIPO=${1:-dia}
D=/docker/gestaoneway/pb_data
BASE=/root/backups/gestaoneway
OUT=$BASE/$TIPO
mkdir -p "$OUT"
chmod 700 "$BASE" "$OUT"
TS=$(date -u +%Y%m%d-%H%M)
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

sqlite3 "$D/data.db" ".backup $TMP/data.db"
if [ -f "$D/auxiliary.db" ]; then sqlite3 "$D/auxiliary.db" ".backup $TMP/auxiliary.db"; fi
if [ -d "$D/storage" ]; then cp -a "$D/storage" "$TMP/storage"; fi
if [ "$(sqlite3 "$TMP/data.db" 'PRAGMA integrity_check;')" != ok ]; then
  echo "$(date -u) cópia $TIPO com defeito: não foi guardada" >&2
  exit 1
fi

F="$OUT/gestaoneway-$TS.tar.gz"
tar -C "$TMP" -czf "$F" .
chmod 600 "$F"

keep() { ls -1t "$1"/gestaoneway-*.tar.gz | tail -n +"$(($2 + 1))" | xargs -r rm -f; }
case $TIPO in
  hora) keep "$OUT" 48 ;;
  dia)
    keep "$OUT" 30
    if [ "$(date -u +%d)" = 01 ]; then
      mkdir -p "$BASE/mes"
      cp "$F" "$BASE/mes/"
      keep "$BASE/mes" 24
    fi
    ;;
esac

ENVF=/docker/gestaoneway/backup.env
[ -f "$ENVF" ] || exit 0
set -a
. "$ENVF"
set +a
export RCLONE_S3_PROVIDER=Other RCLONE_S3_ENDPOINT="$NUVEM_ENDPOINT" RCLONE_S3_NO_CHECK_BUCKET=true \
  RCLONE_S3_ACCESS_KEY_ID="$NUVEM_ACCESS_KEY_ID" RCLONE_S3_SECRET_ACCESS_KEY="$NUVEM_SECRET_ACCESS_KEY"
rclone() {
  docker run --rm -e RCLONE_S3_PROVIDER -e RCLONE_S3_ENDPOINT -e RCLONE_S3_NO_CHECK_BUCKET \
    -e RCLONE_S3_ACCESS_KEY_ID -e RCLONE_S3_SECRET_ACCESS_KEY -v "$BASE":/copias:ro \
    rclone/rclone:1.68.2 -q "$@"
}
REMOTE=":s3:$NUVEM_BUCKET/copias"
up() { rclone copyto "/copias/$1/$(basename "$F")" "$REMOTE/$1/$(basename "$F")"; }
case $TIPO in
  hora) up hora && rclone delete "$REMOTE/hora" --min-age 3d ;;
  dia)
    up dia && rclone delete "$REMOTE/dia" --min-age 45d
    if [ "$(date -u +%d)" = 01 ]; then up mes && rclone delete "$REMOTE/mes" --min-age 800d; fi
    ;;
esac
