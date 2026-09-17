import { useRef, useState } from "react";
import { unzipSync } from "fflate";

const TEXT_LIMIT = 512 * 1024;

export interface PickedFile {
  path: string;
  text: string;
}

type DroppedEntry = {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  fullPath: string;
  file: (callback: (file: File) => void, error?: (reason: DOMException) => void) => void;
  createReader: () => {
    readEntries: (
      callback: (entries: DroppedEntry[]) => void,
      error?: (reason: DOMException) => void,
    ) => void;
  };
};

async function fileFromEntry(entry: DroppedEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

async function entriesFromDirectory(entry: DroppedEntry): Promise<DroppedEntry[]> {
  const reader = entry.createReader();
  const entries: DroppedEntry[] = [];
  while (true) {
    const batch = await new Promise<DroppedEntry[]>((resolve, reject) =>
      reader.readEntries(resolve, reject),
    );
    if (batch.length === 0) return entries;
    entries.push(...batch);
  }
}

const SKIP_RE = /(^|\/)(node_modules|\.git|__MACOSX|dist|build|\.next|\.DS_Store)(\/|$)/;

function isProbablyText(bytes: Uint8Array): boolean {
  const sample = bytes.subarray(0, 2048);
  for (const byte of sample) if (byte === 0) return false;
  return true;
}

/** Expands a .zip into individual text files; other files pass through unchanged. */
async function expandFile(file: File, path: string): Promise<PickedFile[]> {
  if (!/\.zip$/i.test(file.name)) {
    if (file.size > TEXT_LIMIT) return [];
    return [{ path, text: await file.text() }];
  }

  const archive = unzipSync(new Uint8Array(await file.arrayBuffer()));
  const decoder = new TextDecoder();
  const names = Object.keys(archive);

  // Drop a single common top-level folder so paths look like the project root.
  const tops = new Set(names.map((name) => name.split("/")[0] ?? ""));
  const strip = tops.size === 1 && names.every((name) => name.includes("/"));

  const out: PickedFile[] = [];
  for (const name of names) {
    const bytes = archive[name]!;
    if (name.endsWith("/") || bytes.length === 0) continue;
    if (SKIP_RE.test(name)) continue;
    if (bytes.length > TEXT_LIMIT) continue;
    if (!isProbablyText(bytes)) continue;
    const relative = strip ? name.slice(name.indexOf("/") + 1) : name;
    if (relative) out.push({ path: relative, text: decoder.decode(bytes) });
  }
  return out;
}

async function walkEntry(entry: DroppedEntry): Promise<PickedFile[]> {
  if (entry.isFile) {
    const file = await fileFromEntry(entry);
    return expandFile(file, entry.fullPath.replace(/^\/+/, ""));
  }
  if (!entry.isDirectory) return [];
  const children = await entriesFromDirectory(entry);
  const nested = await Promise.all(children.map(walkEntry));
  return nested.flat();
}


export function UploadDropzone({
  onFiles,
  busy,
}: {
  onFiles: (files: PickedFile[]) => void;
  busy?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  async function read(list: FileList | null) {
    if (!list) return;
    const picked: PickedFile[] = [];
    for (const file of Array.from(list)) {
      const relative = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
      picked.push(...(await expandFile(file, relative || file.name)));
    }
    if (picked.length > 0) onFiles(picked);
  }

  async function readDrop(event: React.DragEvent<HTMLDivElement>) {
    const entries: DroppedEntry[] = [];
    for (const item of Array.from(event.dataTransfer.items)) {
      const withEntry = item as DataTransferItem & {
        webkitGetAsEntry?: () => unknown;
      };
      const entry = withEntry.webkitGetAsEntry?.();
      if (entry) entries.push(entry as unknown as DroppedEntry);
    }

    if (entries.length === 0) {
      await read(event.dataTransfer.files);
      return;
    }

    const picked = (await Promise.all(entries.map(walkEntry))).flat();
    if (picked.length > 0) onFiles(picked);
  }

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        void readDrop(event);
      }}
      className={`rounded-lg border border-dashed p-6 text-center transition-colors ${
        over ? "border-primary bg-accent/40" : "border-border bg-surface"
      }`}
    >
      <p className="font-mono text-sm text-foreground">
        Drag your project files, a folder, or a .zip here
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        A .zip is unpacked automatically — every text file inside is compressed and stored. Files up
        to 512 KB each.
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="mt-4 inline-flex items-center rounded-md bg-primary px-3 py-1.5 font-mono text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {busy ? "Uploading…" : "Browse files"}
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        onChange={(event) => void read(event.target.files)}
      />
    </div>
  );
}
