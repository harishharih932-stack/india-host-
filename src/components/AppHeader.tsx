import { Link, useNavigate } from "@tanstack/react-router";
import { Search, LogOut } from "lucide-react";
import { useState } from "react";

import { Logo } from "@/components/Logo";
import { useAuth } from "@/hooks/useAuth";

export function AppHeader({
  search,
  onSearch,
}: {
  search?: string;
  onSearch?: (value: string) => void;
}) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [local, setLocal] = useState(search ?? "");
  const initial = (user?.email ?? "?").slice(0, 1).toUpperCase();

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-header">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
        <Link to="/" className="flex items-center gap-2 font-semibold text-header-foreground">
          <Logo />
        </Link>

        <div className="relative ml-2 hidden flex-1 sm:block">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            value={local}
            onChange={(event) => {
              setLocal(event.target.value);
              onSearch?.(event.target.value);
            }}
            placeholder="Search repositories…"
            className="h-9 w-full max-w-sm rounded-md border border-border bg-canvas-subtle pl-8 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring focus:bg-background"
          />
        </div>

        <div className="ml-auto flex items-center gap-3">
          {user ? (
            <>
              <div
                title={user.email ?? ""}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground"
              >
                {initial}
              </div>
              <button
                onClick={async () => {
                  await signOut();
                  navigate({ to: "/auth" });
                }}
                title="Sign out"
                className="text-muted-foreground hover:text-foreground"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </>
          ) : (
            <Link
              to="/auth"
              className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
