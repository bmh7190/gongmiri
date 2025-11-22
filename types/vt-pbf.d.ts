declare module "vt-pbf" {
  const value: {
    fromGeojsonVt: (layers: Record<string, unknown>) => Uint8Array;
  };
  export default value;
}
