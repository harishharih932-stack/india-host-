import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  createApiKey,
  getActivity,
  getProfile,
  getStats,
  listApiKeys,
  revokeApiKey,
  updateProfile,
} from "@/lib/data";
import { formatBytes } from "@/lib/microxerox";
import { vaultStats, type VaultMode } from "@/lib/vault";
import { ContributionGrid } from "@/components/ContributionGrid";
import { ConsoleOutput } from "@/components/ConsoleOutput";

export function ProfileTab() {
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [keyName, setKeyName] = useState("");
  const [issued, setIssued] = useState<string | null>(null);
  const [vault, setVault] = useState<{ mode: VaultMode; host: string } | null>(null);

  const profileQuery = useQuery({ queryKey: ["profile"], queryFn: getProfile });
  const statsQuery = useQuery({ queryKey: ["stats"], queryFn: getStats });
  const activityQuery = useQuery({ queryKey: ["activity"], queryFn: () => getActivity(182) });
  const keysQuery = useQuery({ queryKey: ["api-keys"], queryFn: listApiKeys });

  useEffect(() => {
    if (profileQuery.data) {
      setDisplayName(profileQuery.data.display_name ?? "");
      setBio(profileQuery.data.bio ?? "");
    }
  }, [profileQuery.data]);

  useEffect(() => {
    void vaultStats().then(setVault);
  }, []);

  const save = useMutation({
    mutationFn: () => updateProfile({ display_name: displayName, bio }),
    onSuccess: () => {
      toast.success("Profile saved");
      void queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const mint = useMutation({
    mutationFn: () => createApiKey(keyName.trim() || "agent key"),
    onSuccess: ({ token }) => {
      setIssued(token);
      setKeyName("");
      void queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const stats = statsQuery.data;

  return (
    <div className="space-y-6">
      <section className="panel p-4">
        <span className="mono-label">Your storage at a glance</span>
        <dl className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            ["Repositories", stats?.repos ?? 0],
            ["Files", stats?.files ?? 0],
            ["Commits", stats?.commits ?? 0],
            ["Published sites", stats?.deployments ?? 0],
          ].map(([label, value]) => (
            <div key={label as string}>
              <dd className="font-mono text-2xl font-semibold text-foreground">{value}</dd>
              <dt className="mono-label">{label}</dt>
            </div>
          ))}
        </dl>
        <p className="mt-4 font-mono text-xs text-muted-foreground">
          {formatBytes(stats?.originalBytes ?? 0)} of code stored as{" "}
          {formatBytes(stats?.compressedBytes ?? 0)} · {stats?.savings ?? 0}% space saved
        </p>
        {vault && (
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            Storage location: {vault.mode} · {vault.host}
          </p>
        )}
      </section>

      <section className="panel p-4">
        <span className="mono-label">Your activity</span>
        <div className="mt-3">
          <ContributionGrid days={activityQuery.data ?? []} />
        </div>
      </section>

      <section className="panel space-y-3 p-4">
        <span className="mono-label">Profile · {profileQuery.data?.username ?? "…"}</span>
        <input
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          placeholder="Display name"
          className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm text-foreground"
        />
        <textarea
          value={bio}
          onChange={(event) => setBio(event.target.value)}
          placeholder="Short bio"
          rows={3}
          className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm text-foreground"
        />
        <button
          type="button"
          disabled={save.isPending}
          onClick={() => save.mutate()}
          className="rounded-md bg-primary px-4 py-2 font-mono text-xs font-semibold text-primary-foreground disabled:opacity-50"
        >
          Save profile
        </button>
      </section>

      <section className="panel space-y-3 p-4">
        <span className="mono-label">API keys</span>
        <p className="text-xs text-muted-foreground">
          Create a key if you want to publish from your own scripts or tools instead of this page.
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            value={keyName}
            onChange={(event) => setKeyName(event.target.value)}
            placeholder="Key name, e.g. my laptop"
            className="min-w-48 flex-1 rounded-md border border-input bg-background px-3 py-2 font-mono text-sm text-foreground"
          />
          <button
            type="button"
            disabled={mint.isPending}
            onClick={() => mint.mutate()}
            className="rounded-md bg-primary px-4 py-2 font-mono text-xs font-semibold text-primary-foreground disabled:opacity-50"
          >
            Create key
          </button>
        </div>
        {issued && (
          <ConsoleOutput
            title="Copy this key now — it will not be shown again"
            lines={[
              issued,
              "",
              `curl -X POST ${typeof window === "undefined" ? "" : window.location.origin}/api/public/v1/deploy \\`,
              `  -H "Authorization: Bearer ${issued}" \\`,
              '  -H "content-type: application/json" \\',
              '  -d \'{"title":"from agent","repo_slug":"my-site","entry_file":"index.html"}\'',
            ]}
          />
        )}
        <ul className="space-y-2">
          {(keysQuery.data ?? []).map((key) => (
            <li
              key={key.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
            >
              <span className="font-mono text-xs text-foreground">
                {key.name} · {key.key_prefix}… {key.revoked ? "· revoked" : ""}
              </span>
              {!key.revoked && (
                <button
                  type="button"
                  onClick={async () => {
                    await revokeApiKey(key.id);
                    void queryClient.invalidateQueries({ queryKey: ["api-keys"] });
                  }}
                  className="font-mono text-xs text-destructive"
                >
                  Revoke
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
