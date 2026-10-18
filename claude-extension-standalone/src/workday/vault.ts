/**
 * Credential vault for per-tenant Workday accounts. Runs in extension pages and
 * the service worker only (never in content scripts, whose IndexedDB belongs to
 * the page). Passwords are AES-GCM encrypted with a non-extractable key kept in
 * the extension's IndexedDB, so a dump of chrome.storage alone doesn't reveal them.
 */

export const MASTER = "__master__";

interface EncryptedCred {
  email: string;
  iv: string;
  ct: string;
  createdAt: number;
}

export interface Credential {
  email: string;
  password: string;
}

const DB = "wd-vault";
const STORE = "keys";

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function vaultKey(): Promise<CryptoKey> {
  const db = await idb();
  const existing = await new Promise<CryptoKey | undefined>((resolve, reject) => {
    const r = db.transaction(STORE).objectStore(STORE).get("aes");
    r.onsuccess = () => resolve(r.result as CryptoKey | undefined);
    r.onerror = () => reject(r.error);
  });
  if (existing) return existing;
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(key, "aes");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  return key;
}

const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const storageKey = (host: string) => `wd:cred:${host}`;

export async function saveCredential(host: string, cred: Credential): Promise<void> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await vaultKey(), new TextEncoder().encode(cred.password))
  );
  const rec: EncryptedCred = { email: cred.email, iv: b64(iv), ct: b64(ct), createdAt: Date.now() };
  await chrome.storage.local.set({ [storageKey(host)]: rec });
}

export async function loadCredential(host: string): Promise<Credential | null> {
  const out = await chrome.storage.local.get(storageKey(host));
  const rec = out?.[storageKey(host)] as EncryptedCred | undefined;
  if (!rec) return null;
  try {
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(rec.iv) }, await vaultKey(), unb64(rec.ct));
    return { email: rec.email, password: new TextDecoder().decode(pt) };
  } catch {
    return null; // key lost (extension reinstalled) → treat as no credential
  }
}

export async function deleteCredential(host: string): Promise<void> {
  await chrome.storage.local.remove(storageKey(host));
}

export async function listCredentialHosts(): Promise<string[]> {
  const all = await chrome.storage.local.get(null);
  return Object.keys(all)
    .filter((k) => k.startsWith("wd:cred:"))
    .map((k) => k.slice("wd:cred:".length))
    .filter((h) => h !== MASTER);
}

/** 18 chars with upper, lower, digit and symbol — passes every Workday password policy seen. */
export function generatePassword(len = 18): string {
  const sets = ["ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnopqrstuvwxyz", "23456789", "!@#$%*?"];
  const all = sets.join("");
  const rnd = (n: number) => crypto.getRandomValues(new Uint32Array(1))[0] % n;
  const chars = sets.map((s) => s[rnd(s.length)]);
  while (chars.length < len) chars.push(all[rnd(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}
