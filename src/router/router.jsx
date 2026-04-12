import {
    createBrowserRouter,
    createRoutesFromElements,
    Route,
} from "react-router";
import { NavLink } from "react-router";
import FormAuth from "../Pages/auth";
import App from "../App";
import FormZayavki from "../Pages/FormZayavki";
import AllMessage from "../Pages/AllMessage";
import ZayavkiPage from "../Pages/Zayavki";
import AllZayavki from "../Pages/AllZayavki";
import ProtectedRoute from "../Pages/ProtectedRoute";
const route = createBrowserRouter(
    createRoutesFromElements(
        <>
            <Route element={<ProtectedRoute />}>
                <Route path="/" element={<App />}>
                    <Route path="/zayavki" element={<ZayavkiPage />}>
                        <Route path="/zayavki/new" element={<FormZayavki />} />
                        <Route path="/zayavki/all" element={<AllZayavki />} />
                    </Route>
                    <Route path="/allMessage" element={<AllMessage />} />
                </Route>
            </Route>
            <Route path="/auth" element={<FormAuth />} />
            <Route
                path="*"
                element={
                    <section className="container pt-6">
                        <p className="has-background-warning-dark has-text-success mb-6">
                            Такой страницы нет: 404!
                        </p>
                        <NavLink to="/">
                            <button class="button is-warning">Назад</button>
                        </NavLink>
                    </section>
                }
            />
        </>,
    ),
);

export default route;
