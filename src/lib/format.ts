export { formatBytes, ratioLabel, savingsPercent } from "@/lib/microxerox";

/** "3 hours ago" style relative time, GitHub-flavoured. */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  const seconds = Math.max(1, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  return `${Math.floor(months / 12)} year${months < 24 ? "" : "s"} ago`;
}

const LANGUAGE_BY_EXT: Record<string, string> = {
  ts: "TypeScript",
  tsx: "TypeScript",
  js: "JavaScript",
  jsx: "JavaScript",
  css: "CSS",
  scss: "SCSS",
  html: "HTML",
  htm: "HTML",
  json: "JSON",
  md: "Markdown",
  py: "Python",
  rb: "Ruby",
  go: "Go",
  rs: "Rust",
  java: "Java",
  sh: "Shell",
  sql: "SQL",
  svg: "SVG",
  txt: "Text",
};

const LANGUAGE_COLOR: Record<string, string> = {
  TypeScript: "#3178c6",
  JavaScript: "#f1e05a",
  CSS: "#663399",
  SCSS: "#c6538c",
  HTML: "#e34c26",
  JSON: "#292929",
  Markdown: "#083fa1",
  Python: "#3572A5",
  Ruby: "#701516",
  Go: "#00ADD8",
  Rust: "#dea584",
  Java: "#b07219",
  Shell: "#89e051",
  SQL: "#e38c00",
  SVG: "#ff9900",
  Text: "#8b949e",
};

export function languageOf(pathOrExt: string | null | undefined): string {
  if (!pathOrExt) return "Text";
  const ext = pathOrExt.includes(".") ? pathOrExt.split(".").pop()! : pathOrExt;
  return LANGUAGE_BY_EXT[ext.toLowerCase()] ?? "Text";
}

export function languageColor(language: string): string {
  return LANGUAGE_COLOR[language] ?? "#8b949e";
}

/** Monaco language id for a path. */
export function monacoLanguage(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    json: "json",
    css: "css",
    scss: "scss",
    html: "html",
    htm: "html",
    md: "markdown",
    py: "python",
    sh: "shell",
    sql: "sql",
    svg: "xml",
  };
  return map[ext] ?? "plaintext";
}
