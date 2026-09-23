// Worker de l'admin conversationnelle. Il vit sur son propre domaine, séparé du site public :
// rien de ce qui est publié sur le site ne peut s'exécuter dans l'origine de l'admin.
import Anthropic from "@anthropic-ai/sdk";
import adminPage from "./admin.html";
import { authenticate, editorFromEmail, type Editor } from "./auth";
import { GitHub } from "./github";
import { branchFor } from "./agent";
import { publishBranch } from "./publish";
import type { Env } from "./env";
import { addMessages, touch, lock, commitAuthor } from "./db";

export { ConversationRunner } from "./runner";

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
const PHOTO_PATH = /^src\/assets\/images\/[a-z0-9-]+\.jpg$/;
const MAX_PHOTOS = 6;

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/favicon.png") return fetch(new URL("/favicon.png", env.SITE_URL));

    const editor = await authenticate(req, env);
    if (!editor) return url.pathname.startsWith("/api/") ? json({ error: "Non autorisé" }, 401) : new Response("Accès réservé aux éditeurs du site des Jardins d'ici.", { status: 403 });

    if (url.pathname === "/" || url.pathname === "/admin") {
      return new Response(adminPage, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Frame-Options": "DENY",
          "Content-Security-Policy": "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'",
        },
      });
    }
    if (!url.pathname.startsWith("/api/admin/")) return json({ error: "Introuvable" }, 404);
    // Les écritures viennent uniquement de la page d'admin (protection contre les requêtes intersites).
    if (req.method !== "GET" && req.headers.get("X-Admin-Request") !== "1") return json({ error: "Requête refusée" }, 403);

    try {
      return await api(req, url, env, editor);
    } catch (e) {
      console.error(e);
      return json({ error: (e as Error).message }, 500);
    }
  },
} satisfies ExportedHandler<Env>;

