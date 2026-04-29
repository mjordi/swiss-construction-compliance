import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: [],
    exclude: [
      "**/node_modules/**",
      "**/.next/**",
      "**/.backup-*/**",
      "**/openclaw-backup/**",
      "**/swiss-construction-compliance/**",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
