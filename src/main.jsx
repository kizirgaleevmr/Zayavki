import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import "bulma/css/bulma.css";
import route from "./router/router";

/**
 * Точка входа клиентского приложения: инициализирует React и подключает роутер.
 */
createRoot(document.getElementById("root")).render(
    <StrictMode>
        <RouterProvider router={route} />
    </StrictMode>,
);
