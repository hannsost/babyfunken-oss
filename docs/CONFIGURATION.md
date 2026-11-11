# Configuration

Nothing deployment-specific is compiled into the source. The server reads
the environment; the clients read their build config.

## Server (`server/.env`)

Start from `server/.env.example`.

| Variable | Default | Notes |
|---|---|---|
| `NODE_ENV` | `development` | `production` turns on the strict checks below. |
| `PORT` | `8002` | |
| `HOST` | `0.0.0.0` | |
| `ALLOWED_ORIGINS` | `*` in dev | Comma-separated exact origins. **Required in production**, and `*` is rejected there. |
| `TRUST_PROXY_HOPS` | `1` | Proxy hops in front of the process, so client IPs are right for rate limiting. |
| `TURN_SECRET` | — | Must equal `static-auth-secret` in `turnserver.conf`. **Required in production.** |
| `TURN_URLS` | — | Comma-separated TURN URLs. **Required in production.** |
| `TURN_TTL_SECONDS` | `43200` | Lifetime of a minted TURN credential. |
| `STUN_URLS` | Google STUN | Used for direct connections, which is the common case. |
| `RATE_LIMIT_JOIN_ATTEMPTS` | `10` | Failed joins per window before a block. |
| `RATE_LIMIT_JOIN_WINDOW_MS` | `60000` | |
| `RATE_LIMIT_CREATE_PER_HOUR` | `20` | Groups one address may create per hour. |
| `RATE_LIMIT_BLOCK_MS` | `900000` | How long a block lasts. |
| `SERVE_WEBAPP` | `true` | Serve `webapp/dist` from the same process. |

The server **refuses to start** in production without `ALLOWED_ORIGINS`,
`TURN_SECRET` and `TURN_URLS`. A baby monitor that comes up silently
misconfigured is worse than one that does not come up.

## Mobile (build time)

Set through `eas.json` per profile, read in `app.config.js`:

| Variable | Used for |
|---|---|
| `BABYFUNKEN_SERVER_URL` | Signaling server the app connects to. |
| `BABYFUNKEN_PRIVACY_URL` | Privacy policy link shown in the app and on the store listing. |
| `BABYFUNKEN_SUPPORT_EMAIL` | Support contact. |

Locally:

```bash
BABYFUNKEN_SERVER_URL=http://192.168.1.50:8002 npm run mobile
```

Note that a plain `http://` URL only works in a development build — the
release build forbids cleartext traffic.

## Webapp (build time)

| Variable | Default |
|---|---|
| `VITE_SERVER_URL` | The page's own origin, since the server serves the webapp. |

## Identity that must not change

These are fixed for the life of the app on the Play Store:

- **Package id**: `de.babyfunken.app`
- **Deep link scheme**: `babyfunken://join?g=<code>&s=<secret>`
- **Signing key**: managed by EAS. Export and back it up — losing it means
  you can never update the listing again.
