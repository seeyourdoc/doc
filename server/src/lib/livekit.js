import { AccessToken } from 'livekit-server-sdk';
import { env } from '../config.js';

// Rooms are private: nobody can join without a token signed here, and tokens are only
// issued to the patient (via their secret link) or the assigned doctor (via login).
export async function joinToken({ room, identity, name, ttl }) {
  const at = new AccessToken(env.livekitKey, env.livekitSecret, { identity, name, ttl });
  at.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true, canPublishData: true });
  return at.toJwt();
}
