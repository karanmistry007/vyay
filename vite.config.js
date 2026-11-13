import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const BUILD_ID = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");

export default defineConfig({
  base: "./",
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  plugins: [react()],
  server: { host: true, port: 5173 },
  build: { outDir: "dist", sourcemap: false },
});
