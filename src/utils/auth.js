export const AUTH_TOKEN_KEY = "auth_token";
export const AUTH_USER_KEY = "auth_user";

/**
 * Возвращает токен текущей авторизованной сессии из `localStorage`.
 *
 * @returns {string | null} Токен авторизации или `null`.
 */
export function getAuthToken() {
    return localStorage.getItem(AUTH_TOKEN_KEY);
}

/**
 * Сохраняет токен и данные пользователя в локальное хранилище браузера.
 *
 * @param {string} token Токен авторизации.
 * @param {Record<string, any> | null | undefined} user Данные пользователя.
 * @returns {void}
 */
export function setAuthSession(token, user) {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
    if (user) {
        localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
    }
}

/**
 * Очищает данные текущей сессии из локального хранилища.
 *
 * @returns {void}
 */
export function clearAuthSession() {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_USER_KEY);
}

/**
 * Формирует заголовки авторизации для HTTP-запросов.
 *
 * @returns {{ Authorization: string } | Record<string, never>} Заголовки `fetch`.
 */
export function getAuthHeaders() {
    const token = getAuthToken();
    return token
        ? {
              Authorization: `Bearer ${token}`,
          }
        : {};
}

/**
 * Проверяет, есть ли активная авторизованная сессия.
 *
 * @returns {boolean} `true`, если токен сохранён.
 */
export function isAuthenticated() {
    return Boolean(getAuthToken());
}

/**
 * Приводит путь приложения к hash-router формату с ведущим `/`.
 *
 * @param {string} path Целевой путь приложения.
 * @returns {string} Нормализованный путь.
 */
function normalizeAppPath(path) {
    return String(path || "/").startsWith("/") ? String(path) : `/${path}`;
}

/**
 * Перенаправляет пользователя на указанный путь внутри hash-router приложения.
 *
 * @param {string} path Целевой путь.
 * @param {{ replace?: boolean }} [options={}] Параметры перенаправления.
 * @returns {void}
 */
export function redirectToAppPath(path, options = {}) {
    const normalizedPath = normalizeAppPath(path);
    const targetUrl = `${window.location.origin}${window.location.pathname}${window.location.search}#${normalizedPath}`;

    if (options.replace) {
        window.location.replace(targetUrl);
        return;
    }

    window.location.hash = normalizedPath;
}

/**
 * Возвращает текущий маршрут приложения из `window.location.hash`.
 *
 * @returns {string} Текущий hash-путь.
 */
function getCurrentAppPath() {
    const hash = String(window.location.hash || "").replace(/^#/, "");
    return hash || "/";
}

/**
 * Выполняет запрос с автоматическим добавлением токена авторизации.
 * При ответе `401` очищает сессию и отправляет пользователя на страницу входа.
 *
 * @param {RequestInfo | URL} input Адрес запроса.
 * @param {RequestInit} [init={}] Параметры запроса.
 * @returns {Promise<Response>} Ответ `fetch`.
 */
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
