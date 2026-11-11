# Security model

This app puts a live camera and microphone in a room with a child. What
follows is what the design protects against, and — just as importantly —
what it does not.

## What protects a session

**Media is end-to-end encrypted.** WebRTC mandates DTLS-SRTP; there is no
unencrypted mode. The signaling server sees the handshake, never the
media. Even when a connection falls back to the TURN relay, the relay
forwards packets it cannot decrypt.

**A group code alone is not enough to join.** Codes are eight characters
from a 32-character alphabet (~1.1 × 10¹² combinations) and are generated
with `crypto.randomBytes`, not `Math.random`. Joining additionally
requires a 24-byte secret that is never displayed as text — it travels
inside a QR code or a share link.

**Joining is only possible while the pairing window is open.** The window
opens for ten minutes when a group is created and can be reopened or
closed from any device in the group. Outside that window, the correct
code *and* the correct secret are still refused. This is the control that
matters most: even a leaked link stops working.

**A bad secret and an unknown group return the same error.** There is no
oracle that would let someone enumerate which codes exist.

**Failed joins are rate limited per IP**, with a fifteen minute block
after ten failures in a minute. Successful joins reset the counter, so a
household reconnecting repeatedly is never locked out.

**Signaling frames are checked against group membership.** A connected
socket cannot send an offer, an ICE candidate or an alert into a group it
is not part of. This is covered by tests, because it is the kind of thing
that silently regresses.

**Returning devices use a token, not the secret.** Each device gets its
own 24-byte token on first join and reuses it afterwards, which is what
lets a phone reconnect at 3am without reopening pairing.

**Credentials live in the Android keystore** via `expo-secure-store`, not
in plain preferences. Backups are disabled (`allowBackup="false"`), so a
device backup does not carry the pairing secret off the phone.

**TURN credentials are short-lived.** The server mints them per
connection with an HMAC over an expiry timestamp (coturn's
`use-auth-secret` scheme). The shared secret never reaches a client, so
pulling the APK apart yields nothing reusable.

**Cleartext HTTP is forbidden** at the platform level through a network
security config, so a hostile network cannot downgrade the connection.

## What it does not protect against

**Anyone holding the pairing link, while pairing is open, can join.**
That is the whole design of the link. The share sheet says so in as many
words. Close the pairing window once the device is in.

**A device already in the group is trusted.** Any member can watch the
stream, reopen pairing and invite others. There are no per-device
permissions. For a household this is the right trade; for anything larger
it is not.

**A compromised phone compromises the session.** Keystore storage does
not survive malware with root.

**The server sees metadata**: which device ids are in which group, when
they connect, and that an alert fired. It does not see names of people,
media, or anything about the audio beyond the fact that a threshold was
crossed.

**The browser client stores credentials in `localStorage`**, which is
weaker than the Android keystore. Use a phone for the camera; treat the
browser as a convenience monitor.

**There is no account system**, so there is nothing to recover if every
device in a group is lost — and nothing to breach either. That is
deliberate.

## Reporting a vulnerability

Email the address in `SUPPORT_EMAIL` rather than opening a public issue.
