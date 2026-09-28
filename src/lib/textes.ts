import { getEntry } from "astro:content";

/** Les textes fixes du site (src/content/textes.yaml). */
export const getTextes = async () => (await getEntry("textes", "main"))!.data;

/** Texte court avec *italique* : échappé, puis *…* devient <em>…</em>. À utiliser avec set:html. */
export function inline(s: string): string {
  const esc = s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  return esc.replace(/\*([^*]+)\*/g, "<em>$1</em>");
}
