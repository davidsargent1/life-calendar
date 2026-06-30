import { defineConfig, configDefaults } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://127.0.0.1:8787"
    }
  },
  test: {
    // Tooling (ras, Claude Code worktrees) checks out copies of the repo —
    // including its test files — under these dirs. Exclude them so they
    // aren't picked up as part of this project's suite.
    exclude: [...configDefaults.exclude, "**/.ras/**", "**/.claude/**"]
  }
});
