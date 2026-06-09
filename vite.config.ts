import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the production bundle loads over Electron's file:// protocol
  // (absolute "/assets/..." paths resolve to the filesystem root and break the standalone app).
  base: './',
  plugins: [react()],
});
