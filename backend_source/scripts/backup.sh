#!/bin/bash
# ============================================================
# HServer backup — one run. The backend starts it (BackupsService):
# every night at BACKUP_TIME, and when you press "Back up now" in the app.
# ============================================================
# Each run:
#   1. dump Postgres (all databases: mindmap, keycloak, …) and Vaultwarden
#   2. restic backup of /srv/hserverdir-data + the dumps + .env
#      → to the backup folder on the other disk (REPO_DRIVE); REPO_CLOUD optional
#   3. keep the last 3 runs + 7 daily, 4 weekly, 6 monthly copies, delete older ones
#   4. restore test: read the Postgres dump back out of the new backup
#   5. Sundays: check part of the stored data can still be read
# Progress and results go to $STATUS_DIR/status.json (the app's 💾 Backups tab).
# Usage: bash backup.sh [manual|scheduled]
# Everything is encrypted with RESTIC_PASSWORD — without it the backups can't be opened.
# ============================================================
set -uo pipefail

DATA_DIR=${DATA_DIR:-/data}
DUMP_DIR=${DUMP_DIR:-/backup-work/dumps}
ENV_DIR=${ENV_DIR:-/env}
STATUS_DIR=${STATUS_DIR:-/backup-work/status}
VAULTWARDEN_DB=${VAULTWARDEN_DB:-/vaultwarden/db.sqlite3}
EXCLUDES=${EXCLUDES:-/app/scripts/backup-excludes.txt}
BACKUP_TIME=${BACKUP_TIME:-03:30}
KEEP_LAST=${KEEP_LAST:-3}          # the last few runs, even on the same day ("Back up now" before a big change)
KEEP_DAILY=${KEEP_DAILY:-7}
KEEP_WEEKLY=${KEEP_WEEKLY:-4}
KEEP_MONTHLY=${KEEP_MONTHLY:-6}
INCLUDE_TORRENTS=${INCLUDE_TORRENTS:-no}
REPO_DRIVE=${REPO_DRIVE:-}
DRIVE_MARK=${DRIVE_MARK:-/drive/.hserver-backup-drive}
REPO_CLOUD=${REPO_CLOUD:-}
HOST_TAG=hserver

mkdir -p "$STATUS_DIR" "$DUMP_DIR"
STATE="$STATUS_DIR/state.json"
LOG="$STATUS_DIR/backup.log"
[ -s "$STATE" ] || echo '{}' > "$STATE"

log() { echo "$(date '+%F %T') $*" | tee -a "$LOG" >&2; }
now() { date -Iseconds; }

# Merge a jq expression into the state file and rewrite status.json (what the app shows)
state() {
  local tmp="$STATE.tmp"
  jq "$@" "$STATE" > "$tmp" && mv "$tmp" "$STATE"
  jq --arg next "$(date -d "@$NEXT" -Iseconds 2>/dev/null || echo '')" \
     --arg time "$BACKUP_TIME" --arg torrents "$INCLUDE_TORRENTS" \
     --argjson keep "{\"last\":$KEEP_LAST,\"daily\":$KEEP_DAILY,\"weekly\":$KEEP_WEEKLY,\"monthly\":$KEEP_MONTHLY}" \
     '. + {nextRun: $next, schedule: $time, includeTorrents: ($torrents == "yes"), keep: $keep, updatedAt: (now | todate)}' \
     "$STATE" > "$STATUS_DIR/status.json.tmp" && mv "$STATUS_DIR/status.json.tmp" "$STATUS_DIR/status.json"
}

next_run() {
  local t
  t=$(date -d "today $BACKUP_TIME" +%s)
  [ "$t" -le "$(date +%s)" ] && t=$(date -d "tomorrow $BACKUP_TIME" +%s)
  echo "$t"
}

# ------------------------------------------------------------
# 1. DUMPS
# ------------------------------------------------------------
dump_postgres() {
  [ -n "${PGHOST:-}" ] || { echo "skipped"; return; }
  if pg_dumpall --clean --if-exists 2>>"$LOG" | gzip > "$DUMP_DIR/postgres.sql.gz.tmp" && gzip -t "$DUMP_DIR/postgres.sql.gz.tmp" \
     && zcat "$DUMP_DIR/postgres.sql.gz.tmp" | tail -c 4096 | grep -q "PostgreSQL database cluster dump complete"; then
    mv "$DUMP_DIR/postgres.sql.gz.tmp" "$DUMP_DIR/postgres.sql.gz"
    echo "ok"
  else
    rm -f "$DUMP_DIR/postgres.sql.gz.tmp"
    echo "failed"
  fi
}

