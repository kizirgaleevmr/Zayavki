import { NavLink, Outlet } from "react-router-dom";
export default function ZayavkiPage() {
    return (
        <>
            <section className="container">
                <button className="button is-white mr-2">
                    <NavLink to="/zayavki/new">
                        {({ isActive }) => (
                            <span
                                className={
                                    isActive ? "active" : "has-text-black"
                                }
                            >
                                Новая заявка
                            </span>
                        )}
                    </NavLink>
                </button>
                <button className="button is-white has-text-black">
                    <NavLink to="/zayavki/all">
                        {({ isActive }) => (
                            <span
                                className={
                                    isActive ? "active" : "has-text-black"
                                }
                            >
                                Все заявки
                            </span>
                        )}
                    </NavLink>
                </button>
                <main className="mt-4">
                    <Outlet />
                </main>
            </section>
        </>
    );
}
