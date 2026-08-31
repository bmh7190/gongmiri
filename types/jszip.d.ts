declare module "jszip" {
  type ZipEntryData = string | ArrayBuffer | Uint8Array;

  export default class JSZip {
    file(
      path: string,
      data: ZipEntryData,
      options?: { binary?: boolean },
    ): this;

    generateAsync(options: {
      type: "uint8array";
      compression?: "STORE" | "DEFLATE";
    }): Promise<Uint8Array>;
  }
}