dump_vaultwarden() {
  [ -f "$VAULTWARDEN_DB" ] || { echo "skipped"; return; }
  rm -f "$DUMP_DIR/vaultwarden.sqlite3.tmp"
  if sqlite3 "$VAULTWARDEN_DB" ".backup '$DUMP_DIR/vaultwarden.sqlite3.tmp'" 2>>"$LOG"; then
    mv "$DUMP_DIR/vaultwarden.sqlite3.tmp" "$DUMP_DIR/vaultwarden.sqlite3"
    echo "ok"
  else
    echo "failed"
  fi
}

# ------------------------------------------------------------
# 2–5. ONE REPOSITORY
# ------------------------------------------------------------
backup_repo() {   # name label repo
  local name=$1 label=$2 repo=$3 err="" added=0 files=0 snap="" verified=false checked=null code
  state --arg n "$name" '.phase = "Backing up to " + $n'
  log "[$name] start ($repo)"

  if [ "$name" = "drive" ] && [ ! -f "$DRIVE_MARK" ]; then
    err="Backup drive is not plugged in or not mounted (no $(basename "$DRIVE_MARK") file on it)"
  fi

  # First run: create the repository
  if [ -z "$err" ] && ! restic -r "$repo" cat config >/dev/null 2>>"$LOG"; then
    log "[$name] creating repository"
    restic -r "$repo" init >>"$LOG" 2>&1 || err="Could not open or create the backup repository (wrong password or settings? see backup.log)"
  fi

  if [ -z "$err" ]; then
    # a backup that was cut off (container restarted) leaves a stale lock behind
    restic -r "$repo" unlock >>"$LOG" 2>&1
    local extra=()
    [ "$INCLUDE_TORRENTS" = "yes" ] || extra+=(--exclude "$DATA_DIR/cloud_data/torrents")
    local paths=("$DATA_DIR" "$DUMP_DIR")
    [ -d "$ENV_DIR" ] && paths+=("$ENV_DIR")
    local out="$STATUS_DIR/last-$name.json"
    restic -r "$repo" backup --json --host "$HOST_TAG" --tag hserver \
      --exclude-file <(tr -d '\r' < "$EXCLUDES" | sed "s#^/data#$DATA_DIR#") "${extra[@]}" "${paths[@]}" > "$out" 2>>"$LOG"
    code=$?
    # 0 = ok, 3 = some files couldn't be read (the rest is saved), anything else = failed
    if [ $code -eq 0 ] || [ $code -eq 3 ]; then
      local summary
      summary=$(jq -c 'select(.message_type == "summary")' "$out" | tail -1)
      snap=$(jq -r '.snapshot_id // ""' <<<"$summary" | cut -c1-8)
      added=$(jq -r '.data_added // 0' <<<"$summary")
      files=$(jq -r '.total_files_processed // 0' <<<"$summary")
      [ $code -eq 3 ] && err="Saved, but some files couldn't be read (see backup.log)"
      log "[$name] snapshot $snap, $files files, $added bytes new"

      restic -r "$repo" forget --host "$HOST_TAG" --keep-last "$KEEP_LAST" --keep-daily "$KEEP_DAILY" --keep-weekly "$KEEP_WEEKLY" \
        --keep-monthly "$KEEP_MONTHLY" --prune >>"$LOG" 2>&1 || log "[$name] cleaning up old copies failed"

      # Restore test: read the database dump back out of the new snapshot
      if [ -f "$DUMP_DIR/postgres.sql.gz" ]; then
        if restic -r "$repo" dump "$snap" "$DUMP_DIR/postgres.sql.gz" 2>>"$LOG" | zcat 2>/dev/null | tail -c 4096 \
           | grep -q "PostgreSQL database cluster dump complete"; then
          verified=true
        else
          err="${err:+$err; }Restore test failed: the database dump could not be read back"
        fi
      else
        verified=true
      fi

      # Sundays: read back a sample of the stored data
      if [ "$(date +%u)" = "7" ]; then
        if restic -r "$repo" check --read-data-subset=5% >>"$LOG" 2>&1; then checked=true; else checked=false; err="${err:+$err; }Data check found problems (see backup.log)"; fi
      fi
    else
      err="Backup failed (restic exit $code, see backup.log)"
    fi
  fi

  local snaps='null' size=0
  # (skipped when the repository can't be read, e.g. drive unplugged — the last known list is kept)
  if { [ "$name" != "drive" ] || [ -f "$DRIVE_MARK" ]; } && restic -r "$repo" cat config >/dev/null 2>&1; then
    snaps=$(restic -r "$repo" snapshots --json --host "$HOST_TAG" 2>>"$LOG" \
      | jq -c '[.[] | {id: .short_id, time, files: (.summary.total_files_processed // null), size: (.summary.total_bytes_processed // null), added: (.summary.data_added // null)}] | sort_by(.time) | reverse | .[:40]' 2>/dev/null || echo 'null')
    [ -n "$snaps" ] || snaps='null'
    size=$(restic -r "$repo" stats --mode raw-data --json 2>>"$LOG" | jq -r '.total_size // 0' 2>/dev/null || echo 0)
  fi

  local ok=false
  # ok = a snapshot was saved and the restore test passed (a "some files unreadable" note stays as a warning)
  [ -n "$snap" ] && [ "$verified" = true ] && [ "$checked" != false ] && ok=true
  state --arg n "$name" --arg label "$label" --arg repo "$repo" --arg err "$err" --arg snap "$snap" \
        --argjson ok "$ok" --argjson added "${added:-0}" --argjson files "${files:-0}" --argjson verified "$verified" \
        --argjson checked "$checked" --argjson snaps "$snaps" --argjson size "${size:-0}" --arg t "$(now)" '
    .repos[$n] = ((.repos[$n] // {}) + {
      name: $n, label: $label, target: $repo, ok: $ok, error: (if $err == "" then null else $err end),
      lastRun: $t, snapshot: (if $snap == "" then null else $snap end), added: $added, files: $files,
      verified: $verified
    } + (if $snaps != null then {snapshots: $snaps, repoSize: $size} else {} end) + (if $ok then {lastSuccess: $t} else {} end) + (if $checked != null then {lastCheck: $t, checkOk: $checked} else {} end))'
  log "[$name] done: ${err:-ok}"
  $ok
}

