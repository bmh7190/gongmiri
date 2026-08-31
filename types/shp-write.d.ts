declare module "@mapbox/shp-write" {
  import type { FeatureCollection } from "geojson";

  const shpwrite: {
    zip(
      collection: FeatureCollection,
      options?: {
        folder?: string;
        outputType?: "uint8array";
        types?: Partial<Record<"point" | "polyline" | "polygon", string>>;
      },
    ): Promise<Uint8Array>;
  };

  export default shpwrite;
}
