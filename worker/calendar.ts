// Calendrier de l'espace partenaires : événements internes (table `events`) et agenda public du site (lu en JSON).
import type { Env } from "./env";
import type { User } from "./users";

export type Kind = "reunion" | "gestion" | "chantier" | "autre";
export const KINDS: Kind[] = ["reunion", "gestion", "chantier", "autre"];

export interface CalEvent {
  id: string;
  title: string;
  kind: Kind;
  date: string;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  visio_url: string | null;
  description: string | null;
  created_by: string;
  created_at: number;
  updated_at: number;
}

export interface PublicEvent { id: string; title: string; date: string; endDate: string | null; time: string | null; summary: string | null; url: string }

const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const FIELDS = ["title", "kind", "date", "end_date", "start_time", "end_time", "location", "visio_url", "description"] as const;
type Field = (typeof FIELDS)[number];
export type EventInput = Partial<Record<Field, unknown>>;
export type CleanEvent = Partial<Record<Field, string | null>>;

const text = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max) || null;

/** Vérifie et normalise une saisie ; renvoie un message d'erreur lisible ou les champs propres. */
export function cleanEvent(body: EventInput, creating: boolean, current?: CalEvent): { error: string } | CleanEvent {
  const out: CleanEvent = {};
  const has = (k: Field) => creating || body[k] !== undefined;
  if (has("title")) { out.title = text(body.title, 120); if (!out.title) return { error: "Le titre est obligatoire." }; }
  if (has("kind")) { if (!KINDS.includes(body.kind as Kind)) return { error: "Type d'événement inconnu." }; out.kind = body.kind as Kind; }
  if (has("date")) { if (!DATE.test(String(body.date ?? ""))) return { error: "Date invalide." }; out.date = String(body.date); }
  for (const k of ["end_date"] as const) if (has(k)) { const v = text(body[k], 10); if (v && !DATE.test(v)) return { error: "Date de fin invalide." }; out[k] = v; }
  for (const k of ["start_time", "end_time"] as const) if (has(k)) { const v = text(body[k], 5); if (v && !TIME.test(v)) return { error: "Heure invalide (format 14:30)." }; out[k] = v; }
  if (has("location")) out.location = text(body.location, 160);
  if (has("visio_url")) { const v = text(body.visio_url, 500); if (v && !/^https:\/\/\S+$/.test(v)) return { error: "Le lien de visio doit commencer par https://" }; out.visio_url = v; }
  if (has("description")) out.description = text(body.description, 4000);

  // Cohérence sur l'état final (saisie + valeurs déjà enregistrées).
  const final = { ...current, ...out } as CleanEvent;
  if (final.end_date && final.date && final.end_date < final.date) return { error: "La date de fin est avant la date de début." };
  if (final.end_date === final.date) out.end_date = null;
  if (final.end_time && !final.start_time) return { error: "Indiquez aussi l'heure de début." };
  if (!final.end_date && final.start_time && final.end_time && final.end_time <= final.start_time) return { error: "L'heure de fin est avant l'heure de début." };
  return out;
}

/** L'auteur d'un événement, les éditeurs et les administrateurs peuvent le modifier ou le supprimer. */
export const canEdit = (user: Pick<User, "email" | "role">, ev: Pick<CalEvent, "created_by">) => user.role !== "partenaire" || ev.created_by === user.email;

export async function listEvents(env: Env): Promise<CalEvent[]> {
  const { results } = await env.DB.prepare(`SELECT * FROM events ORDER BY date, start_time`).all<CalEvent>();
  return results;
}

let publicCache: { at: number; events: PublicEvent[] } | null = null;

/** Activités publiques du site (agenda), mises en cache 5 minutes. En cas de panne, on garde la dernière liste connue. */
export async function publicEvents(env: Env): Promise<{ events: PublicEvent[]; error?: string }> {
  if (publicCache && Date.now() - publicCache.at < 5 * 60_000) return { events: publicCache.events };
  try {
    const res = await fetch(new URL("/agenda.json", env.SITE_URL), { headers: { "User-Agent": "jardinsdici-admin" } });
    if (!res.ok) throw new Error(`agenda du site indisponible (${res.status})`);
    const events = ((await res.json()) as { events: PublicEvent[] }).events.map((e) => ({ ...e, url: new URL(e.url, env.SITE_URL).href }));
    publicCache = { at: Date.now(), events };
    return { events };
  } catch (e) {
    return { events: publicCache?.events ?? [], error: (e as Error).message };
  }
}
