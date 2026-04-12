import { useEffect, useState } from "react";
import ExcelJS from "exceljs";
import { fetchWithAuth } from "../utils/auth";

export default function AllZayavki() {
    const [zayavki, setZayavki] = useState([]);
    const [statusFilter, setStatusFilter] = useState("all");
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState("");
    const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
    const [detailsZayavka, setDetailsZayavka] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedZayavka, setSelectedZayavka] = useState(null);
    const [decisionText, setDecisionText] = useState("");
    const [decisionDate, setDecisionDate] = useState("");
    const [isSavingDecision, setIsSavingDecision] = useState(false);
    const [decisionError, setDecisionError] = useState("");
    const [deletingId, setDeletingId] = useState("");
    const [isExporting, setIsExporting] = useState(false);
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

    function getRowHighlight(item) {
        const decision = (item.decision || "").trim();
        return decision && decision !== "-"
            ? { backgroundColor: "#e8f8ee" }
            : { backgroundColor: "#fdeeee" };
    }

    function isResolved(item) {
        const decision = (item.decision || "").trim();
        return Boolean(decision && decision !== "-");
    }

    function openDecisionModal(item) {
        setSelectedZayavka(item);
        setDecisionText(item.decision || "");
        setDecisionDate(
            item.decision_date
                ? new Date(item.decision_date).toISOString().slice(0, 10)
                : "",
        );
        setDecisionError("");
        setIsModalOpen(true);
    }

    function closeDecisionModal() {
        setIsModalOpen(false);
        setSelectedZayavka(null);
        setDecisionText("");
        setDecisionDate("");
        setDecisionError("");
    }

    function openDetailsModal(item, evt) {
        evt.stopPropagation();
        setDetailsZayavka(item);
        setIsDetailsModalOpen(true);
    }

    function closeDetailsModal() {
        setIsDetailsModalOpen(false);
        setDetailsZayavka(null);
    }

    function printDetails() {
        if (!detailsZayavka) return;

        const printWindow = window.open("", "_blank", "width=900,height=700");
        if (!printWindow) return;

        const createdAt = detailsZayavka.createdAt
            ? new Date(detailsZayavka.createdAt).toLocaleString("ru-RU")
            : "-";
        const decisionDate = detailsZayavka.decision_date
            ? new Date(detailsZayavka.decision_date).toLocaleDateString("ru-RU")
            : "-";
        const ksaValue =
            detailsZayavka.ksa_number ||
            detailsZayavka.ksa_name ||
            detailsZayavka.ksa_id ||
            "-";
        const deviceTypeValue =
            deviceTypeLabels[detailsZayavka.device_type] ||
            detailsZayavka.device_type ||
            "-";
        const photoBlock = detailsZayavka.device_photo?.data_base64
            ? `<img src="${detailsZayavka.device_photo.data_base64}" alt="Фото устройства" style="width:220px;max-width:100%;border-radius:8px;" />`
            : "<p>-</p>";

        const html = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<title>Заявка ${detailsZayavka.device_serial || ""}</title>
<style>
body { font-family: Arial, sans-serif; margin: 24px; color: #222; }
h1 { margin: 0 0 16px; font-size: 22px; }
p { margin: 8px 0; line-height: 1.35; }
strong { display: inline-block; min-width: 180px; }
.photo { margin-top: 12px; }
</style>
</head>
<body>
<h1>Информация по заявке</h1>
<p><strong>Дата:</strong> ${createdAt}</p>
<p><strong>Регион:</strong> ${detailsZayavka.region_name || "-"}</p>
<p><strong>КСА:</strong> ${ksaValue}</p>
<p><strong>Адрес КСА:</strong> ${detailsZayavka.ksa_address || "-"}</p>
<p><strong>Тип устройства:</strong> ${deviceTypeValue}</p>
<p><strong>Наименование:</strong> ${detailsZayavka.device_name || "-"}</p>
<p><strong>Серийный номер:</strong> ${detailsZayavka.device_serial || "-"}</p>
<p><strong>Контактное лицо:</strong> ${detailsZayavka.contact_person || "-"}</p>
<p><strong>Неисправность:</strong> ${detailsZayavka.device_issue || "-"}</p>
<p><strong>Решение:</strong> ${detailsZayavka.decision || "-"}</p>
<p><strong>Дата решения:</strong> ${decisionDate}</p>
<div class="photo">
<p><strong>Фото:</strong></p>
${photoBlock}
</div>
</body>
</html>`;

        printWindow.document.open();
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.focus();
        printWindow.print();
    }

    async function saveDecision() {
        if (!selectedZayavka?._id) return;

        try {
            setIsSavingDecision(true);
            setDecisionError("");

            const response = await fetchWithAuth(
                `${apiUrl}/zayavki/${selectedZayavka._id}/decision`,
                {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        decision: decisionText,
                        decision_date: decisionDate,
                    }),
                },
            );

            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.message || "Не удалось сохранить решение");
            }

            setZayavki((prev) =>
                prev.map((item) =>
                    item._id === selectedZayavka._id
                        ? { ...item, ...result.zayavka }
                        : item,
                ),
            );
            closeDecisionModal();
        } catch (err) {
            setDecisionError(err.message || "Ошибка сохранения решения");
        } finally {
            setIsSavingDecision(false);
        }
    }

    async function deleteZayavka(item, evt) {
        evt.stopPropagation();
        if (!item?._id) return;

        const confirmed = window.confirm(
            `Удалить заявку с серийным номером "${item.device_serial || "-"}"?`,
        );
        if (!confirmed) return;

        try {
            setDeletingId(item._id);
            let response = await fetchWithAuth(`${apiUrl}/zayavki/${item._id}`, {
                method: "DELETE",
            });
            if (response.status === 404) {
                response = await fetchWithAuth(
                    `${apiUrl}/zayavki/${item._id}/delete`,
                    {
                        method: "POST",
                    },
                );
            }

            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.message || "Не удалось удалить заявку");
            }

            setZayavki((prev) => prev.filter((z) => z._id !== item._id));
            if (selectedZayavka?._id === item._id) {
                closeDecisionModal();
            }
            if (detailsZayavka?._id === item._id) {
                closeDetailsModal();
            }
        } catch (err) {
            setError(err.message || "Ошибка удаления заявки");
        } finally {
            setDeletingId("");
        }
    }

    function getImageExtension(dataUrl) {
        const match = String(dataUrl).match(/^data:image\/(png|jpeg|jpg);base64,/i);
        if (!match) return null;
        const ext = match[1].toLowerCase();
        return ext === "jpg" ? "jpeg" : ext;
    }

    async function exportAllToExcel() {
        try {
            setIsExporting(true);
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet("Заявки");

            worksheet.columns = [
                { header: "Дата", key: "createdAt", width: 22 },
                { header: "Фото", key: "photo", width: 14 },
                { header: "КСА", key: "ksa", width: 14 },
                { header: "Адрес КСА", key: "ksaAddress", width: 28 },
                { header: "Тип устройства", key: "deviceType", width: 18 },
                { header: "Наименование", key: "deviceName", width: 28 },
                { header: "Серийный номер", key: "deviceSerial", width: 22 },
                { header: "Контактное лицо", key: "contactPerson", width: 24 },
                { header: "Решение", key: "decision", width: 30 },
                { header: "Дата решения", key: "decisionDate", width: 16 },
            ];

            zayavki.forEach((item, index) => {
                const rowNumber = index + 2;
                worksheet.addRow({
                    createdAt: item.createdAt
                        ? new Date(item.createdAt).toLocaleString("ru-RU")
                        : "-",
                    photo: item.device_photo?.data_base64 ? "" : "-",
                    ksa: item.ksa_number || item.ksa_name || item.ksa_id || "-",
                    ksaAddress: item.ksa_address || "-",
                    deviceType:
                        deviceTypeLabels[item.device_type] ||
                        item.device_type ||
                        "-",
                    deviceName: item.device_name || "-",
                    deviceSerial: item.device_serial || "-",
                    contactPerson: item.contact_person || "-",
                    decision: item.decision || "-",
                    decisionDate: item.decision_date
                        ? new Date(item.decision_date).toLocaleDateString("ru-RU")
                        : "-",
                });

                if (item.device_photo?.data_base64) {
                    const ext = getImageExtension(item.device_photo.data_base64);
                    if (ext) {
                        const imageId = workbook.addImage({
                            base64: item.device_photo.data_base64,
                            extension: ext,
                        });

                        worksheet.addImage(imageId, {
                            tl: { col: 1.1, row: rowNumber - 1 + 0.1 },
                            ext: { width: 72, height: 72 },
                        });
                        worksheet.getRow(rowNumber).height = 58;
                    }
                }
            });

            worksheet.getRow(1).font = { bold: true };

            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([buffer], {
                type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `zayavki_${new Date().toISOString().slice(0, 10)}.xlsx`;
            link.click();
            URL.revokeObjectURL(url);
        } finally {
            setIsExporting(false);
        }
    }

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

    const filteredZayavki = zayavki.filter((item) => {
        if (statusFilter === "resolved") return isResolved(item);
        if (statusFilter === "unresolved") return !isResolved(item);
        return true;
    });

    return (
        <section className="container">
            <h1 className="title is-4">Все заявки</h1>

            <div className="field mb-4">
                <label className="label">Фильтр</label>
                <div className="control">
                    <div className="is-flex is-align-items-center is-gap-3">
                        <div className="select">
                            <select
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                            >
                                <option value="all">Все</option>
                                <option value="resolved">Решенные</option>
                                <option value="unresolved">Нерешенные</option>
                            </select>
                        </div>
                        <button
                            type="button"
                            className={`button is-link is-light ${
                                isExporting ? "is-loading" : ""
                            }`}
                            onClick={exportAllToExcel}
                            disabled={zayavki.length === 0 || isExporting}
                        >
                            Вывод в Excel
                        </button>
                    </div>
                </div>
            </div>

            {filteredZayavki.length === 0 ? (
                <p>Заявок пока нет.</p>
            ) : (
                <div className="table-container">
                    <table className="table is-fullwidth is-striped is-hoverable">
                        <thead>
                            <tr>
                                <th>Дата</th>
                                <th>Подробно</th>
                                <th>Изображение</th>
                                <th>КСА</th>
                                <th>Тип устройства</th>
                                <th>Наименование</th>
                                <th>Серийный номер</th>
                                <th>Контактное лицо</th>
                                <th>Решение</th>
                                <th>Удалить</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredZayavki.map((item) => (
                                <tr
                                    key={item._id}
                                    style={{
                                        cursor: "pointer",
                                        ...getRowHighlight(item),
                                    }}
                                    onClick={() => openDecisionModal(item)}
                                >
                                    <td>
                                        {item.createdAt
                                            ? new Date(
                                                  item.createdAt,
                                              ).toLocaleString("ru-RU")
                                            : "-"}
                                    </td>
                                    <td>
                                        <button
                                            type="button"
                                            className="button is-small is-light"
                                            onClick={(evt) =>
                                                openDetailsModal(item, evt)
                                            }
                                            title="Подробно"
                                        >
                                            i
                                        </button>
                                    </td>
                                    <td>
                                        {item.device_photo?.data_base64 ? (
                                            <img
                                                src={item.device_photo.data_base64}
                                                alt="Фото устройства"
                                                style={{
                                                    width: "64px",
                                                    height: "64px",
                                                    objectFit: "cover",
                                                    borderRadius: "6px",
                                                }}
                                            />
                                        ) : (
                                            "-"
                                        )}
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
                                    <td>
                                        <button
                                            type="button"
                                            className={`button is-small is-danger is-light ${
                                                deletingId === item._id
                                                    ? "is-loading"
                                                    : ""
                                            }`}
                                            onClick={(evt) =>
                                                deleteZayavka(item, evt)
                                            }
                                            disabled={deletingId === item._id}
                                        >
                                            Удалить
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <div className={`modal ${isModalOpen ? "is-active" : ""}`}>
                <div className="modal-background" onClick={closeDecisionModal} />
                <div className="modal-card">
                    <header className="modal-card-head">
                        <p className="modal-card-title">Решение по заявке</p>
                        <button
                            className="delete"
                            aria-label="close"
                            type="button"
                            onClick={closeDecisionModal}
                        />
                    </header>
                    <section className="modal-card-body">
                        {selectedZayavka ? (
                            <p className="mb-3">
                                Заявка:{" "}
                                <strong>{selectedZayavka.device_serial || "-"}</strong>
                            </p>
                        ) : null}
                        <div className="field">
                            <label className="label">Решение</label>
                            <div className="control">
                                <textarea
                                    className="textarea"
                                    value={decisionText}
                                    onChange={(e) => setDecisionText(e.target.value)}
                                    placeholder="Введите решение"
                                    rows="4"
                                />
                            </div>
                        </div>
                        <div className="field">
                            <label className="label">Дата</label>
                            <div className="control">
                                <input
                                    className="input"
                                    type="date"
                                    value={decisionDate}
                                    onChange={(e) => setDecisionDate(e.target.value)}
                                />
                            </div>
                        </div>
                        {decisionError ? (
                            <p className="help is-danger">{decisionError}</p>
                        ) : null}
                    </section>
                    <footer className="modal-card-foot">
                        <button
                            className={`button is-success ${
                                isSavingDecision ? "is-loading" : ""
                            }`}
                            type="button"
                            onClick={saveDecision}
                            disabled={isSavingDecision}
                        >
                            Сохранить
                        </button>
                        <button
                            className="button"
                            type="button"
                            onClick={closeDecisionModal}
                            disabled={isSavingDecision}
                        >
                            Отмена
                        </button>
                    </footer>
                </div>
            </div>

            <div className={`modal ${isDetailsModalOpen ? "is-active" : ""}`}>
                <div className="modal-background" onClick={closeDetailsModal} />
                <div className="modal-card">
                    <header className="modal-card-head">
                        <p className="modal-card-title">Информация по заявке</p>
                        <button
                            className="delete"
                            aria-label="close"
                            type="button"
                            onClick={closeDetailsModal}
                        />
                    </header>
                    <section className="modal-card-body">
                        {detailsZayavka ? (
                            <>
                                <p>
                                    <strong>Дата:</strong>{" "}
                                    {detailsZayavka.createdAt
                                        ? new Date(
                                              detailsZayavka.createdAt,
                                          ).toLocaleString("ru-RU")
                                        : "-"}
                                </p>
                                <p>
                                    <strong>Регион:</strong>{" "}
                                    {detailsZayavka.region_name || "-"}
                                </p>
                                <p>
                                    <strong>КСА:</strong>{" "}
                                    {detailsZayavka.ksa_number ||
                                        detailsZayavka.ksa_name ||
                                        detailsZayavka.ksa_id ||
                                        "-"}
                                </p>
                                <p>
                                    <strong>Адрес КСА:</strong>{" "}
                                    {detailsZayavka.ksa_address || "-"}
                                </p>
                                <p>
                                    <strong>Тип устройства:</strong>{" "}
                                    {deviceTypeLabels[detailsZayavka.device_type] ||
                                        detailsZayavka.device_type ||
                                        "-"}
                                </p>
                                <p>
                                    <strong>Наименование:</strong>{" "}
                                    {detailsZayavka.device_name || "-"}
                                </p>
                                <p>
                                    <strong>Серийный номер:</strong>{" "}
                                    {detailsZayavka.device_serial || "-"}
                                </p>
                                <p>
                                    <strong>Контактное лицо:</strong>{" "}
                                    {detailsZayavka.contact_person || "-"}
                                </p>
                                <p>
                                    <strong>Неисправность:</strong>{" "}
                                    {detailsZayavka.device_issue || "-"}
                                </p>
                                <p>
                                    <strong>Решение:</strong>{" "}
                                    {detailsZayavka.decision || "-"}
                                </p>
                                <p>
                                    <strong>Дата решения:</strong>{" "}
                                    {detailsZayavka.decision_date
                                        ? new Date(
                                              detailsZayavka.decision_date,
                                          ).toLocaleDateString("ru-RU")
                                        : "-"}
                                </p>
                                <p>
                                    <strong>Фото:</strong>
                                </p>
                                {detailsZayavka.device_photo?.data_base64 ? (
                                    <img
                                        src={detailsZayavka.device_photo.data_base64}
                                        alt="Фото устройства"
                                        style={{
                                            width: "220px",
                                            maxWidth: "100%",
                                            borderRadius: "8px",
                                        }}
                                    />
                                ) : (
                                    <p>-</p>
                                )}
                            </>
                        ) : null}
                    </section>
                    <footer className="modal-card-foot">
                        <button
                            className="button is-link is-light"
                            type="button"
                            onClick={printDetails}
                        >
                            Печать
                        </button>
                        <button
                            className="button"
                            type="button"
                            onClick={closeDetailsModal}
                        >
                            Закрыть
                        </button>
                    </footer>
                </div>
            </div>
        </section>
    );
}
