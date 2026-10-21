// What Better keeps in this browser: a few things by name, in IndexedDB
// (sturdier than localStorage, which a browser may clear when short of
// room).
const DB = "better";
const STORE = "kv";

let db = null;
const open = () =>
  db ??
  (db = new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  }));

const step = async (mode, use) => {
  const d = await open();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(STORE, mode);
    const r = use(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(r?.result);
    tx.onerror = () => reject(tx.error);
  });
};

export const kept = {
  get: (key) => step("readonly", (s) => s.get(key)),
  set: (key, value) => step("readwrite", (s) => s.put(value, key)),
  remove: (key) => step("readwrite", (s) => s.delete(key)),
};

// What a store kept under an older name (Tempo's), by key; nothing if there
// is none (looked for first, so as not to make one).
export async function keptBefore(name, keys) {
  if (!(await indexedDB.databases()).some((d) => d.name === name)) return {};
  const old = await new Promise((resolve, reject) => {
    const r = indexedDB.open(name);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  const out = {};
  if (old.objectStoreNames.contains(STORE)) {
    const s = old.transaction(STORE).objectStore(STORE);
    await Promise.all(keys.map((k) => new Promise((resolve) => {
      const r = s.get(k);
      r.onsuccess = () => { if (r.result !== undefined) out[k] = r.result; resolve(); };
      r.onerror = () => resolve();
    })));
  }
  old.close();
  return out;
}
