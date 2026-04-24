import { NavLink, Outlet } from "react-router-dom";

/**
 * Контейнер раздела заявок с вложенной навигацией между созданием и списком.
 *
 * @returns {JSX.Element} Раздел заявок.
 */
export default function ZayavkiPage() {
    return (
        <>
            <section className="container zayavki-page">
                <NavLink
                    to="/zayavki/new"
                    className={({ isActive }) =>
                        `button mr-2 ${
                            isActive
                                ? "is-success is-active-route"
                                : "is-white has-text-black"
                        }`
                    }
                >
                    Новая заявка
                </NavLink>
                <NavLink
                    to="/zayavki/all"
                    className={({ isActive }) =>
                        `button ${
                            isActive
                                ? "is-success is-active-route"
                                : "is-white has-text-black"
                        }`
                    }
                >
                    Все заявки
                </NavLink>
                <main className="mt-4">
                    <Outlet />
                </main>
            </section>
        </>
    );
}
