// Publication d'une conversation : fusion de sa branche dans main, conflits résolus sans humain.
// Règle d'or : rien n'atteint main sans un aperçu construit avec succès pour exactement cette version.
import Anthropic from "@anthropic-ai/sdk";
import { GitHub, rebuildBranchOnMain, createBlob, type Author, type TreeChange } from "./github";
import { validateContent } from "./content";

export type PublishResult =
  | { ok: true; sha: string }
  | { ok: false; reason: string; rebuilt?: boolean };

export async function publishBranch(gh: GitHub, client: Anthropic, model: string, branch: string, title: string, author: Author): Promise<PublishResult> {
  const head = await gh.headSha(branch);
  if (!head) return { ok: false, reason: "Aucune modification à publier dans cette conversation." };
  const run = await gh.latestRun(branch, head);
  if (!run || run.status !== "completed") return { ok: false, reason: "L'aperçu de la dernière modification n'est pas encore prêt : attendez-le avant de publier." };
  if (run.conclusion !== "success") return { ok: false, reason: "L'aperçu de la dernière modification n'a pas pu être construit : il faut d'abord corriger." };

  const cmp = await gh.compare(branch);
  if (cmp.ahead === 0) return { ok: false, reason: "Ces modifications sont déjà en ligne." };

  const merge = await gh.merge(branch, `Publication : ${title}\n\nDemandé par ${author.name} depuis l'admin conversationnelle.`);
  if (merge.result === "merged") {
    await gh.deleteBranch(branch);
    return { ok: true, sha: merge.sha! };
  }
  if (merge.result === "nothing") return { ok: false, reason: "Ces modifications sont déjà en ligne." };

  // Conflit : quelqu'un a publié entre-temps une modification des mêmes fichiers.
  // On reconstruit la branche au-dessus de CE commit de main, puis on exige un nouvel aperçu avant de publier.
  const mainSha = (await gh.headSha("main"))!;
  const changes: TreeChange[] = [];
  const resolved: string[] = [];
  const assets = new Set([...(await gh.listFiles(mainSha, "src/assets")), ...(await gh.listFiles(branch, "src/assets"))]);
  for (const f of cmp.files) {
    if (f.status === "renamed" && f.previous) changes.push({ path: f.previous, sha: null });
    const ours = await gh.readFile(branch, f.path);
    if (f.status === "removed" || !ours) { changes.push({ path: f.path, sha: null }); continue; }
    const theirs = await gh.readFile(mainSha, f.path);
    const base = await gh.readFile(cmp.mergeBase, f.path);
    if (!theirs || theirs.sha === ours.sha || (base && theirs.sha === base.sha)) {
      changes.push({ path: f.path, sha: ours.sha }); // main n'a pas touché ce fichier : notre version s'applique telle quelle
      continue;
    }
    if (!/\.(md|ya?ml)$/.test(f.path)) return { ok: false, reason: `Le fichier ${f.path} a été remplacé des deux côtés : impossible de le fusionner automatiquement.` };
    const merged = await mergeText(client, model, f.path, base?.content ?? "", ours.content, theirs.content);
    const problems = validateContent(f.path, merged, assets);
    if (problems.length) return { ok: false, reason: `La fusion automatique de ${f.path} n'est pas valide (${problems.join(" ; ")}). Refaites la modification dans une nouvelle conversation.` };
    changes.push({ path: f.path, sha: await createBlob(gh, merged) });
    resolved.push(f.path);
  }
  await rebuildBranchOnMain(gh, branch, mainSha, changes, `Reprise de « ${title} » sur la dernière version du site${resolved.length ? ` (fusion : ${resolved.join(", ")})` : ""}`, author);
  return {
    ok: false,
    rebuilt: true,
    reason: `Le site a été modifié entre-temps par quelqu'un d'autre${resolved.length ? ` (${resolved.join(", ")})` : ""}. J'ai repris vos modifications sur la dernière version ; le nouvel aperçu se construit, il faudra publier à nouveau quand il sera prêt.`,
  };
}

async function mergeText(client: Anthropic, model: string, path: string, base: string, ours: string, theirs: string): Promise<string> {
  const response = await client.beta.messages.create({
    model,
    max_tokens: 32000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium" },
    system: "Tu fusionnes deux modifications concurrentes d'un même fichier de contenu (Markdown avec métadonnées YAML entre deux lignes ---) d'un site web. Garde les deux intentions : les ajouts et corrections de chaque côté. Si les deux côtés changent la même phrase différemment, garde la version « à publier ». Réponds uniquement avec le contenu complet du fichier fusionné, sans commentaire ni bloc de code.",
    messages: [{
      role: "user",
      content: `Fichier : ${path}\n\n=== Version d'origine ===\n${base || "(le fichier n'existait pas)"}\n\n=== Version déjà en ligne (publiée entre-temps par quelqu'un d'autre) ===\n${theirs}\n\n=== Version à publier ===\n${ours}`,
    }],
  });
  if (response.stop_reason !== "end_turn") throw new Error(`Fusion impossible (${response.stop_reason}) pour ${path}`);
  let text = response.content.filter((b) => b.type === "text").map((b) => (b as Anthropic.Beta.BetaTextBlock).text).join("").trim();
  text = text.replace(/^```[a-z]*\n([\s\S]*?)\n```$/i, "$1").trim();
  if (!text) throw new Error(`Fusion vide pour ${path}`);
  return text + "\n";
}
