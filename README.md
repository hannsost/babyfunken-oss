<p align="center">
  <img src="docs/logo.svg" alt="Babyfunken" height="96">
</p>

<h1 align="center">Babyfunken</h1>

<p align="center"><strong>A private, peer-to-peer baby monitor for the phones and tablets you already own.</strong></p>

<p align="center">
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-0B1A3A.svg"></a>
  <img alt="Stack" src="https://img.shields.io/badge/stack-React%20Native%20%C2%B7%20WebRTC-FF8A1F.svg">
  <a href="CONTRIBUTING.md"><img alt="PRs welcome" src="https://img.shields.io/badge/PRs-welcome-FFC247.svg"></a>
</p>

<p align="center">
  <a href="https://neurofunken.de"><img src="docs/neurofunken-logo.svg" alt="neurofunken" height="28"></a><br>
  <sub>a neurofunken project</sub>
</p>

---

Babyfunken turns two spare devices into a baby monitor. Video and audio travel directly between your devices over encrypted WebRTC; a tiny signaling server only introduces the devices to each other and never receives, decodes or stores a single frame. Cry detection runs on the camera device, lullabies are bundled with the app.

> **Status:** Early-stage open source release. APIs and data models may still change.

## Features

- Peer-to-peer, end-to-end encrypted video and audio (WebRTC)
- On-device cry detection and alerts
- Push-to-talk and built-in lullabies
- Android app (Expo + React Native) and web app
- Minimal Node.js signaling server with short-lived TURN credentials and abuse limits
- Self-hostable: Docker Compose with coturn

## Tech stack

React Native / Expo · React (Vite) web app · Node.js signaling server · WebRTC, coturn

## Quick start

```sh
npm install
cp server/.env.example server/.env    # set TURN_SECRET, ALLOWED_ORIGINS, ...
npm run server                        # signaling server on :8002
npm run webapp                        # web client
npm run mobile                        # Expo dev server for the Android app
```

Deployment with coturn: see `docs/DEPLOYMENT.md`.

## Configuration

All configuration is read from environment variables or local config files that are **never** committed.
Copy the provided example files (e.g. `.env.example`) and fill in your own values. The examples contain
placeholders only — no real credentials, hostnames or customer data ship with this repository.

## Project layout

| Path | Content |
| --- | --- |
| `mobile/` | Android app (Expo + React Native, react-native-webrtc) |
| `webapp/` | Web client |
| `server/` | Signaling server |
| `shared/` | Shared protocol and constants |
| `deploy/` | Dockerfile, Docker Compose, coturn configuration |
| `docs/` | Configuration, deployment, privacy, security, Play Store notes |

## Contributing

Contributions are welcome — bug reports, documentation, tests and features alike.
Please read [CONTRIBUTING.md](CONTRIBUTING.md) and our [Code of Conduct](CODE_OF_CONDUCT.md) first.
Security issues: please follow [SECURITY.md](SECURITY.md) and do **not** open a public issue.

## License

Released under the [MIT License](LICENSE). © 2026 Hanns Leonhard Osterbrink / neurofunken.

---

## Kurzfassung (Deutsch)

Babyfunken ist ein privates Babyfon für vorhandene Smartphones und Tablets: Bild und Ton laufen verschlüsselt direkt zwischen den Geräten (WebRTC), der Server vermittelt nur die Verbindung. Schreierkennung auf dem Gerät, Gegensprechen, Schlaflieder, selbst hostbar mit Docker und coturn.

Beiträge sind willkommen – siehe [CONTRIBUTING.md](CONTRIBUTING.md). Sicherheitslücken bitte vertraulich
gemäß [SECURITY.md](SECURITY.md) melden. Lizenz: MIT.

Ausführliche deutschsprachige Dokumentation: [docs/README.de.md](docs/README.de.md).

<p align="center"><sub>Built with care in Darmstadt by <a href="https://neurofunken.de">neurofunken</a>.</sub></p>
