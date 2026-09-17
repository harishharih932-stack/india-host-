import { supabase } from "@/integrations/supabase/client";
import {
  compressFull,
  decompressFull,
  byteLength,
  savingsPercent,
  formatBytes,
  ratioLabel,
} from "@/lib/microxerox";
import { vaultPut } from "@/lib/vault";

export interface Repo {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  description: string | null;
  language: string | null;
  is_public: boolean;
  file_count: number;
  original_bytes: number;
  compressed_bytes: number;
  created_at: string;
  updated_at: string;
}

export interface RepoFile {
  id: string;
  repo_id: string;
  path: string;
  content: string;
  encoding: string;
  original_bytes: number;
  compressed_bytes: number;
  updated_at: string;
}

export interface Commit {
  id: string;
  message: string;
  files_changed: number;
  bytes_added: number;
  bytes_removed: number;
  created_at: string;
}

export interface Deployment {
  id: string;
  repo_id: string | null;
  slug: string;
  title: string;
  status: string;
  entry_file: string;
  build_log: string;
  source: string;
  created_at: string;
}

export function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "repo"
  );
}

async function requireUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("You need to be signed in.");
  return data.user;
}

async function logActivity(kind: string, detail: string) {
  const user = await requireUser();
  await supabase.from("activity_events").insert({ user_id: user.id, kind, detail });
}

/* ---------------------------------------------------------------- repos */

export async function listRepos(): Promise<Repo[]> {
  const user = await requireUser();
  const { data, error } = await supabase
    .from("repositories")
    .select("*")
    .eq("owner_id", user.id)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Repo[];
}

export async function getRepo(id: string): Promise<Repo | null> {
  const { data, error } = await supabase.from("repositories").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as Repo) ?? null;
}

export async function createRepo(input: {
  name: string;
  description?: string;
  isPublic?: boolean;
}): Promise<Repo> {
  const user = await requireUser();
  const { data, error } = await supabase
    .from("repositories")
    .insert({
      owner_id: user.id,
      name: input.name,
      slug: `${slugify(input.name)}-${Math.random().toString(36).slice(2, 6)}`,
      description: input.description ?? null,
      is_public: input.isPublic ?? false,
    })
    .select("*")
    .single();
  if (error) throw error;
  await logActivity("repo_created", input.name);
  return data as Repo;
}

export async function deleteRepo(id: string) {
  const { error } = await supabase.from("repositories").delete().eq("id", id);
  if (error) throw error;
}

export async function setRepoVisibility(id: string, isPublic: boolean) {
  const { error } = await supabase.from("repositories").update({ is_public: isPublic }).eq("id", id);
  if (error) throw error;
}

/* ---------------------------------------------------------------- files */

export interface IngestFile {
  path: string;
  text: string;
}

export interface FileReport {
  path: string;
  encoding: string;
  originalBytes: number;
  compressedBytes: number;
  savings: number;
  ratio: string;
  phases: { name: string; bytes: number; kept: boolean }[];
}

export interface IngestReport {
  files: number;
  originalBytes: number;
  compressedBytes: number;
  savings: number;
  lines: string[];
  reports: FileReport[];
}

async function refreshRepoTotals(repoId: string) {
  const { data, error } = await supabase
    .from("repo_files")
    .select("original_bytes, compressed_bytes, path")
    .eq("repo_id", repoId);
  if (error) throw error;
  const rows = data ?? [];
  const original = rows.reduce((sum, r) => sum + (r.original_bytes ?? 0), 0);
  const compressed = rows.reduce((sum, r) => sum + (r.compressed_bytes ?? 0), 0);
  const ext = rows[0]?.path.split(".").pop() ?? null;
  await supabase
    .from("repositories")
    .update({
      file_count: rows.length,
      original_bytes: original,
      compressed_bytes: compressed,
      language: ext,
    })
    .eq("id", repoId);
}

