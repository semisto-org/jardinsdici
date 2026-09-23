import { test, expect } from "bun:test";
import { checkPath, validateContent, WRITABLE_TEXT, DELETABLE, READABLE } from "./content";

test("l'agent ne peut écrire que du contenu", () => {
  for (const ok of ["src/content/events/2026-10-04-balade.md", "src/content/pages/espaces/potager.md", "src/content/site.yaml", "admin/knowledge.md", "src/content/faq/chiens.md"])
    expect(checkPath(ok, WRITABLE_TEXT)).toBeNull();
  for (const bad of ["src/pages/index.astro", "src/layouts/Base.astro", "src/styles/global.css", "worker/index.ts", "wrangler.jsonc", "package.json", ".github/workflows/deploy.yml", "public/_redirects", "src/content/../pages/x.md", "/etc/passwd", "src/content.config.ts", "src/content/events/x.astro"])
    expect(checkPath(bad, WRITABLE_TEXT)).not.toBeNull();
});

test("suppression limitée au contenu et aux images", () => {
  expect(checkPath("src/assets/images/photo-ab12cd.jpg", DELETABLE)).toBeNull();
  expect(checkPath("src/content/events/2025-03-09-x.md", DELETABLE)).toBeNull();
  expect(checkPath("src/assets/images/../../pages/index.astro", DELETABLE)).not.toBeNull();
  expect(checkPath("src/components/EventCard.astro", DELETABLE)).not.toBeNull();
});

test("lecture limitée au contenu", () => {
  expect(checkPath("src/content/site.yaml", READABLE)).toBeNull();
  expect(checkPath("worker/agent.ts", READABLE)).not.toBeNull();
});

const assets = new Set(["src/assets/images/pomme.jpg"]);

test("un événement sans date est refusé", () => {
  const p = validateContent("src/content/events/2026-10-04-balade.md", "---\ntitle: Balade\n---\n\nTexte\n", assets);
  expect(p.some((x) => x.includes("date"))).toBe(true);
});

test("un événement valide passe", () => {
  const p = validateContent("src/content/events/2026-10-04-balade.md", '---\ntitle: "Balade"\ndate: 2026-10-04\ncover: "../../assets/images/pomme.jpg"\n---\n\nTexte\n', assets);
  expect(p).toEqual([]);
});

test("image introuvable ou externe refusée", () => {
  expect(validateContent("src/content/events/2026-10-04-b.md", '---\ntitle: B\ndate: 2026-10-04\ncover: "../../assets/images/absente.jpg"\n---\n', assets).length).toBeGreaterThan(0);
  expect(validateContent("src/content/pages/x.md", "---\ntitle: X\n---\n\n![](https://exemple.org/a.jpg)\n", assets).length).toBeGreaterThan(0);
});

test("nom de fichier d'événement imposé", () => {
  expect(validateContent("src/content/events/balade.md", "---\ntitle: B\ndate: 2026-10-04\n---\n", assets).length).toBeGreaterThan(0);
});

test("métadonnées YAML cassées refusées", () => {
  expect(validateContent("src/content/pages/x.md", "---\ntitle: : : [\n---\n", assets).length).toBeGreaterThan(0);
  expect(validateContent("src/content/pages/x.md", "pas de frontmatter", assets).length).toBeGreaterThan(0);
});

test("tous les contenus actuels du site passent la validation", async () => {
  const { Glob } = await import("bun");
  const all = new Set<string>();
  for await (const f of new Glob("src/assets/**/*").scan(".")) all.add(f);
  for await (const f of new Glob("src/content/**/*.md").scan(".")) {
    expect({ f, p: validateContent(f, await Bun.file(f).text(), all) }).toEqual({ f, p: [] });
  }
  expect(validateContent("src/content/site.yaml", await Bun.file("src/content/site.yaml").text(), all)).toEqual([]);
});

test("HTML actif et liens javascript: refusés", () => {
  const ev = (body: string) => validateContent("src/content/events/2026-10-04-b.md", `---\ntitle: B\ndate: 2026-10-04\n---\n\n${body}\n`, assets);
  expect(ev('<script src="https://x.io/a.js"></script>').length).toBeGreaterThan(0);
  expect(ev('<iframe src="https://x.io"></iframe>').length).toBeGreaterThan(0);
  expect(ev('<img src=x onerror="alert(1)">').length).toBeGreaterThan(0);
  expect(ev("[clic](javascript:alert(1))").length).toBeGreaterThan(0);
  expect(ev("Un texte *normal* avec un [lien](https://www.d-ici.be).")).toEqual([]);
  expect(validateContent("src/content/events/2026-10-04-b.md", '---\ntitle: B\ndate: 2026-10-04\nlink: "javascript:alert(1)"\n---\n', assets).length).toBeGreaterThan(0);
});
