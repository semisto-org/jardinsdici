// L'assistant de l'admin : une boucle tool-use Claude qui lit et modifie le contenu du site
// sur la branche de la conversation, puis publie quand l'éditeur le demande.
import Anthropic from "@anthropic-ai/sdk";
import knowledge from "../admin/knowledge.md";
import { GitHub, type Author } from "./github";
import { checkPath, validateContent, WRITABLE_TEXT, DELETABLE, READABLE } from "./content";
import { publishBranch } from "./publish";

type MessageParam = Anthropic.Beta.BetaMessageParam;
type ToolResult = Anthropic.Beta.BetaToolResultBlockParam;

export interface AgentEnv {
  ANTHROPIC_API_KEY: string;
  MODEL?: string;
  PREVIEW_URL_TEMPLATE: string; // ex. "https://{alias}-jardinsdici.birch.workers.dev"
  SITE_URL: string;
}

export type AgentEvent =
  | { type: "text"; delta: string }
  | { type: "tool"; name: string; label: string }
  | { type: "tool_done"; label: string; ok: boolean }
  | { type: "preview"; url: string }
  | { type: "published"; sha: string }
  | { type: "error"; message: string };

export interface Conversation { id: string; title: string; branch: string }

export const branchFor = (id: string) => `chat/${id}`;
export const previewUrl = (env: AgentEnv, branch: string) => env.PREVIEW_URL_TEMPLATE.replace("{alias}", branch.replace("/", "-"));

const SYSTEM = `Tu es l'assistant qui tient à jour le site web des Jardins d'ici (${"{SITE_URL}"}). Les personnes qui te parlent sont des membres du collectif, pas des techniciens : elles te demandent en français d'ajouter un événement, de changer un texte, de remplacer une photo… Tu fais le travail toi-même avec tes outils, tu ne leur demandes jamais de toucher au code, à Git ou à un terminal.

# Comment le site est fait

Site Astro. Tout le contenu éditorial est en Markdown dans le dépôt, un fichier par élément :
- src/content/pages/**.md — les pages ; le chemin du fichier donne l'URL (pages/espaces/potager-en-permaculture.md → /espaces/potager-en-permaculture). Métadonnées : title (obligatoire), description, cover (image), order (nombre, ordre dans les listes). Une page affiche automatiquement ses sous-pages.
- src/content/events/AAAA-MM-JJ-titre-court.md — l'agenda. Métadonnées : title, date (AAAA-MM-JJ, obligatoire), endDate, time (ex. « 10 h – 17 h »), summary (une phrase pour les cartes), cover (image), link (URL d'inscription). « À venir » et « passés » se calculent seuls à partir de la date.
- src/content/facts/*.md (Le saviez-vous : title, image, source {label, url}, order), src/content/faq/*.md (question, order ; le corps est la réponse), src/content/partners/*.md (name, role, url, image, order).
- src/content/site.yaml — chiffres clés de l'accueil (stats), e-mail, liens newsletter / Facebook / réservation école.
- Images : src/assets/images/. Depuis un fichier Markdown, on les référence en chemin relatif : depuis src/content/events/x.md → ../../assets/images/photo.jpg ; depuis src/content/pages/espaces/x.md → ../../../assets/images/photo.jpg. Les photos ajoutées par l'éditeur dans la conversation sont déjà déposées dans src/assets/images/ et leur chemin t'est donné.
- Galerie : toute image placée dans src/assets/galerie/ apparaît sur /galerie.
- admin/knowledge.md — ce que tu sais du collectif (ci-dessous). Tu peux le compléter quand on t'apprend quelque chose de durable.

Tu ne peux modifier que ce contenu. Le design, la mise en page et le code ne se changent pas depuis cette conversation : si on te le demande, explique gentiment que c'est un travail de développement et qu'il faut en parler à Michael (m.hulet@semisto.org).

# Façon de travailler

1. Avant de modifier un fichier, lis-le (read_file) ; pour trouver le bon fichier, list_files. Réécris toujours le fichier complet avec write_file, en conservant ce que tu ne changes pas.
2. N'invente jamais un fait (date, horaire, prix, nom, lien). S'il manque une information indispensable, pose une question courte avant d'écrire.
3. Après tes modifications, appelle check_preview : il attend la construction de l'aperçu (1 à 3 minutes). Si la construction échoue, lis l'erreur, corrige et relance, sans déranger l'éditeur avec les détails techniques.
4. Quand l'aperçu est prêt, dis en une ou deux phrases ce que tu as changé et invite à vérifier l'aperçu, puis à écrire « publie » (ou cliquer sur Publier) quand c'est bon.
5. N'appelle publish que si l'éditeur l'a demandé explicitement dans son dernier message (« publie », « mets en ligne », « c'est bon, vas-y »).
6. Réponds en français, simplement et brièvement, sans jargon (ni « commit », ni « branche », ni « build »).

# Ce que tu sais du collectif

${knowledge}`;

