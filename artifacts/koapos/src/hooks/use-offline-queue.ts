import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";

const DB_NAME = "koapos-offline";
const DB_VERSION = 1;
const STORE_NAME = "pending-sales";

interface PendingSale {
  id: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
  timestamp: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("IndexedDB not available")); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getAllPending(): Promise<PendingSale[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result as PendingSale[]);
    req.onerror = () => reject(req.error);
  });
}

async function deletePending(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function addPending(sale: PendingSale): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).add(sale);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function useOfflineQueue() {
  const [pendingCount, setPendingCount] = useState(0);
  const [isOnline, setIsOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [isSyncing, setIsSyncing] = useState(false);
  const syncingRef = useRef(false);

  const refreshCount = useCallback(async () => {
    try {
      const all = await getAllPending();
      setPendingCount(all.length);
    } catch { /* ignore */ }
  }, []);

  const syncPending = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setIsSyncing(true);
    try {
      const all = await getAllPending();
      if (all.length === 0) return;
      let synced = 0;
      for (const sale of all) {
        try {
          const r = await fetch(sale.url, {
            method: sale.method,
            headers: { ...sale.headers, "Content-Type": "application/json" },
            body: sale.body,
            credentials: "include",
          });
          if (r.ok) { await deletePending(sale.id); synced++; }
        } catch { /* still offline — keep */ }
      }
      if (synced > 0) {
        toast.success(`${synced} queued sale${synced !== 1 ? "s" : ""} synced successfully`);
        await refreshCount();
      }
    } finally {
      syncingRef.current = false;
      setIsSyncing(false);
    }
  }, [refreshCount]);

  const queueSale = useCallback(async (url: string, body: string): Promise<void> => {
    const sale: PendingSale = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      url,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      timestamp: Date.now(),
    };
    await addPending(sale);
    setPendingCount(c => c + 1);
    toast.warning("Offline — sale queued and will sync when connection returns");
  }, []);

  useEffect(() => {
    refreshCount();
    const handleOnline = () => {
      setIsOnline(true);
      syncPending();
    };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [refreshCount, syncPending]);

  return { pendingCount, isOnline, isSyncing, queueSale, syncPending };
}
