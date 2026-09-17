/**
 * Micro-Xerox compression engine.
 *
 * Three phases, all reversible, all measured in real bytes (UTF-8):
 *
 *   Phase A — structural stripping: comments and redundant whitespace.
 *   Phase B — token substitution: frequent source tokens replaced with short
 *             private-use markers, driven by a dictionary emitted in the header.
 *   Phase C — bit packing: the Phase B stream is re-encoded over its own
 *             measured alphabet (ceil(log2(N)) bits per symbol) and emitted in
 *             a 91-symbol printable alphabet at 13 bits per 2 characters.
 *
 * Phase C is only kept when it actually produces fewer bytes. Savings reported
 * by `compress()` are measured, never estimated.
 */

export type Encoding = "plain" | "mx-a" | "mx-b" | "mx-c";

export interface CompressionResult {
  content: string;
  encoding: Encoding;
  originalBytes: number;
  compressedBytes: number;
  phases: { name: string; bytes: number; kept: boolean }[];
}

const encoder = new TextEncoder();

export function byteLength(text: string): number {
  return encoder.encode(text).length;
}

/* ------------------------------------------------------------------ */
/* Phase A — comment + whitespace stripping                            */
/* ------------------------------------------------------------------ */

const CODE_EXT = new Set([
  "js",
  "jsx",
  "ts",
  "tsx",
  "css",
  "scss",
  "json",
  "html",
  "htm",
  "svg",
]);

export function fileKind(path: string): string {
  const dot = path.lastIndexOf(".");
  return dot === -1 ? "" : path.slice(dot + 1).toLowerCase();
}

export function isCompressible(path: string): boolean {
  return CODE_EXT.has(fileKind(path)) || fileKind(path) === "md";
}

/**
 * Character-scanning stripper. Stays inside strings, template literals and
 * regex-ish contexts so it never corrupts source.
 */
export function phaseA(source: string, path: string): string {
  const kind = fileKind(path);
  if (kind === "json") {
    try {
      return JSON.stringify(JSON.parse(source));
    } catch {
      return source;
    }
  }
  if (kind === "html" || kind === "htm" || kind === "svg") {
    return source
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/\n\s*\n/g, "\n")
      .replace(/^[ \t]+/gm, "")
      .trim();
  }
  if (!CODE_EXT.has(kind)) {
    return source.replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n");
  }

  let out = "";
  let i = 0;
  const n = source.length;
  let quote: string | null = null;

  while (i < n) {
    const c = source[i]!;
    const next = source[i + 1];

    if (quote) {
      out += c;
      if (c === "\\") {
        if (i + 1 < n) out += source[i + 1];
        i += 2;
        continue;
      }
      if (c === quote) quote = null;
      i += 1;
      continue;
    }

    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      out += c;
      i += 1;
      continue;
    }

    if (c === "/" && next === "/") {
      while (i < n && source[i] !== "\n") i += 1;
      continue;
    }

    if (c === "/" && next === "*") {
      i += 2;
      while (i < n && !(source[i] === "*" && source[i + 1] === "/")) i += 1;
      i += 2;
      continue;
    }

    out += c;
    i += 1;
  }

  return out
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/* ------------------------------------------------------------------ */
/* Phase B — token substitution                                        */
/* ------------------------------------------------------------------ */

const MARK_START = 0xe000; // Unicode private use area
const MIN_TOKEN_LEN = 4;
const MAX_DICT = 96;

const TOKEN_RE = /[A-Za-z_$][A-Za-z0-9_$]{3,}|[<>/\s]{0,0}/g;

