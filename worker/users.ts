// Utilisateurs de l'admin et leurs droits. La table `users` (D1) fait référence ; Access n'en est qu'un reflet.
import type { Env } from "./env";

export type Role = "admin" | "editeur" | "partenaire";
export const ROLES: Role[] = ["admin", "editeur", "partenaire"];

export interface User {
  email: string;
  name: string;
  organisation: string | null;
  role: Role;
  active: number;
  created_at: number;
  created_by: string | null;
  last_seen_at: number | null;
}

export type Permission = "site" | "users";
const PERMISSIONS: Record<Role, Permission[]> = { admin: ["site", "users"], editeur: ["site"], partenaire: [] };
export const can = (user: Pick<User, "role">, p: Permission) => PERMISSIONS[user.role].includes(p);

export const EMAIL = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[a-z]{2,}$/i;

/** Propriétaires (variable ADMIN_EMAILS) : toujours administrateurs, même si la table est vidée par erreur. */
export const owners = (env: Env) => (env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

/** L'utilisateur actif derrière cette adresse, ou null. Note la date de passage (au plus toutes les 5 min). */
export async function resolveUser(env: Env, email: string): Promise<User | null> {
  let user = await env.DB.prepare(`SELECT * FROM users WHERE email = ?`).bind(email).first<User>();
  if (owners(env).includes(email) && (!user || user.role !== "admin" || !user.active)) {
    await env.DB.prepare(`INSERT INTO users (email, name, role, active, created_at) VALUES (?, ?, 'admin', 1, ?)
      ON CONFLICT (email) DO UPDATE SET role = 'admin', active = 1`).bind(email, email.split("@")[0], Date.now()).run();
    user = await env.DB.prepare(`SELECT * FROM users WHERE email = ?`).bind(email).first<User>();
  }
  if (!user || !user.active) return null;
  if (!user.last_seen_at || Date.now() - user.last_seen_at > 5 * 60_000) {
    await env.DB.prepare(`UPDATE users SET last_seen_at = ? WHERE email = ?`).bind(Date.now(), email).run();
  }
  return user;
}

export async function listUsers(env: Env): Promise<User[]> {
  const { results } = await env.DB.prepare(`SELECT * FROM users ORDER BY active DESC, name COLLATE NOCASE`).all<User>();
  return results;
}

export interface UserInput { email?: string; name?: string; organisation?: string | null; role?: string; active?: boolean }

/** Vérifie et normalise une saisie ; renvoie un message d'erreur lisible ou les champs propres. */
export function cleanInput(body: UserInput, creating: boolean): { error: string } | { email?: string; name?: string; organisation?: string | null; role?: Role; active?: number } {
  const out: { email?: string; name?: string; organisation?: string | null; role?: Role; active?: number } = {};
  if (creating || body.email !== undefined) {
    const email = String(body.email ?? "").trim().toLowerCase();
    if (!EMAIL.test(email)) return { error: "Adresse e-mail invalide." };
    out.email = email;
  }
  if (creating || body.name !== undefined) {
    const name = String(body.name ?? "").trim().slice(0, 80);
    if (!name) return { error: "Le nom est obligatoire." };
    out.name = name;
  }
  if (body.organisation !== undefined) out.organisation = String(body.organisation ?? "").trim().slice(0, 80) || null;
  if (creating || body.role !== undefined) {
    if (!ROLES.includes(body.role as Role)) return { error: "Rôle inconnu." };
    out.role = body.role as Role;
  }
  if (body.active !== undefined) out.active = body.active ? 1 : 0;
  return out;
}

/** Garde-fous d'une modification : on ne se retire pas ses propres droits, il reste toujours un administrateur. */
export function checkChange(env: Env, actor: User, target: User, change: { role?: Role; active?: number }, users: User[]): string | null {
  const demoted = (change.role && change.role !== "admin") || change.active === 0;
  if (!demoted || target.role !== "admin") return null;
  if (target.email === actor.email) return "Vous ne pouvez pas retirer vos propres droits d'administrateur : demandez à un autre administrateur.";
  if (owners(env).includes(target.email)) return "Ce compte est propriétaire de l'admin : ses droits ne peuvent pas être retirés ici.";
  if (!users.some((u) => u.email !== target.email && u.role === "admin" && u.active)) return "Il doit toujours rester au moins un administrateur actif.";
  return null;
}
