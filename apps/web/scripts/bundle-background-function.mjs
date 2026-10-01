// Bundles the run-workflow background function into a single self-contained file.
//
// Netlify's function bundler treats node_modules packages as external and traces
// them into the deploy. That works for published packages, but this workspace's
// packages export TypeScript sources (and use extensionless relative imports),
// which cannot be executed at runtime. esbuild resolves and inlines all of it.
import { build } from "esbuild";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

await build({
  entryPoints: [resolve(appRoot, "lib/workflow/background-entry.ts")],
  outfile: resolve(appRoot, "netlify/functions/run-workflow-background.js"),
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  sourcemap: false,
  logLevel: "info",
  // A CommonJS bundle exposes the entry point as `exports.default`, but
  // Netlify's function loader also accepts the legacy `handler` export name.
  // Publishing both removes any doubt about which one the runtime picks up.
  footer: { js: "module.exports.handler = module.exports.default;" }
});

console.log("bundled netlify/functions/run-workflow-background.js");
