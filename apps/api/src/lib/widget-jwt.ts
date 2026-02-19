import { SignJWT, jwtVerify, type JWTPayload } from 'jose';

// ---------------------------------------------------------------------------
// Widget session JWT — anonymous visitors (not Clerk-authenticated)
// ---------------------------------------------------------------------------

const ALG = 'HS256';
const ISSUER = 'platform-widget';
const EXPIRY = '24h';

/** Claims embedded in every widget JWT. */
export interface WidgetTokenClaims extends JWTPayload {
  sub: string;        // visitor ID  (visitor_<hash>)
  tenant_id: string;  // server-resolved UUID
  artifact_id: string;
  customer_id: string;
}

function getSecret(): Uint8Array {
  const raw = process.env.WIDGET_JWT_SECRET;
  if (!raw) throw new Error('WIDGET_JWT_SECRET is not set');
  return new TextEncoder().encode(raw);
}

/** Create a signed widget JWT. */
export async function createWidgetToken(claims: {
  visitorId: string;
  tenantId: string;
  artifactId: string;
  customerId: string;
}): Promise<string> {
  return new SignJWT({
    tenant_id: claims.tenantId,
    artifact_id: claims.artifactId,
    customer_id: claims.customerId,
  })
    .setSubject(claims.visitorId)
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(EXPIRY)
    .setIssuer(ISSUER)
    .sign(getSecret());
}

/** Verify + decode a widget JWT. Throws on invalid/expired tokens. */
export async function verifyWidgetToken(token: string): Promise<WidgetTokenClaims> {
  const { payload } = await jwtVerify(token, getSecret(), { issuer: ISSUER });
  // Runtime shape check — jose returns generic JWTPayload
  if (
    typeof payload.sub !== 'string' ||
    typeof payload.tenant_id !== 'string' ||
    typeof payload.artifact_id !== 'string' ||
    typeof payload.customer_id !== 'string'
  ) {
    throw new Error('Malformed widget JWT claims');
  }
  return payload as WidgetTokenClaims;
}
