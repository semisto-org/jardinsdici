// Reflet de la table `users` dans Cloudflare Access : un groupe Access (inclus dans la politique de
// l'application jardinsdici-admin) contient l'adresse de chaque utilisateur actif. Ainsi, ajouter quelqu'un
// dans l'admin suffit pour qu'il reçoive son code de connexion, et le désactiver le lui retire.
// Sans configuration (jeton absent), l'admin fonctionne quand même : l'écran liste les adresses à reporter à la main.
import type { Env } from "./env";
import { listUsers } from "./users";

export interface AccessEnv {
  CF_API_TOKEN?: string; // secret : jeton API « Access : Organizations, Identity Providers, and Groups » (modification)
  CF_ACCOUNT_ID?: string;
  ACCESS_GROUP_ID?: string; // groupe Access tenu à jour par l'admin
}

export interface AccessStatus { configured: boolean; synced?: boolean; missing?: string[]; error?: string }

interface Group { name: string; include: { email?: { email: string } }[]; exclude?: unknown[]; require?: unknown[] }

const configured = (env: AccessEnv) => !!(env.CF_API_TOKEN && env.CF_ACCOUNT_ID && env.ACCESS_GROUP_ID);

async function cf<T>(env: AccessEnv, method: string, body?: unknown): Promise<T> {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/access/groups/${env.ACCESS_GROUP_ID}`, {
    method,
    headers: { Authorization: `Bearer ${env.CF_API_TOKEN}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as { success?: boolean; result?: T; errors?: { message: string }[] };
  if (!res.ok || !data.success) throw new Error(`Cloudflare Access a refusé (${res.status}) : ${data.errors?.map((e) => e.message).join(", ") || "réponse inattendue"}`);
  return data.result as T;
}

const activeEmails = async (env: Env) => (await listUsers(env)).filter((u) => u.active).map((u) => u.email).sort();
const groupEmails = (g: Group) => g.include.map((r) => r.email?.email?.toLowerCase()).filter((e): e is string => !!e);

/** Compare le groupe Access à la table : qui manque encore dans Access ? */
export async function accessStatus(env: Env): Promise<AccessStatus> {
  if (!configured(env)) return { configured: false, missing: await activeEmails(env) };
  try {
    const inGroup = new Set(groupEmails(await cf<Group>(env, "GET")));
    const wanted = await activeEmails(env);
    const missing = wanted.filter((e) => !inGroup.has(e));
    return { configured: true, synced: !missing.length && inGroup.size === wanted.length, missing };
  } catch (e) {
    return { configured: true, error: (e as Error).message };
  }
}

/** Remplace le contenu du groupe par les utilisateurs actifs. Ne lève jamais : renvoie l'état obtenu. */
export async function syncAccess(env: Env): Promise<AccessStatus> {
  if (!configured(env)) return accessStatus(env);
  try {
    const group = await cf<Group>(env, "GET");
    const others = group.include.filter((r) => !r.email); // règles non nominatives éventuelles, conservées telles quelles
    const emails = await activeEmails(env);
    await cf(env, "PUT", { name: group.name, include: [...others, ...emails.map((email) => ({ email: { email } }))], exclude: group.exclude ?? [], require: group.require ?? [] });
    return { configured: true, synced: true, missing: [] };
  } catch (e) {
    return { configured: true, error: (e as Error).message };
  }
}
