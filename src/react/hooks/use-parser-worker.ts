import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ParserWorkerMessage,
  ParseProgressMessage,
  ParseRequest,
} from "../../domain/parser-protocol";
import type {
  EncodingOption,
  ParseMode,
  ParsedDataset,
  SridCode,
} from "../../domain/types";

type PendingJob = {
  resolve: (dataset: ParsedDataset) => void;
  reject: (reason: Error) => void;
};

export const useParserWorker = () => {
  const workerRef = useRef<Worker | null>(null);
  const nextJobId = useRef(0);
  const pendingJobs = useRef(new Map<number, PendingJob>());
  const [progress, setProgress] = useState<Omit<ParseProgressMessage, "id" | "status"> | null>(null);

  const handleMessage = useCallback((event: MessageEvent<ParserWorkerMessage>) => {
    const message = event.data;
    const pending = pendingJobs.current.get(message.id);
    if (!pending) return;
    if (message.status === "progress") {
      setProgress({
        code: message.code,
        percent: message.percent,
        currentLayer: message.currentLayer,
        totalLayers: message.totalLayers,
      });
      return;
    }
    pendingJobs.current.delete(message.id);
    setProgress(null);
    if (message.status === "success") {
      pending.resolve(message.dataset);
    } else {
      pending.reject(new Error(message.code));
    }
  }, []);

  const startWorker = useCallback(() => {
    const worker = new Worker(
      new URL("../../workers/parser.ts", import.meta.url),
      { type: "module" },
    );
    workerRef.current = worker;
    worker.addEventListener("message", handleMessage);
  }, [handleMessage]);

  const stopWorker = useCallback((reason: Error) => {
    const worker = workerRef.current;
    if (worker) {
      worker.removeEventListener("message", handleMessage);
      worker.terminate();
      workerRef.current = null;
    }
    for (const pending of pendingJobs.current.values()) {
      pending.reject(reason);
    }
    pendingJobs.current.clear();
  }, [handleMessage]);

  useEffect(() => {
    startWorker();
    return () => stopWorker(new Error("Parser worker stopped."));
  }, [startWorker, stopWorker]);

  const cancel = useCallback(() => {
    const reason = new Error("Parser worker cancelled.");
    reason.name = "AbortError";
    stopWorker(reason);
    setProgress(null);
    startWorker();
  }, [startWorker, stopWorker]);

  const parse = useCallback(
    (
      buffer: ArrayBuffer,
      encoding: EncodingOption,
      srid: SridCode | null,
      mode: ParseMode,
      fileName: string,
      fileBytes: number,
      allowAutoQuick = false,
    ): Promise<ParsedDataset> => {
      const worker = workerRef.current;
      if (!worker) {
        return Promise.reject(new Error("Parser worker is not ready."));
      }
      const id = ++nextJobId.current;
      const promise = new Promise<ParsedDataset>((resolve, reject) => {
        pendingJobs.current.set(id, { resolve, reject });
      });
      const request: ParseRequest = {
        id,
        buffer,
        encoding,
        srid,
        mode,
        fileName,
        fileBytes,
        allowAutoQuick,
      };
      worker.postMessage(request);
      return promise;
    },
    [],
  );

  return { parse, progress, cancel };
};
