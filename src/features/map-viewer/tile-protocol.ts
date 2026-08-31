import * as maplibregl from "maplibre-gl";
import geojsonvt from "geojson-vt";
import vtpbf from "vt-pbf";
import type { FeatureCollectionGeometry } from "../../domain/types";

export const TILE_PROTOCOL = "gongmiri-geojsonvt";
export const TILE_LAYER_NAME = "gongmiri";
export const TILE_MAX_ZOOM = 14;

type TileIndex = ReturnType<typeof geojsonvt>;
const indexes = new Map<string, TileIndex>();
let registered = false;

export const registerTileProtocol = () => {
  if (registered) return;
  maplibregl.addProtocol(TILE_PROTOCOL, async ({ url }) => {
    const match = url.match(
      /^gongmiri-geojsonvt:\/\/(.+)\/(\d+)\/(\d+)\/(\d+)\.pbf$/,
    );
    if (!match?.[1]) throw new Error("Invalid Gongmiri tile request.");
    const index = indexes.get(match[1]);
    if (!index) throw new Error("Gongmiri tile index was released.");
    const tile = index.getTile(Number(match[2]), Number(match[3]), Number(match[4]));
    if (!tile) return { data: new ArrayBuffer(0) };
    const buffer = vtpbf.fromGeojsonVt({ [TILE_LAYER_NAME]: tile }).buffer;
    return { data: buffer };
  });
  registered = true;
};

export const createTileSet = (collection: FeatureCollectionGeometry) => {
  const key = `react-vt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  indexes.set(
    key,
    geojsonvt(collection as unknown as GeoJSON.FeatureCollection, {
      maxZoom: TILE_MAX_ZOOM,
      indexMaxZoom: TILE_MAX_ZOOM,
      indexMaxPoints: 120_000,
      tolerance: 3,
      buffer: 64,
      extent: 4096,
      generateId: false,
    }),
  );
  return {
    key,
    url: `${TILE_PROTOCOL}://${key}/{z}/{x}/{y}.pbf`,
  };
};

export const releaseTileSet = (key: string | null) => {
  if (key) indexes.delete(key);
};
