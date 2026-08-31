import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist-react",
    sourcemap: true,
    rollupOptions: {
      input: {
        viewer: "extension/react-viewer.html",
      },
      output: {
        manualChunks: {
          react: ["react", "react-dom", "i18next", "react-i18next"],
          map: ["maplibre-gl", "geojson-vt", "vt-pbf"],
        },
      },
    },
  },
});
