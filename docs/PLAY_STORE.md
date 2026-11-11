# Play Store release

Everything Google asks for, and the answers this app needs.

## Before the first upload

- [ ] Google Play Developer account (one-off 25 USD), **Organisation** type
      if you want the developer name to be a company
- [ ] Host the privacy policy from [`PRIVACY.md`](PRIVACY.md) at a public
      URL and set `BABYFUNKEN_PRIVACY_URL` in `eas.json`
- [ ] Deploy the signaling server and coturn, see [`DEPLOYMENT.md`](DEPLOYMENT.md)
- [ ] Point `BABYFUNKEN_SERVER_URL` in the production profile at it
- [ ] `eas login` and confirm the project id in `app.config.js` is yours

## Build and upload

```bash
cd mobile
eas build --profile production --platform android
```

`appVersionSource: "remote"` with `autoIncrement` means EAS owns the
version code — never bump it by hand.

First upload has to go through the Play Console by hand (create the app,
fill the listing). Afterwards:

```bash
eas submit --profile production --platform android
```

That needs a Play service account JSON at `secrets/play-service-account.json`
(Play Console → Setup → API access). **Do not commit it**; the path is
already covered by `.gitignore` and `.easignore`.

## Signing key

EAS generates and stores the upload key. Export a copy and put it
somewhere you will still have in five years:

```bash
eas credentials --platform android
```

Losing it means you can never update this listing again — you would have
to publish a new app under a new package id and ask every user to migrate.

## Data safety form

The honest answers for this app:

| Question | Answer |
|---|---|
| Does your app collect or share user data? | **No** |
| Is data encrypted in transit? | **Yes** — DTLS-SRTP for media, TLS for signaling |
| Can users request data deletion? | Not applicable — nothing is stored |

Justification, if asked: video and audio never reach a server. They go
peer-to-peer between the user's own devices and are end-to-end encrypted.
The signaling server holds ephemeral, in-memory group membership that is
discarded when the group empties. There are no accounts, no analytics
SDKs, no advertising identifiers, no crash-reporting SDK.

Do not claim "no data collected" if you later add analytics. Update this
first.

## Foreground service declaration

Since Android 14 each foreground service type must be justified in the
Play Console. Declared types and the wording to use:

**`camera` and `microphone`** — *"The user places one device in the child's
room to act as a baby monitor. It transmits live camera and microphone
data to the parent's device for as long as the session runs, which is
typically all night with the screen off. The user starts the session
explicitly and an ongoing notification is visible the entire time."*

**`mediaPlayback`** — *"The monitoring device plays lullabies and alert
sounds while the screen is off."*

Attach a short screen recording showing: starting a session, the ongoing
notification, locking the screen, and the stream still running on the
other device. Reviewers ask for this.

## Store listing

Copy lives in [`../store/listing-de.md`](../store/listing-de.md).

Graphics still needed:
- [ ] Feature graphic, 1024 × 500 (no transparency)
- [ ] At least 2 phone screenshots, 16:9 or 9:16, min 320px
- [ ] Optional: 7" and 10" tablet screenshots

The app icon at `store/play-icon-512.png` is generated and already has
transparency removed, which Play requires.

## Content rating

Answer the questionnaire honestly. Expect **USK 0 / PEGI 3**: no violence,
no user-generated content shared publicly, no purchases, no ads. The
questionnaire will ask about user-to-user communication — answer **yes**,
because push-to-talk is audio between users, and note that it is limited
to devices the user has explicitly paired.

## Technical requirements

- [x] Target SDK 35 (`expo-build-properties` in `app.config.js`)
- [x] 64-bit native code (Expo SDK 54 ships arm64 and x86_64)
- [x] App Bundle, not APK (`buildType: "app-bundle"`)
- [x] No cleartext traffic
- [x] `allowBackup="false"`, so pairing secrets do not leave the device

## Testing tracks

Do not go straight to production:

1. **Internal testing** — your own devices. Confirm the overnight case:
   start a session, lock both phones, leave it eight hours, check the
   stream is still up in the morning. This is the single most important
   test for this product and no emulator will tell you the answer.
2. **Closed testing** — a handful of real households, at least a week.
   Google now requires a period of closed testing before a personal
   developer account may publish to production.
3. **Production** — staged rollout at 20%, watch Android vitals for ANRs
   and background-service kills before going wider.

## Things that get a baby monitor rejected

- Claiming "no data collected" while shipping an analytics SDK
- Foreground service types that do not match what the app actually does
- A privacy policy URL that 404s or does not mention camera and microphone
- Screenshots showing a real child's face — use a doll or a blurred frame
- Health claims. Babyfunken detects sustained loud audio. It is not a
  medical device, does not detect breathing, and must never be described
  as preventing SIDS.