async function api(req: Request, url: URL, env: Env, editor: Editor): Promise<Response> {
  const parts = url.pathname.replace(/^\/api\/admin\/?/, "").split("/").filter(Boolean);
  const gh = new GitHub(env);

  if (parts[0] === "me") {
    const names = Object.fromEntries(env.ADMIN_EMAILS.split(",").map((e) => e.trim()).filter(Boolean).map((e) => [e, editorFromEmail(e, env.ADMIN_NAMES).name]));
    return json({ email: editor.email, name: editor.name, names, site: env.SITE_URL });
  }

  if (parts[0] === "conversations" && parts.length === 1) {
    if (req.method === "GET") {
      const { results } = await env.DB.prepare(`SELECT * FROM conversations ORDER BY updated_at DESC LIMIT 200`).all();
      return json(results);
    }
    if (req.method === "POST") {
      const id = crypto.randomUUID().replace(/-/g, "").slice(0, 10);
      await env.DB.prepare(`INSERT INTO conversations (id, title, author, status, branch, created_at, updated_at) VALUES (?, 'Nouvelle conversation', ?, 'ouverte', ?, ?, ?)`)
        .bind(id, editor.email, branchFor(id), Date.now(), Date.now()).run();
      return json({ id }, 201);
    }
  }

  const id = parts[1];
  if (parts[0] !== "conversations" || !id) return json({ error: "Introuvable" }, 404);
  const conv = await env.DB.prepare(`SELECT * FROM conversations WHERE id = ?`).bind(id).first<Record<string, any>>();
  if (!conv) return json({ error: "Conversation introuvable" }, 404);
  const action = parts[2];
  const active = conv.status === "ouverte" || conv.status === "apercu";
  const runner = () => env.RUNNER.get(env.RUNNER.idFromName(id));

  if (!action && req.method === "GET") {
    const { results } = await env.DB.prepare(`SELECT id, role, author, content, created_at FROM messages WHERE conversation_id = ? ORDER BY id`).bind(id).all();
    return json({ conversation: conv, messages: results.map((m: any) => ({ ...m, content: JSON.parse(m.content) })) });
  }

  if (action === "live" && req.method === "GET") {
    return json({ conversation: conv, live: await runner().live() });
  }

  if (action === "status" && req.method === "GET") {
    const deploy = conv.status === "publiee" && conv.published_sha ? await gh.latestRun("main", conv.published_sha) : null;
    return json({ conversation: conv, deploy });
  }

  if (action === "image" && req.method === "GET") {
    const path = url.searchParams.get("path") ?? "";
    if (!PHOTO_PATH.test(path)) return json({ error: "Chemin invalide" }, 400);
    const bytes = (await gh.readRaw(conv.branch, path).catch(() => null)) ?? (await gh.readRaw("main", path));
    if (!bytes) return json({ error: "Image introuvable" }, 404);
    return new Response(bytes, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=86400" } });
  }

  if (action === "upload" && req.method === "POST") {
    // Photo glissée dans le chat, déjà redimensionnée par le navigateur (JPEG).
    if (!active) return json({ error: "Cette conversation est terminée." }, 409);
    if (conv.busy) return json({ error: "Attendez que l'assistant ait fini." }, 409);
    const name = (url.searchParams.get("name") ?? "photo").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\.[a-z]+$/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "photo";
    const bytes = new Uint8Array(await req.arrayBuffer());
    if (bytes.length > 4_000_000) return json({ error: "Image trop lourde (4 Mo max après réduction)." }, 413);
    if (!(bytes[0] === 0xff && bytes[1] === 0xd8)) return json({ error: "Seules les images JPEG sont acceptées." }, 415);
    const path = `src/assets/images/${name}-${crypto.randomUUID().slice(0, 6)}.jpg`;
    await gh.ensureBranch(conv.branch);
    await gh.writeFile(conv.branch, path, bytes, `Ajout de la photo ${path.split("/").pop()}`, commitAuthor(env, editor));
    await touch(env, id, { status: "ouverte", preview_url: null });
    return json({ path });
  }

  if (action === "messages" && req.method === "POST") {
    if (!active) return json({ error: "Cette conversation est terminée. Ouvrez-en une nouvelle." }, 409);
    const body = (await req.json()) as { text?: string; photos?: string[] };
    const text = (body.text ?? "").trim().slice(0, 8000);
    const photos = (body.photos ?? []).filter((p) => typeof p === "string");
    if (photos.length > MAX_PHOTOS) return json({ error: `${MAX_PHOTOS} photos maximum par message.` }, 400);
    if (photos.some((p) => !PHOTO_PATH.test(p))) return json({ error: "Photo invalide." }, 400);
    if (!text && !photos.length) return json({ error: "Message vide" }, 400);
    if (!(await lock(env, id))) return json({ error: "L'assistant travaille déjà sur cette conversation." }, 409);

    const dateFr = new Intl.DateTimeFormat("fr-BE", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Brussels" }).format(new Date());
    const content = [
      { type: "text", text: `[${editor.name}, ${dateFr}]\n${text}` },
      ...photos.map((p) => ({ type: "text", text: `[Photo jointe, déjà ajoutée au site : ${p}]` })),
    ];
    await addMessages(env, id, [{ role: "user", author: editor.email, content }]);
    if (conv.title === "Nouvelle conversation" && text) await touch(env, id, { title: text.slice(0, 70) + (text.length > 70 ? "…" : "") });
    try {
      await runner().start({ convId: id, editorEmail: editor.email });
    } catch (e) {
      await touch(env, id, { busy: 0 });
      throw e;
    }
    return json({ ok: true }, 202);
  }

  if (action === "publish" && req.method === "POST") {
    if (conv.status !== "apercu") return json({ error: "Il n'y a pas d'aperçu prêt à publier." }, 409);
    if (!(await lock(env, id))) return json({ error: "L'assistant travaille encore sur cette conversation." }, 409);
    try {
      const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
      const res = await publishBranch(gh, client, env.MODEL ?? "claude-opus-5", conv.branch, conv.title, commitAuthor(env, editor));
      if (!res.ok) {
        if (res.rebuilt) await touch(env, id, { status: "ouverte", preview_url: null });
        await addMessages(env, id, [
          { role: "user", author: editor.email, content: [{ type: "text", text: `[${editor.name} a cliqué sur « Publier »]` }] },
          { role: "assistant", content: [{ type: "text", text: res.reason + (res.rebuilt ? " Écrivez-moi « publie » et je m'en occupe dès que l'aperçu est prêt." : "") }] },
        ]);
        return json({ error: res.reason, rebuilt: !!res.rebuilt }, 409);
      }
      await touch(env, id, { status: "publiee", published_sha: res.sha });
      await addMessages(env, id, [
        { role: "user", author: editor.email, content: [{ type: "text", text: `[${editor.name} a cliqué sur « Publier »]` }] },
        { role: "assistant", content: [{ type: "text", text: `C'est parti ✅ Le site sera à jour d'ici une à deux minutes : ${env.SITE_URL}` }] },
      ]);
      return json({ ok: true, sha: res.sha });
    } finally {
      await touch(env, id, { busy: 0 });
    }
  }

  if (action === "archive" && req.method === "POST") {
    if (!active) return json({ error: "Cette conversation est déjà terminée." }, 409);
    if (!(await lock(env, id))) return json({ error: "L'assistant travaille encore sur cette conversation." }, 409);
    await gh.deleteBranch(conv.branch);
    await touch(env, id, { status: "abandonnee", busy: 0 });
    return json({ ok: true });
  }

  return json({ error: "Introuvable" }, 404);
}
