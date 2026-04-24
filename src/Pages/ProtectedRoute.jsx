import { Navigate, Outlet } from "react-router-dom";
import { isAuthenticated } from "../utils/auth";

/**
 * Защищает вложенные маршруты и перенаправляет неавторизованных пользователей на `/auth`.
 *
 * @returns {JSX.Element} Вложенный маршрут или редирект на авторизацию.
 */
export default function ProtectedRoute() {
    if (!isAuthenticated()) {
        return <Navigate to="/auth" replace />;
    }

    return <Outlet />;
}
