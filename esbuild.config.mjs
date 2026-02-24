import esbuild from "esbuild";
import { readFileSync } from "fs";

const args = process.argv.slice(2);
const watch = args.includes("--watch");

const manifest = JSON.parse(readFileSync("./manifest.json", "utf-8"));

const baseConfig = {
  entryPoints: ["main.ts"],
  bundle: true,
  external: ["obsidian"],
  format: "cjs",
  target: "es2020",
  outfile: "main.js",
  sourcemap: true,
};

if (watch) {
  const ctx = await esbuild.context(baseConfig);
  await ctx.watch();
  console.log(`Watching ${manifest.name}...`);
} else {
  await esbuild.build(baseConfig);
  console.log(`Built ${manifest.name}`);
}
