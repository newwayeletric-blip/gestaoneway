# PocketBase do sistema de gestão, na mesma versão do servidor do Skip
# (0.40.4). O binário oficial é conferido pelo SHA256 do checksums.txt da
# release antes de entrar na imagem. Roda sem root.
FROM alpine:3.20

ARG PB_VERSION=0.40.4
ARG PB_SHA256=9042ec818570e79c3628dadcd0a756c1496d9e1173918ec409d133c02f82e5fa

RUN apk add --no-cache ca-certificates unzip \
  && wget -q -O /tmp/pb.zip "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip" \
  && echo "${PB_SHA256}  /tmp/pb.zip" | sha256sum -c - \
  && unzip -q /tmp/pb.zip pocketbase -d /usr/local/bin \
  && rm /tmp/pb.zip \
  && apk del unzip \
  && addgroup -S -g 10001 pb \
  && adduser -S -D -H -u 10001 -G pb pb

USER pb
EXPOSE 8090

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8090/api/health || exit 1

CMD ["/usr/local/bin/pocketbase", "serve", "--http=0.0.0.0:8090", "--dir=/pb/pb_data", "--hooksDir=/pb/pb_hooks", "--migrationsDir=/pb/pb_migrations"]
