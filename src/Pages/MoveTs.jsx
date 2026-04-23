import { useEffect, useState } from "react";
import { fetchWithAuth } from "../utils/auth";
import { getApiUrl } from "../utils/api";

function formatDate(value) {
    if (!value) return "-";

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return "-";
    }

    return parsed.toLocaleString("ru-RU");
}

export default function MoveTs() {
    const apiUrl = getApiUrl();
    const [items, setItems] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        async function loadMoveTs() {
            try {
                setIsLoading(true);
                setError("");

                const response = await fetchWithAuth(`${apiUrl}/move-ts`, {
                    method: "GET",
                });

                if (!response.ok) {
                    let message = "Не удалось получить движение техники";
                    try {
                        const errorBody = await response.json();
                        if (errorBody?.message) {
                            message = errorBody.message;
                        }
                    } catch {
                        // ignore parse error
                    }
                    throw new Error(message);
                }

                const data = await response.json();
                setItems(Array.isArray(data) ? data : []);
            } catch (loadError) {
                setError(
                    loadError.message ||
                        "Ошибка загрузки движения техники",
                );
                setItems([]);
            } finally {
                setIsLoading(false);
            }
        }

        loadMoveTs();
    }, [apiUrl]);

    return (
        <section className="container">
            <div className="box">
                <div className="is-flex is-justify-content-space-between is-align-items-center mb-4">
                    <div>
                        <h1 className="title is-4 mb-2">Движение техники</h1>
                        <p className="has-text-grey">
                            Всего записей: {items.length}
                        </p>
                    </div>
                </div>

                {error ? <p className="help is-danger mb-4">{error}</p> : null}

                {isLoading ? (
                    <p>Загрузка...</p>
                ) : items.length === 0 ? (
                    <p>Записей движения техники пока нет.</p>
                ) : (
                    <div className="table-container">
                        <table className="table is-fullwidth is-striped is-hoverable">
                            <thead>
                                <tr>
                                    <th>№</th>
                                    <th>По какой заявке</th>
                                    <th>Номер акта</th>
                                    <th>Дата</th>
                                    <th>Статус</th>
                                    <th>Способ доставки</th>
                                    <th>Тип устройства</th>
                                    <th>Наименование</th>
                                    <th>Серийный номер</th>
                                    <th>Инвентарный номер</th>
                                    <th>Откуда</th>
                                    <th>Куда</th>
                                    <th>Количество</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((item, index) => (
                                    <tr key={item._id || `${item.request_number}-${index}`}>
                                        <td>{index + 1}</td>
                                        <td>{item.request_number || "-"}</td>
                                        <td>{item.act_number || "-"}</td>
                                        <td>{formatDate(item.move_date)}</td>
                                        <td>{item.status || "-"}</td>
                                        <td>{item.delivery_method || "-"}</td>
                                        <td>{item.device_type || "-"}</td>
                                        <td>{item.device_name || "-"}</td>
                                        <td>{item.device_serial || "-"}</td>
                                        <td>{item.inv_number || "-"}</td>
                                        <td>{item.from_location || "-"}</td>
                                        <td>{item.to_location || "-"}</td>
                                        <td>{item.quantity ?? "-"}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </section>
    );
}
