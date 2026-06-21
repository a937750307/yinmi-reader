import { defineConfig } from 'vite';

import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [cloudflare()],
  server: {
    allowedHosts: ['.monkeycode-ai.online'],
    port: 5173
  }
});