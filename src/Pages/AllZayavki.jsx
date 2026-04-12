import { useEffect, useState } from "react";
import { fetchWithAuth } from "../utils/auth";

export default function AllZayavki() {
    const [zayavki, setZayavki] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState("");
    const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:3002";

    const deviceTypeLabels = {
        terminal: "Терминал",
        printer: "Принтер",
        scanner: "Сканер",
        pc: "ПК",
        other: "Другое",
    };

    useEffect(() => {
        async function getAllZayavki() {
            try {
                setIsLoading(true);
                setError("");

                const response = await fetchWithAuth(`${apiUrl}/zayavki`, {
                    method: "GET",
                });

                if (!response.ok) {
                    throw new Error("Не удалось получить список заявок");
                }

                const data = await response.json();
                setZayavki(data);
            } catch (err) {
                setError(err.message || "Ошибка загрузки заявок");
            } finally {
                setIsLoading(false);
            }
        }

        getAllZayavki();
    }, [apiUrl]);

    if (isLoading) {
        return (
            <section className="container">
                <p>Загрузка заявок...</p>
            </section>
        );
    }

    if (error) {
        return (
            <section className="container">
                <p className="has-text-danger">{error}</p>
            </section>
        );
    }

    return (
        <section className="container">
            <h1 className="title is-4">Все заявки</h1>

            {zayavki.length === 0 ? (
                <p>Заявок пока нет.</p>
            ) : (
                <div className="table-container">
                    <table className="table is-fullwidth is-striped is-hoverable">
                        <thead>
                            <tr>
                                <th>Дата</th>
                                <th>КСА</th>
                                <th>Тип устройства</th>
                                <th>Наименование</th>
                                <th>Серийный номер</th>
                                <th>Контактное лицо</th>
                                <th>Решение</th>
                            </tr>
                        </thead>
                        <tbody>
                            {zayavki.map((item) => (
                                <tr key={item._id}>
                                    <td>
                                        {item.createdAt
                                            ? new Date(
                                                  item.createdAt,
                                              ).toLocaleString("ru-RU")
                                            : "-"}
                                    </td>
                                    <td>
                                        {item.ksa_number ||
                                            item.ksa_name ||
                                            item.ksa_id ||
                                            "-"}
                                    </td>
                                    <td>
                                        {deviceTypeLabels[item.device_type] ||
                                            item.device_type ||
                                            "-"}
                                    </td>
                                    <td>{item.device_name || "-"}</td>
                                    <td>{item.device_serial || "-"}</td>
                                    <td>{item.contact_person || "-"}</td>
                                    <td>{item.decision || "-"}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}
