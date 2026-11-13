/**
 * Local storage layer.
 *
 * IndexedDB where available. A single-file prototype is often opened straight
 * from disk, where browsers hand out an opaque origin and refuse IndexedDB, so
 * this falls back to localStorage and finally to memory.
 */
const DB_NAME = "vyay";
const DB_VERSION = 3;
const LS_KEY = "vyay:db:v3";

export const COLLECTIONS = [
  "books", "accounts", "categories", "retailers", "methods",
  "people", "peopleEntries", "tags", "txns", "budgets", "goals", "recurring", "rules",
];

const emptyState = () => {
  const out = { meta: {} };
  COLLECTIONS.forEach((c) => { out[c] = []; });
  return out;
};

function openIDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined" || !indexedDB) return reject(new Error("no indexedDB"));
    let request;
    try { request = indexedDB.open(DB_NAME, DB_VERSION); } catch (e) { return reject(e); }
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of COLLECTIONS) {
        if (!db.objectStoreNames.contains(name)) {
          const store = db.createObjectStore(name, { keyPath: "id" });
          if (name !== "books") store.createIndex("book", "book", { unique: false });
          if (name === "txns") store.createIndex("date", "date", { unique: false });
          if (name === "peopleEntries") store.createIndex("person", "person", { unique: false });
        }
      }
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "k" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("indexedDB blocked"));
    request.onblocked = () => reject(new Error("indexedDB blocked"));
    setTimeout(() => reject(new Error("indexedDB timed out")), 3000);
  });
}

function idbBackend(db) {
  const done = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
  const run = (stores, mode, fn) => new Promise((resolve, reject) => {
    const t = db.transaction(stores, mode);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error("aborted"));
    fn(t);
  });
  return {
    kind: "indexeddb",
    async loadAll() {
      const t = db.transaction([...COLLECTIONS, "meta"], "readonly");
      const out = {};
      await Promise.all(COLLECTIONS.map(async (c) => { out[c] = await done(t.objectStore(c).getAll()); }));
      const meta = await done(t.objectStore("meta").getAll());
      out.meta = Object.fromEntries(meta.map((m) => [m.k, m.v]));
      return out;
    },
    put: (c, r) => run([c], "readwrite", (t) => { t.objectStore(c).put(r); }),
    putMany: (c, rs) => run([c], "readwrite", (t) => { const s = t.objectStore(c); rs.forEach((r) => s.put(r)); }),
    remove: (c, id) => run([c], "readwrite", (t) => { t.objectStore(c).delete(id); }),
    removeMany: (c, ids) => run([c], "readwrite", (t) => { const s = t.objectStore(c); ids.forEach((id) => s.delete(id)); }),
    setMeta: (k, v) => run(["meta"], "readwrite", (t) => { t.objectStore("meta").put({ k, v }); }),
    clearCollection: (c) => run([c], "readwrite", (t) => { t.objectStore(c).clear(); }),
    wipe: () => run([...COLLECTIONS, "meta"], "readwrite", (t) => {
      [...COLLECTIONS, "meta"].forEach((c) => t.objectStore(c).clear());
    }),
    replaceAll: (data) => run([...COLLECTIONS, "meta"], "readwrite", (t) => {
      COLLECTIONS.forEach((c) => { const s = t.objectStore(c); s.clear(); (data[c] || []).forEach((r) => s.put(r)); });
      const m = t.objectStore("meta");
      m.clear();
      Object.entries(data.meta || {}).forEach(([k, v]) => m.put({ k, v }));
    }),
  };
}

function documentBackend(kind, read, write) {
  let state = read() || emptyState();
  const flush = () => write(state);
  return {
    kind,
    async loadAll() { return JSON.parse(JSON.stringify(state)); },
    async put(c, record) {
      const list = state[c] || [];
      const i = list.findIndex((r) => r.id === record.id);
      if (i >= 0) list[i] = record; else list.push(record);
      state[c] = list; flush();
    },
    async putMany(c, records) { for (const r of records) await this.put(c, r); },
    async remove(c, id) { state[c] = (state[c] || []).filter((r) => r.id !== id); flush(); },
    async removeMany(c, ids) { state[c] = (state[c] || []).filter((r) => !ids.includes(r.id)); flush(); },
    async setMeta(k, v) { state.meta = { ...state.meta, [k]: v }; flush(); },
    async clearCollection(c) { state[c] = []; flush(); },
    async wipe() { state = emptyState(); flush(); },
    async replaceAll(data) {
      state = emptyState();
      COLLECTIONS.forEach((c) => { state[c] = data[c] || []; });
      state.meta = data.meta || {};
      flush();
    },
  };
}

function localStorageBackend() {
  const probe = "__vyay_probe__";
  localStorage.setItem(probe, "1");
  localStorage.removeItem(probe);
  return documentBackend("localstorage",
    () => { try { return JSON.parse(localStorage.getItem(LS_KEY)); } catch (e) { return null; } },
    (state) => { try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) { console.warn("Storage full", e); } });
}

let ready = null;
const pick = () => openIDB().then(idbBackend).catch(() => {
  try { return localStorageBackend(); }
  catch (e) { return documentBackend("memory", () => null, () => {}); }
});
const backend = () => (ready = ready || pick());

export const storageKind = async () => (await backend()).kind;
export const loadAll = async () => (await backend()).loadAll();
export const put = async (c, r) => (await backend()).put(c, r);
export const putMany = async (c, rs) => (await backend()).putMany(c, rs);
export const remove = async (c, id) => (await backend()).remove(c, id);
export const removeMany = async (c, ids) => (await backend()).removeMany(c, ids);
export const setMeta = async (k, v) => (await backend()).setMeta(k, v);
export const clearCollection = async (c) => (await backend()).clearCollection(c);
export const wipe = async () => (await backend()).wipe();
export const replaceAll = async (d) => (await backend()).replaceAll(d);

export async function estimateUsage() {
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const { usage, quota } = await navigator.storage.estimate();
      return { usage, quota };
    }
  } catch (e) { /* not supported */ }
  return null;
}
export async function persistStorage() {
  try { if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist(); }
  catch (e) { /* not supported */ }
  return false;
}
