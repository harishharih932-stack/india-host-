import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";

import { Logo } from "@/components/Logo";
import { RepositoriesTab } from "@/components/RepositoriesTab";
import { DeployTab } from "@/components/DeployTab";
import { ProfileTab } from "@/components/ProfileTab";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "indihost — your code vault console" },
      {
        name: "description",
        content:
          "Upload, compress and version repositories, deploy static builds and track your contribution streak from the indihost console.",
      },
      { property: "og:title", content: "indihost — your code vault console" },
      {
        property: "og:description",
        content:
          "Upload, compress and version repositories, deploy static builds and track your contribution streak.",
      },
    ],
  }),
  component: Index,
});

const TABS = [
  { id: "repositories", label: "Repositories" },
  { id: "deploy", label: "Deployments" },
  { id: "profile", label: "Profile" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function Index() {
  const { user, loading, signOut } = useAuth();
  const [tab, setTab] = useState<TabId>("repositories");

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <p className="mono-label text-muted-foreground">Loading your workspace…</p>
      </main>
    );
  }

  if (!user) return <Hero />;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
          <Logo />
          <div className="flex items-center gap-3">
            <span className="mono-label hidden text-muted-foreground sm:inline">{user.email}</span>
            <button
              type="button"
              onClick={() => void signOut()}
              className="rounded-md border border-border px-3 py-1.5 font-mono text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              Sign out
            </button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 px-4">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`-mb-px border-b-2 px-3 py-2 font-mono text-xs transition-colors ${
                tab === item.id
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="sr-only">indihost console</h1>
        {tab === "repositories" && <RepositoriesTab />}
        {tab === "deploy" && <DeployTab />}
        {tab === "profile" && <ProfileTab />}
      </main>
    </div>
  );
}

function Hero() {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex max-w-3xl flex-col items-start gap-8 px-6 py-28">
        <Logo />
        <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
          Store your code. Publish your site. One console.
        </h1>
        <p className="max-w-xl text-base text-muted-foreground">
          indihost is a simple home for your projects: upload your files and they are compressed
          automatically, every change is saved as a commit you can come back to, and one click puts
          your site on a live URL you can share.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            to="/auth"
            className="rounded-md bg-primary px-5 py-2.5 font-mono text-sm text-primary-foreground transition-opacity hover:opacity-90"
          >
            Get started — it's free
          </Link>
          <a
            href="#how"
            className="rounded-md border border-border px-5 py-2.5 font-mono text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            How it works
          </a>
        </div>
        <dl id="how" className="grid w-full gap-4 sm:grid-cols-3">
          {[
            ["1 · Upload", "Drop your project files in — they are compressed automatically."],
            ["2 · Edit", "Every save creates a commit, so you never lose an older version."],
            ["3 · Publish", "Pick a repository and get a live link for your site in one click."],
          ].map(([title, body]) => (
            <div key={title} className="rounded-lg border border-border p-4">
              <dt className="mono-label text-foreground">{title}</dt>
              <dd className="mt-2 text-sm text-muted-foreground">{body}</dd>
            </div>
          ))}
        </dl>
      </div>
    </main>
  );
}
