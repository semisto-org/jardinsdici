import type Anthropic from "@anthropic-ai/sdk";
import type { Env } from "./env";
import type { Editor } from "./auth";
import type { Author } from "./github";

type MessageParam = Anthropic.Beta.BetaMessageParam;

/** Les commits portent le nom de l'éditeur mais l'adresse du site : le repo est public. */
export const commitAuthor = (env: Env, editor: Editor): Author => ({ name: editor.name, email: env.COMMIT_EMAIL ?? "bonjour@jardinsdici.org" });

/** Écrit plusieurs messages d'un coup (transaction) : jamais d'appel d'outil sans son résultat. */
export async function addMessages(env: Env, id: string, msgs: { role: string; author?: string | null; content: unknown[] }[]) {
  const now = Date.now();
  await env.DB.batch([
    ...msgs.map((m, i) => env.DB.prepare(`INSERT INTO messages (conversation_id, role, author, content, created_at) VALUES (?, ?, ?, ?, ?)`)
      .bind(id, m.role, m.author ?? null, JSON.stringify(m.content), now + i)),
    env.DB.prepare(`UPDATE conversations SET updated_at = ? WHERE id = ?`).bind(now, id),
  ]);
}

const COLUMNS = new Set(["title", "status", "preview_url", "busy", "published_sha"]);
export async function touch(env: Env, id: string, fields: Record<string, unknown>) {
  const keys = Object.keys(fields).filter((k) => COLUMNS.has(k) && fields[k] !== undefined);
  const sets = [...keys.map((k) => `${k} = ?`), "updated_at = ?"].join(", ");
  await env.DB.prepare(`UPDATE conversations SET ${sets} WHERE id = ?`).bind(...keys.map((k) => fields[k] ?? null), Date.now(), id).run();
}

/** Verrou atomique : une seule exécution à la fois par conversation. */
export async function lock(env: Env, id: string): Promise<boolean> {
  const stale = Date.now() - 20 * 60_000;
  const r = await env.DB.prepare(`UPDATE conversations SET busy = 1, updated_at = ? WHERE id = ? AND status IN ('ouverte', 'apercu') AND (busy = 0 OR updated_at < ?)`)
    .bind(Date.now(), id, stale).run();
  return r.meta.changes === 1;
}

export async function loadHistory(env: Env, id: string): Promise<MessageParam[]> {
  const { results } = await env.DB.prepare(`SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY id`).bind(id).all<{ role: "user" | "assistant"; content: string }>();
  const history: MessageParam[] = results.map((m) => ({ role: m.role, content: JSON.parse(m.content) }));
  // Filet de sécurité : un appel d'outil resté sans résultat rendrait la conversation inutilisable.
  const last = history[history.length - 1];
  if (last?.role === "assistant" && Array.isArray(last.content)) {
    const uses = (last.content as any[]).filter((b) => b.type === "tool_use");
    if (uses.length) history.push({ role: "user", content: uses.map((u) => ({ type: "tool_result", tool_use_id: u.id, is_error: true, content: "Interrompu." })) });
  }
  return history;
}
