import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [],
  server: {
    allowedHosts: ['.monkeycode-ai.online'],
    port: 5173
  }
});
