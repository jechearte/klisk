import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Klisk Studio",
        short_name: "Klisk",
        description: "AI Agent Development Studio",
        start_url: "/",
        display: "standalone",
        background_color: "#030712",
        theme_color: "#030712",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,ico,woff2}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api/, /^\/ws/],
        runtimeCaching: [],
      },
    }),
  ],
  server: {
    port: 3000,
    proxy: {
      "/api": "http://localhost:8321",
      "/ws": {
        target: "ws://localhost:8321",
        ws: true,
      },
    },
  },
});
