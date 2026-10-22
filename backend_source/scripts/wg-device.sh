#!/bin/bash
# ============================================================
# WireGuard devices on HServer's own WireGuard (wg-quick@wg0, 10.10.0.1)
# ============================================================
#   sudo bash wg-device.sh add phone      new device: key, address, QR code
#   sudo bash wg-device.sh remove phone   take a device off
#   sudo bash wg-device.sh list           devices this script made
#   sudo bash wg-device.sh qr phone       show a device's QR code again
#
# Each device gets a split-tunnel setup: only HServer (10.10.0.0/24) and
# Pi-hole (192.168.4.194) go through home — the app, files and ad-blocking
# DNS — everything else goes straight out.
# The app's 🏠 Remote access tab reads the devices from DEVICES_DIR
# (/srv/hserverdir-data/wireguard-devices) and their live status from
# STATUS_FILE, which a cron job refreshes every minute (see "status").
# Settings (optional): WG_IF (wg0), ENDPOINT (your DuckDNS name),
#   LAN_DNS (192.168.4.194), DEVICES_DIR, OWNER (the user Docker runs as)
# ============================================================
set -euo pipefail

WG_IF=${WG_IF:-wg0}
CONF=${CONF:-/etc/wireguard/$WG_IF.conf}
DEVICES_DIR=${DEVICES_DIR:-/srv/hserverdir-data/wireguard-devices}
STATUS_DIR=${STATUS_DIR:-/srv/hserverdir-data/wireguard-status}
LAN_DNS=${LAN_DNS:-192.168.4.194}
OWNER=${OWNER:-${SUDO_USER:-root}}
OWNER_HOME=$(getent passwd "$OWNER" | cut -d: -f6 || true)
ENV_FILE=${ENV_FILE:-$OWNER_HOME/hserverdir/.env}

die() { echo "✗ $*" >&2; exit 1; }
[ "$(id -u)" = 0 ] || die "run it with sudo"
command -v wg >/dev/null || die "wg not found (sudo apt install wireguard-tools)"
[ -f "$CONF" ] || die "$CONF not found"

endpoint() {
  local e=${ENDPOINT:-}
  [ -n "$e" ] || { [ -f "$ENV_FILE" ] && e=$(grep -m1 '^WIREGUARD_SERVER_URL=' "$ENV_FILE" | cut -d= -f2- | tr -d '"'"'"' \r'); } || true
  [ -n "$e" ] || die "set WIREGUARD_SERVER_URL in $ENV_FILE (your DuckDNS name) or run with ENDPOINT=yourname.duckdns.org"
  echo "${e%%:*}:$(wg show "$WG_IF" listen-port)"
}

valid_name() { [[ "$1" =~ ^[a-z0-9][a-z0-9_-]{0,30}$ ]] || die "device name: lowercase letters, numbers, - or _ (e.g. phone, worklaptop)"; }

# Lowest free 10.10.0.N (3–254): skips addresses already in the WireGuard config or live
free_ip() {
  local prefix used n
  prefix=$(ip -4 -o addr show "$WG_IF" | awk '{print $4}' | cut -d/ -f1 | cut -d. -f1-3)
  [ -n "$prefix" ] || prefix=10.10.0
  used=$( { grep -oE "$prefix\.[0-9]+" "$CONF" || true; wg show "$WG_IF" allowed-ips | grep -oE "$prefix\.[0-9]+" || true; ip -4 -o addr show "$WG_IF" | grep -oE "$prefix\.[0-9]+" || true; } | sort -u)
  for n in $(seq 3 254); do
    grep -qx "$prefix.$n" <<<"$used" || { echo "$prefix.$n"; return; }
  done
  die "no free addresses left"
}

fix_owner() { chown -R "$OWNER:$OWNER" "$@" 2>/dev/null || true; }

# A copy of the server's WireGuard settings where the nightly backup can reach it
backup_server_conf() {
  mkdir -p "$DEVICES_DIR/.server"
  cp -a "$(dirname "$CONF")"/. "$DEVICES_DIR/.server/"
  chmod 700 "$DEVICES_DIR/.server"; chmod 600 "$DEVICES_DIR/.server/"*
  fix_owner "$DEVICES_DIR/.server"
}

