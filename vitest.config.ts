import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["agent/**/*.test.ts", "scripts/**/*.test.ts"],
    globals: false,
    pool: "threads",
  },
});
