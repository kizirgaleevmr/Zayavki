import { useCallback, useEffect, useState } from "react";
import ExcelJS from "exceljs";
import { fetchWithAuth, AUTH_USER_KEY } from "../utils/auth";

export default function AllZayavki() {
    // Получение пользователя из localStorage
    let user = null;
    try {
        const userStr = localStorage.getItem(AUTH_USER_KEY);
        if (userStr) user = JSON.parse(userStr);
    } catch {}
    const [zayavki, setZayavki] = useState([]);
    const [statusFilter, setStatusFilter] = useState("all");
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState("");
    const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
    const [detailsZayavka, setDetailsZayavka] = useState(null);
    const [isDetailsLoading, setIsDetailsLoading] = useState(false);
    const [detailsError, setDetailsError] = useState("");
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedZayavka, setSelectedZayavka] = useState(null);
    const [decisionText, setDecisionText] = useState("");
    const [decisionDate, setDecisionDate] = useState("");
    const [isSavingDecision, setIsSavingDecision] = useState(false);
    const [decisionError, setDecisionError] = useState("");
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingZayavka, setEditingZayavka] = useState(null);
    const [isSavingEdit, setIsSavingEdit] = useState(false);
    const [editError, setEditError] = useState("");
    const [editForm, setEditForm] = useState({
        device_type: "",
        device_name: "",
        device_serial: "",
        device_issue: "",
        contact_person: "",
        ksa_address: "",
    });
    const [deletingId, setDeletingId] = useState("");
    const [isExporting, setIsExporting] = useState(false);
    const [searchText, setSearchText] = useState("");
    const [currentPage, setCurrentPage] = useState(1);
    const [totalItems, setTotalItems] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [lastUpdated, setLastUpdated] = useState("");
    const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:3002";
    const PAGE_SIZE = 10;

    const deviceTypeLabels = {
        terminal: "Терминал",
        printer: "Принтер",
        scanner: "Сканер",
        pc: "ПК",
        other: "Другое",
    };

    const getAllZayavki = useCallback(
        async (silent = false) => {
            try {
                if (silent) {
                    setIsRefreshing(true);
                } else {
                    setIsLoading(true);
                    setError("");
                }

                const params = new URLSearchParams({
                    page: String(currentPage),
                    limit: String(PAGE_SIZE),
                    status: statusFilter,
                });
                if (searchText.trim()) {
                    params.set("search", searchText.trim());
                }

                const response = await fetchWithAuth(
                    `${apiUrl}/zayavki?${params.toString()}`,
                    {
                        method: "GET",
                    },
                );

                if (!response.ok) {
                    let message = "Не удалось получить список заявок";
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

                const rawData = await response.json();
                const data = Array.isArray(rawData)
                    ? rawData
                    : Array.isArray(rawData?.items)
                      ? rawData.items
                      : Array.isArray(rawData?.zayavki)
                        ? rawData.zayavki
                        : [];
                setZayavki(data);
                setTotalItems(
                    Number.isFinite(rawData?.total)
                        ? rawData.total
                        : data.length,
                );
                setTotalPages(
                    Number.isFinite(rawData?.totalPages)
                        ? rawData.totalPages
                        : 1,
                );
                setLastUpdated(new Date().toLocaleString("ru-RU"));
            } catch (err) {
                if (!silent) {
                    setError(err.message || "Ошибка загрузки заявок");
                } else {
                    console.error("[AllZayavki] auto refresh error:", err);
                }
            } finally {
                if (silent) {
                    setIsRefreshing(false);
                } else {
                    setIsLoading(false);
                }
            }
        },
        [apiUrl, currentPage, PAGE_SIZE, searchText, statusFilter],
    );

    useEffect(() => {
        getAllZayavki(false);
        const timerId = setInterval(() => {
            getAllZayavki(true);
        }, 30000);

        return () => clearInterval(timerId);
    }, [getAllZayavki]);

    function getRowHighlight(item) {
        const decision = (item.decision || "").trim();
        return decision && decision !== "-"
            ? { backgroundColor: "#e8f8ee" }
            : { backgroundColor: "#fdeeee" };
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

    async function openDetailsModal(item, evt) {
        evt.stopPropagation();
        setDetailsError("");
        setIsDetailsLoading(true);
        setDetailsZayavka(null);
        setIsDetailsModalOpen(true);

        try {
            const response = await fetchWithAuth(
                `${apiUrl}/zayavki/${item._id}`,
                {
                    method: "GET",
                },
            );
            const result = await response.json();
            if (!response.ok) {
                throw new Error(
                    result.message || "Не удалось получить данные заявки",
                );
            }
            setDetailsZayavka(result);
        } catch (err) {
            setDetailsError(err.message || "Ошибка загрузки деталей");
        } finally {
            setIsDetailsLoading(false);
        }
    }

    function closeDetailsModal() {
        setIsDetailsModalOpen(false);
        setDetailsZayavka(null);
        setIsDetailsLoading(false);
        setDetailsError("");
    }

    function openEditModal(item, evt) {
        evt.stopPropagation();
        setEditingZayavka(item);
        setEditForm({
            device_type: item.device_type || "",
            device_name: item.device_name || "",
            device_serial: item.device_serial || "",
            device_issue: item.device_issue || "",
            contact_person: item.contact_person || "",
            ksa_address: item.ksa_address || "",
        });
        setEditError("");
        setIsEditModalOpen(true);
    }

    function closeEditModal() {
        setIsEditModalOpen(false);
        setEditingZayavka(null);
        setEditError("");
        setEditForm({
            device_type: "",
            device_name: "",
            device_serial: "",
            device_issue: "",
            contact_person: "",
            ksa_address: "",
        });
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
                throw new Error(
                    result.message || "Не удалось сохранить решение",
                );
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

    async function saveEdit() {
        if (!editingZayavka?._id) return;

        try {
            setIsSavingEdit(true);
            setEditError("");

            const payload = {
                device_type: editForm.device_type,
                device_name: editForm.device_name,
                device_serial: editForm.device_serial,
                device_issue: editForm.device_issue,
                contact_person: editForm.contact_person,
                ksa_address: editForm.ksa_address,
            };

            const response = await fetchWithAuth(
                `${apiUrl}/zayavki/${editingZayavka._id}`,
                {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(payload),
                },
            );

            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.message || "Не удалось обновить заявку");
            }

            setZayavki((prev) =>
                prev.map((item) =>
                    item._id === editingZayavka._id
                        ? { ...item, ...result.zayavka }
                        : item,
                ),
            );

            if (detailsZayavka?._id === editingZayavka._id) {
                setDetailsZayavka((prev) => ({ ...prev, ...result.zayavka }));
            }
            if (selectedZayavka?._id === editingZayavka._id) {
                setSelectedZayavka((prev) => ({ ...prev, ...result.zayavka }));
            }

            closeEditModal();
        } catch (err) {
            setEditError(err.message || "Ошибка обновления заявки");
        } finally {
            setIsSavingEdit(false);
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
            let response = await fetchWithAuth(
                `${apiUrl}/zayavki/${item._id}`,
                {
                    method: "DELETE",
                },
            );
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
            if (editingZayavka?._id === item._id) {
                closeEditModal();
            }
        } catch (err) {
            setError(err.message || "Ошибка удаления заявки");
        } finally {
            setDeletingId("");
        }
    }

    function getImageExtension(dataUrl) {
        const match = String(dataUrl).match(
            /^data:image\/(png|jpeg|jpg);base64,/i,
        );
        if (!match) return null;
        const ext = match[1].toLowerCase();
        return ext === "jpg" ? "jpeg" : ext;
    }

    async function exportAllToExcel() {
        try {
            setIsExporting(true);
            const exportLimit = 100;
            const exportItems = [];
            let exportPage = 1;
            let exportTotalPages = 1;

            do {
                const params = new URLSearchParams({
                    page: String(exportPage),
                    limit: String(exportLimit),
                    status: statusFilter,
                    includePhoto: "1",
                });
                if (searchText.trim()) {
                    params.set("search", searchText.trim());
                }

                const response = await fetchWithAuth(
                    `${apiUrl}/zayavki?${params.toString()}`,
                    {
                        method: "GET",
                    },
                );
                const result = await response.json();
                if (!response.ok) {
                    throw new Error(
                        result.message || "Не удалось выгрузить заявки",
                    );
                }

                const pageItems = Array.isArray(result?.items)
                    ? result.items
                    : [];
                exportItems.push(...pageItems);
                exportTotalPages = Number(result?.totalPages || 1);
                exportPage += 1;
            } while (exportPage <= exportTotalPages);

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

            exportItems.forEach((item, index) => {
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
                        ? new Date(item.decision_date).toLocaleDateString(
                              "ru-RU",
                          )
                        : "-",
                });

                if (item.device_photo?.data_base64) {
                    const ext = getImageExtension(
                        item.device_photo.data_base64,
                    );
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

    useEffect(() => {
        setCurrentPage(1);
    }, [statusFilter, searchText]);

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
        <section className="container all-zayavki-page">
            <h1 className="title is-4">Все заявки</h1>
            <div className="mb-4">
                <span className="has-text-grey">
                    {user && user.name ? (
                        <>Пользователь: <strong>{user.name}</strong></>
                    ) : (
                        "Пользователь не определён"
                    )}
                </span>
            </div>

            <div className="field mb-4">
                <label className="label">Фильтр и поиск</label>
                <div className="control">
                    <div className="is-flex is-align-items-center is-gap-3 zayavki-toolbar">
                        <div className="select">
                            <select
                                value={statusFilter}
                                onChange={(e) =>
                                    setStatusFilter(e.target.value)
                                }
                            >
                                <option value="all">Все</option>
                                <option value="resolved">Решенные</option>
                                <option value="unresolved">Нерешенные</option>
                            </select>
                        </div>
                        <input
                            className="input zayavki-search"
                            type="text"
                            value={searchText}
                            onChange={(e) => setSearchText(e.target.value)}
                            placeholder="Поиск: КСА, серийный номер, контакт..."
                        />
                        <button
                            type="button"
                            className={`button is-light ${
                                isRefreshing ? "is-loading" : ""
                            }`}
                            onClick={() => getAllZayavki(true)}
                            disabled={isRefreshing}
                            title="Обновить список"
                        >
                            Обновить
                        </button>
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
                    <p className="help mt-2">
                        Показано: {zayavki.length} из {totalItems}
                        {lastUpdated ? ` • обновлено: ${lastUpdated}` : ""}
                    </p>
                </div>
            </div>

            {zayavki.length === 0 ? (
                <p>
                    {searchText.trim()
                        ? "По вашему поиску ничего не найдено."
                        : "Заявок пока нет."}
                </p>
            ) : (
                <>
                    <div className="table-container zayavki-table-container zayavki-desktop-view">
                        <table className="table is-fullwidth is-striped is-hoverable">
                            <thead>
                                <tr>
                                    <th>Номер заявки</th>
                                    <th>Дата</th>
                                    <th>Изображение</th>
                                    <th>КСА</th>
                                    <th>Тип устройства</th>
                                    <th>Наименование</th>
                                    <th>Серийный номер</th>
                                    <th>Неисправность</th>
                                    <th>Контактное лицо</th>
                                    <th>Решение</th>
                                    <th>Действия</th>
                                </tr>
                            </thead>
                            <tbody>
                                {zayavki.map((item) => (
                                    <tr
                                        key={item._id}
                                        style={{
                                            cursor: "pointer",
                                            ...getRowHighlight(item),
                                        }}
                                        onClick={() => openDecisionModal(item)}
                                    >
                                        <td>
                                            {item._id
                                                ? String(item._id).slice(-6)
                                                : "-"}
                                        </td>
                                        <td>
                                            {item.createdAt
                                                ? new Date(
                                                      item.createdAt,
                                                  ).toLocaleString("ru-RU")
                                                : "-"}
                                        </td>
                                        <td>
                                            {item.device_photo?.data_base64 ? (
                                                <img
                                                    src={
                                                        item.device_photo
                                                            .data_base64
                                                    }
                                                    alt="Фото устройства"
                                                    style={{
                                                        width: "64px",
                                                        height: "64px",
                                                        objectFit: "cover",
                                                        borderRadius: "6px",
                                                    }}
                                                />
                                            ) : item.device_photo?.file_name &&
                                              item.device_photo.file_name !==
                                                  "нету фото" ? (
                                                "Есть"
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
                                            {deviceTypeLabels[
                                                item.device_type
                                            ] ||
                                                item.device_type ||
                                                "-"}
                                        </td>
                                        <td>{item.device_name || "-"}</td>
                                        <td>{item.device_serial || "-"}</td>
                                        <td>{item.device_issue || "-"}</td>
                                        <td>{item.contact_person || "-"}</td>
                                        <td>
                                            <div>{item.decision || "-"}</div>
                                            <div className="is-size-7 has-text-grey">
                                                Дата решения:{" "}
                                                {item.decision_date
                                                    ? new Date(
                                                          item.decision_date,
                                                      ).toLocaleDateString(
                                                          "ru-RU",
                                                      )
                                                    : "-"}
                                            </div>
                                        </td>
                                        <td>
                                            <div className="zayavki-row-actions">
                                                <button
                                                    type="button"
                                                    className="button is-small is-light is-rounded z-action-btn"
                                                    onClick={(evt) =>
                                                        openDetailsModal(
                                                            item,
                                                            evt,
                                                        )
                                                    }
                                                    title="Подробно"
                                                    aria-label="Подробно"
                                                >
                                                    <svg
                                                        viewBox="0 0 24 24"
                                                        width="14"
                                                        height="14"
                                                        aria-hidden="true"
                                                    >
                                                        <path
                                                            fill="currentColor"
                                                            d="M11 7h2V5h-2zm0 12h2V9h-2zm1-17A10 10 0 1 0 12 22 10 10 0 0 0 12 2zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16z"
                                                        />
                                                    </svg>
                                                </button>
                                                <button
                                                    type="button"
                                                    className="button is-small is-link is-light is-rounded z-action-btn"
                                                    onClick={(evt) =>
                                                        openEditModal(item, evt)
                                                    }
                                                    title="Редактировать"
                                                    aria-label="Редактировать"
                                                >
                                                    <svg
                                                        viewBox="0 0 24 24"
                                                        width="14"
                                                        height="14"
                                                        aria-hidden="true"
                                                    >
                                                        <path
                                                            fill="currentColor"
                                                            d="m3 17.25 9.06-9.06 3.75 3.75L6.75 21H3zM20.71 7.04a1 1 0 0 0 0-1.41L18.37 3.3a1 1 0 0 0-1.41 0l-1.59 1.59 3.75 3.75z"
                                                        />
                                                    </svg>
                                                </button>
                                                <button
                                                    type="button"
                                                    className={`button is-small is-danger is-light is-rounded z-action-btn ${
                                                        deletingId === item._id
                                                            ? "is-loading"
                                                            : ""
                                                    }`}
                                                    onClick={(evt) =>
                                                        deleteZayavka(item, evt)
                                                    }
                                                    disabled={
                                                        deletingId === item._id
                                                    }
                                                    title="Удалить"
                                                    aria-label="Удалить"
                                                >
                                                    <svg
                                                        viewBox="0 0 24 24"
                                                        width="14"
                                                        height="14"
                                                        aria-hidden="true"
                                                    >
                                                        <path
                                                            fill="currentColor"
                                                            d="M9 3h6l1 2h4v2H4V5h4zm1 6h2v9h-2zm4 0h2v9h-2zM7 9h2v9H7z"
                                                        />
                                                    </svg>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="zayavki-mobile-view">
                        {zayavki.map((item) => (
                            <article
                                key={item._id}
                                className="zayavka-card"
                                style={getRowHighlight(item)}
                            >
                                <div className="zayavka-card-head">
                                    <p className="zayavka-card-date">
                                        {item.createdAt
                                            ? new Date(
                                                  item.createdAt,
                                              ).toLocaleString("ru-RU")
                                            : "-"}
                                    </p>
                                    <span className="tag is-info">
                                        №{" "}
                                        {item._id
                                            ? String(item._id).slice(-6)
                                            : "-"}
                                    </span>
                                    <span className="tag is-light">
                                        {item.ksa_number ||
                                            item.ksa_name ||
                                            item.ksa_id ||
                                            "-"}
                                    </span>
                                </div>

                                <div className="zayavka-card-content">
                                    {item.device_photo?.data_base64 ? (
                                        <img
                                            src={item.device_photo.data_base64}
                                            alt="Фото устройства"
                                            className="zayavka-card-image"
                                        />
                                    ) : item.device_photo?.file_name &&
                                      item.device_photo.file_name !==
                                          "нету фото" ? (
                                        <div className="zayavka-card-image-placeholder">
                                            Есть фото
                                        </div>
                                    ) : (
                                        <div className="zayavka-card-image-placeholder">
                                            Нет фото
                                        </div>
                                    )}

                                    <div className="zayavka-card-fields">
                                        <p>
                                            <strong>Тип:</strong>{" "}
                                            {deviceTypeLabels[
                                                item.device_type
                                            ] ||
                                                item.device_type ||
                                                "-"}
                                        </p>
                                        <p>
                                            <strong>Устройство:</strong>{" "}
                                            {item.device_name || "-"}
                                        </p>
                                        <p>
                                            <strong>Серийный:</strong>{" "}
                                            {item.device_serial || "-"}
                                        </p>
                                        <p>
                                            <strong>Неисправность:</strong>{" "}
                                            {item.device_issue || "-"}
                                        </p>
                                        <p>
                                            <strong>Контакт:</strong>{" "}
                                            {item.contact_person || "-"}
                                        </p>
                                        <p>
                                            <strong>Решение:</strong>{" "}
                                            {item.decision || "-"}
                                        </p>
                                        <p>
                                            <strong>Дата решения:</strong>{" "}
                                            {item.decision_date
                                                ? new Date(
                                                      item.decision_date,
                                                  ).toLocaleDateString("ru-RU")
                                                : "-"}
                                        </p>
                                    </div>
                                </div>

                                <div className="zayavka-card-actions">
                                    <button
                                        type="button"
                                        className="button is-small is-light"
                                        onClick={(evt) =>
                                            openDetailsModal(item, evt)
                                        }
                                    >
                                        Подробно
                                    </button>
                                    <button
                                        type="button"
                                        className="button is-small is-link is-light"
                                        onClick={() => openDecisionModal(item)}
                                    >
                                        Решение
                                    </button>
                                    <button
                                        type="button"
                                        className="button is-small is-info is-light"
                                        onClick={(evt) =>
                                            openEditModal(item, evt)
                                        }
                                    >
                                        Редактировать
                                    </button>
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
                                </div>
                            </article>
                        ))}
                    </div>

                    {totalPages > 1 ? (
                        <nav
                            className="pagination is-centered mt-4"
                            role="navigation"
                            aria-label="pagination"
                        >
                            <button
                                type="button"
                                className="pagination-previous"
                                onClick={() =>
                                    setCurrentPage((prev) =>
                                        Math.max(1, prev - 1),
                                    )
                                }
                                disabled={currentPage === 1}
                            >
                                Назад
                            </button>
                            <button
                                type="button"
                                className="pagination-next"
                                onClick={() =>
                                    setCurrentPage((prev) =>
                                        Math.min(totalPages, prev + 1),
                                    )
                                }
                                disabled={currentPage === totalPages}
                            >
                                Вперед
                            </button>
                            <ul className="pagination-list">
                                <li>
                                    <span className="pagination-link is-current">
                                        Стр. {currentPage} из {totalPages}
                                    </span>
                                </li>
                            </ul>
                        </nav>
                    ) : null}
                </>
            )}

            <div className={`modal ${isModalOpen ? "is-active" : ""}`}>
                <div
                    className="modal-background"
                    onClick={closeDecisionModal}
                />
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
                            <>
                                <p className="mb-2">
                                    <span className="has-text-weight-semibold">
                                        Номер заявки:
                                    </span>{" "}
                                    <span
                                        className="tag is-info is-medium"
                                        style={{ marginLeft: 4 }}
                                    >
                                        №{" "}
                                        {selectedZayavka._id
                                            ? String(selectedZayavka._id).slice(
                                                  -6,
                                              )
                                            : "-"}
                                    </span>
                                </p>
                                <p className="mb-3">
                                    <span className="has-text-weight-semibold">
                                        Номер КСА:
                                    </span>{" "}
                                    <span>
                                        {selectedZayavka.ksa_number || "-"}
                                    </span>
                                </p>
                            </>
                        ) : null}
                        <div className="field">
                            <label className="label">Решение</label>
                            <div className="control">
                                <textarea
                                    className="textarea"
                                    value={decisionText}
                                    onChange={(e) =>
                                        setDecisionText(e.target.value)
                                    }
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
                                    onChange={(e) =>
                                        setDecisionDate(e.target.value)
                                    }
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
                        {isDetailsLoading ? (
                            <p>Загрузка данных заявки...</p>
                        ) : detailsError ? (
                            <p className="has-text-danger">{detailsError}</p>
                        ) : detailsZayavka ? (
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
                                    {deviceTypeLabels[
                                        detailsZayavka.device_type
                                    ] ||
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
                                        src={
                                            detailsZayavka.device_photo
                                                .data_base64
                                        }
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
                        ) : (
                            <p>Данные заявки не найдены.</p>
                        )}
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

            <div className={`modal ${isEditModalOpen ? "is-active" : ""}`}>
                <div className="modal-background" onClick={closeEditModal} />
                <div className="modal-card">
                    <header className="modal-card-head">
                        <p className="modal-card-title">
                            Редактирование заявки
                        </p>
                        <button
                            className="delete"
                            aria-label="close"
                            type="button"
                            onClick={closeEditModal}
                        />
                    </header>
                    <section className="modal-card-body">
                        {editingZayavka ? (
                            <p className="mb-3">
                                ID: <strong>{editingZayavka._id}</strong>
                            </p>
                        ) : null}
                        <div className="field">
                            <label className="label">Тип устройства</label>
                            <div className="control">
                                <div className="select is-fullwidth">
                                    <select
                                        value={editForm.device_type}
                                        onChange={(e) =>
                                            setEditForm((prev) => ({
                                                ...prev,
                                                device_type: e.target.value,
                                            }))
                                        }
                                    >
                                        <option value="terminal">
                                            Терминал
                                        </option>
                                        <option value="printer">Принтер</option>
                                        <option value="scanner">Сканер</option>
                                        <option value="pc">ПК</option>
                                        <option value="other">Другое</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                        <div className="field">
                            <label className="label">
                                Наименование устройства
                            </label>
                            <div className="control">
                                <input
                                    className="input"
                                    type="text"
                                    value={editForm.device_name}
                                    onChange={(e) =>
                                        setEditForm((prev) => ({
                                            ...prev,
                                            device_name: e.target.value,
                                        }))
                                    }
                                />
                            </div>
                        </div>
                        <div className="field">
                            <label className="label">Серийный номер</label>
                            <div className="control">
                                <input
                                    className="input"
                                    type="text"
                                    value={editForm.device_serial}
                                    onChange={(e) =>
                                        setEditForm((prev) => ({
                                            ...prev,
                                            device_serial: e.target.value,
                                        }))
                                    }
                                />
                            </div>
                        </div>
                        <div className="field">
                            <label className="label">Неисправность</label>
                            <div className="control">
                                <textarea
                                    className="textarea"
                                    rows="3"
                                    value={editForm.device_issue}
                                    onChange={(e) =>
                                        setEditForm((prev) => ({
                                            ...prev,
                                            device_issue: e.target.value,
                                        }))
                                    }
                                />
                            </div>
                        </div>
                        <div className="field">
                            <label className="label">Контактное лицо</label>
                            <div className="control">
                                <input
                                    className="input"
                                    type="text"
                                    value={editForm.contact_person}
                                    onChange={(e) =>
                                        setEditForm((prev) => ({
                                            ...prev,
                                            contact_person: e.target.value,
                                        }))
                                    }
                                />
                            </div>
                        </div>
                        <div className="field">
                            <label className="label">Адрес КСА</label>
                            <div className="control">
                                <input
                                    className="input"
                                    type="text"
                                    value={editForm.ksa_address}
                                    onChange={(e) =>
                                        setEditForm((prev) => ({
                                            ...prev,
                                            ksa_address: e.target.value,
                                        }))
                                    }
                                />
                            </div>
                        </div>
                        {editError ? (
                            <p className="help is-danger">{editError}</p>
                        ) : null}
                    </section>
                    <footer className="modal-card-foot">
                        <button
                            className={`button is-success ${
                                isSavingEdit ? "is-loading" : ""
                            }`}
                            type="button"
                            onClick={saveEdit}
                            disabled={isSavingEdit}
                        >
                            Сохранить
                        </button>
                        <button
                            className="button"
                            type="button"
                            onClick={closeEditModal}
                            disabled={isSavingEdit}
                        >
                            Отмена
                        </button>
                    </footer>
                </div>
            </div>
        </section>
    );
}
