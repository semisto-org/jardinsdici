import { getCollection, type CollectionEntry } from "astro:content";

export type Page = CollectionEntry<"pages">;
export type Event = CollectionEntry<"events">;

const fmt = new Intl.DateTimeFormat("fr-BE", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Brussels" });
export const formatDate = (d: Date) => fmt.format(d);
export const day = (d: Date) => new Intl.DateTimeFormat("fr-BE", { day: "numeric", timeZone: "Europe/Brussels" }).format(d);
export const month = (d: Date) => new Intl.DateTimeFormat("fr-BE", { month: "short", timeZone: "Europe/Brussels" }).format(d).replace(".", "");
export const year = (d: Date) => d.getUTCFullYear();

/** Événements à venir (du jour du build inclus) et passés, triés du plus proche au plus lointain. */
export async function eventsSplit(now = new Date()) {
  const all = await getCollection("events");
  const today = new Date(now.toISOString().slice(0, 10));
  const end = (e: Event) => e.data.endDate ?? e.data.date;
  const upcoming = all.filter((e) => end(e) >= today).sort((a, b) => +a.data.date - +b.data.date);
  const past = all.filter((e) => end(e) < today).sort((a, b) => +b.data.date - +a.data.date);
  return { upcoming, past };
}

export async function childPages(id: string) {
  const depth = id.split("/").length + 1;
  return (await getCollection("pages"))
    .filter((p) => p.id.startsWith(id + "/") && p.id.split("/").length === depth)
    .sort((a, b) => a.data.order - b.data.order || a.data.title.localeCompare(b.data.title));
}

export async function breadcrumb(id: string) {
  const pages = await getCollection("pages");
  const parts = id.split("/");
  return parts.slice(0, -1).map((_, i) => {
    const pid = parts.slice(0, i + 1).join("/");
    return { href: `/${pid}`, title: pages.find((p) => p.id === pid)?.data.title ?? pid };
  });
}

/** Premier paragraphe de texte d'un Markdown, pour les résumés de cartes. */
export function excerpt(body = "", max = 160) {
  const para = body.split(/\n\n/).map((s) => s.trim()).find((s) => s && !s.startsWith("!") && !s.startsWith("#") && !s.startsWith("|")) ?? "";
  const text = para.replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[*_`>#]/g, "").replace(/\s+/g, " ").trim();
  return text.length > max ? text.slice(0, max).replace(/\s\S*$/, "") + "…" : text;
}
