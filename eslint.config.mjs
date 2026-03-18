import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",

    // Generated folders can also exist in nested copies/worktrees.
    "**/.next/**",
    "**/node_modules/**",

    // Local backup/mirror directories that should not affect root lint signal.
    "swiss-construction-compliance/**",
    "openclaw-backup/**",
    ".backup-work/**",

    // Automation and generated integration artifacts (separate quality gates).
    "scripts/**",
  ]),
]);

export default eslintConfig;
