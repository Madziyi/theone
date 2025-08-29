import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {include:['react-is',   "@deck.gl/core",
      "@deck.gl/react",
      "@deck.gl/layers",
      "@deck.gl/mesh-layers",
      "@luma.gl/engine",
      "@luma.gl/shadertools",
      "maplibre-gl"]},
  resolve: { alias: { "@": path.resolve(__dirname, "src") } }
});
