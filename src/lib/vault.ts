/**
 * Vault transport.
 *
 * Blob bodies (compressed file payloads) are stored in the local Indihost
 * agent when it is reachable on the machine, and fall back to IndexedDB in the
 * browser when it is not. The database only ever holds metadata + the
 * compressed text, so the vault is an optional acceleration layer.
 */

const AGENT_URL = "http://127.0.0.1:7654";
const DB_NAME = "indihost-vault";
const STORE = "blobs";

export type VaultMode = "agent" | "indexeddb" | "unavailable";

let cachedMode: VaultMode | null = null;

export async function detectVault(timeoutMs = 900): Promise<VaultMode> {
  if (typeof window === "undefined") return "unavailable";
  if (cachedMode) return cachedMode;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`${AGENT_URL}/health`, { signal: controller.signal });
    clearTimeout(timer);
    if (res.ok) {
      cachedMode = "agent";
      return cachedMode;
    }
  } catch {
    /* agent not running — fall through */
  }
  cachedMode = "indexedDB" in window ? "indexeddb" : "unavailable";
  return cachedMode;
}

export function resetVaultDetection() {
  cachedMode = null;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idbPut(key: string, value: string) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function idbGet(key: string): Promise<string | null> {
  const db = await openDb();
  const value = await new Promise<string | null>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).get(key);
    request.onsuccess = () => resolve((request.result as string) ?? null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return value;
}

export async function vaultPut(key: string, value: string): Promise<VaultMode> {
  const mode = await detectVault();
  if (mode === "agent") {
    try {
      await fetch(`${AGENT_URL}/blob/${encodeURIComponent(key)}`, {
        method: "PUT",
        headers: { "content-type": "text/plain" },
        body: value,
      });
      return "agent";
    } catch {
      resetVaultDetection();
    }
  }
  if (typeof window !== "undefined" && "indexedDB" in window) {
    await idbPut(key, value);
    return "indexeddb";
  }
  return "unavailable";
}

export async function vaultGet(key: string): Promise<string | null> {
  const mode = await detectVault();
  if (mode === "agent") {
    try {
      const res = await fetch(`${AGENT_URL}/blob/${encodeURIComponent(key)}`);
      if (res.ok) return await res.text();
    } catch {
      resetVaultDetection();
    }
  }
  if (typeof window !== "undefined" && "indexedDB" in window) {
    return idbGet(key);
  }
  return null;
}

export async function vaultStats(): Promise<{ mode: VaultMode; host: string }> {
  const mode = await detectVault();
  if (mode === "agent") {
    try {
      const res = await fetch(`${AGENT_URL}/health`);
      const json = (await res.json()) as { root?: string };
      return { mode, host: json.root ?? AGENT_URL };
    } catch {
      /* ignore */
    }
  }
  return { mode, host: mode === "indexeddb" ? "browser IndexedDB" : "none" };
}
