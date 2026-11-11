#!/usr/bin/env bash
# Publica hooks, migrations e a configuração do servidor no VPS e reinicia
# o PocketBase. O PocketBase padrão só lê hooks *.pb.js; o Skip lia *.js,
# por isso os hooks sobem com o sufixo trocado (como no harness dos testes).
# Uso: deploy/servidor/publicar.sh [usuario@host] [chave-ssh]
set -euo pipefail

HOST="${1:-root@187.127.52.64}"
KEY="${2:-$HOME/.ssh/newway_hostinger_ed25519}"
DEST=/docker/gestaoneway
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SSH=(ssh -i "$KEY" -o BatchMode=yes "$HOST")

stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT
mkdir -p "$stage/pb_hooks" "$stage/pb_migrations"
for f in "$ROOT"/pocketbase/hooks/*.js; do
  cp "$f" "$stage/pb_hooks/$(basename "${f%.js}").pb.js"
done
cp "$ROOT"/pocketbase/migrations/*.js "$stage/pb_migrations/"
cp "$ROOT"/deploy/servidor/Dockerfile "$ROOT"/deploy/servidor/docker-compose.yml "$stage/"
[ -f "$ROOT/deploy/servidor/Caddyfile" ] && cp "$ROOT/deploy/servidor/Caddyfile" "$stage/"

# Hooks e migrations são trocados por inteiro: arquivo apagado no
# repositório também sai do servidor. Só o conteúdo das pastas é apagado:
# o contêiner monta as próprias pastas, e uma pasta recriada ficaria fora
# dele. pb_data nunca é tocado aqui.
tar -C "$stage" -cf - . | "${SSH[@]}" "
  set -e
  mkdir -p $DEST/pb_data $DEST/pb_hooks $DEST/pb_migrations
  find $DEST/pb_hooks $DEST/pb_migrations -mindepth 1 -delete
  tar -C $DEST --no-same-owner -xf -
  chown root:root $DEST
  chown -R 10001:10001 $DEST/pb_data
  cd $DEST && docker compose up -d --build && docker compose restart pocketbase
"
"${SSH[@]}" "cd $DEST && docker compose ps && docker compose logs --tail=20 pocketbase"
