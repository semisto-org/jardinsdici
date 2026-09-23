// Un Durable Object par conversation : l'agent tourne dans une alarme (jusqu'à 15 min, relancée si elle
// est interrompue), indépendamment de l'onglet de l'éditeur. L'interface suit l'avancement en interrogeant `live()`.
import { DurableObject } from "cloudflare:workers";
import Anthropic from "@anthropic-ai/sdk";
import { GitHub, bytesToB64 } from "./github";
import { SiteAgent, type AgentEvent } from "./agent";
import { editorFromEmail } from "./auth";
import type { Env } from "./env";
import { addMessages, loadHistory, touch, commitAuthor } from "./db";

interface Job { convId: string; editorEmail: string }
export interface Live { running: boolean; text: string; events: AgentEvent[] }

export class ConversationRunner extends DurableObject<Env> {
  private state: Live = { running: false, text: "", events: [] };

  async start(job: Job): Promise<void> {
    await this.ctx.storage.put("job", job);
    this.state = { running: true, text: "", events: [] };
    await this.ctx.storage.setAlarm(Date.now());
  }

  async live(): Promise<Live> {
    const job = await this.ctx.storage.get<Job>("job");
    return { ...this.state, running: this.state.running || !!job };
  }

  async alarm(): Promise<void> {
    const job = await this.ctx.storage.get<Job>("job");
    if (!job) return;
    const env = this.env;
    const conv = await env.DB.prepare(`SELECT * FROM conversations WHERE id = ?`).bind(job.convId).first<Record<string, any>>();
    if (!conv) { await this.ctx.storage.delete("job"); return; }
    this.state.running = true;
    const editor = editorFromEmail(job.editorEmail, env.ADMIN_NAMES);
    const gh = new GitHub(env);
    const emit = (e: AgentEvent) => {
      if (e.type === "text") this.state.text += e.delta;
      else this.state.events.push(e);
    };
    try {
      const history = await withImages(gh, conv.branch, await loadHistory(env, job.convId));
      const agent = new SiteAgent(env, gh, { id: job.convId, title: conv.title, branch: conv.branch }, commitAuthor(env, editor), emit,
        (s) => touch(env, job.convId, s));
      await agent.run(history, (msgs) => addMessages(env, job.convId, msgs.map((m) => ({ role: m.role, content: m.content as unknown[] }))));
    } catch (e) {
      console.error(e);
      const message = e instanceof Anthropic.AuthenticationError ? "La clé API de l'assistant est invalide ou absente." : `Oups, un souci technique : ${(e as Error).message}`;
      emit({ type: "error", message });
      await addMessages(env, job.convId, [{ role: "assistant", content: [{ type: "text", text: message }] }]);
    } finally {
      await this.ctx.storage.delete("job");
      await touch(env, job.convId, { busy: 0 });
      this.state.running = false;
    }
  }
}

// Les photos ne sont pas stockées dans D1 : on les recharge depuis GitHub pour le dernier message de l'éditeur.
const PHOTO = /\[Photo jointe, déjà ajoutée au site : (src\/assets\/images\/[a-z0-9-]+\.jpg)\]/g;
async function withImages(gh: GitHub, branch: string, history: Anthropic.Beta.BetaMessageParam[]) {
  const idx = history.findLastIndex((m) => m.role === "user" && Array.isArray(m.content) && m.content.some((b: any) => b.type === "text"));
  if (idx < 0) return history;
  const msg = history[idx];
  const blocks: Anthropic.Beta.BetaContentBlockParam[] = [];
  for (const b of msg.content as Anthropic.Beta.BetaContentBlockParam[]) {
    blocks.push(b);
    if (b.type !== "text") continue;
    for (const m of b.text.matchAll(PHOTO)) {
      const bytes = (await gh.readRaw(branch, m[1])) ?? (await gh.readRaw("main", m[1]));
      if (bytes) blocks.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: bytesToB64(bytes) } });
    }
  }
  const copy = [...history];
  copy[idx] = { ...msg, content: blocks };
  return copy;
}
