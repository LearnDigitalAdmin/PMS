// Guard: the password hash is a device-local secret (offline sign-in). Fails if app code writes it to Firestore.
// Allowed: reading/storing it in the LOCAL database, and deleteField() to scrub legacy cloud copies.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../src", import.meta.url).pathname;
const files = [];
(function walk(d) {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(n) && files.push(p);
  }
})(root);

const bad = [];
for (const f of files) {
  if (f.includes("/pages/legal/")) continue;
  const lines = readFileSync(f, "utf8").split("\n");
  lines.forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, "");
    if (/^\s*(const|let)\s*\{/.test(code) || /console\.(log|error|warn)/.test(code)) return;   // destructuring / logging, not a write
    // a passwordHash key being assigned a value in an object literal that is not the scrub
    if (/passwordHash\s*:/.test(code) && !/deleteField\(\)/.test(code) && /Sync|Auth|firebase|Firestore/i.test(f) && !/^\s*passwordHash\??:\s*string/.test(code)) {
      bad.push(`${f}:${i + 1}: ${line.trim()}`);
    }
    if (/updateDoc\([^)]*'users'/.test(code) && /passwordHash/.test(code)) bad.push(`${f}:${i + 1}: ${line.trim()}`);
  });
}
if (bad.length) { console.error("passwordHash is written to Firestore:\n" + bad.join("\n")); process.exit(1); }
console.log(`ok: no Firestore write of passwordHash in ${files.length} source files`);
