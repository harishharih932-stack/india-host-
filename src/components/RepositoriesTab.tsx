import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  createRepo,
  deleteRepo,
  downloadRepoZip,
  ingestFiles,
  listRepos,
  setRepoVisibility,
} from "@/lib/data";
import { formatBytes, savingsPercent } from "@/lib/microxerox";
import { UploadDropzone, type PickedFile } from "@/components/UploadDropzone";
import { ConsoleOutput } from "@/components/ConsoleOutput";

export function RepositoriesTab() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [target, setTarget] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [zipping, setZipping] = useState<string | null>(null);


  const reposQuery = useQuery({ queryKey: ["repos"], queryFn: listRepos });

  const create = useMutation({
    mutationFn: () => createRepo({ name: name.trim() }),
    onSuccess: (repo) => {
      setName("");
      setTarget(repo.id);
      toast.success(`Repository ${repo.name} created`);
      void queryClient.invalidateQueries({ queryKey: ["repos"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const upload = useMutation({
    mutationFn: (files: PickedFile[]) => {
      if (!target) throw new Error("Pick a repository first.");
      return ingestFiles(target, files);
    },
    onSuccess: (report) => {
      setLog([
        `> ${report.files} file(s) encoded`,
        ...report.lines,
        `> total ${formatBytes(report.originalBytes)} -> ${formatBytes(report.compressedBytes)} (${report.savings}% saved)`,
      ]);
      toast.success(`${report.files} file(s) committed · ${report.savings}% smaller`);
      void queryClient.invalidateQueries({ queryKey: ["repos"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const repos = reposQuery.data ?? [];

  return (
    <div className="space-y-6">
      <section className="panel p-4">
        <span className="mono-label">Create a new repository</span>
        <p className="mt-1 text-xs text-muted-foreground">
          A repository is a folder for one project's files — like a GitHub repo.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Repository name, e.g. my-static-site"
            className="min-w-56 flex-1 rounded-md border border-input bg-background px-3 py-2 font-mono text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            type="button"
            disabled={!name.trim() || create.isPending}
            onClick={() => create.mutate()}
            className="rounded-md bg-primary px-4 py-2 font-mono text-xs font-semibold text-primary-foreground disabled:opacity-50"
          >
            Create repository
          </button>
        </div>
      </section>

      <section className="panel p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="mono-label">Upload files</span>
            <p className="mt-1 text-xs text-muted-foreground">
              Choose a repository, then drop your project files in — they are compressed
              automatically before saving.
            </p>
          </div>
          <select
            value={target ?? ""}
            onChange={(event) => setTarget(event.target.value || null)}
            className="rounded-md border border-input bg-background px-2 py-1.5 font-mono text-xs text-foreground"
          >
            <option value="">Choose a repository…</option>
            {repos.map((repo) => (
              <option key={repo.id} value={repo.id}>
                {repo.name}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-3 space-y-3">
          <UploadDropzone busy={upload.isPending} onFiles={(files) => upload.mutate(files)} />
          <ConsoleOutput lines={log} title="Upload log" />
        </div>
      </section>

      <section className="space-y-3">
        <span className="mono-label">Your repositories ({repos.length})</span>
        {reposQuery.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!reposQuery.isLoading && repos.length === 0 && (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No repositories yet — create your first one above to get started.
          </p>
        )}
        {repos.map((repo) => (
          <article key={repo.id} className="panel p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-mono text-sm font-semibold text-foreground">{repo.name}</h3>
                <p className="mono-label mt-1">
                  {repo.is_public ? "public" : "private"} · {repo.file_count} files ·{" "}
                  {formatBytes(Number(repo.compressed_bytes))} stored ·{" "}
                  {savingsPercent(Number(repo.original_bytes), Number(repo.compressed_bytes))}% saved
                </p>
                <p className="mono-label mt-1 truncate text-muted-foreground">/r/{repo.slug}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  to="/r/$slug"
                  params={{ slug: repo.slug }}
                  className="rounded-md border border-border px-3 py-1.5 font-mono text-xs text-foreground hover:bg-secondary"
                >
                  View repo
                </Link>
                <button
                  type="button"
                  onClick={async () => {
                    const url = `${window.location.origin}/r/${repo.slug}`;
                    try {
                      await navigator.clipboard.writeText(url);
                      toast.success("Repository link copied");
                    } catch {
                      toast.error(`Copy failed — link: ${url}`);
                    }
                  }}
                  className="rounded-md border border-border px-3 py-1.5 font-mono text-xs text-muted-foreground hover:bg-secondary"
                >
                  Copy link
                </button>
                <button
                  type="button"
                  disabled={zipping === repo.id}
                  onClick={async () => {
                    setZipping(repo.id);
                    try {
                      const count = await downloadRepoZip(repo.id, repo.name);
                      toast.success(`Downloaded ${count} file(s) as ZIP`);
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : "Download failed");
                    } finally {
                      setZipping(null);
                    }
                  }}
                  className="rounded-md border border-border px-3 py-1.5 font-mono text-xs text-muted-foreground hover:bg-secondary disabled:opacity-50"
                >
                  {zipping === repo.id ? "Preparing…" : "Download ZIP"}
                </button>
                <Link
                  to="/repo/$id/edit/$"
                  params={{ id: repo.id, _splat: "" }}
                  className="rounded-md border border-border px-3 py-1.5 font-mono text-xs text-foreground hover:bg-secondary"
                >
                  Open editor
                </Link>
                <button
                  type="button"
                  onClick={async () => {
                    await setRepoVisibility(repo.id, !repo.is_public);
                    void queryClient.invalidateQueries({ queryKey: ["repos"] });
                  }}
                  className="rounded-md border border-border px-3 py-1.5 font-mono text-xs text-muted-foreground hover:bg-secondary"
                >
                  {repo.is_public ? "Make private" : "Make public"}
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    if (!window.confirm(`Delete "${repo.name}" and all its files? This cannot be undone.`)) return;
                    await deleteRepo(repo.id);
                    toast.success("Repository deleted");
                    void queryClient.invalidateQueries({ queryKey: ["repos"] });
                  }}
                  className="rounded-md border border-border px-3 py-1.5 font-mono text-xs text-destructive hover:bg-secondary"
                >
                  Delete
                </button>
              </div>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
