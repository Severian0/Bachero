// Copies MapLibre's ESM worker (and the shared chunk it imports) into public/
// so the browser can load it from a real URL. MapLibre derives the worker URL
// from import.meta.url, which Turbopack does not give it, so the map must be
// told where the worker lives (see ConsoleMap.tsx, setWorkerUrl).
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const src = join(root, "node_modules", "maplibre-gl", "dist");
const dest = join(root, "public", "maplibre");
mkdirSync(dest, { recursive: true });
for (const f of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  copyFileSync(join(src, f), join(dest, f));
}
console.log("maplibre worker copied to public/maplibre");
