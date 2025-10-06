import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Map all react-native imports to react-native-web
      "react-native": "react-native-web",
      // Avoid bundling native-only view-shot on web
      "react-native-view-shot": "/src/shims/viewShotWeb.ts",
    },
  },
  optimizeDeps: {
    include: ["react-native-web"],
    // Prevent esbuild from scanning RN's Flow-typed sources
    exclude: ["react-native", "react-native-view-shot"],
  },
  server: {
    proxy: {
      "/api": {
        // Force IPv4 to avoid localhost -> ::1 resolution causing ECONNREFUSED
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
