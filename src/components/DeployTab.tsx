import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  createDeployment,
  listDeployments,
  listFiles,
  listRepos,
  setDeploymentStatus,
} from "@/lib/data";
import { ConsoleOutput } from "@/components/ConsoleOutput";

export function DeployTab() {
  const queryClient = useQueryClient();
  const [repoId, setRepoId] = useState("");
  const [title, setTitle] = useState("");
  const [entry, setEntry] = useState("index.html");

  const reposQuery = useQuery({ queryKey: ["repos"], queryFn: listRepos });
  const deploymentsQuery = useQuery({ queryKey: ["deployments"], queryFn: listDeployments });
  const filesQuery = useQuery({
    queryKey: ["repo-files", repoId],
    queryFn: () => listFiles(repoId),
    enabled: Boolean(repoId),
  });

  const deploy = useMutation({
    mutationFn: () =>
      createDeployment({ repoId, title: title.trim() || "untitled", entryFile: entry }),
    onSuccess: (deployment) => {
      toast.success(`Live at /d/${deployment.slug}`);
      setTitle("");
      void queryClient.invalidateQueries({ queryKey: ["deployments"] });
      void queryClient.invalidateQueries({ queryKey: ["repos"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deployments = deploymentsQuery.data ?? [];

  return (
    <div className="space-y-6">
      <section className="panel space-y-3 p-4">
        <span className="mono-label">Publish a site</span>
        <p className="text-xs text-muted-foreground">
          Pick one of your repositories and indihost puts it on a live URL you can share.
        </p>
        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">Repository</span>
          <select
            value={repoId}
            onChange={(event) => setRepoId(event.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm text-foreground"
          >
            <option value="">Choose a repository…</option>
            {(reposQuery.data ?? []).map((repo) => (
              <option key={repo.id} value={repo.id}>
                {repo.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">Name for this site (optional)</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="e.g. Portfolio v1"
            className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm text-foreground"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">
            Start page — the first file visitors will see
          </span>
          <select
            value={entry}
            onChange={(event) => setEntry(event.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm text-foreground"
          >
            <option value="index.html">index.html</option>
            {(filesQuery.data ?? []).map((file) => (
              <option key={file.id} value={file.path}>
                {file.path}
              </option>
            ))}
          </select>
        </label>
        <p className="text-xs text-muted-foreground">
          Note: publishing makes this repository visible to anyone with the link.
        </p>
        <button
          type="button"
          disabled={!repoId || deploy.isPending}
          onClick={() => deploy.mutate()}
          className="rounded-md bg-primary px-4 py-2 font-mono text-xs font-semibold text-primary-foreground disabled:opacity-50"
        >
          {deploy.isPending ? "Publishing…" : "Publish site"}
        </button>
      </section>

      <section className="space-y-3">
        <span className="mono-label">Published sites ({deployments.length})</span>
        {deployments.length === 0 && (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Nothing published yet — pick a repository above and hit Publish site.
          </p>
        )}
        {deployments.map((deployment) => (
          <article key={deployment.id} className="panel space-y-3 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-mono text-sm font-semibold text-foreground">
                  {deployment.title}
                </h3>
                <p className="mono-label mt-1">
                  <span
                    className={
                      deployment.status === "live" ? "text-foreground" : "text-muted-foreground"
                    }
                  >
                    {deployment.status === "live" ? "● Live" : `● ${deployment.status}`}
                  </span>{" "}
                  · /d/{deployment.slug} · start page {deployment.entry_file}
                </p>
              </div>
              <div className="flex gap-2">
                <a
                  href={`/d/${deployment.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md border border-border px-3 py-1.5 font-mono text-xs text-foreground hover:bg-secondary"
                >
                  Open site
                </a>
                <button
                  type="button"
                  onClick={async () => {
                    await setDeploymentStatus(
                      deployment.id,
                      deployment.status === "live" ? "stopped" : "live",
                    );
                    void queryClient.invalidateQueries({ queryKey: ["deployments"] });
                  }}
                  className="rounded-md border border-border px-3 py-1.5 font-mono text-xs text-muted-foreground hover:bg-secondary"
                >
                  {deployment.status === "live" ? "Take offline" : "Put back online"}
                </button>
              </div>
            </div>
            <ConsoleOutput lines={deployment.build_log.split("\n")} title="Publish log" />
          </article>
        ))}
      </section>
    </div>
  );
}
