// Worker du site : sert le site statique, et l'admin conversationnelle sous /admin et /api/admin.
import Anthropic from "@anthropic-ai/sdk";
import adminPage from "./admin.html";
import { authenticate, editorFromEmail, type AuthEnv, type Editor } from "./auth";
import { GitHub } from "./github";
import { SiteAgent, branchFor, previewUrl, type AgentEnv, type AgentEvent } from "./agent";
import { publishBranch } from "./publish";

interface Env extends AuthEnv, AgentEnv {
  ASSETS: Fetcher;
  DB: D1Database;
  GITHUB_TOKEN: string;
  GITHUB_REPO: string;
}

type MessageParam = Anthropic.Beta.BetaMessageParam;

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const isAdmin = url.pathname === "/admin" || url.pathname.startsWith("/admin/") || url.pathname.startsWith("/api/admin/");
    if (!isAdmin) return env.ASSETS.fetch(req);

    const editor = await authenticate(req, env);
    if (!editor) return url.pathname.startsWith("/api/") ? json({ error: "Non autorisé" }, 401) : new Response("Accès réservé aux éditeurs du site.", { status: 403 });

    if (!url.pathname.startsWith("/api/")) {
      return new Response(adminPage, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Frame-Options": "DENY" } });
    }
    // Les appels d'API viennent uniquement de la page d'admin (protection contre les requêtes intersites).
    if (req.method !== "GET" && req.headers.get("X-Admin-Request") !== "1") return json({ error: "Requête refusée" }, 403);

    try {
      return await api(req, url, env, ctx, editor);
    } catch (e) {
      console.error(e);
      return json({ error: (e as Error).message }, 500);
    }
  },
} satisfies ExportedHandler<Env>;

