# Babyfunken

A baby monitor that runs on the phones and tablets you already own.

Video and audio travel **directly between your devices** over WebRTC. The
server in the middle introduces the two devices to each other and then
gets out of the way — it never receives, decodes or stores a single frame.
Cry detection runs on the device holding the camera. Lullabies are files
inside the app. The result is a system where the expensive work happens on
the hardware in your house, and the hosted part stays small enough to run
on almost nothing.

```
   Camera device                                    Monitor device
  ┌──────────────┐                                 ┌──────────────┐
  │  camera+mic  │◀───── encrypted media (P2P) ───▶│  video+audio │
  │ cry detection│                                 │ push-to-talk │
  │  lullabies   │                                 │    alerts    │
  └──────┬───────┘                                 └───────┬──────┘
         │              ┌──────────────────┐               │
         └─────────────▶│ signaling server │◀──────────────┘
            handshake   │  (relay only)    │   handshake
            + alerts    └──────────────────┘   + alerts
```

## What is in here

| Path      | What it is                                                        |
|-----------|-------------------------------------------------------------------|
| `mobile/` | The Android app. Expo + React Native, `react-native-webrtc`.      |
| `webapp/` | Browser client, for using a laptop as a monitor or a camera.      |
| `server/` | Signaling server. Express + Socket.IO. Holds no media.            |
| `shared/` | The protocol and constants every client and the server agree on.  |
| `deploy/` | Dockerfile, compose stack and coturn configuration.               |
| `scripts/`| Regenerates the app icons and the bundled lullabies.              |
| `store/`  | Play Store listing copy and graphics.                             |

## Getting started

```bash
npm install                 # workspaces: shared, server, webapp, mobile
cp server/.env.example server/.env

npm run server              # signaling on :8002
npm run webapp              # browser client on :8003
npm run mobile              # Expo dev server
```

The mobile app needs a development build rather than Expo Go, because
`react-native-webrtc` and the foreground service are native code:

```bash
cd mobile
eas build --profile development --platform android
```

## Tests

```bash
npm test --workspaces
```

64 tests. The server suite drives a real Socket.IO server and asserts the
things that matter for a camera pointed at a child: that a group code
alone cannot get you in, that a closed pairing window holds, that
signaling frames cannot cross between groups, and that device tokens are
never broadcast.

## Documentation

- [`docs/CONFIGURATION.md`](CONFIGURATION.md) — every environment variable
- [`docs/DEPLOYMENT.md`](DEPLOYMENT.md) — running the server and coturn
- [`docs/SECURITY.md`](SECURITY.md) — the threat model, stated plainly
- [`docs/PLAY_STORE.md`](PLAY_STORE.md) — release checklist and Data Safety answers
- [`docs/PRIVACY.md`](PRIVACY.md) — the privacy policy text

## Regenerating assets

Icons and lullabies are generated, not hand-made, so they can never drift
from their sources:

```bash
npm run assets   # needs rsvg-convert, ImageMagick, ffmpeg, numpy
```

The four lullabies are synthesised from scratch by
`scripts/generate-lullabies.py`, which is why the app bundles music with
no licence attached to it.

## Licence

MIT. See [LICENSE](../LICENSE).
