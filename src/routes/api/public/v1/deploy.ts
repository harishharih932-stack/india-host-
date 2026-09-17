import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const bodySchema = z.object({
  repo_id: z.string().uuid().optional(),
  title: z.string().min(1).max(120),
  slug: z
    .string()
    .min(3)
    .max(60)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  entry_file: z.string().min(1).max(200).default("index.html"),
  build_log: z.string().max(20000).optional(),
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const Route = createFileRoute("/api/public/v1/deploy")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authHeader = request.headers.get("authorization") ?? "";
        const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
        if (!token.startsWith("ixk_")) {
          return json({ error: "Missing or malformed API key" }, 401);
        }

        let parsed;
        try {
          parsed = bodySchema.safeParse(await request.json());
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }
        if (!parsed.success) {
          return json({ error: "Invalid payload", issues: parsed.error.flatten() }, 400);
        }
        const input = parsed.data;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const keyHash = await sha256Hex(token);
        const { data: apiKey, error: keyError } = await supabaseAdmin
          .from("api_keys")
          .select("id, owner_id, revoked")
          .eq("key_hash", keyHash)
          .maybeSingle();

        if (keyError) return json({ error: "Key lookup failed" }, 500);
        if (!apiKey) return json({ error: "Unknown API key" }, 401);
        if (apiKey.revoked) return json({ error: "API key has been revoked" }, 403);

        await supabaseAdmin
          .from("api_keys")
          .update({ last_used_at: new Date().toISOString() })
          .eq("id", apiKey.id);

        if (input.repo_id) {
          const { data: repo } = await supabaseAdmin
            .from("repositories")
            .select("id")
            .eq("id", input.repo_id)
            .eq("owner_id", apiKey.owner_id)
            .maybeSingle();
          if (!repo) return json({ error: "Repository not found for this key" }, 404);
        }

        const slug =
          input.slug ??
          `${input.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 40)}-${Math.random().toString(36).slice(2, 7)}`;

        const buildLog =
          input.build_log ??
          [
            `> agent deploy slug=${slug}`,
            `> entry=${input.entry_file}`,
            "> status live",
          ].join("\n");

        const { data: deployment, error: deployError } = await supabaseAdmin
          .from("deployments")
          .insert({
            owner_id: apiKey.owner_id,
            repo_id: input.repo_id ?? null,
            slug,
            title: input.title,
            entry_file: input.entry_file,
            status: "live",
            build_log: buildLog,
            source: "agent",
          })
          .select("id, slug, status, entry_file, created_at")
          .single();

        if (deployError || !deployment) {
          return json({ error: "Deployment failed", detail: deployError?.message }, 400);
        }

        await supabaseAdmin.from("activity_events").insert({
          user_id: apiKey.owner_id,
          kind: "deploy",
          detail: `agent: ${input.title}`,
        });

        return json({ deployment, url: `/d/${deployment.slug}` }, 201);
      },
    },
  },
});