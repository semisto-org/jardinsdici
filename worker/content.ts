// Garde-fous sur ce que l'agent peut écrire : chemins autorisés et validation du contenu
// avant commit, pour attraper la plupart des erreurs sans attendre le build.
import { parse as parseYaml } from "yaml";

export const WRITABLE_TEXT = /^(src\/content\/(pages|events|facts|faq|partners)\/[a-z0-9][a-z0-9/_-]*\.md|src\/content\/site\.yaml|admin\/knowledge\.md)$/;
export const DELETABLE = /^(src\/content\/(pages|events|facts|faq|partners)\/[a-z0-9][a-z0-9/_-]*\.md|src\/assets\/(images|galerie)\/[a-z0-9][a-z0-9._-]*\.(jpe?g|png|webp))$/;
export const READABLE = /^(src\/content\/|src\/assets\/|admin\/knowledge\.md$)/;

export function checkPath(path: string, rule: RegExp): string | null {
  if (path.includes("..") || path.startsWith("/") || path.includes("//")) return "Chemin invalide.";
  if (!rule.test(path)) return `Chemin non autorisé : ${path}. L'assistant ne peut modifier que le contenu (src/content/…) et les images (src/assets/…), pas le design ni le code.`;
  return null;
}

function splitFrontmatter(text: string): { data: Record<string, unknown>; body: string } | string {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return "Le fichier doit commencer par un bloc de métadonnées entre deux lignes « --- ».";
  try {
    const data = parseYaml(m[1]);
    if (!data || typeof data !== "object") return "Le bloc de métadonnées est vide.";
    return { data: data as Record<string, unknown>, body: m[2] };
  } catch (e) {
    return `Métadonnées YAML invalides : ${(e as Error).message}`;
  }
}

const isDate = (v: unknown) => (v instanceof Date && !isNaN(+v)) || (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v)));
const str = (v: unknown) => typeof v === "string" && v.trim().length > 0;

function resolveRelative(fromFile: string, rel: string): string {
  const parts = fromFile.split("/").slice(0, -1);
  for (const seg of rel.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg !== ".") parts.push(seg);
  }
  return parts.join("/");
}

/** Renvoie la liste des problèmes (vide si le fichier est valide). `assets` = chemins d'images existants sur la branche. */
export function validateContent(path: string, text: string, assets: Set<string>): string[] {
  const problems: string[] = [];
  if (path === "src/content/site.yaml") {
    try {
      const y = parseYaml(text) as any;
      if (!y?.main?.email || !Array.isArray(y.main.stats)) problems.push("site.yaml doit garder la clé main avec email et stats.");
    } catch (e) {
      problems.push(`YAML invalide : ${(e as Error).message}`);
    }
    return problems;
  }
  if (path === "admin/knowledge.md") return problems;

  const fm = splitFrontmatter(text);
  if (typeof fm === "string") return [fm];
  const d = fm.data;
  const collection = path.split("/")[2];
  const need = (k: string, ok: (v: unknown) => boolean, msg: string) => { if (!ok(d[k])) problems.push(msg); };

  if (collection === "events") {
    if (!/^src\/content\/events\/\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.md$/.test(path)) problems.push("Un événement se nomme AAAA-MM-JJ-titre-court.md (minuscules, tirets).");
    need("title", str, "title (titre) est obligatoire.");
    need("date", isDate, "date est obligatoire, au format AAAA-MM-JJ.");
    if (d.endDate !== undefined && !isDate(d.endDate)) problems.push("endDate doit être au format AAAA-MM-JJ.");
    if (d.link !== undefined && !(typeof d.link === "string" && /^https?:\/\//.test(d.link))) problems.push("link doit être une URL complète (https://…).");
  } else if (collection === "pages") {
    need("title", str, "title (titre) est obligatoire.");
    if (d.order !== undefined && typeof d.order !== "number") problems.push("order doit être un nombre.");
  } else if (collection === "facts") {
    need("title", str, "title est obligatoire.");
  } else if (collection === "faq") {
    need("question", str, "question est obligatoire.");
  } else if (collection === "partners") {
    need("name", str, "name est obligatoire.");
    need("role", str, "role est obligatoire.");
  }

  const refs = [
    ...["cover", "image"].map((k) => d[k]).filter((v): v is string => typeof v === "string"),
    ...[...fm.body.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)].map((m) => m[1]).filter((u) => !/^https?:/.test(u)),
  ];
  for (const ref of refs) {
    const target = resolveRelative(path, ref);
    if (!assets.has(target)) problems.push(`Image introuvable : ${ref} (résolu en ${target}). Les images vivent dans src/assets/images/ ; depuis ce fichier le chemin relatif commence par ${"../".repeat(path.split("/").length - 2)}assets/images/.`);
  }
  if (/!\[[^\]]*\]\(https?:/.test(fm.body)) problems.push("Pas d'image hébergée ailleurs : ajoute l'image au site (src/assets/images) et référence-la en chemin relatif.");
  return problems;
}
