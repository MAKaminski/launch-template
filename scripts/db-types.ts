#!/usr/bin/env tsx
/**
 * pnpm db:types
 *
 * Regenerates lib/supabase/types.ts from the live schema, replacing the
 * hand-written placeholder that ships with the template.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { dbSchema, launchConfig } from "../launch.config.js";

const OUTPUT = path.join(process.cwd(), "lib", "supabase", "types.ts");

function loadEnvLocal(): void {
  const file = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) return;

  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (!match) continue;
    const [, key, rawValue] = match;
    if (!key || rawValue === undefined || process.env[key]) continue;
    const value = rawValue.replace(/^["']|["']$/g, "");
    if (value && !value.startsWith("TODO_")) process.env[key] = value;
  }
}

loadEnvLocal();

const projectId = process.env.SUPABASE_PROJECT_ID;
if (!projectId) {
  console.error(
    "SUPABASE_PROJECT_ID is not set. Add it to .env.local (Dashboard → Settings → General → Reference ID).",
  );
  process.exit(1);
}

console.log(`Generating types for ${launchConfig.slug} (schema: ${dbSchema})…`);

try {
  const output = execFileSync(
    "supabase",
    ["gen", "types", "typescript", "--project-id", projectId, "--schema", dbSchema],
    { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
  );

  fs.writeFileSync(OUTPUT, output, "utf8");
  console.log(`✓ Wrote ${path.relative(process.cwd(), OUTPUT)}`);
  console.log(
    "\nNote: generated types key the schema by its real name. Update the\n" +
      "`db: { schema: ... as \"public\" }` casts in lib/supabase/*.ts if the\n" +
      "generated shape no longer uses a `public` key.",
  );
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Type generation failed: ${message}`);
  console.error("Is the Supabase CLI installed and are you logged in (`supabase login`)?");
  process.exit(1);
}
