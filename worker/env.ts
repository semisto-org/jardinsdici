import type { AuthEnv } from "./auth";
import type { AgentEnv } from "./agent";
import type { ConversationRunner } from "./runner";

export interface Env extends AuthEnv, AgentEnv {
  DB: D1Database;
  RUNNER: DurableObjectNamespace<ConversationRunner>;
  GITHUB_TOKEN: string;
  GITHUB_REPO: string;
  COMMIT_EMAIL?: string;
}
