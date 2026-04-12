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
        if (window.location.pathname !== "/auth") {
            window.location.assign("/auth");
        }
    }

    return response;
}
