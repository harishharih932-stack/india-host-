import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Editor from "@monaco-editor/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { FileTree } from "@/components/FileTree";
import { ConsoleOutput } from "@/components/ConsoleOutput";
import { Logo } from "@/components/Logo";
import { getRepo, listFiles, readFile, saveFile, listCommits } from "@/lib/data";
import { formatBytes } from "@/lib/microxerox";

export const Route = createFileRoute("/repo/$id/edit/$")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Repository editor — indihost" },
      {
        name: "description",
        content:
          "Browse and edit compressed repository files in the indihost editor, with live encoding and byte-savings feedback on every save.",
      },
      { property: "og:title", content: "Repository editor — indihost" },
      {
        property: "og:description",
        content: "Edit compressed repository files with live byte-savings feedback.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RepoEditor,
});

function languageFor(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    json: "json",
    css: "css",
    html: "html",
    md: "markdown",
    py: "python",
    sql: "sql",
    sh: "shell",
    yml: "yaml",
    yaml: "yaml",
  };
  return map[ext] ?? "plaintext";
}

function RepoEditor() {
  const { id, _splat } = Route.useParams();
  const queryClient = useQueryClient();
  const [activePath, setActivePath] = useState<string | null>(_splat || null);
  const [draft, setDraft] = useState("");
  const [log, setLog] = useState<string[]>(["> editor ready"]);
  const [saving, setSaving] = useState(false);

  const repoQuery = useQuery({ queryKey: ["repo", id], queryFn: () => getRepo(id) });
  const filesQuery = useQuery({ queryKey: ["repo-files", id], queryFn: () => listFiles(id) });
  const commitsQuery = useQuery({ queryKey: ["commits", id], queryFn: () => listCommits(id) });

  const files = filesQuery.data ?? [];

  useEffect(() => {
    if (!activePath && files.length > 0) setActivePath(files[0]!.path);
  }, [files, activePath]);

  useEffect(() => {
    if (!activePath) return;
    let cancelled = false;
    void readFile(id, activePath).then((text) => {
      if (!cancelled) setDraft(text);
    });
    return () => {
      cancelled = true;
    };
  }, [id, activePath]);

  async function handleSave() {
    if (!activePath) return;
    setSaving(true);
    try {
      const report = await saveFile(id, activePath, draft);
      setLog((prev) => [
        ...prev,
        `> saved ${activePath} · ${report.encoding} · ${formatBytes(report.originalBytes)} -> ${formatBytes(
          report.compressedBytes,
        )} (${report.savings}% saved)`,
      ]);
      toast.success(`${report.savings}% smaller on disk`);
      void queryClient.invalidateQueries({ queryKey: ["repo-files", id] });
      void queryClient.invalidateQueries({ queryKey: ["commits", id] });
      void queryClient.invalidateQueries({ queryKey: ["repos"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex items-center justify-between gap-4 border-b border-border px-4 py-3">
        <div className="flex items-center gap-4">
          <Logo compact />
          <h1 className="font-mono text-sm text-foreground">
            {repoQuery.data?.name ?? "repository"}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!activePath || saving}
            onClick={() => void handleSave()}
            className="rounded-md bg-primary px-4 py-1.5 font-mono text-xs text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "saving…" : "commit"}
          </button>
          <Link
            to="/"
            className="rounded-md border border-border px-3 py-1.5 font-mono text-xs text-muted-foreground hover:bg-secondary"
          >
            console
          </Link>
        </div>
      </header>

      <div className="grid flex-1 grid-cols-1 lg:grid-cols-[240px_1fr_280px]">
        <aside className="flex flex-col border-b border-border lg:border-r lg:border-b-0">
          <p className="mono-label border-b border-border px-3 py-2 text-muted-foreground">files</p>
          <FileTree files={files} activePath={activePath} onSelect={setActivePath} />
        </aside>

        <section className="flex min-h-[420px] flex-col">
          {activePath ? (
            <Editor
              height="100%"
              theme="vs-dark"
              path={activePath}
              language={languageFor(activePath)}
              value={draft}
              onChange={(value) => setDraft(value ?? "")}
              options={{ fontSize: 13, minimap: { enabled: false }, scrollBeyondLastLine: false }}
            />
          ) : (
            <p className="p-6 text-sm text-muted-foreground">
              This repository has no files yet. Upload some from the console.
            </p>
          )}
        </section>

        <aside className="flex flex-col gap-4 border-t border-border p-3 lg:border-t-0 lg:border-l">
          <ConsoleOutput lines={log} title="output" />
          <div>
            <p className="mono-label mb-2 text-muted-foreground">commits</p>
            <ul className="space-y-2">
              {(commitsQuery.data ?? []).map((commit) => (
                <li key={commit.id} className="rounded-md border border-border p-2">
                  <p className="font-mono text-xs text-foreground">{commit.message}</p>
                  <p className="mono-label mt-1 text-muted-foreground">
                    {commit.files_changed} file(s) · {formatBytes(commit.bytes_added)} stored ·{" "}
                    {new Date(commit.created_at).toLocaleString()}
                  </p>
                </li>
              ))}
              {(commitsQuery.data ?? []).length === 0 && (
                <li className="text-xs text-muted-foreground">No commits yet.</li>
              )}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}