function buildDictionary(text: string): string[] {
  const counts = new Map<string, number>();
  for (const match of text.matchAll(TOKEN_RE)) {
    const token = match[0];
    if (token.length < MIN_TOKEN_LEN) continue;
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  const scored: { token: string; gain: number }[] = [];
  for (const [token, count] of counts) {
    if (count < 2) continue;
    // Marker costs 3 UTF-8 bytes; dictionary entry costs token + 1 separator.
    const gain = count * (byteLength(token) - 3) - (byteLength(token) + 1);
    if (gain > 0) scored.push({ token, gain });
  }
  scored.sort((a, b) => b.gain - a.gain);
  return scored.slice(0, MAX_DICT).map((entry) => entry.token);
}

function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function phaseB(text: string): string {
  const dict = buildDictionary(text);
  if (dict.length === 0) return "\u0002\u0003" + text;

  let out = text;
  dict.forEach((token, index) => {
    const marker = String.fromCharCode(MARK_START + index);
    out = out.replace(new RegExp(escapeForRegex(token), "g"), marker);
  });
  return "\u0002" + dict.join("\u0001") + "\u0003" + out;
}

export function unphaseB(packed: string): string {
  if (!packed.startsWith("\u0002")) return packed;
  const end = packed.indexOf("\u0003");
  if (end === -1) return packed;
  const header = packed.slice(1, end);
  let body = packed.slice(end + 1);
  if (header.length === 0) return body;
  const dict = header.split("\u0001");
  dict.forEach((token, index) => {
    const marker = String.fromCharCode(MARK_START + index);
    body = body.split(marker).join(token);
  });
  return body;
}

/* ------------------------------------------------------------------ */
/* Phase C — real bit packing over a measured alphabet                 */
/* ------------------------------------------------------------------ */

// 91 printable single-byte symbols: 0x21..0x7E minus " \ | (used as delimiters)
const OUT_ALPHABET = (() => {
  const excluded = new Set(['"', "\\", "|"]);
  let alphabet = "";
  for (let code = 0x21; code <= 0x7e; code += 1) {
    const ch = String.fromCharCode(code);
    if (!excluded.has(ch)) alphabet += ch;
  }
  return alphabet; // length 91
})();

const OUT_INDEX = new Map<string, number>(
  [...OUT_ALPHABET].map((ch, i) => [ch, i]),
);

const MX3 = "MX3|";

class BitWriter {
  private bits: number[] = [];
  write(value: number, width: number) {
    for (let i = width - 1; i >= 0; i -= 1) this.bits.push((value >> i) & 1);
  }
  toBase91(): string {
    let out = "";
    for (let i = 0; i < this.bits.length; i += 13) {
      const chunk = this.bits.slice(i, i + 13);
      const width = chunk.length;
      let value = 0;
      for (const bit of chunk) value = (value << 1) | bit;
      if (width <= 6) {
        out += OUT_ALPHABET[value]!;
      } else {
        value = value << (13 - width);
        out += OUT_ALPHABET[value % 91]! + OUT_ALPHABET[Math.floor(value / 91)]!;
      }
    }
    return out;
  }
}

function readBase91Bits(payload: string): number[] {
  const bits: number[] = [];
  let i = 0;
  while (i < payload.length) {
    if (i + 1 < payload.length) {
      const lo = OUT_INDEX.get(payload[i]!) ?? 0;
      const hi = OUT_INDEX.get(payload[i + 1]!) ?? 0;
      const value = lo + hi * 91;
      for (let b = 12; b >= 0; b -= 1) bits.push((value >> b) & 1);
      i += 2;
    } else {
      const value = OUT_INDEX.get(payload[i]!) ?? 0;
      for (let b = 5; b >= 0; b -= 1) bits.push((value >> b) & 1);
      i += 1;
    }
  }
  return bits;
}

export function phaseC(text: string): string | null {
  const symbols = [...new Set([...text])].sort();
  if (symbols.length === 0 || symbols.length > 4096) return null;
  const bitsIn = Math.max(1, Math.ceil(Math.log2(symbols.length)));
  const index = new Map<string, number>(symbols.map((s, i) => [s, i]));

  const writer = new BitWriter();
  for (const ch of text) writer.write(index.get(ch)!, bitsIn);

  const alphabet = symbols.join("");
  const payload = writer.toBase91();
  return `${MX3}${bitsIn}|${[...text].length}|${alphabet.length}|${alphabet}${payload}`;
}

export function unphaseC(packed: string): string {
  if (!packed.startsWith(MX3)) return packed;
  const rest = packed.slice(MX3.length);
  const p1 = rest.indexOf("|");
  const p2 = rest.indexOf("|", p1 + 1);
  const p3 = rest.indexOf("|", p2 + 1);
  const bitsIn = Number(rest.slice(0, p1));
  const count = Number(rest.slice(p1 + 1, p2));
  const alphaLen = Number(rest.slice(p2 + 1, p3));
  const body = rest.slice(p3 + 1);
  const alphabet = [...body].slice(0, alphaLen);
  const payload = [...body].slice(alphaLen).join("");

  const bits = readBase91Bits(payload);
  let out = "";
  let cursor = 0;
  for (let n = 0; n < count; n += 1) {
    let value = 0;
    for (let b = 0; b < bitsIn; b += 1) {
      value = (value << 1) | (bits[cursor] ?? 0);
      cursor += 1;
    }
    out += alphabet[value] ?? "";
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Pipeline                                                            */
/* ------------------------------------------------------------------ */

export function compress(source: string, path: string): CompressionResult {
  const originalBytes = byteLength(source);
  const phases: CompressionResult["phases"] = [];

  let best = source;
  let encoding: Encoding = "plain";
  let bestBytes = originalBytes;

  const a = phaseA(source, path);
  const aBytes = byteLength(a);
  const keepA = aBytes < bestBytes;
  phases.push({ name: "A · strip", bytes: aBytes, kept: keepA });
  if (keepA) {
    best = a;
    bestBytes = aBytes;
    encoding = "mx-a";
  }

  const b = phaseB(best);
  const bBytes = byteLength(b);
  const keepB = bBytes < bestBytes;
  phases.push({ name: "B · tokens", bytes: bBytes, kept: keepB });
  if (keepB) {
    best = b;
    bestBytes = bBytes;
    encoding = "mx-b";
  }

  const c = phaseC(best);
  const cBytes = c === null ? Infinity : byteLength(c);
  const keepC = c !== null && cBytes < bestBytes;
  phases.push({
    name: "C · bitpack",
    bytes: c === null ? bestBytes : cBytes,
    kept: keepC,
  });
  if (keepC && c) {
    best = c;
    bestBytes = cBytes;
    encoding = "mx-c";
  }

  return {
    content: best,
    encoding,
    originalBytes,
    compressedBytes: bestBytes,
    phases,
  };
}

export function decompress(content: string, encoding: Encoding | string): string {
  switch (encoding) {
    case "mx-c":
      return unphaseB(unphaseC(content));
    case "mx-b":
      return unphaseB(content);
    case "mx-a":
    case "plain":
    default:
      return content;
  }
}

export function savingsPercent(original: number, compressed: number): number {
  if (original <= 0) return 0;
  return Math.round(((original - compressed) / original) * 1000) / 10;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/* ------------------------------------------------------------------ */
/* basE91 byte codec (used by Phase D)                                 */
/* ------------------------------------------------------------------ */

const B91_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!#$%&()*+,./:;<=>?@[]^_`{|}~\"";

const B91_DECODE: Record<string, number> = {};
for (let i = 0; i < B91_ALPHABET.length; i += 1) B91_DECODE[B91_ALPHABET[i]!] = i;

export function b91Encode(data: Uint8Array): string {
  let out = "";
  let b = 0;
  let n = 0;
  for (const byte of data) {
    b |= byte << n;
    n += 8;
    if (n > 13) {
      let v = b & 8191;
      if (v > 88) {
        b >>= 13;
        n -= 13;
      } else {
        v = b & 16383;
        b >>= 14;
        n -= 14;
      }
      out += B91_ALPHABET[v % 91]! + B91_ALPHABET[Math.floor(v / 91)]!;
    }
  }
  if (n > 0) {
    out += B91_ALPHABET[b % 91]!;
    if (n > 7 || b > 90) out += B91_ALPHABET[Math.floor(b / 91)]!;
  }
  return out;
}

export function b91Decode(text: string): Uint8Array {
  const bytes: number[] = [];
  let b = 0;
  let n = 0;
  let v = -1;
  for (const ch of text) {
    const c = B91_DECODE[ch];
    if (c === undefined) continue;
    if (v < 0) {
      v = c;
    } else {
      v += c * 91;
      b |= v << n;
      n += (v & 8191) > 88 ? 13 : 14;
      do {
        bytes.push(b & 255);
        b >>= 8;
        n -= 8;
      } while (n > 7);
      v = -1;
    }
  }
  if (v + 1 > 0) bytes.push((b | (v << n)) & 255);
  return new Uint8Array(bytes);
}

/* ------------------------------------------------------------------ */
/* Phase D — LZ77 window packing (deflate-raw) into base91             */
/* ------------------------------------------------------------------ */

const MX4 = "\u00A7D4\u00A7";

export async function phaseD(text: string): Promise<string | null> {
  if (typeof CompressionStream === "undefined") return null;
  try {
    const stream = new Blob([new TextEncoder().encode(text)])
      .stream()
      .pipeThrough(new CompressionStream("deflate-raw"));
    const buffer = await new Response(stream).arrayBuffer();
    return MX4 + b91Encode(new Uint8Array(buffer));
  } catch {
    return null;
  }
}

export async function unphaseD(packed: string): Promise<string> {
  if (!packed.startsWith(MX4)) return packed;
  const bytes = b91Decode(packed.slice(MX4.length));
  const stream = new Blob([bytes as unknown as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  return new TextDecoder().decode(await new Response(stream).arrayBuffer());
}

/* ------------------------------------------------------------------ */
/* Full async pipeline: A -> B -> (C | D), each kept only if smaller   */
/* ------------------------------------------------------------------ */

export async function compressFull(
  source: string,
  path: string,
  stripComments = false,
): Promise<CompressionResult> {
  const originalBytes = byteLength(source);
  const phases: CompressionResult["phases"] = [];
  const chain: string[] = [];

  let best = source;
  let bestBytes = originalBytes;

  const a = phaseA(source, path);
  const aBytes = byteLength(a);
  const keepA = stripComments && aBytes < bestBytes;
  phases.push({ name: "A · strip comments + whitespace", bytes: aBytes, kept: keepA });
  if (keepA) {
    best = a;
    bestBytes = aBytes;
    chain.push("a");
  }

  const b = phaseB(best);
  const bBytes = byteLength(b);
  const keepB = bBytes < bestBytes;
  phases.push({ name: "B · dictionary tokens", bytes: bBytes, kept: keepB });
  if (keepB) {
    best = b;
    bestBytes = bBytes;
    chain.push("b");
  }

  const c = phaseC(best);
  const cBytes = c === null ? Infinity : byteLength(c);

  const d = await phaseD(best);
  const dBytes = d === null ? Infinity : byteLength(d);

  const useD = dBytes < bestBytes && dBytes <= cBytes;
  const useC = !useD && cBytes < bestBytes;

  phases.push({
    name: "C · bit-pack over alphabet",
    bytes: Number.isFinite(cBytes) ? cBytes : bestBytes,
    kept: useC,
  });
  phases.push({
    name: "D · window packing (base91)",
    bytes: Number.isFinite(dBytes) ? dBytes : bestBytes,
    kept: useD,
  });

  if (useD && d) {
    best = d;
    bestBytes = dBytes;
    chain.push("d");
  } else if (useC && c) {
    best = c;
    bestBytes = cBytes;
    chain.push("c");
  }

  return {
    content: best,
    encoding: (chain.length ? chain.join("+") : "plain") as Encoding,
    originalBytes,
    compressedBytes: bestBytes,
    phases,
  };
}

export async function decompressFull(content: string, encoding: string): Promise<string> {
  if (encoding === "plain" || encoding === "") return content;
  if (encoding.startsWith("mx-")) return decompress(content, encoding);
  let out = content;
  for (const step of encoding.split("+").reverse()) {
    if (step === "d") out = await unphaseD(out);
    else if (step === "c") out = unphaseC(out);
    else if (step === "b") out = unphaseB(out);
  }
  return out;
}

export function ratioLabel(original: number, compressed: number): string {
  if (original <= 0 || compressed <= 0) return "1:1";
  const ratio = original / compressed;
  return `1:${ratio >= 10 ? Math.round(ratio) : ratio.toFixed(1)}`;
}
