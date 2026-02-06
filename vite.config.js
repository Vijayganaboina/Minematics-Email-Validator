import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Calls to http://localhost:5173/api/... will be forwarded to the real API
      "/api": {
        target: "https://rapid-email-verifier.fly.dev",
        changeOrigin: true,
        secure: true,
      },
    },
  },
});
