// Publication d'une conversation : fusion de sa branche dans main, conflits résolus sans humain.
import Anthropic from "@anthropic-ai/sdk";
import { GitHub, rebuildBranchOnMain, createBlob, type Author, type TreeChange } from "./github";

export type PublishResult =
  | { ok: true; sha: string; resolved: string[] }
  | { ok: false; reason: string };

export async function publishBranch(gh: GitHub, client: Anthropic, model: string, branch: string, title: string, author: Author): Promise<PublishResult> {
  const cmp = await gh.compare(branch);
  if (cmp.ahead === 0) return { ok: false, reason: "Aucune modification à publier dans cette conversation." };

  const message = `Publication : ${title}\n\nDemandé par ${author.name} depuis l'admin conversationnelle.`;
  let merge = await gh.merge(branch, message);
  const resolved: string[] = [];

  if (merge.result === "conflict") {
    // Quelqu'un a publié entre-temps une modification du même fichier : on reconstruit la branche au-dessus de main.
    const mainSha = (await gh.headSha("main"))!;
    const changes: TreeChange[] = [];
    for (const f of cmp.files) {
      const ours = await gh.readFile(branch, f.path);
      if (f.status === "removed" || !ours) { changes.push({ path: f.path, sha: null }); continue; }
      const theirs = await gh.readFile(mainSha, f.path);
      const base = await gh.readFile(cmp.mergeBase, f.path);
      if (!theirs || !base || theirs.sha === base.sha || theirs.sha === ours.sha) {
        changes.push({ path: f.path, sha: ours.sha }); // main n'a pas touché ce fichier : notre version s'applique telle quelle
        continue;
      }
      const merged = await mergeText(client, model, f.path, base.content, ours.content, theirs.content);
      changes.push({ path: f.path, sha: await createBlob(gh, merged) });
      resolved.push(f.path);
    }
    await rebuildBranchOnMain(gh, branch, changes, `Reprise de « ${title} » sur la dernière version du site`, author);
    merge = await gh.merge(branch, message);
    if (merge.result === "conflict") return { ok: false, reason: "Conflit persistant après reconstruction de la branche." };
  }
  if (merge.result === "nothing") return { ok: false, reason: "Ces modifications sont déjà en ligne." };
  await gh.deleteBranch(branch);
  return { ok: true, sha: merge.sha!, resolved };
}

async function mergeText(client: Anthropic, model: string, path: string, base: string, ours: string, theirs: string): Promise<string> {
  const response = await client.beta.messages.create({
    model,
    max_tokens: 32000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium" },
    system: "Tu fusionnes deux modifications concurrentes d'un même fichier de contenu (Markdown avec métadonnées YAML) d'un site web. Garde les deux intentions : les ajouts et corrections de chaque côté. Si les deux côtés changent la même phrase différemment, garde la version « à publier ». Réponds uniquement avec le contenu complet du fichier fusionné, sans commentaire ni bloc de code.",
    messages: [{
      role: "user",
      content: `Fichier : ${path}\n\n=== Version d'origine ===\n${base}\n\n=== Version déjà en ligne (publiée entre-temps par quelqu'un d'autre) ===\n${theirs}\n\n=== Version à publier ===\n${ours}`,
    }],
  });
  if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") throw new Error(`Fusion impossible (${response.stop_reason}) pour ${path}`);
  const text = response.content.filter((b) => b.type === "text").map((b) => (b as Anthropic.Beta.BetaTextBlock).text).join("");
  return text.endsWith("\n") ? text : text + "\n";
}
