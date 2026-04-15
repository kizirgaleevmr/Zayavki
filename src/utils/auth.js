export const AUTH_TOKEN_KEY = "auth_token";
export const AUTH_USER_KEY = "auth_user";

export function getAuthToken() {
    return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function setAuthSession(token, user) {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
    if (user) {
        localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
    }
}

export function clearAuthSession() {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_USER_KEY);
}

export function getAuthHeaders() {
    const token = getAuthToken();
    return token
        ? {
              Authorization: `Bearer ${token}`,
          }
        : {};
}

export function isAuthenticated() {
    return Boolean(getAuthToken());
}

function normalizeAppPath(path) {
    return String(path || "/").startsWith("/") ? String(path) : `/${path}`;
}

export function redirectToAppPath(path, options = {}) {
    const normalizedPath = normalizeAppPath(path);
    const targetUrl = `${window.location.origin}${window.location.pathname}${window.location.search}#${normalizedPath}`;

    if (options.replace) {
        window.location.replace(targetUrl);
        return;
    }

    window.location.hash = normalizedPath;
}

function getCurrentAppPath() {
    const hash = String(window.location.hash || "").replace(/^#/, "");
    return hash || "/";
}

export async function fetchWithAuth(input, init = {}) {
    const response = await fetch(input, {
        ...init,
        headers: {
            ...(init.headers || {}),
            ...getAuthHeaders(),
        },
    });

    if (response.status === 401) {
        clearAuthSession();
        if (getCurrentAppPath() !== "/auth") {
            redirectToAppPath("/auth", { replace: true });
        }
    }

    return response;
}