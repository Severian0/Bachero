import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Pure logic only — component tests add little for a demo, the same call the
// console spec makes. jsdom because the fixture source and the outbox both use
// localStorage.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "jsdom",
    include: ["test/**/*.test.ts"],
  },
});
