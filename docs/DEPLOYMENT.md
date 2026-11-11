# Deployment

Two processes: the signaling server and coturn. Neither is large.

## Sizing

Signaling is a handful of small JSON frames per session and an idle
WebSocket per device. A 1 vCPU / 512 MB instance comfortably handles
thousands of concurrent groups.

coturn only carries traffic for connections that cannot go peer-to-peer —
in practice 10–20% of sessions, mostly mobile data and carrier-grade NAT.
Budget roughly **0.5 GB per hour of relayed 540p video**, and remember it
is bandwidth, not CPU.

## 1. DNS and certificates

```
signal.example.org  A  <server ip>
turn.example.org    A  <server ip>
```

```bash
certbot certonly --standalone -d turn.example.org
```

coturn needs to read the certificate; the compose file mounts
`/etc/letsencrypt/live/turn.example.org` read-only.

## 2. Configure

```bash
cp server/.env.example server/.env
SECRET=$(openssl rand -base64 48)
sed -i "s|^TURN_SECRET=.*|TURN_SECRET=$SECRET|" server/.env
sed -i "s|^static-auth-secret=.*|static-auth-secret=$SECRET|" deploy/turnserver.conf
```

The two must match — the server derives per-session TURN credentials from
that secret and coturn verifies them.

Then edit `deploy/turnserver.conf`:

- set `realm` and `server-name` to your domain
- on a cloud VM with a private NIC, set `external-ip=<public>/<private>`,
  otherwise coturn advertises an unreachable relay address

## 3. Firewall

| Port | Protocol | Why |
|---|---|---|
| 443 | TCP | HTTPS + WebSocket (behind your proxy) |
| 3478 | UDP + TCP | TURN |
| 5349 | TCP | TURN over TLS, for restrictive networks |
| 49160–49200 | UDP | coturn relay range (`min-port`/`max-port`) |

The relay range is the one people forget. Without it, TURN allocates
successfully and then no media flows.

## 4. Run

```bash
cd deploy
docker compose up -d --build
docker compose logs -f signaling
curl https://signal.example.org/health
```

Put a TLS-terminating reverse proxy in front of the signaling container;
it binds to `127.0.0.1:8002` on purpose. Make sure the proxy forwards
WebSocket upgrades and sets `X-Forwarded-For`, or rate limiting will see
every client as the same address.

## 5. Verify TURN actually works

This is worth doing before you ship, because TURN failures only show up
on someone else's mobile network:

1. Open <https://icetest.info> or Trickle ICE.
2. Enter `turn:turn.example.org:3478` with credentials from
   `GET /health`-adjacent tooling, or read a pair out of the `HELLO_ACK`
   frame in the browser devtools.
3. You must see at least one candidate of type `relay`. If you only see
   `host` and `srflx`, the relay port range is closed.

## Updating

```bash
git pull
docker compose up -d --build
```

Old clients keep working as long as `PROTOCOL_VERSION` in
`shared/protocol.js` is unchanged. When it changes, clients show an
"update the app" message rather than failing in a confusing way — so bump
it only alongside a store release.

## Backups

There is nothing to back up. All state is in memory and intentionally
disposable: groups expire, no media is stored, no accounts exist. The only
thing worth protecting is `TURN_SECRET` and the Android signing key.
