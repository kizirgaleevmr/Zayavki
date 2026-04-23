import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
    plugins: [react()],
    server: {
        proxy: {
            "/api": {
                target: "https://zayavki-b970.onrender.com",
                changeOrigin: true,
                secure: true,
                rewrite: (path) => path.replace(/^\/api/, ""),
                configure: (proxy) => {
                    proxy.on("proxyReq", (proxyReq) => {
                        proxyReq.removeHeader("origin");
                    });
                },
            },
        },
        watch: {
            usePolling: true,
            interval: 300,
        },
    },
});
