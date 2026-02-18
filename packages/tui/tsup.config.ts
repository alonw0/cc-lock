import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.tsx"],
  format: ["esm"],
  clean: true,
  sourcemap: true,
  external: ["react", "ink"],
});
