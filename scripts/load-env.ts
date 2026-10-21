import fs from "node:fs";
import path from "node:path";

/** Minimal .env loader for CLI scripts (Next.js loads .env files itself). */
export function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    const p = path.join(process.cwd(), file);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m || line.trim().startsWith("#")) continue;
      const value = m[2]!.replace(/^["']|["']$/g, "");
      if (process.env[m[1]!] === undefined) process.env[m[1]!] = value;
    }
  }
}
