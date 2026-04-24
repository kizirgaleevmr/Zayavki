const DEFAULT_LOCAL_API_URL = "http://localhost:3002";
const DEFAULT_DEV_PROXY_API_URL = "/api";
const FALLBACK_REMOTE_API_URL = "https://zayavki-b970.onrender.com";

/**
 * Удаляет завершающие слэши из URL-строки.
 *
 * @param {unknown} value Исходное значение URL.
 * @returns {string} URL без завершающих `/`.
 */
function trimTrailingSlash(value) {
    return String(value || "").replace(/\/+$/, "");
}

/**
 * Определяет, запущен ли фронтенд на локальном или приватном адресе.
 *
 * @param {unknown} hostname Имя хоста текущего окна.
 * @returns {boolean} `true`, если это локальная/dev-среда.
 */
function isLocalFrontendHost(hostname) {
    const normalized = String(hostname || "").toLowerCase();

    if (
        normalized === "localhost" ||
        normalized === "127.0.0.1" ||
        normalized === "::1"
    ) {
        return true;
    }

    return (
        /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(normalized) ||
        /^192\.168\.\d{1,3}\.\d{1,3}$/.test(normalized) ||
        /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(normalized)
    );
}

/**
 * Возвращает базовый URL API с учётом `VITE_API_URL`, dev-proxy и production fallback.
 *
 * @returns {string} Базовый URL серверного API.
 */
export function getApiUrl() {
    const envUrl = trimTrailingSlash(import.meta.env.VITE_API_URL);
    if (envUrl) {
        return envUrl;
    }

    if (typeof window !== "undefined") {
        const { hostname } = window.location;
        if (isLocalFrontendHost(hostname)) {
            return DEFAULT_DEV_PROXY_API_URL;
        }

        return FALLBACK_REMOTE_API_URL;
    }

    return DEFAULT_LOCAL_API_URL;
}
