// Documents partagés de l'espace partenaires : fiches dans D1 (table `documents`), fichiers dans R2 (binding FILES).
import type { User } from "./users";

export const MAX_SIZE = 50 * 1024 * 1024; // une requête Worker est limitée à 100 Mo ; 50 Mo suffit pour des PV et des plans
export const FOLDERS = ["PV de réunions", "Plans", "Communication", "Subsides et conventions", "Divers"];

export interface Doc {
  id: string;
  folder: string;
  name: string;
  title: string;
  doc_date: string | null;
  mime: string;
  size: number;
  r2_key: string;
  text: string | null;
  uploaded_by: string;
  created_at: number;
  updated_at: number;
}

// Types acceptés, d'après l'extension (le navigateur ne donne pas toujours un type fiable).
const TYPES: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  odt: "application/vnd.oasis.opendocument.text",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  odp: "application/vnd.oasis.opendocument.presentation",
  txt: "text/plain; charset=utf-8",
  csv: "text/csv; charset=utf-8",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  zip: "application/zip",
};
/** Ouverts dans le navigateur ; le reste est téléchargé. */
const INLINE = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp", "text/plain; charset=utf-8"]);

export const extOf = (name: string) => (name.match(/\.([a-z0-9]{1,5})$/i)?.[1] ?? "").toLowerCase();
export const mimeOf = (name: string): string | null => TYPES[extOf(name)] ?? null;
export const isInline = (mime: string) => INLINE.has(mime);

/** Titre lisible déduit du nom de fichier : « réunion_transversale_27-04-26.docx » → « réunion transversale 27-04-26 ». */
export const titleFromName = (name: string) => name.replace(/\.[a-z0-9]{1,5}$/i, "").replace(/[_]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 140) || "Document";

/** Date trouvée dans un nom de fichier (27-04-26, 2.7.26, 21/09/2026, 2026-09-21), au format AAAA-MM-JJ. */
export function dateFromName(name: string): string | null {
  const iso = name.match(/(20\d\d)[-_.](\d{1,2})[-_.](\d{1,2})/);
  const be = name.match(/(?:^|\D)(\d{1,2})[-_./](\d{1,2})[-_./](20\d\d|\d\d)(?!\d)/);
  const [y, m, d] = iso ? [+iso[1], +iso[2], +iso[3]] : be ? [+(be[3].length === 2 ? "20" + be[3] : be[3]), +be[2], +be[1]] : [0, 0, 0];
  if (!y || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
export interface DocInput { title?: unknown; folder?: unknown; doc_date?: unknown }

export function cleanDoc(body: DocInput): { error: string } | { title?: string; folder?: string; doc_date?: string | null } {
  const out: { title?: string; folder?: string; doc_date?: string | null } = {};
  if (body.title !== undefined) { out.title = String(body.title ?? "").trim().slice(0, 140); if (!out.title) return { error: "Le titre est obligatoire." }; }
  if (body.folder !== undefined) { out.folder = String(body.folder ?? "").trim().replace(/\s+/g, " ").slice(0, 60); if (!out.folder) return { error: "Choisissez un dossier." }; }
  if (body.doc_date !== undefined) { const v = String(body.doc_date ?? "").trim(); if (v && !DATE.test(v)) return { error: "Date invalide." }; out.doc_date = v || null; }
  return out;
}

/** La personne qui a déposé un document, les éditeurs et les administrateurs peuvent le modifier ou le supprimer. */
export const canEditDoc = (user: Pick<User, "email" | "role">, doc: Pick<Doc, "uploaded_by">) => user.role !== "partenaire" || doc.uploaded_by === user.email;

/** En-tête Content-Disposition avec un nom de fichier accentué (RFC 6266). */
export function disposition(inline: boolean, name: string) {
  const ascii = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7e]|["\\]/g, "_");
  return `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
