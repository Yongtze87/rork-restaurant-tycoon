import path from "path";

import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  optimizeDeps: { include: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', 'vitest-browser-react', 'next-themes', 'sonner', 'zod', 'react-hook-form', '@hookform/resolvers/zod', '@radix-ui/react-collapsible', '@radix-ui/react-dialog', '@radix-ui/react-switch', '@radix-ui/react-radio-group', '@react-three/fiber', 'three', 'three/addons/geometries/RoundedBoxGeometry.js', 'three/addons/utils/BufferGeometryUtils.js'] },
  test: {
    globals: true,
    include: ["src/**/*.browser.{test,spec}.{ts,tsx}"],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: "chromium" }],
    },
  },
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
