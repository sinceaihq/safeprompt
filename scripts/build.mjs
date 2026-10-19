// Build the extension into dist/extension and the web demo into dist/web.
//
//   node scripts/build.mjs            build both
//   node scripts/build.mjs --zip      also write dist/safeprompt-<version>.zip
//
// The output is deterministic: same sources and lockfile give the same bytes
// (no timestamps, sorted zip entries), so a release can be rebuilt and checked.

import { createHash } from "node:crypto";
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";
import { build } from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const dist = join(root, "dist");
const ext = join(dist, "extension");
const web = join(dist, "web");

const common = {
  bundle: true,
  minify: true,
  sourcemap: false,
  legalComments: "linked",
  target: ["chrome116"],
  logLevel: "warning",
  define: { __VERSION__: JSON.stringify(pkg.version) },
};

rmSync(dist, { recursive: true, force: true });
mkdirSync(ext, { recursive: true });
mkdirSync(web, { recursive: true });

await build({
  ...common,
  entryPoints: {
    background: "src/extension/background.ts",
    panel: "src/extension/panel.ts",
    review: "src/extension/review.ts",
  },
  outdir: ext,
  format: "esm",
});
// Content scripts cannot be ES modules.
await build({ ...common, entryPoints: { content: "src/extension/content.ts" }, outdir: ext, format: "iife" });

const manifest = JSON.parse(readFileSync(join(root, "src/extension/manifest.json"), "utf8"));
manifest.version = pkg.version;
writeFileSync(join(ext, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
for (const f of ["panel.html", "review.html"]) cpSync(join(root, "src/extension", f), join(ext, f));
cpSync(join(root, "src/extension/icons"), join(ext, "icons"), { recursive: true });
const css = readFileSync(join(root, "src/ui/styles.css"), "utf8");
writeFileSync(join(ext, "styles.css"), css);
cpSync(join(root, "src/ui/panel.css"), join(ext, "panel.css"));
cpSync(join(root, "LICENSE"), join(ext, "LICENSE"));

// Web demo (static page, same engine and interface).
await build({ ...common, entryPoints: { demo: "web/demo.ts" }, outdir: web, format: "esm", target: ["es2022"] });
cpSync(join(root, "web/index.html"), join(web, "index.html"));
writeFileSync(join(web, "styles.css"), css);
cpSync(join(root, "src/ui/panel.css"), join(web, "panel.css"));
cpSync(join(root, "src/extension/icons"), join(web, "icons"), { recursive: true });

function files(dir) {
  return readdirSync(dir)
    .flatMap((name) => {
      const p = join(dir, name);
      return statSync(p).isDirectory() ? files(p) : [p];
    })
    .sort();
}

// Minimal deterministic zip (deflate, fixed 1980-01-01 timestamps).
const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
const crc32 = (buf) => {
  let c = -1;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};

function zip(dir) {
  const local = [];
  const central = [];
  let offset = 0;
  for (const path of files(dir)) {
    const name = Buffer.from(relative(dir, path).split("\\").join("/"));
    const data = readFileSync(path);
    const packed = deflateRawSync(data, { level: 9 });
    const crc = crc32(data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x0800, 6); // UTF-8 names
    header.writeUInt16LE(8, 8); // deflate
    header.writeUInt16LE(0, 10); // time
    header.writeUInt16LE(0x21, 12); // date 1980-01-01
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(packed.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(name.length, 26);
    local.push(header, name, packed);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0x0800, 8);
    entry.writeUInt16LE(8, 10);
    entry.writeUInt16LE(0, 12);
    entry.writeUInt16LE(0x21, 14);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(packed.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, name);
    offset += header.length + name.length + packed.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(central.length / 2, 8);
  end.writeUInt16LE(central.length / 2, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, cd, end]);
}

if (process.argv.includes("--zip")) {
  const out = join(dist, `safeprompt-${pkg.version}.zip`);
  const bytes = zip(ext);
  writeFileSync(out, bytes);
  const sha = createHash("sha256").update(bytes).digest("hex");
  writeFileSync(join(dist, "SHA256SUMS"), `${sha}  safeprompt-${pkg.version}.zip\n`);
  console.log(`${relative(root, out)}  ${(bytes.length / 1024).toFixed(0)} kB  sha256 ${sha}`);
}
for (const f of files(ext)) console.log(`${relative(root, f).padEnd(40)} ${(statSync(f).size / 1024).toFixed(1)} kB`);
