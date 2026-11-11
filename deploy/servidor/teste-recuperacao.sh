#!/bin/bash
# Testa a recuperação: restaura a última cópia de hora num PocketBase
# provisório, liga o Litestream contra um S3 provisório (rclone serve s3),
# grava uma marca, derruba tudo à força 2 s depois e restaura da "nuvem".
# Não toca no sistema de produção nem imprime credenciais. Uso, do PC:
#   ssh -i ~/.ssh/newway_hostinger_ed25519 root@187.127.52.64 bash -s < deploy/servidor/teste-recuperacao.sh
set -euo pipefail
T=$(mktemp -d /root/teste-nuvem-XXXX)
NET=nw-teste-nuvem
cleanup() {
  docker rm -f nw-minio nw-pb-teste nw-ls-teste >/dev/null 2>&1 || true
  docker network rm $NET >/dev/null 2>&1 || true
  rm -rf "$T"
}
trap cleanup EXIT

docker network create $NET >/dev/null
MU=teste$(openssl rand -hex 4)
MP=$(openssl rand -hex 16)
mkdir -p "$T/s3/teste"
docker run -d --name nw-minio --network $NET -v "$T/s3:/data" \
  rclone/rclone:1.68.2 serve s3 /data --addr :9000 --auth-key "$MU,$MP" >/dev/null
printf 'NUVEM_ENDPOINT=http://nw-minio:9000\nNUVEM_BUCKET=teste\nNUVEM_ACCESS_KEY_ID=%s\nNUVEM_SECRET_ACCESS_KEY=%s\n' "$MU" "$MP" >"$T/backup.env"
chmod 600 "$T/backup.env"

export RCLONE_S3_PROVIDER=Other RCLONE_S3_ENDPOINT=http://nw-minio:9000 RCLONE_S3_NO_CHECK_BUCKET=true \
  RCLONE_S3_ACCESS_KEY_ID=$MU RCLONE_S3_SECRET_ACCESS_KEY=$MP
rc() {
  docker run --rm --network $NET -e RCLONE_S3_PROVIDER -e RCLONE_S3_ENDPOINT -e RCLONE_S3_NO_CHECK_BUCKET \
    -e RCLONE_S3_ACCESS_KEY_ID -e RCLONE_S3_SECRET_ACCESS_KEY -v /root/backups/gestaoneway:/copias:ro \
    rclone/rclone:1.68.2 -q "$@"
}
for i in $(seq 1 20); do rc lsd :s3: 2>/dev/null | grep -q teste && break; sleep 1; done
echo "nuvem de teste: pronta"

F=$(ls -1t /root/backups/gestaoneway/hora/*.tar.gz | head -1)
mkdir -p "$T/pb_data"
tar -C "$T/pb_data" -xzf "$F"
chown -R 10001:10001 "$T/pb_data"
docker run -d --name nw-pb-teste --network $NET -p 127.0.0.1:8093:8090 -v "$T/pb_data:/pb/pb_data" \
  -v /docker/gestaoneway/pb_hooks:/pb/pb_hooks:ro -v /docker/gestaoneway/pb_migrations:/pb/pb_migrations:ro \
  gestaoneway-pocketbase >/dev/null
for i in $(seq 1 30); do curl -s -o /dev/null http://127.0.0.1:8093/api/health && break; sleep 1; done
echo "sistema provisório: $(curl -s http://127.0.0.1:8093/api/health)"

docker run -d --name nw-ls-teste --network $NET --user 10001:10001 --env-file "$T/backup.env" \
  -v "$T/pb_data:/pb_data" -v /docker/gestaoneway/litestream.yml:/etc/litestream.yml:ro \
  litestream/litestream:0.3.13 replicate -config /etc/litestream.yml >/dev/null
sleep 6

MARCA="venda-teste-$(date +%s)"
sqlite3 "$T/pb_data/data.db" "CREATE TABLE IF NOT EXISTS teste_restauracao(marca TEXT); INSERT INTO teste_restauracao VALUES ('$MARCA');"
echo "gravado: $MARCA"
sleep 2
docker kill nw-ls-teste nw-pb-teste >/dev/null
echo "pane simulada: sistema e cópia desligados à força 2 s depois"

docker run --rm --network $NET --env-file "$T/backup.env" -v /docker/gestaoneway/litestream.yml:/etc/litestream.yml:ro \
  -v "$T:/out" litestream/litestream:0.3.13 restore -config /etc/litestream.yml -o /out/restaurado.db /pb_data/data.db
echo "restaurado da nuvem: marca=$(sqlite3 -readonly "$T/restaurado.db" 'SELECT marca FROM teste_restauracao;') | usuários=$(sqlite3 -readonly "$T/restaurado.db" 'SELECT count(*) FROM users;') | lojas=$(sqlite3 -readonly "$T/restaurado.db" 'SELECT count(*) FROM stores;') | integridade=$(sqlite3 -readonly "$T/restaurado.db" 'PRAGMA integrity_check;')"

B=$(basename "$F")
rc copyto "/copias/hora/$B" ":s3:teste/copias/hora/$B"
rc delete ":s3:teste/copias/hora" --min-age 3d
echo "cópia de hora na nuvem: $(rc lsf :s3:teste/copias/hora/)"
