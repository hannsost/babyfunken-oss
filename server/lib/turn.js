import { createHmac } from 'node:crypto';

/**
 * Mints ephemeral TURN credentials for coturn running with
 * `use-auth-secret` / `static-auth-secret` (the RFC 7635 style REST API).
 *
 * The shared secret never leaves the server: clients receive a username
 * that expires and a password derived from it. An APK pulled apart by a
 * stranger therefore yields nothing reusable.
 */
export function mintTurnCredentials({ secret, urls, ttlSeconds }, identity = 'babyfunken') {
  if (!secret || !urls?.length) return [];

  const expiry = Math.floor(Date.now() / 1000) + ttlSeconds;
  const username = `${expiry}:${identity}`;
  const credential = createHmac('sha1', secret).update(username).digest('base64');

  return [{ urls, username, credential, credentialType: 'password' }];
}

/** Full ICE server list handed to a client: public STUN plus our relay. */
export function iceServersFor(config, identity) {
  return [
    ...config.stunUrls.map(url => ({ urls: url })),
    ...mintTurnCredentials(config.turn, identity),
  ];
}