export async function ingestFiles(
  repoId: string,
  files: IngestFile[],
  message = "Upload files",
): Promise<IngestReport> {
  const user = await requireUser();
  const lines: string[] = [];
  const reports: FileReport[] = [];
  let originalBytes = 0;
  let compressedBytes = 0;

  for (const file of files) {
    const result = await compressFull(file.text, file.path);
    originalBytes += result.originalBytes;
    compressedBytes += result.compressedBytes;
    const { error } = await supabase.from("repo_files").upsert(
      {
        repo_id: repoId,
        owner_id: user.id,
        path: file.path,
        content: result.content,
        encoding: result.encoding,
        original_bytes: result.originalBytes,
        compressed_bytes: result.compressedBytes,
      },
      { onConflict: "repo_id,path" },
    );
    if (error) throw error;
    void vaultPut(`${repoId}:${file.path}`, result.content).catch(() => undefined);
    const savings = savingsPercent(result.originalBytes, result.compressedBytes);
    const ratio = ratioLabel(result.originalBytes, result.compressedBytes);
    reports.push({
      path: file.path,
      encoding: result.encoding,
      originalBytes: result.originalBytes,
      compressedBytes: result.compressedBytes,
      savings,
      ratio,
      phases: result.phases,
    });
    lines.push(
      `${file.path}  ${formatBytes(result.originalBytes)} -> ${formatBytes(result.compressedBytes)}  (${savings.toFixed(1)}% saved, ${ratio})`,
    );
  }

  const { error: commitError } = await supabase.from("commits").insert({
    repo_id: repoId,
    author_id: user.id,
    message,
    files_changed: files.length,
    bytes_added: compressedBytes,
    bytes_removed: Math.max(originalBytes - compressedBytes, 0),
  });
  if (commitError) throw commitError;

  await refreshRepoTotals(repoId);
  await logActivity("commit", `${files.length} file(s) in ${repoId.slice(0, 8)}`);

  return {
    files: files.length,
    originalBytes,
    compressedBytes,
    savings: savingsPercent(originalBytes, compressedBytes),
    lines,
    reports,
  };
}

export async function listFiles(repoId: string): Promise<RepoFile[]> {
  const { data, error } = await supabase
    .from("repo_files")
    .select("*")
    .eq("repo_id", repoId)
    .order("path");
  if (error) throw error;
  return (data ?? []) as RepoFile[];
}

export async function readFile(repoId: string, path: string): Promise<string> {
  const { data, error } = await supabase
    .from("repo_files")
    .select("content, encoding")
    .eq("repo_id", repoId)
    .eq("path", path)
    .maybeSingle();
  if (error) throw error;
  if (!data) return "";
  return decompressFull(data.content, data.encoding);
}

export interface FileWithBoth {
  file: RepoFile;
  original: string;
}

/** Reads a file row plus its decompressed original text. */
export async function readFileFull(repoId: string, path: string): Promise<FileWithBoth | null> {
  const { data, error } = await supabase
    .from("repo_files")
    .select("*")
    .eq("repo_id", repoId)
    .eq("path", path)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const file = data as RepoFile;
  return { file, original: await decompressFull(file.content, file.encoding) };
}

export interface SaveReport {
  encoding: string;
  originalBytes: number;
  compressedBytes: number;
  savings: number;
}

export async function saveFile(repoId: string, path: string, text: string): Promise<SaveReport> {
  const user = await requireUser();
  const result = await compressFull(text, path);
  const { error } = await supabase.from("repo_files").upsert(
    {
      repo_id: repoId,
      owner_id: user.id,
      path,
      content: result.content,
      encoding: result.encoding,
      original_bytes: result.originalBytes,
      compressed_bytes: result.compressedBytes,
    },
    { onConflict: "repo_id,path" },
  );
  if (error) throw error;
  void vaultPut(`${repoId}:${path}`, result.content).catch(() => undefined);

  await supabase.from("commits").insert({
    repo_id: repoId,
    author_id: user.id,
    message: `Edit ${path}`,
    files_changed: 1,
    bytes_added: result.compressedBytes,
    bytes_removed: Math.max(result.originalBytes - result.compressedBytes, 0),
  });
  await refreshRepoTotals(repoId);
  await logActivity("commit", `Edit ${path}`);

  return {
    encoding: result.encoding,
    originalBytes: result.originalBytes,
    compressedBytes: result.compressedBytes,
    savings: savingsPercent(result.originalBytes, result.compressedBytes),
  };
}

