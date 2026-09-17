import { createFileRoute } from "@tanstack/react-router";
import { decompressFull } from "@/lib/microxerox";

type StoredFile = {
  path: string;
  content: string;
  encoding: string;
};

const MIME_TYPES: Record<string, string> = {
  css: "text/css; charset=utf-8",
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  map: "application/json; charset=utf-8",
  svg: "image/svg+xml",
  txt: "text/plain; charset=utf-8",
  xml: "application/xml; charset=utf-8",
};

function normalizedPath(value: string) {
  const parts: string[] = [];
  for (const part of value.replace(/\\/g, "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}

function contentType(path: string) {
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  return MIME_TYPES[extension] ?? "application/octet-stream";
}

function publicFetch(apiKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(init?.headers);
    headers.delete("authorization");
    headers.set("apikey", apiKey);
    return fetch(input, { ...init, headers });
  };
}

function injectBase(html: string, baseHref: string) {
  const base = `<base href="${baseHref}">`;
  const withBase = /<head(?:\s[^>]*)?>/i.test(html)
    ? html.replace(/<head(\s[^>]*)?>/i, (head) => `${head}${base}`)
    : `${base}${html}`;

  // Root-relative assets would otherwise escape the deployment's file URL.
  return withBase
    .replace(/\b(src|href)=(['"])\/(?!\/)/gi, `$1=$2${baseHref}`)
    .replace(/url\((['"]?)\/(?!\/)/gi, `url($1${baseHref}`)
    .replace(/\b(from\s*|import\s*)(['"])\/(?!\/)/g, `$1$2${baseHref}`);
}

export const Route = createFileRoute("/api/public/live/$slug/$")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const marker = "/api/public/live/";
        const remainder = url.pathname.slice(url.pathname.indexOf(marker) + marker.length);
        const [encodedSlug = "", ...encodedParts] = remainder.split("/");
        const slug = decodeURIComponent(encodedSlug);
        const requestedPath = normalizedPath(encodedParts.map(decodeURIComponent).join("/"));

        const backendUrl = process.env["SUPABASE_URL"];
        const publishableKey = process.env["SUPABASE_PUBLISHABLE_KEY"];
        if (!backendUrl || !publishableKey) return new Response("Site host unavailable", { status: 503 });

        const { createClient } = await import("@supabase/supabase-js");
        const client = createClient(backendUrl, publishableKey, {
          global: { fetch: publicFetch(publishableKey) },
          auth: { persistSession: false, autoRefreshToken: false },
        });

        const { data: deployment, error: deploymentError } = await client
          .from("deployments")
          .select("repo_id, entry_file")
          .eq("slug", slug)
          .eq("status", "live")
          .maybeSingle();

        if (deploymentError || !deployment?.repo_id) {
          return new Response("Site not found", { status: 404 });
        }

        const { data, error } = await client
          .from("repo_files")
          .select("path, content, encoding")
          .eq("repo_id", deployment.repo_id);
        if (error) return new Response("Site files unavailable", { status: 502 });

        const files = (data ?? []) as StoredFile[];
        const configuredEntry = normalizedPath(deployment.entry_file || "index.html");
        const entry =
          files.find((file) => normalizedPath(file.path) === configuredEntry) ??
          files.find((file) => /(^|\/)index\.html?$/i.test(normalizedPath(file.path)));
        if (!entry) return new Response("No index.html found", { status: 404 });

        const entryPath = normalizedPath(entry.path);
        const entryDirectory = entryPath.includes("/") ? entryPath.slice(0, entryPath.lastIndexOf("/")) : "";
        const candidatePath = requestedPath || entryPath;
        const rootedCandidate = entryDirectory
          ? normalizedPath(`${entryDirectory}/${requestedPath}`)
          : requestedPath;
        const file = requestedPath
          ? files.find((item) => normalizedPath(item.path) === candidatePath) ??
            files.find((item) => normalizedPath(item.path) === rootedCandidate)
          : entry;

        if (!file) return new Response("File not found", { status: 404 });

        let body = await decompressFull(file.content, file.encoding);
        const servedPath = normalizedPath(file.path);
        if (/\.html?$/i.test(servedPath)) {
          const encodedRoot = entryDirectory
            .split("/")
            .filter(Boolean)
            .map(encodeURIComponent)
            .join("/");
          const baseHref = `${marker}${encodeURIComponent(slug)}/${encodedRoot ? `${encodedRoot}/` : ""}`;
          body = injectBase(body, baseHref);
        }

        return new Response(body, {
          headers: {
            "content-type": contentType(servedPath),
            "cache-control": "public, max-age=60",
            "access-control-allow-origin": "*",
            "x-content-type-options": "nosniff",
          },
        });
      },
    },
  },
});