import type { MilkpodMessage } from '@milkpod/ai/types';

type ChatMessagesRecord = {
  threadId: string;
  messages: MilkpodMessage[];
  updatedAt: number;
};

type ChatMessagesPayload = {
  threadId: string;
  messages: MilkpodMessage[];
};

const DB_NAME = 'milkpod-local-cache';
const DB_VERSION = 1;
const CHAT_MESSAGES_STORE = 'chat_messages';
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7;

let dbPromise: Promise<IDBDatabase | null> | null = null;

function hasIndexedDb(): boolean {
  return typeof window !== 'undefined' && 'indexedDB' in window;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => {
      reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    };
    transaction.onabort = () => {
      reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
    };
  });
}

async function openDb(): Promise<IDBDatabase | null> {
  if (!hasIndexedDb()) return null;
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CHAT_MESSAGES_STORE)) {
        const store = db.createObjectStore(CHAT_MESSAGES_STORE, {
          keyPath: 'threadId',
        });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };

    request.onerror = () => {
      resolve(null);
    };

    request.onblocked = () => {
      resolve(null);
    };
  });

  return dbPromise;
}

export async function readPersistedChatMessages(
  threadId: string,
): Promise<ChatMessagesPayload | undefined> {
  const db = await openDb();
  if (!db) return undefined;

  try {
    const transaction = db.transaction(CHAT_MESSAGES_STORE, 'readonly');
    const store = transaction.objectStore(CHAT_MESSAGES_STORE);
    const record = await requestToPromise<ChatMessagesRecord | undefined>(
      store.get(threadId),
    );
    await transactionDone(transaction);

    if (!record) return undefined;
    if (Date.now() - record.updatedAt > MAX_AGE_MS) {
      void deletePersistedChatMessages(threadId);
      return undefined;
    }

    return { threadId: record.threadId, messages: record.messages };
  } catch {
    return undefined;
  }
}

export async function writePersistedChatMessages(
  threadId: string,
  messages: MilkpodMessage[],
): Promise<void> {
  const db = await openDb();
  if (!db) return;

  try {
    const transaction = db.transaction(CHAT_MESSAGES_STORE, 'readwrite');
    const store = transaction.objectStore(CHAT_MESSAGES_STORE);

    await requestToPromise(
      store.put({
        threadId,
        messages,
        updatedAt: Date.now(),
      } satisfies ChatMessagesRecord),
    );

    await transactionDone(transaction);
  } catch {
    // Best-effort cache write.
  }
}

export async function deletePersistedChatMessages(threadId: string): Promise<void> {
  const db = await openDb();
  if (!db) return;

  try {
    const transaction = db.transaction(CHAT_MESSAGES_STORE, 'readwrite');
    const store = transaction.objectStore(CHAT_MESSAGES_STORE);
    await requestToPromise(store.delete(threadId));
    await transactionDone(transaction);
  } catch {
    // Best-effort cache deletion.
  }
}
