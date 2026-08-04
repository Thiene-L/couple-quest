"use client";

// 聊天记录的本地库。服务器不留底，这里才是唯一的完整历史。
// 用原生 IndexedDB，不引第三方依赖：读写模式很简单，不值得多一个包。

const DB_NAME = "couple-quest-chat";
const DB_VERSION = 1;
const STORE = "messages";

export interface ChatMessage {
  id: string;
  body: string;
  createdAt: string; // ISO
  mine: boolean;
  fromName?: string;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(
  db: IDBDatabase,
  mode: IDBTransactionMode,
): [IDBTransaction, IDBObjectStore] {
  const t = db.transaction(STORE, mode);
  return [t, t.objectStore(STORE)];
}

// 按时间正序返回全部本地消息
export async function loadAll(): Promise<ChatMessage[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const [, store] = tx(db, "readonly");
    const req = store.index("createdAt").getAll();
    req.onsuccess = () => resolve((req.result ?? []) as ChatMessage[]);
    req.onerror = () => reject(req.error);
  });
}

// put 而非 add：同一条被重复拉到时覆盖即可，天然幂等
export async function saveMany(messages: ChatMessage[]): Promise<void> {
  if (messages.length === 0) return;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const [t, store] = tx(db, "readwrite");
    for (const m of messages) store.put(m);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export async function saveOne(message: ChatMessage): Promise<void> {
  await saveMany([message]);
}

export async function removeOne(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const [t, store] = tx(db, "readwrite");
    store.delete(id);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export async function clearAll(): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const [t, store] = tx(db, "readwrite");
    store.clear();
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export async function countAll(): Promise<number> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const [, store] = tx(db, "readonly");
    const req = store.count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function supportsLocalChat(): boolean {
  return typeof indexedDB !== "undefined";
}
