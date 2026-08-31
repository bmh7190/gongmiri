import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ExportRequest,
  ExportWorkerMessage,
} from "../../domain/export-protocol";

type ExportPayload = Omit<ExportRequest, "id">;

type PendingExport = {
  resolve: (buffer: ArrayBuffer) => void;
  reject: (reason: Error) => void;
};

export const useExportWorker = () => {
  const workerRef = useRef<Worker | null>(null);
  const pendingRef = useRef<PendingExport | null>(null);
  const nextIdRef = useRef(0);
  const [isExporting, setIsExporting] = useState(false);

  const startWorker = useCallback(() => {
    const worker = new Worker(
      new URL("../../workers/exporter.ts", import.meta.url),
      { type: "module" },
    );
    worker.addEventListener("message", (event: MessageEvent<ExportWorkerMessage>) => {
      const pending = pendingRef.current;
      if (!pending) return;
      pendingRef.current = null;
      setIsExporting(false);
      if (event.data.status === "success") pending.resolve(event.data.buffer);
      else pending.reject(new Error("exportFailed"));
    });
    worker.addEventListener("error", () => {
      const pending = pendingRef.current;
      pendingRef.current = null;
      setIsExporting(false);
      pending?.reject(new Error("exportFailed"));
    });
    workerRef.current = worker;
  }, []);

  const stopWorker = useCallback((reason: Error) => {
    workerRef.current?.terminate();
    workerRef.current = null;
    pendingRef.current?.reject(reason);
    pendingRef.current = null;
    setIsExporting(false);
  }, []);

  useEffect(() => {
    startWorker();
    return () => stopWorker(new Error("Export worker stopped"));
  }, [startWorker, stopWorker]);

  const exportData = useCallback((payload: ExportPayload): Promise<ArrayBuffer> => {
    const worker = workerRef.current;
    if (!worker || pendingRef.current) {
      return Promise.reject(new Error("Export worker unavailable"));
    }
    const id = ++nextIdRef.current;
    const promise = new Promise<ArrayBuffer>((resolve, reject) => {
      pendingRef.current = { resolve, reject };
    });
    setIsExporting(true);
    worker.postMessage({ ...payload, id } satisfies ExportRequest);
    return promise;
  }, []);

  const cancelExport = useCallback(() => {
    const reason = new Error("Export cancelled");
    reason.name = "AbortError";
    stopWorker(reason);
    startWorker();
  }, [startWorker, stopWorker]);

  return { exportData, isExporting, cancelExport };
};
