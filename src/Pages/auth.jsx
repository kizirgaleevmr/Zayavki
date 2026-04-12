import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { isAuthenticated, setAuthSession } from "../utils/auth";

export default function FormAuth() {
    const [login, setLogin] = useState("");
    const [password, setPassword] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");
    const navigate = useNavigate();
    const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:3002";

    useEffect(() => {
        if (isAuthenticated()) {
            navigate("/zayavki/new", { replace: true });
        }
    }, [navigate]);

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
                    login,
                    password,
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
            <form className="form-control box is-radiusle" onSubmit={submitClick}>
                <label className="label">Авторизуйтесь</label>
                <div className="field">
                    <p className="control has-icons-left has-icons-right">
                        <input
                            name="login"
                            className="input"
                            type="text"
                            placeholder="логин"
                            value={login}
                            onChange={(e) => setLogin(e.target.value)}
                            required
                        />
                        <span className="icon is-small is-left">
                            <i className="fas fa-envelope"></i>
                        </span>
                        <span className="icon is-small is-right">
                            <i className="fas fa-check"></i>
                        </span>
                    </p>
                </div>
                <div className="field">
                    <p className="control has-icons-left">
                        <input
                            name="passw"
                            className="input"
                            type="password"
                            placeholder="пароль"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                        <span className="icon is-small is-left">
                            <i className="fas fa-lock"></i>
                        </span>
                    </p>
                </div>
                {error ? <p className="help is-danger mb-3">{error}</p> : null}
                <div className="field">
                    <p className="control">
                        <button
                            type="submit"
                            className={`button is-success has-text-white ${
                                isLoading ? "is-loading" : ""
                            }`}
                            disabled={isLoading}
                        >
                            Войти
                        </button>
                    </p>
                </div>
            </form>
        </section>
    );
}
