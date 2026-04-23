const DEFAULT_LOCAL_API_URL = "http://localhost:3002";
const DEFAULT_DEV_PROXY_API_URL = "/api";
const FALLBACK_REMOTE_API_URL = "https://zayavki-b970.onrender.com";

function trimTrailingSlash(value) {
    return String(value || "").replace(/\/+$/, "");
}

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
