# Bun 1.1's own image is Debian 11, whose update servers were retired (apt gets 404s).
# Same bun program, on Debian 12 (bookworm), which still gets updates.
FROM oven/bun:1.1 AS bun
FROM debian:bookworm-slim
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
RUN ln -s /usr/local/bin/bun /usr/local/bin/bunx
# Programs the backend runs: ffmpeg (videos/audio), tesseract (OCR), pdftoppm (scanned PDF pages)
# Programs the backend runs:
#   ffmpeg (videos/audio), tesseract (OCR), pdftoppm (scanned PDF pages)
#   backups (scripts/backup.sh): restic, pg_dumpall 16 (same version as the postgres container),
#   sqlite3 (Vaultwarden copy), jq (status file), tzdata (BACKUP_TIME in your time zone)
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg tesseract-ocr tesseract-ocr-eng poppler-utils \
      ca-certificates curl bzip2 jq sqlite3 tzdata \
    && install -d /usr/share/postgresql-common/pgdg \
    && curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc \
    && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt $(. /etc/os-release && echo $VERSION_CODENAME)-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
    && apt-get update && apt-get install -y --no-install-recommends postgresql-client-16 \
    && curl -fsSL -o /tmp/restic.bz2 https://github.com/restic/restic/releases/download/v0.18.1/restic_0.18.1_linux_amd64.bz2 \
    && echo "680838f19d67151adba227e1570cdd8af12c19cf1735783ed1ba928bc41f363d  /tmp/restic.bz2" | sha256sum -c - \
    && bunzip2 /tmp/restic.bz2 && install -m 755 /tmp/restic /usr/local/bin/restic && rm -f /tmp/restic && restic version \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY package.json ./
RUN bun install

COPY . .

EXPOSE 3000
CMD ["bun", "run", "start:dev"]
