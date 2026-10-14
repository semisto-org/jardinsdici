// Authentification de l'admin : Cloudflare Access devant tout le domaine, et revérification du jeton ici.
// Ce fichier dit seulement *qui* se connecte ; ce qu'il a le droit de faire est dans users.ts (table `users`).
export interface AuthEnv {
  ACCESS_TEAM_DOMAIN?: string; // ex. "semisto.cloudflareaccess.com"
  ACCESS_AUD?: string; // tag « Application Audience » de l'application Access
  DEV_AUTH_EMAIL?: string; // uniquement en local (wrangler dev), jamais en production
}

/** Nom affichable déduit d'une adresse, quand on ne connaît pas mieux. */
export const nameFromEmail = (email: string) =>
  email.split("@")[0].split(/[._-]/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

/** Adresse e-mail vérifiée par Access (ou l'identité de dev en local), en minuscules ; null sinon. */
export async function authenticate(req: Request, env: AuthEnv): Promise<string | null> {
  const url = new URL(req.url);
  if (env.DEV_AUTH_EMAIL && (url.hostname === "localhost" || url.hostname === "127.0.0.1")) return env.DEV_AUTH_EMAIL.toLowerCase();
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return null;
  const token = req.headers.get("Cf-Access-Jwt-Assertion") ?? cookie(req, "CF_Authorization");
  if (!token) return null;
  const payload = await verifyAccessJwt(token, env.ACCESS_TEAM_DOMAIN, env.ACCESS_AUD);
  return payload?.email ? payload.email.toLowerCase() : null;
}

function cookie(req: Request, name: string): string | null {
  const m = (req.headers.get("Cookie") ?? "").match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

let jwksCache: { at: number; keys: JsonWebKey[] } | null = null;

async function jwks(team: string, force = false): Promise<JsonWebKey[]> {
  if (!force && jwksCache && Date.now() - jwksCache.at < 3600_000) return jwksCache.keys;
  const res = await fetch(`https://${team}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`JWKS Access indisponible (${res.status})`);
  const keys = ((await res.json()) as { keys: JsonWebKey[] }).keys;
  jwksCache = { at: Date.now(), keys };
  return keys;
}

const b64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=")), (c) => c.charCodeAt(0));

export async function verifyAccessJwt(token: string, team: string, aud: string): Promise<{ email?: string } | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const header = JSON.parse(new TextDecoder().decode(b64url(parts[0])));
    const payload = JSON.parse(new TextDecoder().decode(b64url(parts[1])));
    if (header.alg !== "RS256") return null;
    // Clé inconnue : Access a peut-être fait tourner ses clés, on recharge une fois.
    const jwk = (await jwks(team)).find((k: any) => k.kid === header.kid) ?? (await jwks(team, true)).find((k: any) => k.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64url(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
    if (!ok) return null;
    const now = Math.floor(Date.now() / 1000);
    const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!auds.includes(aud) || (payload.exp && payload.exp < now) || payload.iss !== `https://${team}`) return null;
    return payload;
  } catch {
    return null;
  }
}
