import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { isAuthenticated, setAuthSession } from "../utils/auth";
import { getApiUrl } from "../utils/api";

/**
 * Страница авторизации пользователя.
 *
 * @returns {JSX.Element} Форма входа в систему.
 */
export default function FormAuth() {
    const [login, setLogin] = useState("");
    const [password, setPassword] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");
    const navigate = useNavigate();
    const apiUrl = getApiUrl();

    useEffect(() => {
        if (isAuthenticated()) {
            navigate("/zayavki/new", { replace: true });
        }
    }, [navigate]);

    /**
     * Отправляет форму авторизации и сохраняет сессию при успешном входе.
     *
     * @param {React.FormEvent<HTMLFormElement>} evt Событие отправки формы.
     * @returns {Promise<void>}
     */
    async function submitClick(evt) {
        evt.preventDefault();
        setError("");
        setIsLoading(true);

        try {
            const response = await fetch(`${apiUrl}/auth/login`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    login: login.trim(),
                    password: password.trim(),
                }),
            });

            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.message || "Ошибка авторизации");
            }

            setAuthSession(result.token, result.user);
            navigate("/zayavki/new", { replace: true });
        } catch (err) {
            setError(err.message || "Ошибка авторизации");
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <section className="auth">
            <div className="auth-shell">
                <div className="auth-copy">
                    <p className="auth-badge">БТИ SERVICE DESK</p>
                    <h1 className="auth-title">Авторизация</h1>
                    <p className="auth-subtitle">
                        Войдите в систему, чтобы создавать, отслеживать и
                        обрабатывать заявки.
                    </p>
                    <p className="auth-copyright">
                        Все права защищены. MKR &copy; 2026.
                    </p>
                </div>

                <form
                    className="form-control box auth-form"
                    onSubmit={submitClick}
                >
                    <label className="label auth-form-title">
                        Авторизуйтесь
                    </label>

                    <div className="field auth-field">
                        <label
                            className="label auth-field-label"
                            htmlFor="login"
                        >
                            Логин
                        </label>
                        <p className="control">
                            <span
                                className="auth-field-icon"
                                aria-hidden="true"
                            >
                                @
                            </span>
                            <input
                                id="login"
                                name="login"
                                className="input auth-input"
                                type="text"
                                placeholder="Введите логин"
                                value={login}
                                onChange={(e) => setLogin(e.target.value)}
                                autoComplete="username"
                                required
                            />
                        </p>
                    </div>

                    <div className="field auth-field">
                        <label
                            className="label auth-field-label"
                            htmlFor="password"
                        >
                            Пароль
                        </label>
                        <p className="control">
                            <span
                                className="auth-field-icon"
                                aria-hidden="true"
                            >
                                *
                            </span>
                            <input
                                id="password"
                                name="passw"
                                className="input auth-input"
                                type="password"
                                placeholder="Введите пароль"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                autoComplete="current-password"
                                required
                            />
                        </p>
                    </div>

                    {error ? (
                        <p className="help is-danger mb-3 auth-error">
                            {error}
                        </p>
                    ) : null}

                    <div className="field auth-actions">
                        <p className="control">
                            <button
                                type="submit"
                                className={`button is-success has-text-white auth-submit ${
                                    isLoading ? "is-loading" : ""
                                }`}
                                disabled={isLoading}
                            >
                                Войти
                            </button>
                        </p>
                    </div>
                </form>
            </div>
        </section>
    );
}
