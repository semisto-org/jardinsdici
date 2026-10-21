import type { AuthEnv } from "./auth";
import type { AccessEnv } from "./access";
import type { AgentEnv } from "./agent";
import type { ConversationRunner } from "./runner";

export interface Env extends AuthEnv, AccessEnv, AgentEnv {
  DB: D1Database;
  FILES: R2Bucket; // documents (et bientôt photos) de l'espace partenaires
  RUNNER: DurableObjectNamespace<ConversationRunner>;
  GITHUB_TOKEN: string;
  GITHUB_REPO: string;
  COMMIT_EMAIL?: string;
  ADMIN_EMAILS?: string; // propriétaires : toujours administrateurs (filet de sécurité), séparés par des virgules
}
