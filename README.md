# Project Hug

Bhai, credits phir khatam ho gaye — jo hua hai wo saved hai. Exact status:

Is session me complete hua

Pata chala ki pichhli session ka kaam project me tha hi nahi (template default tha) — uploaded archive se sab restore kar diya: src/styles.css, src/lib/{data,microxerox,vault}.ts, src/hooks/useAuth.tsx, aur saare components (Logo, ConsoleOutput, ContributionGrid, FileTree, UploadDropzone, RepositoriesTab, DeployTab, ProfileTab).
Lovable Cloud enable + poora schema migrate (profiles, user_roles + has_role, repositories, repo_files, commits, deployments, activity_events, api_keys) — RLS, grants, signup trigger sab ke saath. Ek has_role lint warning bacha hai, intentional.
Google sign-in provider configure (src/integrations/lovable generate hua).
@monaco-editor/react install.
Naye routes likhe: __root.tsx (AuthProvider + sonner Toaster + indihost head), index.tsx (three-tab shell + signed-out hero), auth.tsx (email/password + Google), repo.$id.edit.$.tsx (Monaco + FileTree + commits), d.$slug.tsx (sandboxed iframe + boot log + 404 state), api/public/v1/deploy.ts (Bearer ixk_ key, SHA-256 lookup via admin client, revoked reject, last_used_at, deployment + activity insert, zod).
agent/package.json bana.
Baaki hai (agli session ka prompt)

Continue indihost. Backend, design system, saare components aur routes already exist. Sirf ye baaki hai:

agent/server.js — Express server 127.0.0.1:7654 pe, jo src/lib/vault.ts ka contract implement kare: GET /health, GET /blob/:key, PUT /blob/:key (text/plain body, disk pe ~/.indihost/blobs me store), CORS allow origin *.
agent/README.md — install + run instructions.
Build verify karo (vite build) aur RepositoriesTab ka /repo/$id/edit/$ link + /auth link type errors resolve ho gaye ya nahi check karo — routeTree regenerate hone ke baad theek hone chahiye.
src/start.ts me functionMiddleware: [attachSupabaseAuth] sirf tab add karo agar koi server function requireSupabaseAuth use kare (abhi koi nahi karta, so skip).

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/dcadd134-d9a7-4168-8403-bb3339d1384c).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
