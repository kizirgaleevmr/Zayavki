import {
    createHashRouter,
    createRoutesFromElements,
    Navigate,
    NavLink,
    Route,
} from "react-router-dom";
import FormAuth from "../Pages/auth";
import App from "../App";
import FormZayavki from "../Pages/FormZayavki";
import AllMessage from "../Pages/AllMessage";
import ZayavkiPage from "../Pages/Zayavki";
import AllZayavki from "../Pages/AllZayavki";
import ProtectedRoute from "../Pages/ProtectedRoute";
import ReferenceBook from "../Pages/ReferenceBook";
import Consultation from "../Pages/Сonsultations";
import KnowledgeBase from "../Pages/KnowledgeBase";
import { KnbDoska } from "../Pages/KnbDoska";
import MoveTs from "../Pages/MoveTs";

/**
 * Главный hash-router приложения с защищёнными и публичными маршрутами.
 *
 * @type {import("react-router-dom").Router}
 */
const route = createHashRouter(
    createRoutesFromElements(
        <>
            <Route element={<ProtectedRoute />}>
                <Route path="/" element={<App />}>
                    <Route path="/zayavki" element={<ZayavkiPage />}>
                        <Route
                            index
                            element={<Navigate to="/zayavki/all" replace />}
                        />
                        <Route path="/zayavki/new" element={<FormZayavki />} />
                        <Route path="/zayavki/all" element={<AllZayavki />} />
                    </Route>
                    <Route path="/consultations" element={<Consultation />} />
                    <Route path="/knbDoska" element={<KnbDoska />} />
                    <Route path="/move-ts" element={<MoveTs />} />
                    <Route path="/referenceBook" element={<ReferenceBook />} />
                    <Route path="/knowledgeBase" element={<KnowledgeBase />} />
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
                            <button className="button is-warning">Назад</button>
                        </NavLink>
                    </section>
                }
            />
        </>,
    ),
);

export default route;
