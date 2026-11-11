#!/bin/sh
# Liga as cópias na nuvem (Cloudflare R2 ou outro S3). Pergunta as chaves no
# terminal, grava em /docker/gestaoneway/backup.env (só o root lê), testa o
# acesso e liga a cópia em tempo real (Litestream) e o envio das cópias de
# hora em hora. As chaves só existem no VPS.
# No VPS: /usr/local/bin/gestaoneway-nuvem. Uso, do computador do dono:
#   ssh -t -i $HOME\.ssh\newway_hostinger_ed25519 root@187.127.52.64 gestaoneway-nuvem
set -eu
DEST=/docker/gestaoneway
ENVF=$DEST/backup.env
RCLONE=rclone/rclone:1.68.2
clean() { printf '%s' "$1" | tr -d '[:space:]'; }

echo 'Cópias na nuvem do sistema de gestão New Way'
echo
printf 'Endereço S3 (https://....r2.cloudflarestorage.com): '
read -r EP
printf 'Nome do bucket [newway-gestao-backup]: '
read -r BK
printf 'Access Key ID: '
read -r AK
printf 'Secret Access Key (ao colar, nada aparece na tela; é normal): '
stty -echo 2>/dev/null || true
read -r SK
stty echo 2>/dev/null || true
echo
EP=$(clean "$EP")
BK=$(clean "${BK:-newway-gestao-backup}")
AK=$(clean "$AK")
SK=$(clean "$SK")
if [ -z "$EP" ] || [ -z "$AK" ] || [ -z "$SK" ]; then
  echo 'Faltou alguma informação. Nada foi alterado; rode de novo.'
  exit 1
fi

umask 077
printf 'NUVEM_ENDPOINT=%s\nNUVEM_BUCKET=%s\nNUVEM_ACCESS_KEY_ID=%s\nNUVEM_SECRET_ACCESS_KEY=%s\n' \
  "$EP" "$BK" "$AK" "$SK" >"$ENVF.novo"

echo 'Testando o acesso ao bucket...'
if ! RCLONE_S3_PROVIDER=Other RCLONE_S3_ENDPOINT="$EP" RCLONE_S3_ACCESS_KEY_ID="$AK" \
  RCLONE_S3_SECRET_ACCESS_KEY="$SK" RCLONE_S3_NO_CHECK_BUCKET=true \
  docker run --rm -e RCLONE_S3_PROVIDER -e RCLONE_S3_ENDPOINT -e RCLONE_S3_ACCESS_KEY_ID \
  -e RCLONE_S3_SECRET_ACCESS_KEY -e RCLONE_S3_NO_CHECK_BUCKET \
  "$RCLONE" touch ":s3:$BK/teste-de-acesso.txt" >/dev/null 2>&1; then
  rm -f "$ENVF.novo"
  echo 'Não consegui gravar no bucket. Confira o endereço, o nome e as chaves e rode de novo.'
  echo 'Nada foi alterado.'
  exit 1
fi
mv "$ENVF.novo" "$ENVF"

cd "$DEST"
docker compose --profile nuvem up -d litestream
/usr/local/bin/gestaoneway-backup.sh hora
echo
echo 'Pronto! A cópia em tempo real e a cópia de hora em hora já estão indo para a nuvem.'