async function api(req: Request, url: URL, env: Env, ctx: ExecutionContext, editor: Editor): Promise<Response> {
  const parts = url.pathname.replace(/^\/api\/admin\/?/, "").split("/").filter(Boolean);
  const gh = new GitHub(env);
  const now = () => Date.now();

  if (parts[0] === "me") {
    const names = Object.fromEntries(env.ADMIN_EMAILS.split(",").map((e) => e.trim()).filter(Boolean).map((e) => [e, editorFromEmail(e, env.ADMIN_NAMES).name]));
    return json({ email: editor.email, name: editor.name, names });
  }

  if (parts[0] === "conversations" && parts.length === 1) {
    if (req.method === "GET") {
      const { results } = await env.DB.prepare(
        `SELECT c.*, (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS message_count FROM conversations c ORDER BY updated_at DESC LIMIT 200`,
      ).all();
      return json(results);
    }
    if (req.method === "POST") {
      const id = crypto.randomUUID().replace(/-/g, "").slice(0, 10);
      const body = (await req.json().catch(() => ({}))) as { title?: string };
      const title = (body.title ?? "Nouvelle conversation").slice(0, 80);
      await env.DB.prepare(`INSERT INTO conversations (id, title, author, status, branch, created_at, updated_at) VALUES (?, ?, ?, 'ouverte', ?, ?, ?)`)
        .bind(id, title, editor.email, branchFor(id), now(), now()).run();
      return json({ id }, 201);
    }
  }

  const id = parts[1];
  if (parts[0] !== "conversations" || !id) return json({ error: "Introuvable" }, 404);
  const conv = await env.DB.prepare(`SELECT * FROM conversations WHERE id = ?`).bind(id).first<Record<string, any>>();
  if (!conv) return json({ error: "Conversation introuvable" }, 404);
  const action = parts[2];

  if (!action && req.method === "GET") {
    const { results } = await env.DB.prepare(`SELECT id, role, author, content, created_at FROM messages WHERE conversation_id = ? ORDER BY id`).bind(id).all();
    return json({ conversation: conv, messages: results.map((m: any) => ({ ...m, content: JSON.parse(m.content) })) });
  }

  if (action === "status" && req.method === "GET") {
    // État de la mise en ligne après publication : déploiement de main en cours ou terminé.
    let deploy: unknown = null;
    if (conv.status === "publiee" && conv.published_sha) deploy = await gh.latestRun("main", conv.published_sha);
    return json({ conversation: conv, deploy });
  }

  if (action === "upload" && req.method === "POST") {
    // Photo glissée dans le chat, déjà redimensionnée par le navigateur (JPEG).
    const name = (url.searchParams.get("name") ?? "photo").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\.[a-z]+$/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "photo";
    const bytes = new Uint8Array(await req.arrayBuffer());
    if (bytes.length > 4_000_000) return json({ error: "Image trop lourde (4 Mo max après réduction)." }, 413);
    if (!(bytes[0] === 0xff && bytes[1] === 0xd8)) return json({ error: "Seules les images JPEG sont acceptées." }, 415);
    const path = `src/assets/images/${name}-${crypto.randomUUID().slice(0, 6)}.jpg`;
    await gh.ensureBranch(conv.branch);
    await gh.writeFile(conv.branch, path, bytes, `Ajout de la photo ${path.split("/").pop()}`, editor);
    await touch(env, id, { status: "ouverte", preview_url: null });
    return json({ path });
  }

  if (action === "publish" && req.method === "POST") {
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    const res = await publishBranch(gh, client, env.MODEL ?? "claude-opus-5", conv.branch, conv.title, editor);
    if (!res.ok) return json({ error: res.reason }, 409);
    await touch(env, id, { status: "publiee", published_sha: res.sha });
    await addMessage(env, id, "user", editor.email, [{ type: "text", text: `[${editor.name} a cliqué sur « Publier »]` }]);
    await addMessage(env, id, "assistant", null, [{ type: "text", text: `C'est publié ✅ Le site sera à jour d'ici une à deux minutes : ${env.SITE_URL}` }]);
    return json({ ok: true, sha: res.sha, resolved: res.resolved });
  }

  if (action === "archive" && req.method === "POST") {
    await gh.deleteBranch(conv.branch);
    await touch(env, id, { status: "abandonnee" });
    return json({ ok: true });
  }

  if (action === "messages" && req.method === "POST") {
    if (conv.status === "publiee" || conv.status === "abandonnee") return json({ error: "Cette conversation est terminée. Ouvrez-en une nouvelle." }, 409);
    if (conv.busy && now() - conv.updated_at < 10 * 60_000) return json({ error: "L'assistant travaille déjà sur cette conversation." }, 409);
    const body = (await req.json()) as { text?: string; images?: { path: string; data: string }[] };
    const text = (body.text ?? "").trim();
    if (!text && !body.images?.length) return json({ error: "Message vide" }, 400);

    const dateFr = new Intl.DateTimeFormat("fr-BE", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Brussels" }).format(new Date());
    const content: Anthropic.Beta.BetaContentBlockParam[] = [{ type: "text", text: `[${editor.name}, ${dateFr}]\n${text}` }];
    for (const img of body.images ?? []) {
      content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: img.data } });
      content.push({ type: "text", text: `[Photo jointe, déjà ajoutée au site : ${img.path}]` });
    }
    await addMessage(env, id, "user", editor.email, content);
    if (conv.title === "Nouvelle conversation" && text) await touch(env, id, { title: text.slice(0, 70) + (text.length > 70 ? "…" : "") });
    await touch(env, id, { busy: 1 });

    const history = await loadHistory(env, id);
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const enc = new TextEncoder();
    let open = true;
    const send = (e: AgentEvent | { type: "done" }) => {
      if (!open) return;
      writer.write(enc.encode(`data: ${JSON.stringify(e)}\n\n`)).catch(() => { open = false; });
    };

    const agent = new SiteAgent(env, gh, { id, title: conv.title, branch: conv.branch }, editor, send,
      async (s) => touch(env, id, { status: s.status, ...(s.preview_url !== undefined ? { preview_url: s.preview_url } : {}) }));
    const work = agent
      .run(history, async (msgs) => { for (const m of msgs) await addMessage(env, id, m.role, null, m.content as unknown[]); })
      .catch(async (e) => {
        console.error(e);
        const message = e instanceof Anthropic.AuthenticationError ? "La clé API de l'assistant est invalide." : `Oups, un souci technique : ${(e as Error).message}`;
        send({ type: "error", message });
        await addMessage(env, id, "assistant", null, [{ type: "text", text: message }]);
      })
      .finally(async () => {
        await touch(env, id, { busy: 0 });
        send({ type: "done" });
        if (open) await writer.close().catch(() => {});
      });
    ctx.waitUntil(work);
    return new Response(readable, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store" } });
  }

  return json({ error: "Introuvable" }, 404);
}

async function addMessage(env: Env, id: string, role: string, author: string | null, content: unknown[] | string) {
  const blocks = typeof content === "string" ? [{ type: "text", text: content }] : content;
  await env.DB.prepare(`INSERT INTO messages (conversation_id, role, author, content, created_at) VALUES (?, ?, ?, ?, ?)`)
    .bind(id, role, author, JSON.stringify(blocks), Date.now()).run();
  await env.DB.prepare(`UPDATE conversations SET updated_at = ? WHERE id = ?`).bind(Date.now(), id).run();
}

const COLUMNS = new Set(["title", "status", "preview_url", "busy", "published_sha"]);
async function touch(env: Env, id: string, fields: Record<string, unknown>) {
  const keys = Object.keys(fields).filter((k) => COLUMNS.has(k));
  const sets = [...keys.map((k) => `${k} = ?`), "updated_at = ?"].join(", ");
  await env.DB.prepare(`UPDATE conversations SET ${sets} WHERE id = ?`).bind(...keys.map((k) => fields[k] ?? null), Date.now(), id).run();
}

async function loadHistory(env: Env, id: string): Promise<MessageParam[]> {
  const { results } = await env.DB.prepare(`SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY id`).bind(id).all<{ role: "user" | "assistant"; content: string }>();
  return results.map((m) => ({ role: m.role, content: JSON.parse(m.content) }));
}

export { previewUrl };