# ------------------------------------------------------------
# ONE RUN
# ------------------------------------------------------------
run_backup() {   # reason
  local reason=$1 started pg vw allok=true
  started=$(date +%s)
  log "=== backup ($reason) ==="
  state --arg t "$(now)" --arg r "$reason" '.running = true | .startedAt = $t | .reason = $r | .phase = "Saving the databases"'

  pg=$(dump_postgres)
  vw=$(dump_vaultwarden)
  log "dumps: postgres=$pg vaultwarden=$vw"
  state --arg pg "$pg" --arg vw "$vw" '.dumps = {postgres: $pg, vaultwarden: $vw}'
  [ "$pg" = "failed" ] && allok=false

  local any=false
  if [ -n "$REPO_DRIVE" ]; then any=true; backup_repo drive "Backup drive" "$REPO_DRIVE" || allok=false; fi
  if [ -n "$REPO_CLOUD" ]; then any=true; backup_repo cloud "Cloud" "$REPO_CLOUD" || allok=false; fi
  $any || allok=false

  local err=null
  $any || err='"No backup destination set (backup drive or BACKUP_B2_REPO in .env)"'
  [ "$pg" = "failed" ] && err='"The Postgres dump failed (see backup.log)"'
  if [ "$err" = null ] && [ "$allok" = false ]; then
    err=$(jq -c '[.repos[] | select(.ok | not) | .label + ": " + (.error // "failed")] | first // null' "$STATE")
  fi
  state --arg t "$(now)" --argjson ok "$allok" --argjson err "$err" --argjson secs "$(( $(date +%s) - started ))" \
    '.running = false | .phase = null | .finishedAt = $t | .ok = $ok | .error = $err | .duration = $secs | (if $ok then .lastSuccess = $t else . end)'
  log "=== finished: $([ "$allok" = true ] && echo ok || echo 'with problems') in $(( $(date +%s) - started ))s ==="
  # keep the log from growing forever
  tail -n 2000 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
}

# ------------------------------------------------------------
# MAIN
# ------------------------------------------------------------
NEXT=$(next_run)
if [ -z "${RESTIC_PASSWORD:-}" ]; then
  log "RESTIC_PASSWORD is not set — add it to .env and run: docker compose up -d backend_nest"
  state '.running = false | .phase = null | .ok = false | .error = "RESTIC_PASSWORD is not set in .env"'
  exit 1
fi
run_backup "${1:-manual}"