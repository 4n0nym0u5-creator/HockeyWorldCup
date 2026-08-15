import { copyFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const publicDir = resolve(__dirname, "public");
mkdirSync(publicDir, { recursive: true });
copyFileSync(resolve(__dirname, "cloud/state.json"), resolve(publicDir, "ledger.json"));

export default defineConfig({
  plugins: [react()],
  base: process.env.GITHUB_ACTIONS ? "/HockeyWorldCup/" : "/",
});
