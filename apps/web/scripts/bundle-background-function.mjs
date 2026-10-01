// Bundles the workflow function entry points into self-contained files.
//
// Netlify's function bundler treats node_modules packages as external and traces
// them into the deploy. That works for published packages, but this workspace's
// packages export TypeScript sources (and use extensionless relative imports),
// which cannot be executed at runtime. esbuild resolves and inlines all of it.
import { build } from "esbuild";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const targets = [
  // The real dispatch function. Background mode comes from the `-background`
  // filename suffix, which is already proven to answer 202 on this site, and
  // from `config.background` in the entry point.
  { entry: "lib/workflow/background-entry.ts", outfile: "netlify/functions/run-workflow-background.js" },
  // Temporary synchronous diagnostic. See lib/workflow/dispatch-probe.ts.
  { entry: "lib/workflow/probe-entry.ts", outfile: "netlify/functions/run-workflow-probe.js" }
];

for (const target of targets) {
  await build({
    entryPoints: [resolve(appRoot, target.entry)],
    outfile: resolve(appRoot, target.outfile),
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
}
