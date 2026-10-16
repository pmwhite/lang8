// What Tempo keeps in this browser: a few things by name, in IndexedDB
// (sturdier than localStorage, which a browser may clear when short of
// room).
const DB = "tempo";
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