export async function listCommits(repoId: string): Promise<Commit[]> {
  const { data, error } = await supabase
    .from("commits")
    .select("*")
    .eq("repo_id", repoId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as Commit[];
}

/* ---------------------------------------------------------- deployments */

export async function listDeployments(): Promise<Deployment[]> {
  const user = await requireUser();
  const { data, error } = await supabase
    .from("deployments")
    .select("*")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Deployment[];
}

export async function createDeployment(input: {
  repoId: string;
  title: string;
  entryFile: string;
}): Promise<Deployment> {
  const user = await requireUser();
  const slug = `${slugify(input.title)}-${Math.random().toString(36).slice(2, 7)}`;
  const log = [
    `> boot slug=${slug}`,
    `> repo=${input.repoId.slice(0, 8)} entry=${input.entryFile}`,
    "> decoding microxerox payloads",
    "> status live",
  ].join("\n");

  // Visitors read the entry file through the public read path, so the repo is
  // published alongside the deployment.
  await setRepoVisibility(input.repoId, true);

  const { data, error } = await supabase
    .from("deployments")
    .insert({
      owner_id: user.id,
      repo_id: input.repoId,
      slug,
      title: input.title,
      entry_file: input.entryFile,
      status: "live",
      build_log: log,
      source: "web",
    })
    .select("*")
    .single();
  if (error) throw error;
  await logActivity("deploy", input.title);
  return data as Deployment;
}

export async function setDeploymentStatus(id: string, status: string) {
  const { error } = await supabase.from("deployments").update({ status }).eq("id", id);
  if (error) throw error;
}

export interface LiveDeployment {
  deployment: Deployment;
  entryContent: string | null;
  resolvedEntryFile: string | null;
}

export async function getLiveDeployment(slug: string): Promise<LiveDeployment | null> {
  const { data, error } = await supabase
    .from("deployments")
    .select("*")
    .eq("slug", slug)
    .eq("status", "live")
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const deployment = data as Deployment;
  let entryContent: string | null = null;
  let resolvedEntryFile: string | null = null;
  if (deployment.repo_id) {
    const { data: exactFile } = await supabase
      .from("repo_files")
      .select("path, content, encoding")
      .eq("repo_id", deployment.repo_id)
      .eq("path", deployment.entry_file)
      .maybeSingle();
    let file = exactFile;
    if (!file) {
      const { data: files, error: filesError } = await supabase
        .from("repo_files")
        .select("path, content, encoding")
        .eq("repo_id", deployment.repo_id)
        .order("path");
      if (filesError) throw filesError;
      file = (files ?? []).find((candidate) => /(^|\/)index\.html?$/i.test(candidate.path)) ?? null;
    }
    if (file) {
      resolvedEntryFile = file.path;
      entryContent = await decompressFull(file.content, file.encoding);
    }
  }
  return { deployment, entryContent, resolvedEntryFile };
}

/* -------------------------------------------------------------- profile */

export interface Profile {
  id: string;
  username: string | null;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
}

export async function getProfile(): Promise<Profile | null> {
  const user = await requireUser();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, display_name, bio, avatar_url")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw error;
  return (data as Profile) ?? null;
}

export async function updateProfile(input: {
  display_name?: string;
  username?: string;
  bio?: string;
}) {
  const user = await requireUser();
  const { error } = await supabase.from("profiles").update(input).eq("id", user.id);
  if (error) throw error;
}

export interface ProfileStats {
  repos: number;
  files: number;
  commits: number;
  deployments: number;
  originalBytes: number;
  compressedBytes: number;
  savings: number;
}

export async function getStats(): Promise<ProfileStats> {
  const repos = await listRepos();
  const user = await requireUser();
  const [{ count: commitCount }, { count: deployCount }] = await Promise.all([
    supabase.from("commits").select("id", { count: "exact", head: true }).eq("author_id", user.id),
    supabase.from("deployments").select("id", { count: "exact", head: true }).eq("owner_id", user.id),
  ]);
  const originalBytes = repos.reduce((sum, r) => sum + Number(r.original_bytes), 0);
  const compressedBytes = repos.reduce((sum, r) => sum + Number(r.compressed_bytes), 0);
  return {
    repos: repos.length,
    files: repos.reduce((sum, r) => sum + r.file_count, 0),
    commits: commitCount ?? 0,
    deployments: deployCount ?? 0,
    originalBytes,
    compressedBytes,
    savings: savingsPercent(originalBytes, compressedBytes),
  };
}

export interface ActivityDay {
  day: string;
  count: number;
}

export async function getActivity(days = 182): Promise<ActivityDay[]> {
  const user = await requireUser();
  const since = new Date();
  since.setDate(since.getDate() - days);
  const { data, error } = await supabase
    .from("activity_events")
    .select("day")
    .eq("user_id", user.id)
    .gte("day", since.toISOString().slice(0, 10));
  if (error) throw error;
  const counts = new Map<string, number>();
  for (const row of data ?? []) counts.set(row.day, (counts.get(row.day) ?? 0) + 1);
  const out: ActivityDay[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    out.push({ day: key, count: counts.get(key) ?? 0 });
  }
  return out;
}

/* ------------------------------------------------------------- api keys */

export interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  last_used_at: string | null;
  revoked: boolean;
  created_at: string;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function listApiKeys(): Promise<ApiKey[]> {
  const user = await requireUser();
  const { data, error } = await supabase
    .from("api_keys")
    .select("id, name, key_prefix, last_used_at, revoked, created_at")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ApiKey[];
}

export async function createApiKey(name: string): Promise<{ token: string }> {
  const user = await requireUser();
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const token = `ixk_${Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")}`;
  const { error } = await supabase.from("api_keys").insert({
    owner_id: user.id,
    name,
    key_prefix: token.slice(0, 12),
    key_hash: await sha256Hex(token),
  });
  if (error) throw error;
  await logActivity("api_key", name);
  return { token };
}

export async function revokeApiKey(id: string) {
  const { error } = await supabase.from("api_keys").update({ revoked: true }).eq("id", id);
  if (error) throw error;
}

export { byteLength };

/* ------------------------------------------------- public repo browsing */

export async function getRepoBySlug(slug: string): Promise<Repo | null> {
  const { data, error } = await supabase
    .from("repositories")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return (data as Repo) ?? null;
}

export async function getOwnerProfile(ownerId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, display_name, bio, avatar_url")
    .eq("id", ownerId)
    .maybeSingle();
  if (error) throw error;
  return (data as Profile) ?? null;
}

/** Decompresses every file of a repo and streams it to the browser as a .zip */
export async function downloadRepoZip(repoId: string, repoName: string) {
  const [{ zipSync, strToU8 }, files] = await Promise.all([
    import("fflate"),
    listFiles(repoId),
  ]);
  if (files.length === 0) throw new Error("This repository has no files yet.");

  const tree: Record<string, Uint8Array> = {};
  for (const file of files) {
    const text = await decompressFull(file.content, file.encoding);
    tree[file.path.replace(/^\/+/, "")] = strToU8(text);
  }

  const zipped = zipSync(tree, { level: 6 });
  const blob = new Blob([zipped as unknown as BlobPart], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${slugify(repoName)}.zip`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  return files.length;
}
