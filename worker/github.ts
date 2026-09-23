// Accès au repo GitHub du site : lecture, écriture sur une branche de conversation, fusion.
export interface GitHubEnv {
  GITHUB_TOKEN: string;
  GITHUB_REPO: string; // "owner/name"
}

export interface Author { name: string; email: string }

export class GitHub {
  constructor(private env: GitHubEnv) {}

  async api<T = any>(path: string, init: RequestInit = {}, okStatuses: number[] = []): Promise<{ status: number; data: T }> {
    const res = await fetch(`https://api.github.com/repos/${this.env.GITHUB_REPO}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "jardinsdici-admin",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
    const text = await res.text();
    const data = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
    if (!res.ok && !okStatuses.includes(res.status)) {
      throw new GitHubError(res.status, `GitHub ${init.method ?? "GET"} ${path} → ${res.status} ${typeof data === "object" ? data?.message ?? "" : ""}`);
    }
    return { status: res.status, data: data as T };
  }

  async headSha(branch: string): Promise<string | null> {
    const r = await this.api(`/git/ref/heads/${encodeURIComponent(branch).replace(/%2F/g, "/")}`, {}, [404]);
    return r.status === 404 ? null : r.data.object.sha;
  }

  /** Crée la branche depuis main si elle n'existe pas encore. */
  async ensureBranch(branch: string): Promise<void> {
    if (await this.headSha(branch)) return;
    const main = await this.headSha("main");
    await this.api(`/git/refs`, { method: "POST", body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: main }) });
  }

  async resetBranchTo(branch: string, sha: string): Promise<void> {
    await this.api(`/git/refs/heads/${branch}`, { method: "PATCH", body: JSON.stringify({ sha, force: true }) });
  }

  /** Liste récursive des fichiers d'un dossier sur une ref. */
  async listFiles(ref: string, dir: string): Promise<string[]> {
    const r = await this.api(`/git/trees/${encodeURIComponent(ref)}?recursive=1`);
    const prefix = dir.replace(/\/$/, "") + "/";
    return (r.data.tree as { path: string; type: string }[])
      .filter((e) => e.type === "blob" && e.path.startsWith(prefix))
      .map((e) => e.path);
  }

  async readFile(ref: string, path: string): Promise<{ content: string; sha: string } | null> {
    const r = await this.api(`/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`, {}, [404]);
    if (r.status === 404 || Array.isArray(r.data)) return null;
    return { content: decodeBase64Utf8(r.data.content), sha: r.data.sha };
  }

  async readFileAtCommit(sha: string, path: string): Promise<string | null> {
    return (await this.readFile(sha, path))?.content ?? null;
  }

  async writeFile(branch: string, path: string, content: string | Uint8Array, message: string, author: Author): Promise<string> {
    const existing = await this.api(`/contents/${encodePath(path)}?ref=${encodeURIComponent(branch)}`, {}, [404]);
    const body = {
      message,
      content: typeof content === "string" ? encodeBase64Utf8(content) : bytesToBase64(content),
      branch,
      author,
      committer: author,
      ...(existing.status === 200 && !Array.isArray(existing.data) ? { sha: existing.data.sha } : {}),
    };
    const r = await this.api(`/contents/${encodePath(path)}`, { method: "PUT", body: JSON.stringify(body) });
    return r.data.commit.sha;
  }

  async deleteFile(branch: string, path: string, message: string, author: Author): Promise<boolean> {
    const existing = await this.readFile(branch, path);
    if (!existing) return false;
    await this.api(`/contents/${encodePath(path)}`, {
      method: "DELETE",
      body: JSON.stringify({ message, sha: existing.sha, branch, author, committer: author }),
    });
    return true;
  }

  /** Fichiers modifiés par la branche depuis son point de départ sur main. */
  async compare(branch: string) {
    const r = await this.api(`/compare/main...${encodeURIComponent(branch)}`);
    return {
      mergeBase: r.data.merge_base_commit.sha as string,
      ahead: r.data.ahead_by as number,
      files: (r.data.files ?? []).map((f: any) => ({ path: f.filename as string, status: f.status as string })),
    };
  }

  /** Fusionne la branche dans main. `conflict` si GitHub ne sait pas le faire seul. */
  async merge(branch: string, message: string): Promise<{ result: "merged" | "nothing" | "conflict"; sha?: string }> {
    const r = await this.api(`/merges`, { method: "POST", body: JSON.stringify({ base: "main", head: branch, commit_message: message }) }, [204, 409]);
    if (r.status === 204) return { result: "nothing" };
    if (r.status === 409) return { result: "conflict" };
    return { result: "merged", sha: r.data.sha };
  }

  async deleteBranch(branch: string): Promise<void> {
    await this.api(`/git/refs/heads/${branch}`, { method: "DELETE" }, [404, 422]);
  }

  /** Dernière exécution du workflow de build pour une branche (ou un commit précis). */
  async latestRun(branch: string, headSha?: string) {
    const q = new URLSearchParams({ branch, per_page: "5", event: "push" });
    const r = await this.api(`/actions/runs?${q}`);
    const runs = (r.data.workflow_runs ?? []) as any[];
    const run = headSha ? runs.find((x) => x.head_sha === headSha) : runs[0];
    if (!run) return null;
    return { id: run.id as number, status: run.status as string, conclusion: run.conclusion as string | null, headSha: run.head_sha as string, url: run.html_url as string };
  }

  /** Fin du journal du job en échec, pour que l'agent comprenne l'erreur de build. */
  async failedLogTail(runId: number, lines = 60): Promise<string> {
    const jobs = await this.api(`/actions/runs/${runId}/jobs`);
    const job = (jobs.data.jobs as any[]).find((j) => j.conclusion === "failure") ?? jobs.data.jobs[0];
    if (!job) return "";
    const res = await fetch(`https://api.github.com/repos/${this.env.GITHUB_REPO}/actions/jobs/${job.id}/logs`, {
      headers: { Authorization: `Bearer ${this.env.GITHUB_TOKEN}`, "User-Agent": "jardinsdici-admin", Accept: "application/vnd.github+json" },
    });
    const text = await res.text();
    return text.split("\n").map((l) => l.replace(/^\S+Z /, "")).filter((l) => !/^##\[(group|endgroup)\]/.test(l)).slice(-lines).join("\n");
  }
}

