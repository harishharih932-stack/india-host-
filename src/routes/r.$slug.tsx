import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { Logo } from "@/components/Logo";
import {
  downloadRepoZip,
  getOwnerProfile,
  getRepoBySlug,
  listCommits,
  listFiles,
  readFile,
} from "@/lib/data";
import { formatBytes, savingsPercent } from "@/lib/microxerox";

export const Route = createFileRoute("/r/$slug")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Repository — indihost" },
      {
        name: "description",
        content:
          "Browse a public indihost repository: files, commit history, storage savings, and a one-click ZIP download of the whole project.",
      },
      { property: "og:title", content: "Repository — indihost" },
      {
        property: "og:description",
        content: "Browse files, commits and download the whole repository as a ZIP.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PublicRepo,
});

function PublicRepo() {
  const { slug } = Route.useParams();
  const [openFile, setOpenFile] = useState<string | null>(null);
  const [zipping, setZipping] = useState(false);

  const repoQuery = useQuery({ queryKey: ["repo-slug", slug], queryFn: () => getRepoBySlug(slug) });
  const repo = repoQuery.data ?? null;

  const ownerQuery = useQuery({
    queryKey: ["owner", repo?.owner_id],
    queryFn: () => getOwnerProfile(repo!.owner_id),
    enabled: Boolean(repo?.owner_id),
  });
  const filesQuery = useQuery({
    queryKey: ["repo-files", repo?.id],
    queryFn: () => listFiles(repo!.id),
    enabled: Boolean(repo?.id),
  });
  const commitsQuery = useQuery({
    queryKey: ["commits", repo?.id],
    queryFn: () => listCommits(repo!.id),
    enabled: Boolean(repo?.id),
  });
  const fileQuery = useQuery({
    queryKey: ["repo-file", repo?.id, openFile],
    queryFn: () => readFile(repo!.id, openFile!),
    enabled: Boolean(repo?.id && openFile),
  });

  if (repoQuery.isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <p className="mono-label text-muted-foreground">Loading repository…</p>
      </main>
    );
  }

  if (!repo) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <h1 className="text-2xl font-semibold text-foreground">Repository not found</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          This repository either does not exist or its owner has kept it private.
        </p>
        <Link to="/" className="mono-label text-primary underline">
          Back to indihost
        </Link>
      </main>
    );
  }

  const files = filesQuery.data ?? [];
  const commits = commitsQuery.data ?? [];
  const readme = files.find((file) => /^readme\.md$/i.test(file.path));
  const shareUrl =
    typeof window === "undefined" ? `/r/${repo.slug}` : `${window.location.origin}/r/${repo.slug}`;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4">
          <Logo compact />
          <Link
            to="/"
            className="rounded-md border border-border px-3 py-1.5 font-mono text-xs text-muted-foreground hover:bg-secondary"
          >
            Console
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
        <section className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="mono-label text-muted-foreground">
              {ownerQuery.data?.username ?? "someone"} /
            </p>
            <h1 className="font-mono text-2xl font-semibold text-foreground">{repo.name}</h1>
            {repo.description && (
              <p className="max-w-2xl text-sm text-muted-foreground">{repo.description}</p>
            )}
            <p className="mono-label text-muted-foreground">
              <span className="rounded-full border border-border px-2 py-0.5">
                {repo.is_public ? "public" : "private"}
              </span>{" "}
              · {repo.file_count} files · {commits.length} commits ·{" "}
              {formatBytes(Number(repo.compressed_bytes))} stored ·{" "}
              {savingsPercent(Number(repo.original_bytes), Number(repo.compressed_bytes))}% saved
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(shareUrl);
                  toast.success("Repository link copied");
                } catch {
                  toast.error("Could not copy — link: " + shareUrl);
                }
              }}
              className="rounded-md border border-border px-3 py-1.5 font-mono text-xs text-foreground hover:bg-secondary"
            >
              Copy link
            </button>
            <button
              type="button"
              disabled={zipping}
              onClick={async () => {
                setZipping(true);
                try {
                  const count = await downloadRepoZip(repo.id, repo.name);
                  toast.success(`Downloaded ${count} file(s) as ZIP`);
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Download failed");
                } finally {
                  setZipping(false);
                }
              }}
              className="rounded-md bg-primary px-3 py-1.5 font-mono text-xs font-semibold text-primary-foreground disabled:opacity-50"
            >
              {zipping ? "Preparing…" : "Download ZIP"}
            </button>
          </div>
        </section>

        <section className="panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-4 py-2">
            <span className="mono-label">Files</span>
            <span className="mono-label text-muted-foreground">
              {commits[0] ? `latest: ${commits[0].message}` : "no commits yet"}
            </span>
          </div>
          {files.length === 0 && (
            <p className="p-6 text-center text-sm text-muted-foreground">
              This repository is empty.
            </p>
          )}
          <ul className="divide-y divide-border">
            {files.map((file) => (
              <li key={file.id}>
                <button
                  type="button"
                  onClick={() => setOpenFile(openFile === file.path ? null : file.path)}
                  className="flex w-full items-center justify-between gap-4 px-4 py-2 text-left hover:bg-secondary"
                >
                  <span className="truncate font-mono text-sm text-foreground">{file.path}</span>
                  <span className="mono-label shrink-0 text-muted-foreground">
                    {formatBytes(file.original_bytes)}
                  </span>
                </button>
                {openFile === file.path && (
                  <pre className="max-h-96 overflow-auto border-t border-border bg-secondary/40 p-4 font-mono text-xs text-foreground">
                    {fileQuery.isLoading ? "Loading…" : (fileQuery.data ?? "")}
                  </pre>
                )}
              </li>
            ))}
          </ul>
        </section>

        {readme && (
          <section className="panel space-y-2 p-4">
            <span className="mono-label">{readme.path}</span>
            <ReadmePreview repoId={repo.id} path={readme.path} />
          </section>
        )}

        <section className="panel overflow-hidden">
          <div className="border-b border-border px-4 py-2">
            <span className="mono-label">Commits ({commits.length})</span>
          </div>
          {commits.length === 0 && (
            <p className="p-6 text-center text-sm text-muted-foreground">No commits yet.</p>
          )}
          <ul className="divide-y divide-border">
            {commits.map((commit) => (
              <li key={commit.id} className="px-4 py-3">
                <p className="font-mono text-sm text-foreground">{commit.message}</p>
                <p className="mono-label mt-1 text-muted-foreground">
                  {commit.files_changed} file(s) · {formatBytes(commit.bytes_added)} stored ·{" "}
                  {new Date(commit.created_at).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}

function ReadmePreview({ repoId, path }: { repoId: string; path: string }) {
  const query = useQuery({
    queryKey: ["repo-file", repoId, path],
    queryFn: () => readFile(repoId, path),
  });
  return (
    <pre className="max-h-80 overflow-auto whitespace-pre-wrap font-mono text-xs text-muted-foreground">
      {query.isLoading ? "Loading…" : (query.data ?? "")}
    </pre>
  );
}
