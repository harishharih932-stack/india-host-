import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { ConsoleOutput } from "@/components/ConsoleOutput";
import { Logo } from "@/components/Logo";
import { getLiveDeployment } from "@/lib/data";

export const Route = createFileRoute("/d/$slug")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Live deployment — indihost" },
      {
        name: "description",
        content:
          "A static build published with indihost, served straight from its compressed repository entry file.",
      },
      { property: "og:title", content: "Live deployment — indihost" },
      {
        property: "og:description",
        content: "A static build published with indihost from a compressed repository.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LiveDeploymentPage,
});

function LiveDeploymentPage() {
  const { slug } = Route.useParams();
  const query = useQuery({
    queryKey: ["deployment", slug],
    queryFn: () => getLiveDeployment(slug),
  });

  if (query.isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <p className="mono-label text-muted-foreground">booting deployment…</p>
      </main>
    );
  }

  const live = query.data;

  if (!live) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md text-center">
          <h1 className="text-6xl font-semibold text-foreground">404</h1>
          <p className="mt-4 text-sm text-muted-foreground">
            No live deployment is serving <span className="font-mono">/d/{slug}</span>. It may have
            been paused or removed.
          </p>
          <Link
            to="/"
            className="mt-6 inline-flex rounded-md border border-border px-4 py-2 font-mono text-xs text-foreground hover:bg-secondary"
          >
            back to indihost
          </Link>
        </div>
      </main>
    );
  }

  const { deployment, entryContent, resolvedEntryFile } = live;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex items-center justify-between gap-4 border-b border-border px-4 py-3">
        <div className="flex items-center gap-4">
          <Logo compact />
          <h1 className="font-mono text-sm text-foreground">{deployment.title}</h1>
        </div>
        <span className="mono-label text-muted-foreground">
          {deployment.source} · {resolvedEntryFile ?? deployment.entry_file}
        </span>
      </header>

      <div className="grid flex-1 grid-cols-1 lg:grid-cols-[1fr_320px]">
        <section className="min-h-[420px] bg-card">
          {entryContent ? (
            <iframe
              title={deployment.title}
              src={`/api/public/live/${encodeURIComponent(slug)}/`}
              sandbox="allow-scripts"
              className="h-full min-h-[420px] w-full border-0 bg-white"
            />
          ) : (
            <p className="p-6 text-sm text-muted-foreground">
              No index.html file was found in this repository.
            </p>
          )}
        </section>
        <aside className="border-t border-border p-3 lg:border-t-0 lg:border-l">
          <ConsoleOutput
            lines={deployment.build_log.split("\n").filter(Boolean)}
            title="boot log"
          />
        </aside>
      </div>
    </div>
  );
}