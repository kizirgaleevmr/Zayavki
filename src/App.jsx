import "./App.css";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { clearAuthSession, getAuthHeaders } from "./utils/auth";
import { getApiUrl } from "./utils/api";
import logo from "./assets/logo2.png";

function App() {
    const apiUrl = getApiUrl();
    const navigate = useNavigate();

    async function exitUsers() {
        try {
            await fetch(`${apiUrl}/auth/logout`, {
                method: "POST",
                headers: {
                    ...getAuthHeaders(),
                },
            });
        } catch {
            // ignore network errors on logout
        } finally {
            clearAuthSession();
            navigate("/auth", { replace: true });
        }
    }

    return (
        <section className="container">
            <nav
                className="navbar px-6 is-dark app-navbar"
                role="navigation"
                aria-label="main navigation"
            >
                <img className="logo" src={logo} alt="Logo" />
                <div className="navbar-brand">
                    <div className="navbar-item"></div>
                </div>
                <div className="navbar-menu app-navbar-menu">
                    <div className="navbar-end app-nav-links">
                        <div className="navbar-item">
                            <NavLink to="/zayavki">
                                {({ isActive }) => (
                                    <span
                                        className={
                                            isActive ? "active" : "is-white"
                                        }
                                    >
                                        Заявки по ремонту
                                    </span>
                                )}
                            </NavLink>
                        </div>

                        <div className="navbar-item">
                            <NavLink to="/consultations">
                                {({ isActive }) => (
                                    <span
                                        className={
                                            isActive ? "active" : "is-white"
                                        }
                                    >
                                        Консультации
                                    </span>
                                )}
                            </NavLink>
                        </div>
                        <div className="navbar-item">
                            <NavLink to="/knbDoska">
                                {({ isActive }) => (
                                    <span
                                        className={
                                            isActive ? "active" : "is-white"
                                        }
                                    >
                                        КНБ доска
                                    </span>
                                )}
                            </NavLink>
                        </div>
                        <div className="navbar-item">
                            <NavLink to="/knowledgeBase">
                                {({ isActive }) => (
                                    <span
                                        className={
                                            isActive ? "active" : "is-white"
                                        }
                                    >
                                        База знаний
                                    </span>
                                )}
                            </NavLink>
                        </div>
                        <div className="navbar-item">
                            <NavLink to="/referenceBook">
                                {({ isActive }) => (
                                    <span
                                        className={
                                            isActive ? "active" : "is-white"
                                        }
                                    >
                                        Справочник КСА
                                    </span>
                                )}
                            </NavLink>
                        </div>
                        <div className="navbar-item">
                            <button
                                type="button"
                                className="app-logout-button"
                                onClick={exitUsers}
                            >
                                Выход
                            </button>
                        </div>
                    </div>
                </div>
            </nav>
            <main className="mt-4">
                <Outlet />
            </main>
        </section>
    );
}

export default App;