const tools: Anthropic.Beta.BetaTool[] = [
  {
    name: "list_files",
    description: "Liste les fichiers d'un dossier du site (récursivement), dans la version en cours de modification. Dossiers utiles : src/content, src/content/events, src/content/pages, src/assets/images.",
    input_schema: { type: "object", properties: { dir: { type: "string", description: "ex. src/content/events" } }, required: ["dir"] },
  },
  {
    name: "read_file",
    description: "Lit le contenu complet d'un fichier texte du site (Markdown ou YAML).",
    input_schema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
  },
  {
    name: "write_file",
    description: "Crée ou remplace entièrement un fichier de contenu (src/content/… ou admin/knowledge.md). Le contenu est vérifié (métadonnées obligatoires, images existantes) ; en cas de problème rien n'est écrit et la liste des problèmes est renvoyée.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: { path: { type: "string" }, content: { type: "string", description: "Contenu complet du fichier" }, summary: { type: "string", description: "Résumé en quelques mots de la modification, en français" } },
      required: ["path", "content", "summary"],
    },
  },
  {
    name: "delete_file",
    description: "Supprime un fichier de contenu ou une image du site.",
    input_schema: { type: "object", properties: { path: { type: "string" }, summary: { type: "string" } }, required: ["path", "summary"] },
  },
  {
    name: "check_preview",
    description: "Attend que l'aperçu des modifications de cette conversation soit construit (jusqu'à ~3 minutes). Renvoie l'adresse de l'aperçu, ou l'erreur de construction à corriger.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "publish",
    description: "Met en ligne les modifications de cette conversation sur le vrai site. Uniquement si l'éditeur l'a demandé explicitement.",
    input_schema: { type: "object", properties: {} },
  },
];

export class SiteAgent {
  private client: Anthropic;
  private model: string;
  private gh: GitHub;
  private lastCommit: string | null = null;

  constructor(private env: AgentEnv, gh: GitHub, private conv: Conversation, private editor: Author, private emit: (e: AgentEvent) => void, private onStatus: (s: { status: string; preview_url?: string | null }) => Promise<void>) {
    this.client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    this.model = env.MODEL ?? "claude-opus-5";
    this.gh = gh;
  }

  /** Fait avancer la conversation jusqu'à la réponse finale. Renvoie les messages à ajouter à l'historique. */
  async run(history: MessageParam[], persist: (msgs: MessageParam[]) => Promise<void>): Promise<void> {
    const messages = [...history];
    let jsonRetries = 0;
    for (let turn = 0; turn < 40; turn++) {
      const stream = this.client.beta.messages.stream({
        model: this.model,
        max_tokens: 64000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        thinking: { type: "adaptive" },
        cache_control: { type: "ephemeral" },
        system: [{ type: "text", text: SYSTEM.replace("{SITE_URL}", this.env.SITE_URL), cache_control: { type: "ephemeral" } }],
        tools,
        messages,
      });
      stream.on("text", (delta) => this.emit({ type: "text", delta }));

      let message: Anthropic.Beta.BetaMessage;
      try {
        message = await stream.finalMessage();
        jsonRetries = 0;
      } catch (err) {
        if (err instanceof Anthropic.APIError || jsonRetries++ >= 2) throw err;
        continue; // entrée d'outil illisible : on relance le tour
      }

      if (message.stop_reason === "refusal") {
        const msg: MessageParam = { role: "assistant", content: [{ type: "text", text: "Je ne peux pas traiter cette demande." }] };
        await persist([msg]);
        this.emit({ type: "text", delta: "Je ne peux pas traiter cette demande." });
        return;
      }
      if (message.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content: message.content });
        continue;
      }
      const toolUses = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
      if (message.stop_reason === "max_tokens" && toolUses.length) throw new Error("Réponse tronquée (max_tokens) pendant un appel d'outil.");