cmd_add() {
  local name=$1 dir key pub psk ip server_pub ep
  valid_name "$name"
  dir="$DEVICES_DIR/peer_$name"
  [ ! -e "$dir" ] || die "a device called $name already exists (remove it first)"
  grep -q "^# hserver-device: $name$" "$CONF" && die "$name is already in $CONF"
  command -v qrencode >/dev/null || die "qrencode not found (sudo apt install qrencode)"
  ep=$(endpoint)
  ip=$(free_ip)
  key=$(wg genkey); pub=$(wg pubkey <<<"$key"); psk=$(wg genpsk)
  server_pub=$(wg show "$WG_IF" public-key)

  # 1. the server side: live now + saved in wg0.conf for the next restart
  wg set "$WG_IF" peer "$pub" preshared-key <(echo "$psk") allowed-ips "$ip/32"
  {
    echo ""
    echo "# hserver-device: $name"
    echo "[Peer]"
    echo "PublicKey = $pub"
    echo "PresharedKey = $psk"
    echo "AllowedIPs = $ip/32"
    echo "# end hserver-device: $name"
  } >> "$CONF"

  # 2. the device side
  mkdir -p "$dir"
  cat > "$dir/peer_$name.conf" <<EOF
[Interface]
PrivateKey = $key
Address = $ip/32
DNS = $LAN_DNS

[Peer]
PublicKey = $server_pub
PresharedKey = $psk
Endpoint = $ep
AllowedIPs = 10.10.0.0/24, $LAN_DNS/32
PersistentKeepalive = 25
EOF
  echo "$pub" > "$dir/publickey-peer_$name"
  qrencode -t png -o "$dir/peer_$name.png" < "$dir/peer_$name.conf"
  chmod 700 "$dir"; chmod 600 "$dir"/*
  fix_owner "$DEVICES_DIR"
  backup_server_conf

  echo "✓ $name added as $ip (server: $ep)"
  echo "  Scan this with the WireGuard app (+ → Scan from QR code):"
  qrencode -t ansiutf8 < "$dir/peer_$name.conf"
  echo "  Laptop: import $dir/peer_$name.conf"
}

cmd_remove() {
  local name=$1 dir pub
  valid_name "$name"
  dir="$DEVICES_DIR/peer_$name"
  pub=$(cat "$dir/publickey-peer_$name" 2>/dev/null || sed -n "/^# hserver-device: $name$/,/^# end hserver-device: $name$/p" "$CONF" | awk -F' = ' '/^PublicKey/{print $2}')
  [ -n "$pub" ] || die "no device called $name"
  wg set "$WG_IF" peer "$pub" remove || true
  sed -i "/^# hserver-device: $name$/,/^# end hserver-device: $name$/d" "$CONF"
  rm -rf "$dir"
  backup_server_conf
  echo "✓ $name removed"
}

cmd_list() {
  local d n ip
  for d in "$DEVICES_DIR"/peer_*; do
    [ -d "$d" ] || continue
    n=${d##*/peer_}
    ip=$(awk -F' = ' '/^Address/{print $2}' "$d/peer_$n.conf" 2>/dev/null)
    echo "$n  $ip"
  done
  echo "(other peers in $CONF that weren't made by this script still work — they just show as \"device 10.10.0.x\" in the app)"
}

cmd_qr() {
  local name=$1
  valid_name "$name"
  [ -f "$DEVICES_DIR/peer_$name/peer_$name.conf" ] || die "no device called $name"
  qrencode -t ansiutf8 < "$DEVICES_DIR/peer_$name/peer_$name.conf"
}

# One-time: a cron job that writes `wg show` every minute for the app
cmd_status() {
  mkdir -p "$STATUS_DIR"; fix_owner "$STATUS_DIR"
  cat > /etc/cron.d/hserver-wg-status <<EOF
# HServer: WireGuard status for the app's Remote access tab (made by wg-device.sh)
* * * * * root wg show all dump > $STATUS_DIR/wg-status.tmp 2>/dev/null && chmod 644 $STATUS_DIR/wg-status.tmp && mv $STATUS_DIR/wg-status.tmp $STATUS_DIR/wg-status.txt
EOF
  chmod 644 /etc/cron.d/hserver-wg-status
  wg show all dump > "$STATUS_DIR/wg-status.txt"; chmod 644 "$STATUS_DIR/wg-status.txt"
  mkdir -p "$DEVICES_DIR"; fix_owner "$DEVICES_DIR"
  backup_server_conf
  echo "✓ status job installed (/etc/cron.d/hserver-wg-status) — the app updates every minute"
}

case "${1:-}" in
  add)    [ -n "${2:-}" ] || die "usage: sudo bash wg-device.sh add <name>"; cmd_add "$2" ;;
  remove) [ -n "${2:-}" ] || die "usage: sudo bash wg-device.sh remove <name>"; cmd_remove "$2" ;;
  list)   cmd_list ;;
  qr)     [ -n "${2:-}" ] || die "usage: sudo bash wg-device.sh qr <name>"; cmd_qr "$2" ;;
  status) cmd_status ;;
  *) echo "usage: sudo bash wg-device.sh add <name> | remove <name> | list | qr <name> | status"; exit 1 ;;
esac