export class GitHubError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const encodePath = (p: string) => p.split("/").map(encodeURIComponent).join("/");

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
const encodeBase64Utf8 = (s: string) => bytesToBase64(new TextEncoder().encode(s));
function decodeBase64Utf8(b64: string): string {
  const bin = atob(b64.replace(/\n/g, ""));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

// --- Git Data API : utilisé pour reconstruire une branche au-dessus de main lors d'un conflit ---
export interface TreeChange { path: string; sha: string | null } // sha null = suppression

export async function rebuildBranchOnMain(gh: GitHub, branch: string, changes: TreeChange[], message: string, author: Author): Promise<string> {
  const api = gh.api.bind(gh);
  const mainSha = (await gh.headSha("main"))!;
  const mainCommit = await api(`/git/commits/${mainSha}`);
  const tree = await api(`/git/trees`, {
    method: "POST",
    body: JSON.stringify({ base_tree: mainCommit.data.tree.sha, tree: changes.map((c) => ({ path: c.path, mode: "100644", type: "blob", sha: c.sha })) }),
  });
  const commit = await api(`/git/commits`, {
    method: "POST",
    body: JSON.stringify({ message, tree: tree.data.sha, parents: [mainSha], author, committer: author }),
  });
  await gh.resetBranchTo(branch, commit.data.sha);
  return commit.data.sha;
}

export async function createBlob(gh: GitHub, content: string): Promise<string> {
  const api = gh.api.bind(gh);
  const r = await api(`/git/blobs`, { method: "POST", body: JSON.stringify({ content, encoding: "utf-8" }) });
  return r.data.sha;
}
