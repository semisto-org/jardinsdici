// Photothèque de l'espace partenaires : fiches dans D1 (table `media`), fichiers dans R2 (binding FILES, préfixe galerie/).
import type { User } from "./users";

export const MAX_SIZE = 95 * 1024 * 1024; // une requête Worker est limitée à 100 Mo
export const MAX_THUMB = 400_000;
export const MAX_SITE_PHOTO = 4_000_000; // même plafond que les photos glissées dans le chat
export const MAX_TAGS = 12;

export interface Media {
  id: string;
  kind: "photo" | "video";
  name: string;
  title: string;
  mime: string;
  size: number;
  r2_key: string;
  thumb_key: string | null;
  width: number | null;
  height: number | null;
  taken_on: string | null;
  credit: string | null;
  tags: string;
  site_path: string | null;
  site_conv: string | null;
  uploaded_by: string;
  created_at: number;
  updated_at: number;
}

// Types acceptés, d'après l'extension. Pas de SVG ni de HEIC (que les navigateurs n'affichent pas tous).
const TYPES: Record<string, { mime: string; kind: Media["kind"] }> = {
  jpg: { mime: "image/jpeg", kind: "photo" },
  jpeg: { mime: "image/jpeg", kind: "photo" },
  png: { mime: "image/png", kind: "photo" },
  webp: { mime: "image/webp", kind: "photo" },
  mp4: { mime: "video/mp4", kind: "video" },
  m4v: { mime: "video/mp4", kind: "video" },
  mov: { mime: "video/quicktime", kind: "video" },
  webm: { mime: "video/webm", kind: "video" },
};

export const extOf = (name: string) => (name.match(/\.([a-z0-9]{1,5})$/i)?.[1] ?? "").toLowerCase();
export const typeOf = (name: string) => TYPES[extOf(name)] ?? null;

/** Légende par défaut : le nom du fichier, sauf s'il vient d'un appareil (« IMG_2034.jpg »). */
export function titleFromName(name: string): string {
  const base = name.replace(/\.[a-z0-9]{1,5}$/i, "").replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
  return /^(img|dsc|dscn|dji|pxl|vid|mvi|gopr|p)[\s-]?\d+/i.test(base) || /^\d[\d\s-]*$/.test(base) ? "" : base.slice(0, 140);
}

/** Étiquettes saisies librement (« Chantier, potager ,chantier ») → « chantier,potager ». */
export function cleanTags(input: unknown): string {
  const list = (Array.isArray(input) ? input : String(input ?? "").split(","))
    .map((t) => String(t).trim().toLowerCase().replace(/\s+/g, " ").replace(/,/g, "").slice(0, 30))
    .filter(Boolean);
  return [...new Set(list)].slice(0, MAX_TAGS).join(",");
}

const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
export interface MediaInput { title?: unknown; credit?: unknown; tags?: unknown; taken_on?: unknown }
type Clean = { title?: string; credit?: string | null; tags?: string; taken_on?: string | null };

export function cleanMedia(body: MediaInput): { error: string } | Clean {
  const out: Clean = {};
  if (body.title !== undefined) out.title = String(body.title ?? "").trim().replace(/\s+/g, " ").slice(0, 140);
  if (body.credit !== undefined) out.credit = String(body.credit ?? "").trim().replace(/\s+/g, " ").slice(0, 80) || null;
  if (body.tags !== undefined) out.tags = cleanTags(body.tags);
  if (body.taken_on !== undefined) { const v = String(body.taken_on ?? "").trim(); if (v && !DATE.test(v)) return { error: "Date invalide." }; out.taken_on = v || null; }
  return out;
}

/** Dimensions envoyées par le navigateur : des entiers raisonnables, sinon rien. */
export const dimension = (v: string | null) => { const n = Number(v); return Number.isInteger(n) && n > 0 && n < 100_000 ? n : null; };

/** La personne qui a déposé une photo, les éditeurs et les administrateurs peuvent la modifier ou la supprimer. */
export const canEditMedia = (user: Pick<User, "email" | "role">, m: Pick<Media, "uploaded_by">) => user.role !== "partenaire" || m.uploaded_by === user.email;

/** Nom du fichier sur le site : la galerie publique trie par nom, de la plus récente à la plus ancienne. */
export function sitePath(m: Pick<Media, "id" | "taken_on" | "created_at">): string {
  const month = m.taken_on?.slice(0, 7) ?? new Date(m.created_at).toISOString().slice(0, 7);
  return `src/assets/galerie/${month}-${m.id.toLowerCase().replace(/[^a-z0-9]/g, "")}.jpg`;
}

/** Plage d'octets demandée par le lecteur vidéo (« bytes=0- », « bytes=100-199 », « bytes=-500 »). */
export function parseRange(header: string | null, size: number): { offset: number; length: number } | null {
  const m = header?.match(/^bytes=(\d*)-(\d*)$/);
  if (!m || (!m[1] && !m[2])) return null;
  let start: number, end: number;
  if (!m[1]) { start = Math.max(0, size - Number(m[2])); end = size - 1; }
  else { start = Number(m[1]); end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1; }
  if (start > end || start >= size) return null;
  return { offset: start, length: end - start + 1 };
}
