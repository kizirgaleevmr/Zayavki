import "./App.css";
import { NavLink, Outlet } from "react-router-dom";
import { clearAuthSession, getAuthHeaders } from "./utils/auth";
import logo from "./assets/logo2.png";
function App() {
    const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:3002";

    async function exitUSers() {
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
        }
    }

    return (
        <section className="container">
            <nav
                className="navbar px-6 is-dark app-navbar"
                role="navigation"
                aria-label="main navigation"
            >
                <div className="navbar-brand">
                    <div className="navbar-item">
                        <img
                            className="logo"
                            src={logo}
                            alt="Logo"
                        />
                    </div>
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
                                        Заявки
                                    </span>
                                )}
                            </NavLink>
                        </div>
                        <div className="navbar-item">
                            <NavLink to="/allMessage">
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
                            <NavLink to="/auth" onClick={exitUSers}>
                                {({ isActive }) => (
                                    <span
                                        className={
                                            isActive ? "active" : "is-white"
                                        }
                                    >
                                        Выход
                                    </span>
                                )}
                            </NavLink>
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
