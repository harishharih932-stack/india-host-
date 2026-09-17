import type { RepoFile } from "@/lib/data";
import { formatBytes } from "@/lib/microxerox";

export function FileTree({
  files,
  activePath,
  onSelect,
}: {
  files: RepoFile[];
  activePath: string | null;
  onSelect: (path: string) => void;
}) {
  return (
    <nav className="scrollbar-thin flex-1 overflow-auto p-2">
      {files.length === 0 && (
        <p className="px-2 py-4 text-xs text-muted-foreground">No files in this repository yet.</p>
      )}
      <ul className="space-y-0.5">
        {files.map((file) => {
          const active = file.path === activePath;
          return (
            <li key={file.id}>
              <button
                type="button"
                onClick={() => onSelect(file.path)}
                className={`w-full rounded-md px-2 py-1.5 text-left font-mono text-xs transition-colors ${
                  active
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                <span className="block truncate">{file.path}</span>
                <span className="mono-label">
                  {file.encoding} · {formatBytes(file.compressed_bytes)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