      const assistant: MessageParam = { role: "assistant", content: message.content };
      if (!toolUses.length) {
        await persist([assistant]);
        return;
      }
      const results: ToolResult[] = [];
      for (const use of toolUses) results.push(await this.execute(use));
      const toolTurn: MessageParam = { role: "user", content: results };
      messages.push(assistant, toolTurn);
      await persist([assistant, toolTurn]);
    }
    throw new Error("La conversation a dépassé le nombre d'étapes autorisé.");
  }

  private async execute(use: Anthropic.Beta.BetaToolUseBlock): Promise<ToolResult> {
    const input = (use.input ?? {}) as Record<string, unknown>;
    const done = (content: string, ok = true, label?: string): ToolResult => {
      if (label) this.emit({ type: "tool_done", label, ok });
      return { type: "tool_result", tool_use_id: use.id, content, ...(ok ? {} : { is_error: true }) };
    };
    const branch = this.conv.branch;
    const ref = async () => ((await this.gh.headSha(branch)) ? branch : "main");
    try {
      switch (use.name) {
        case "list_files": {
          const dir = String(input.dir ?? "");
          const err = checkPath(dir.replace(/\/$/, "") + "/x", READABLE);
          if (err) return done(err, false);
          const files = await this.gh.listFiles(await ref(), dir);
          return done(files.length ? files.join("\n") : "(dossier vide)");
        }
        case "read_file": {
          const path = String(input.path ?? "");
          const err = checkPath(path, READABLE);
          if (err) return done(err, false);
          const f = await this.gh.readFile(await ref(), path);
          return done(f ? f.content : `Fichier introuvable : ${path}`, !!f);
        }
        case "write_file": {
          const path = String(input.path ?? "");
          const content = input.content;
          const summary = String(input.summary ?? "Modification");
          if (typeof content !== "string" || !content.length) return done("INVALID_JSON : content manquant ou vide.", false);
          const err = checkPath(path, WRITABLE_TEXT);
          if (err) return done(err, false);
          this.emit({ type: "tool", name: use.name, label: `✏️ ${summary}` });
          await this.gh.ensureBranch(branch);
          const assets = new Set(await this.gh.listFiles(branch, "src/assets"));
          const problems = validateContent(path, content, assets);
          if (problems.length) return done(`Rien n'a été écrit. Problèmes à corriger :\n- ${problems.join("\n- ")}`, false, `⚠️ ${summary} : à corriger`);
          this.lastCommit = await this.gh.writeFile(branch, path, content, summary, this.editor);
          await this.onStatus({ status: "ouverte", preview_url: null });
          return done(`Écrit : ${path}`, true, `✅ ${summary}`);
        }
        case "delete_file": {
          const path = String(input.path ?? "");
          const summary = String(input.summary ?? `Suppression de ${path}`);
          const err = checkPath(path, DELETABLE);
          if (err) return done(err, false);
          this.emit({ type: "tool", name: use.name, label: `🗑️ ${summary}` });
          await this.gh.ensureBranch(branch);
          const ok = await this.gh.deleteFile(branch, path, summary, this.editor);
          if (ok) this.lastCommit = await this.gh.headSha(branch);
          return done(ok ? `Supprimé : ${path}` : `Fichier introuvable : ${path}`, ok, ok ? `✅ ${summary}` : undefined);
        }
        case "check_preview": {
          this.emit({ type: "tool", name: use.name, label: "⏳ Préparation de l'aperçu…" });
          const head = this.lastCommit ?? (await this.gh.headSha(branch));
          if (!head) return done("Aucune modification dans cette conversation : rien à prévisualiser.", false, "Aucune modification");
          const deadline = Date.now() + 200_000;
          while (Date.now() < deadline) {
            const run = await this.gh.latestRun(branch, head);
            if (run?.status === "completed") {
              if (run.conclusion === "success") {
                const url = previewUrl(this.env, branch);
                await this.onStatus({ status: "apercu", preview_url: url });
                this.emit({ type: "preview", url });
                return done(`Aperçu prêt : ${url}`, true, "👀 Aperçu prêt");
              }
              const log = await this.gh.failedLogTail(run.id);
              return done(`La construction de l'aperçu a échoué. Fin du journal :\n${log}`, false, "🔧 Correction en cours…");
            }
            await new Promise((r) => setTimeout(r, 6000));
          }
          return done("L'aperçu n'est pas encore prêt après 3 minutes. Rappelle check_preview.", false);
        }
        case "publish": {
          this.emit({ type: "tool", name: use.name, label: "🚀 Mise en ligne…" });
          const res = await publishBranch(this.gh, this.client, this.model, branch, this.conv.title, this.editor);
          if (!res.ok) return done(res.reason, false, `⚠️ ${res.reason}`);
          await this.onStatus({ status: "publiee" });
          this.emit({ type: "published", sha: res.sha });
          const note = res.resolved.length ? ` (fusionné automatiquement avec des modifications publiées entre-temps sur : ${res.resolved.join(", ")})` : "";
          return done(`Publié${note}. Le site en ligne sera à jour dans une à deux minutes : ${this.env.SITE_URL}`, true, "✅ Publié");
        }
        default:
          return done(`Outil inconnu : ${use.name}`, false);
      }
    } catch (e) {
      return done(`Erreur technique : ${(e as Error).message}`, false, "⚠️ Erreur technique");
    }
  }
}
