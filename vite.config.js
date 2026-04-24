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
                /**
                 * Удаляет dev-префикс `/api` перед проксированием запроса на backend.
                 *
                 * @param {string} path Исходный путь запроса.
                 * @returns {string} Путь без локального префикса.
                 */
                rewrite: (path) => path.replace(/^\/api/, ""),
                /**
                 * Удаляет заголовок `origin` у проксируемых запросов.
                 *
                 * @param {import("http-proxy").Server} proxy Экземпляр прокси-сервера.
                 * @returns {void}
                 */
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
