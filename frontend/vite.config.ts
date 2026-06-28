import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// Vite SPA. Tailwind v4 runs through the official Vite plugin (CSS-first, no config file).
// The `@/` alias mirrors tsconfig `paths` so imports resolve identically in the type-checker
// and the bundler.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: { port: 5173 },
});