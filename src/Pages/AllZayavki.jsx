import { useCallback, useEffect, useMemo, useState } from "react";
import ExcelJS from "exceljs";
import { fetchWithAuth, AUTH_USER_KEY } from "../utils/auth";
import { getApiUrl } from "../utils/api";
import {
    sortDeviceNames,
    sortDeviceSerials,
    sortDeviceTypes,
} from "../utils/sort";

const REQUEST_BASIS_OPTIONS = ["Дооснащение", "Ремонт тс"];
const REPAIR_DECISION_OPTIONS = [
    { value: "repair_on_site", label: "Ремонт на месте" },
    { value: "replacement", label: "Замена" },
];
const ZAYAVKI_TABLE_COLUMNS = [
    { key: "requestId", label: "№ заявки", width: 170, minWidth: 140 },
    { key: "createdAt", label: "Дата", width: 190, minWidth: 150 },
    { key: "photo", label: "Фото", width: 90, minWidth: 80 },
    { key: "ksa", label: "КСА", width: 180, minWidth: 140 },
    { key: "deviceType", label: "Тип устройства", width: 180, minWidth: 150 },
    { key: "deviceName", label: "Наименование", width: 220, minWidth: 180 },
    { key: "deviceSerial", label: "Серийный номер", width: 180, minWidth: 150 },
    { key: "urgency", label: "Срочность", width: 130, minWidth: 110 },
    { key: "deviceIssue", label: "Неисправность", width: 320, minWidth: 220 },
    { key: "actions", label: "Действия", width: 170, minWidth: 150 },
];
const INITIAL_ZAYAVKI_COLUMN_WIDTHS = ZAYAVKI_TABLE_COLUMNS.reduce(
    (acc, column) => ({
        ...acc,
        [column.key]: column.width,
    }),
    {},
);

const COLUMN_WIDTHS_STORAGE_KEY = "zayavki.table.column-widths.v1";
const MODAL_SIZES_STORAGE_KEY = "zayavki.modal-sizes.v1";

/**
 * Читает JSON-значение из `localStorage` с безопасным fallback.
 *
 * @template T
 * @param {string} key Ключ в локальном хранилище.
 * @param {T} fallback Значение по умолчанию.
 * @returns {T} Распарсенное значение или fallback.
 */
function readStorageJson(key, fallback) {
    if (typeof window === "undefined") return fallback;

    try {
        const rawValue = window.localStorage.getItem(key);
        return rawValue ? JSON.parse(rawValue) : fallback;
    } catch {
        return fallback;
    }
}

/**
 * Возвращает стартовые ширины колонок таблицы заявок.
 *
 * @returns {Record<string, number>} Карта ширин колонок.
 */
function getInitialColumnWidths() {
    const storedWidths = readStorageJson(COLUMN_WIDTHS_STORAGE_KEY, null);
    if (!storedWidths || typeof storedWidths !== "object") {
        return INITIAL_ZAYAVKI_COLUMN_WIDTHS;
    }

    return ZAYAVKI_TABLE_COLUMNS.reduce(
        (acc, column) => ({
            ...acc,
            [column.key]: Math.max(
                column.minWidth || 80,
                Number(storedWidths[column.key]) || column.width,
            ),
        }),
        {},
    );
}

/**
 * Возвращает сохранённые размеры модальных окон, если они валидны.
 *
 * @returns {Record<string, { width: number, height: number }>} Карта размеров модалок.
 */
function getInitialModalSizes() {
    const storedSizes = readStorageJson(MODAL_SIZES_STORAGE_KEY, null);
    if (!storedSizes || typeof storedSizes !== "object") {
        return {};
    }

    return Object.entries(storedSizes).reduce((acc, [key, value]) => {
        const width = Math.round(Number(value?.width));
        const height = Math.round(Number(value?.height));

        if (width >= 360 && height >= 240) {
            acc[key] = { width, height };
        }

        return acc;
    }, {});
}

/**
 * Страница просмотра, фильтрации и редактирования заявок.
 *
 * @returns {JSX.Element} Интерфейс списка заявок.
 */
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
    const [isTableLoading, setIsTableLoading] = useState(false);
    const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
    const [error, setError] = useState("");
    const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
    const [detailsZayavkaId, setDetailsZayavkaId] = useState("");
    const [detailsZayavkaData, setDetailsZayavkaData] = useState(null);
    const [isDetailsLoading, setIsDetailsLoading] = useState(false);
    const [detailsError, setDetailsError] = useState("");
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedZayavkaId, setSelectedZayavkaId] = useState("");
    const [decisionText, setDecisionText] = useState("");
    const [decisionDate, setDecisionDate] = useState("");
    const [decisionKind, setDecisionKind] = useState("");
    const [replacementForm, setReplacementForm] = useState({
        device_type: "",
        device_name: "",
        device_serial: "",
        inv_number: "",
    });
    const [replacementDeviceTypes, setReplacementDeviceTypes] = useState([]);
    const [replacementDeviceNames, setReplacementDeviceNames] = useState([]);
    const [replacementDeviceSerials, setReplacementDeviceSerials] = useState(
        [],
    );
    const [replacementSelectedDeviceTypeId, setReplacementSelectedDeviceTypeId] =
        useState("");
    const [replacementSelectedDeviceNameId, setReplacementSelectedDeviceNameId] =
        useState("");
    const [isSavingDecision, setIsSavingDecision] = useState(false);
    const [decisionError, setDecisionError] = useState("");
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingZayavkaId, setEditingZayavkaId] = useState("");
    const [isSavingEdit, setIsSavingEdit] = useState(false);
    const [editError, setEditError] = useState("");
    const [editForm, setEditForm] = useState({
        device_type: "",
        device_name: "",
        device_serial: "",
        request_basis: "",
        device_issue: "",
        contact_person: "",
        urgency: "not_urgent",
        ksa_address: "",
    });
    const [editDeviceTypes, setEditDeviceTypes] = useState([]);
    const [editDeviceNames, setEditDeviceNames] = useState([]);
    const [editDeviceSerials, setEditDeviceSerials] = useState([]);
    const [editSelectedDeviceTypeId, setEditSelectedDeviceTypeId] =
        useState("");
    const [editSelectedDeviceNameId, setEditSelectedDeviceNameId] =
        useState("");
    const [deletingId, setDeletingId] = useState("");
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [deleteCandidateId, setDeleteCandidateId] = useState("");
    const [isExporting, setIsExporting] = useState(false);
    const [searchText, setSearchText] = useState("");
    const [currentPage, setCurrentPage] = useState(1);
    const [totalItems, setTotalItems] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [lastUpdated, setLastUpdated] = useState("");
    const [columnWidths, setColumnWidths] = useState(getInitialColumnWidths);
    const [modalSizes, setModalSizes] = useState(getInitialModalSizes);
    const apiUrl = getApiUrl();
    const PAGE_SIZE = 10;

    const deviceTypeLabels = {
        terminal: "Терминал",
        printer: "Принтер",
        scanner: "Сканер",
        pc: "ПК",
        other: "Другое",
    };
    const urgencyLabels = {
        urgent: "Срочно",
        not_urgent: "Не срочно",
    };

    /**
     * Возвращает локализованное название типа устройства.
     *
     * @param {string} value Внутреннее значение типа устройства.
     * @returns {string} Подпись для интерфейса.
     */
    function getDeviceTypeText(value) {
        return deviceTypeLabels[value] || value || "-";
    }

    /**
     * Нормализует отображаемое значение основания заявки.
     *
     * @param {string} value Значение основания заявки.
     * @returns {string} Подпись основания для интерфейса.
     */
    function getRequestBasisLabel(value) {
        return REQUEST_BASIS_OPTIONS.includes(value) ? value : value || "-";
    }

    function getRequestNumberLabel(item) {
        if (item?.request_number) {
            return String(item.request_number);
        }

        return item?._id ? String(item._id).slice(-6) : "-";
    }

    function normalizeText(value) {
        return String(value || "")
            .trim()
            .toLowerCase();
    }

    const selectedZayavka = useMemo(() => {
        if (!selectedZayavkaId) return null;

        return (
            zayavki.find(
                (item) =>
                    String(item?._id || "").trim() ===
                    String(selectedZayavkaId || "").trim(),
            ) || null
        );
    }, [selectedZayavkaId, zayavki]);

    const editingZayavka = useMemo(() => {
        if (!editingZayavkaId) return null;

        return (
            zayavki.find(
                (item) =>
                    String(item?._id || "").trim() ===
                    String(editingZayavkaId || "").trim(),
            ) || null
        );
    }, [editingZayavkaId, zayavki]);

    const deleteCandidate = useMemo(() => {
        if (!deleteCandidateId) return null;

        return (
            zayavki.find(
                (item) =>
                    String(item?._id || "").trim() ===
                    String(deleteCandidateId || "").trim(),
            ) || null
        );
    }, [deleteCandidateId, zayavki]);

    const detailsBaseZayavka = useMemo(() => {
        if (!detailsZayavkaId) return null;

        return (
            zayavki.find(
                (item) =>
                    String(item?._id || "").trim() ===
                    String(detailsZayavkaId || "").trim(),
            ) || null
        );
    }, [detailsZayavkaId, zayavki]);

    const detailsZayavka = useMemo(() => {
        if (!detailsBaseZayavka && !detailsZayavkaData) return null;

        return {
            ...(detailsZayavkaData || {}),
            ...(detailsBaseZayavka || {}),
        };
    }, [detailsBaseZayavka, detailsZayavkaData]);

    function getEditDeviceTypeIdByValue(value) {
        const rawValue = String(value || "").trim();
        if (!rawValue) return "";

        const byId = editDeviceTypes.find(
            (item) => String(item?.id_type || "").trim() === rawValue,
        );
        if (byId) return String(byId.id_type || "").trim();

        const byText = editDeviceTypes.find(
            (item) => normalizeText(item?.type) === normalizeText(rawValue),
        );
        return String(byText?.id_type || "").trim();
    }

    function getEditDeviceNameIdByValue(value) {
        const rawValue = String(value || "").trim();
        if (!rawValue) return "";

        const byId = editDeviceNames.find(
            (item) => String(item?.id_naimenovanie || "").trim() === rawValue,
        );
        if (byId) return String(byId.id_naimenovanie || "").trim();

        const byText = editDeviceNames.find(
            (item) =>
                normalizeText(item?.ts_naimenovanie) ===
                normalizeText(rawValue),
        );
        return String(byText?.id_naimenovanie || "").trim();
    }

    function getReplacementDeviceTypeIdByValue(value) {
        const rawValue = String(value || "").trim();
        if (!rawValue) return "";

        const byId = replacementDeviceTypes.find(
            (item) => String(item?.id_type || "").trim() === rawValue,
        );
        if (byId) return String(byId.id_type || "").trim();

        const byText = replacementDeviceTypes.find(
            (item) => normalizeText(item?.type) === normalizeText(rawValue),
        );
        return String(byText?.id_type || "").trim();
    }

    function getReplacementDeviceNameIdByValue(value) {
        const rawValue = String(value || "").trim();
        if (!rawValue) return "";

        const byId = replacementDeviceNames.find(
            (item) => String(item?.id_naimenovanie || "").trim() === rawValue,
        );
        if (byId) return String(byId.id_naimenovanie || "").trim();

        const byText = replacementDeviceNames.find(
            (item) =>
                normalizeText(item?.ts_naimenovanie) ===
                normalizeText(rawValue),
        );
        return String(byText?.id_naimenovanie || "").trim();
    }

    const getAllZayavki = useCallback(
        async (silent = false) => {
            try {
                if (silent) {
                    setIsRefreshing(true);
                } else if (hasLoadedOnce) {
                    setIsTableLoading(true);
                    setError("");
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
                setHasLoadedOnce(true);
            } catch (err) {
                if (!silent) {
                    setError(err.message || "Ошибка загрузки заявок");
                } else {
                    console.error("[AllZayavki] auto refresh error:", err);
                }
            } finally {
                if (silent) {
                    setIsRefreshing(false);
                } else if (hasLoadedOnce) {
                    setIsTableLoading(false);
                } else {
                    setIsLoading(false);
                }
            }
        },
        [
            apiUrl,
            currentPage,
            hasLoadedOnce,
            PAGE_SIZE,
            searchText,
            statusFilter,
        ],
    );

    useEffect(() => {
        getAllZayavki(false);
        const timerId = setInterval(() => {
            getAllZayavki(true);
        }, 30000);

        return () => clearInterval(timerId);
    }, [getAllZayavki]);

    function getUrgencyValue(item) {
        return item?.urgency === "urgent" ? "urgent" : "not_urgent";
    }

    function getUrgencyLabel(item) {
        return urgencyLabels[getUrgencyValue(item)];
    }

    function getUrgencyTagClass(item) {
        return getUrgencyValue(item) === "urgent"
            ? "z-urgency-tag-urgent"
            : "z-urgency-tag-normal";
    }

    function getRowClassName(item) {
        const decision = (item.decision || "").trim();
        const isResolved = decision && decision !== "-";

        if (getUrgencyValue(item) === "urgent") {
            return isResolved ? "z-row-urgent-resolved" : "z-row-urgent";
        }

        return isResolved ? "z-row-resolved" : "z-row-open";
    }

    function getCreatedByLabel(item) {
        return item?.created_by || item?.createdBy || item?.author || "-";
    }

    function hasDevicePhoto(item) {
        const fileName = String(item?.device_photo?.file_name || "")
            .trim()
            .toLowerCase();

        return Boolean(
            item?.device_photo?.data_base64 ||
            (fileName && fileName !== "нет фото" && fileName !== "нету фото"),
        );
    }

    function getDevicePhotoDataUrl(item) {
        return String(item?.device_photo?.data_base64 || "").trim();
    }

    function getModalSizeStyle(modalKey) {
        const size = modalSizes[modalKey];
        if (!size) return undefined;

        return {
            width: size.width ? `${size.width}px` : undefined,
            height: size.height ? `${size.height}px` : undefined,
        };
    }

    function getCardStyle(item) {
        const decision = (item.decision || "").trim();
        const isResolved = decision && decision !== "-";

        if (getUrgencyValue(item) === "urgent") {
            return {
                backgroundColor: isResolved ? "#d8f1e1" : "#fff1e7",
                borderColor: "rgba(217, 120, 61, 0.24)",
            };
        }

        return isResolved
            ? { backgroundColor: "#e8f8ee" }
            : { backgroundColor: "#fdeeee" };
    }

    useEffect(() => {
        if (typeof window === "undefined") return undefined;

        const timeoutId = window.setTimeout(() => {
            window.localStorage.setItem(
                COLUMN_WIDTHS_STORAGE_KEY,
                JSON.stringify(columnWidths),
            );
        }, 120);

        return () => window.clearTimeout(timeoutId);
    }, [columnWidths]);

    useEffect(() => {
        if (typeof window === "undefined") return undefined;

        const timeoutId = window.setTimeout(() => {
            window.localStorage.setItem(
                MODAL_SIZES_STORAGE_KEY,
                JSON.stringify(modalSizes),
            );
        }, 120);

        return () => window.clearTimeout(timeoutId);
    }, [modalSizes]);

    useEffect(() => {
        if (
            typeof window === "undefined" ||
            typeof ResizeObserver === "undefined"
        ) {
            return undefined;
        }

        const modalElements = Array.from(
            document.querySelectorAll(".modal-card[data-resizable-modal-key]"),
        );
        if (!modalElements.length) {
            return undefined;
        }

        const observer = new ResizeObserver((entries) => {
            setModalSizes((prev) => {
                let changed = false;
                const next = { ...prev };

                entries.forEach((entry) => {
                    const modalKey = entry.target.dataset.resizableModalKey;
                    if (!modalKey) return;

                    const width = Math.round(entry.contentRect.width);
                    const height = Math.round(entry.contentRect.height);
                    if (width < 360 || height < 240) return;

                    const prevSize = prev[modalKey] || {};
                    if (
                        prevSize.width === width &&
                        prevSize.height === height
                    ) {
                        return;
                    }

                    next[modalKey] = { width, height };
                    changed = true;
                });

                return changed ? next : prev;
            });
        });

        modalElements.forEach((element) => observer.observe(element));
        return () => observer.disconnect();
    }, []);

    function handleColumnResizeStart(columnKey, evt) {
        evt.preventDefault();
        evt.stopPropagation();

        const column = ZAYAVKI_TABLE_COLUMNS.find(
            (item) => item.key === columnKey,
        );
        if (!column) return;

        const startX = evt.clientX;
        const startWidth = columnWidths[columnKey] || column.width;
        document.body.classList.add("z-column-resizing");

        function handleMouseMove(moveEvt) {
            const delta = moveEvt.clientX - startX;
            const nextWidth = Math.max(
                column.minWidth || 80,
                startWidth + delta,
            );

            setColumnWidths((prev) => ({
                ...prev,
                [columnKey]: nextWidth,
            }));
        }

        function handleMouseUp() {
            window.removeEventListener("mousemove", handleMouseMove);
            window.removeEventListener("mouseup", handleMouseUp);
            document.body.classList.remove("z-column-resizing");
        }

        window.addEventListener("mousemove", handleMouseMove);
        window.addEventListener("mouseup", handleMouseUp);
    }

    function openDecisionModal(item) {
        setSelectedZayavkaId(String(item?._id || "").trim());
        const nextDecisionKind =
            item.decision_kind ||
            (item.request_basis === "Дооснащение"
                ? "supplement"
                : item.decision === "Замена"
                  ? "replacement"
                  : item.decision
                    ? "repair_on_site"
                    : "");

        setDecisionKind(nextDecisionKind);
        setDecisionText(
            item.repair_description ||
                (nextDecisionKind === "repair_on_site"
                    ? item.decision || ""
                    : ""),
        );
        setDecisionDate(
            item.decision_date
                ? new Date(item.decision_date).toISOString().slice(0, 10)
                : "",
        );
        setReplacementForm({
            device_type:
                item.replacement_device_type || item.device_type || "",
            device_name:
                item.replacement_device_name || item.device_name || "",
            device_serial: item.replacement_device_serial || "",
            inv_number: item.replacement_inv_number || "",
        });
        setDecisionError("");
        setIsModalOpen(true);
    }

    function closeDecisionModal() {
        setIsModalOpen(false);
        setSelectedZayavkaId("");
        setDecisionText("");
        setDecisionKind("");
        setDecisionDate("");
        setReplacementForm({
            device_type: "",
            device_name: "",
            device_serial: "",
            inv_number: "",
        });
        setReplacementSelectedDeviceTypeId("");
        setReplacementSelectedDeviceNameId("");
        setReplacementDeviceNames([]);
        setReplacementDeviceSerials([]);
        setDecisionError("");
    }

    function handleReplacementDeviceTypeChange(evt) {
        const nextTypeId = evt.target.value;
        const selectedType = replacementDeviceTypes.find(
            (item) => String(item?.id_type || "").trim() === nextTypeId,
        );

        setReplacementSelectedDeviceTypeId(nextTypeId);
        setReplacementSelectedDeviceNameId("");
        setReplacementDeviceNames([]);
        setReplacementDeviceSerials([]);
        setReplacementForm((prev) => ({
            ...prev,
            device_type: String(selectedType?.type || "").trim(),
            device_name: "",
            device_serial: "",
            inv_number: "",
        }));
    }

    function handleReplacementDeviceNameChange(evt) {
        const nextNameValue = evt.target.value;
        const selectedName = replacementDeviceNames.find(
            (item) =>
                normalizeText(item?.ts_naimenovanie) ===
                normalizeText(nextNameValue),
        );

        setReplacementSelectedDeviceNameId(
            String(selectedName?.id_naimenovanie || "").trim(),
        );
        if (!selectedName) {
            setReplacementDeviceSerials([]);
        }
        setReplacementForm((prev) => ({
            ...prev,
            device_name: nextNameValue,
            device_serial: "",
            inv_number: "",
        }));
    }

    function handleReplacementDeviceSerialChange(evt) {
        const nextSerialValue = evt.target.value;
        const selectedSerial = replacementDeviceSerials.find(
            (item) =>
                normalizeText(item?.serial_number) ===
                normalizeText(nextSerialValue),
        );

        setReplacementForm((prev) => ({
            ...prev,
            device_serial: nextSerialValue,
            inv_number: String(selectedSerial?.inv_number || prev.inv_number || "").trim(),
        }));
    }

    async function openDetailsModal(item, evt) {
        evt.stopPropagation();
        setDetailsError("");
        setIsDetailsLoading(true);
        setDetailsZayavkaData(null);
        setIsDetailsModalOpen(true);

        try {
            const response = await fetchWithAuth(
                `${apiUrl}/zayavki/${item._id}?includePhoto=1`,
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
                setDetailsZayavkaData(result);
        } catch (err) {
            setDetailsError(err.message || "Ошибка загрузки деталей заявки");
        } finally {
            setIsDetailsLoading(false);
        }
    }

    function closeDetailsModal() {
        setIsDetailsModalOpen(false);
        setDetailsZayavkaData(null);
        setIsDetailsLoading(false);
        setDetailsError("");
    }

    function openEditModal(item, evt) {
        evt.stopPropagation();
        setEditingZayavkaId(String(item?._id || "").trim());
        setEditForm({
            device_type: item.device_type || "",
            device_name: item.device_name || "",
            device_serial: item.device_serial || "",
            request_basis: item.request_basis || "",
            device_issue: item.device_issue || "",
            contact_person: item.contact_person || "",
            urgency: item.urgency || "not_urgent",
            ksa_address: item.ksa_address || "",
        });
        setEditSelectedDeviceTypeId("");
        setEditSelectedDeviceNameId("");
        setEditDeviceNames([]);
        setEditDeviceSerials([]);
        setEditError("");
        setIsEditModalOpen(true);
    }

    function closeEditModal() {
        setIsEditModalOpen(false);
        setEditingZayavkaId("");
        setEditError("");
        setEditSelectedDeviceTypeId("");
        setEditSelectedDeviceNameId("");
        setEditDeviceNames([]);
        setEditDeviceSerials([]);
        setEditForm({
            device_type: "",
            device_name: "",
            device_serial: "",
            request_basis: "",
            device_issue: "",
            contact_person: "",
            urgency: "not_urgent",
            ksa_address: "",
        });
    }

    function handleEditDeviceTypeChange(evt) {
        const nextTypeId = evt.target.value;
        const selectedType = editDeviceTypes.find(
            (item) => String(item?.id_type || "").trim() === nextTypeId,
        );

        setEditSelectedDeviceTypeId(nextTypeId);
        setEditSelectedDeviceNameId("");
        setEditDeviceNames([]);
        setEditDeviceSerials([]);
        setEditForm((prev) => ({
            ...prev,
            device_type: String(selectedType?.type || "").trim(),
            device_name: "",
            device_serial: "",
        }));
    }

    function handleEditDeviceNameChange(evt) {
        const nextNameValue = evt.target.value;
        const selectedName = editDeviceNames.find(
            (item) =>
                normalizeText(item?.ts_naimenovanie) ===
                normalizeText(nextNameValue),
        );

        setEditSelectedDeviceNameId(
            String(selectedName?.id_naimenovanie || "").trim(),
        );
        if (!selectedName) {
            setEditDeviceSerials([]);
        }
        setEditForm((prev) => ({
            ...prev,
            device_name: nextNameValue,
            device_serial: "",
        }));
    }

    function handleEditDeviceSerialChange(evt) {
        setEditForm((prev) => ({
            ...prev,
            device_serial: evt.target.value,
        }));
    }

    useEffect(() => {
        if (!isEditModalOpen) return;

        async function getEditDeviceTypes() {
            try {
                const response = await fetchWithAuth(`${apiUrl}/device-types`, {
                    method: "GET",
                });

                if (response.ok) {
                    const typeData = await response.json();
                    setEditDeviceTypes(
                        Array.isArray(typeData)
                            ? sortDeviceTypes(typeData)
                            : [],
                    );
                } else {
                    setEditDeviceTypes([]);
                }
            } catch (error) {
                setEditDeviceTypes([]);
                console.error("Error details:", error);
            }
        }

        getEditDeviceTypes();
    }, [apiUrl, isEditModalOpen]);

    useEffect(() => {
        if (
            !isEditModalOpen ||
            !editForm.device_type ||
            !editDeviceTypes.length
        ) {
            return;
        }

        const nextTypeId = getEditDeviceTypeIdByValue(editForm.device_type);
        if (nextTypeId !== editSelectedDeviceTypeId) {
            setEditSelectedDeviceTypeId(nextTypeId);
        }
    }, [
        editDeviceTypes,
        editForm.device_type,
        editSelectedDeviceTypeId,
        isEditModalOpen,
    ]);

    useEffect(() => {
        if (!isEditModalOpen || !editSelectedDeviceTypeId) {
            setEditDeviceNames([]);
            setEditSelectedDeviceNameId("");
            setEditDeviceSerials([]);
            return;
        }

        async function getEditDeviceNames() {
            try {
                const response = await fetchWithAuth(
                    `${apiUrl}/device-names?typeId=${encodeURIComponent(
                        editSelectedDeviceTypeId,
                    )}`,
                    {
                        method: "GET",
                    },
                );

                if (response.ok) {
                    const nameData = await response.json();
                    setEditDeviceNames(
                        Array.isArray(nameData)
                            ? sortDeviceNames(nameData)
                            : [],
                    );
                } else {
                    setEditDeviceNames([]);
                }
            } catch (error) {
                setEditDeviceNames([]);
                console.error("Error details:", error);
            }
        }

        getEditDeviceNames();
    }, [apiUrl, editSelectedDeviceTypeId, isEditModalOpen]);

    useEffect(() => {
        if (
            !isEditModalOpen ||
            !editForm.device_name ||
            !editDeviceNames.length
        ) {
            return;
        }

        const nextNameId = getEditDeviceNameIdByValue(editForm.device_name);
        if (nextNameId !== editSelectedDeviceNameId) {
            setEditSelectedDeviceNameId(nextNameId);
        }
    }, [
        editDeviceNames,
        editForm.device_name,
        editSelectedDeviceNameId,
        isEditModalOpen,
    ]);

    useEffect(() => {
        if (!isEditModalOpen || !editSelectedDeviceNameId) {
            setEditDeviceSerials([]);
            return;
        }

        async function getEditDeviceSerials() {
            try {
                const response = await fetchWithAuth(
                    `${apiUrl}/device-serials?nameId=${encodeURIComponent(
                        editSelectedDeviceNameId,
                    )}`,
                    {
                        method: "GET",
                    },
                );

                if (response.ok) {
                    const serialData = await response.json();
                    setEditDeviceSerials(
                        Array.isArray(serialData)
                            ? sortDeviceSerials(serialData)
                            : [],
                    );
                } else {
                    setEditDeviceSerials([]);
                }
            } catch (error) {
                setEditDeviceSerials([]);
                console.error("Error details:", error);
            }
        }

        getEditDeviceSerials();
    }, [apiUrl, editSelectedDeviceNameId, isEditModalOpen]);

    useEffect(() => {
        if (!isModalOpen || decisionKind !== "replacement") {
            return;
        }

        async function getReplacementDeviceTypes() {
            try {
                const response = await fetchWithAuth(`${apiUrl}/device-types`, {
                    method: "GET",
                });

                if (response.ok) {
                    const typeData = await response.json();
                    setReplacementDeviceTypes(
                        Array.isArray(typeData)
                            ? sortDeviceTypes(typeData)
                            : [],
                    );
                } else {
                    setReplacementDeviceTypes([]);
                }
            } catch (error) {
                setReplacementDeviceTypes([]);
                console.error("Error details:", error);
            }
        }

        getReplacementDeviceTypes();
    }, [apiUrl, decisionKind, isModalOpen]);

    useEffect(() => {
        if (
            !isModalOpen ||
            decisionKind !== "replacement" ||
            !replacementForm.device_type ||
            !replacementDeviceTypes.length
        ) {
            return;
        }

        const nextTypeId = getReplacementDeviceTypeIdByValue(
            replacementForm.device_type,
        );
        if (nextTypeId !== replacementSelectedDeviceTypeId) {
            setReplacementSelectedDeviceTypeId(nextTypeId);
        }
    }, [
        decisionKind,
        isModalOpen,
        replacementDeviceTypes,
        replacementForm.device_type,
        replacementSelectedDeviceTypeId,
    ]);

    useEffect(() => {
        if (
            !isModalOpen ||
            decisionKind !== "replacement" ||
            !replacementSelectedDeviceTypeId
        ) {
            setReplacementDeviceNames([]);
            setReplacementSelectedDeviceNameId("");
            setReplacementDeviceSerials([]);
            return;
        }

        async function getReplacementDeviceNames() {
            try {
                const response = await fetchWithAuth(
                    `${apiUrl}/device-names?typeId=${encodeURIComponent(
                        replacementSelectedDeviceTypeId,
                    )}`,
                    {
                        method: "GET",
                    },
                );

                if (response.ok) {
                    const nameData = await response.json();
                    setReplacementDeviceNames(
                        Array.isArray(nameData)
                            ? sortDeviceNames(nameData)
                            : [],
                    );
                } else {
                    setReplacementDeviceNames([]);
                }
            } catch (error) {
                setReplacementDeviceNames([]);
                console.error("Error details:", error);
            }
        }

        getReplacementDeviceNames();
    }, [apiUrl, decisionKind, isModalOpen, replacementSelectedDeviceTypeId]);

    useEffect(() => {
        if (
            !isModalOpen ||
            decisionKind !== "replacement" ||
            !replacementForm.device_name ||
            !replacementDeviceNames.length
        ) {
            return;
        }

        const nextNameId = getReplacementDeviceNameIdByValue(
            replacementForm.device_name,
        );
        if (nextNameId !== replacementSelectedDeviceNameId) {
            setReplacementSelectedDeviceNameId(nextNameId);
        }
    }, [
        decisionKind,
        isModalOpen,
        replacementDeviceNames,
        replacementForm.device_name,
        replacementSelectedDeviceNameId,
    ]);

    useEffect(() => {
        if (
            !isModalOpen ||
            decisionKind !== "replacement" ||
            !replacementSelectedDeviceNameId
        ) {
            setReplacementDeviceSerials([]);
            return;
        }

        async function getReplacementDeviceSerials() {
            try {
                const response = await fetchWithAuth(
                    `${apiUrl}/device-serials?nameId=${encodeURIComponent(
                        replacementSelectedDeviceNameId,
                    )}`,
                    {
                        method: "GET",
                    },
                );

                if (response.ok) {
                    const serialData = await response.json();
                    setReplacementDeviceSerials(
                        Array.isArray(serialData)
                            ? sortDeviceSerials(serialData)
                            : [],
                    );
                } else {
                    setReplacementDeviceSerials([]);
                }
            } catch (error) {
                setReplacementDeviceSerials([]);
                console.error("Error details:", error);
            }
        }

        getReplacementDeviceSerials();
    }, [apiUrl, decisionKind, isModalOpen, replacementSelectedDeviceNameId]);

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
        const photoSrc = getDevicePhotoDataUrl(detailsZayavka);
        const photoBlock = photoSrc
            ? `<img src="${photoSrc}" alt="Фото устройства" style="width:220px;max-width:100%;border-radius:8px;" />`
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
<h1> Информация по заявке</h1>
<p><strong>Дата:</strong> ${createdAt}</p>
<p><strong>Регион:</strong> ${detailsZayavka.region_name || "-"}</p>
<p><strong>КСА:</strong> ${ksaValue}</p>
<p><strong>Адрес КСА:</strong> ${detailsZayavka.ksa_address || "-"}</p>
<p><strong>Тип устройства:</strong> ${deviceTypeValue}</p>
<p><strong>Название:</strong> ${detailsZayavka.device_name || "-"}</p>
<p><strong>Серийный номер:</strong> ${detailsZayavka.device_serial || "-"}</p>
<p><strong>Основание заявки:</strong> ${getRequestBasisLabel(detailsZayavka.request_basis)}</p>
<p><strong>Срочность:</strong> ${getUrgencyLabel(detailsZayavka)}</p>
<p><strong>Контактное лицо:</strong> ${detailsZayavka.contact_person || "-"}</p>
<p><strong>Неправильность:</strong> ${detailsZayavka.device_issue || "-"}</p>
<p><strong>Решение:</strong> ${detailsZayavka.decision || "-"}</p>
<p><strong>Дата решения:</strong> ${decisionDate}</p>
${detailsZayavka.repair_description ? `<p><strong>Описание ремонта:</strong> ${detailsZayavka.repair_description}</p>` : ""}
${detailsZayavka.replacement_device_type ? `<p><strong>Замена - тип устройства:</strong> ${detailsZayavka.replacement_device_type}</p>` : ""}
${detailsZayavka.replacement_device_name ? `<p><strong>Замена - наименование:</strong> ${detailsZayavka.replacement_device_name}</p>` : ""}
${detailsZayavka.replacement_device_serial ? `<p><strong>Замена - серийный номер:</strong> ${detailsZayavka.replacement_device_serial}</p>` : ""}
${detailsZayavka.replacement_inv_number ? `<p><strong>Замена - инвентарный номер:</strong> ${detailsZayavka.replacement_inv_number}</p>` : ""}
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
                        decision:
                            selectedZayavka.request_basis === "Дооснащение"
                                ? "Дооснащение"
                                : decisionKind === "replacement"
                                  ? "Замена"
                                  : "Ремонт на месте",
                        decision_date: decisionDate,
                        decision_kind: decisionKind,
                        repair_description: decisionText,
                        replacement_device_type:
                            replacementForm.device_type,
                        replacement_device_name:
                            replacementForm.device_name,
                        replacement_device_serial:
                            replacementForm.device_serial,
                        replacement_inv_number:
                            replacementForm.inv_number,
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
                request_basis: editForm.request_basis,
                device_issue: editForm.device_issue,
                contact_person: editForm.contact_person,
                urgency: editForm.urgency,
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

            closeEditModal();
        } catch (err) {
            setEditError(err.message || "Ошибка обновления заявки");
        } finally {
            setIsSavingEdit(false);
        }
    }

    function openDeleteModal(item, evt) {
        evt.stopPropagation();
        if (!item?._id) return;

        setDeleteCandidateId(String(item?._id || "").trim());
        setIsDeleteModalOpen(true);
    }

    function closeDeleteModal() {
        if (deletingId) return;
        setIsDeleteModalOpen(false);
        setDeleteCandidateId("");
    }

    async function confirmDeleteZayavka() {
        if (!deleteCandidate?._id) return;

        try {
            setError("");
            setDeletingId(deleteCandidate._id);
            let response = await fetchWithAuth(
                `${apiUrl}/zayavki/${deleteCandidate._id}`,
                {
                    method: "DELETE",
                },
            );
            if (response.status === 404) {
                response = await fetchWithAuth(
                    `${apiUrl}/zayavki/${deleteCandidate._id}/delete`,
                    {
                        method: "POST",
                    },
                );
            }

            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.message || "Не удалось удалить заявку");
            }

            setZayavki((prev) =>
                prev.filter((z) => z._id !== deleteCandidate._id),
            );
            if (selectedZayavka?._id === deleteCandidate._id) {
                closeDecisionModal();
            }
            if (detailsZayavka?._id === deleteCandidate._id) {
                closeDetailsModal();
            }
            if (editingZayavka?._id === deleteCandidate._id) {
                closeEditModal();
            }
            closeDeleteModal();

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
                {
                    header: "Тип устройства",
                    key: "deviceType",
                    width: 18,
                },
                {
                    header: "Наименование",
                    key: "deviceName",
                    width: 28,
                },
                {
                    header: "Серийный номер",
                    key: "deviceSerial",
                    width: 22,
                },
                {
                    header: "Основание заявки",
                    key: "requestBasis",
                    width: 22,
                },
                { header: "Срочность", key: "urgency", width: 16 },
                {
                    header: "Контактное лицо",
                    key: "contactPerson",
                    width: 24,
                },
                { header: "Решение", key: "decision", width: 30 },
                {
                    header: "Дата решения",
                    key: "decisionDate",
                    width: 16,
                },
            ];

            exportItems.forEach((item, index) => {
                const rowNumber = index + 2;
                worksheet.addRow({
                    createdAt: item.createdAt
                        ? new Date(item.createdAt).toLocaleString("ru-RU")
                        : "-",
                    photo: hasDevicePhoto(item) ? "Есть" : "-",
                    ksa: item.ksa_number || item.ksa_name || item.ksa_id || "-",
                    ksaAddress: item.ksa_address || "-",
                    deviceType:
                        deviceTypeLabels[item.device_type] ||
                        item.device_type ||
                        "-",
                    deviceName: item.device_name || "-",
                    deviceSerial: item.device_serial || "-",
                    requestBasis: getRequestBasisLabel(item.request_basis),
                    urgency: getUrgencyLabel(item),
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

    function handleStatusFilterChange(e) {
        setStatusFilter(e.target.value);
        setCurrentPage(1);
    }

    function handleSearchTextChange(e) {
        setSearchText(e.target.value);
        setCurrentPage(1);
    }
    const desktopTableMinWidth = ZAYAVKI_TABLE_COLUMNS.reduce(
        (sum, column) => sum + (columnWidths[column.key] || column.width),
        0,
    );

    if (isLoading && !hasLoadedOnce) {
        return (
            <section className="container">
                <p>Загрузка заявок...</p>
            </section>
        );
    }

    if (error && !hasLoadedOnce) {
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
                    {user && (user.login || user.name) ? (
                        <>
                            Пользователь:{" "}
                            <strong>{user.login || user.name}</strong>
                        </>
                    ) : (
                        "Пользователь не определен"
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
                                onChange={handleStatusFilterChange}
                            >
                                <option value="all">Все</option>
                                <option value="resolved">Решенные</option>
                                <option value="unresolved">Не решенные</option>
                            </select>
                        </div>
                        <input
                            className="input zayavki-search"
                            type="text"
                            value={searchText}
                            onChange={handleSearchTextChange}
                            placeholder="Поиск: КСА, серийный номер, кто завел..."
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
                        {lastUpdated ? `• обновлено: ${lastUpdated}` : ""}
                    </p>
                    {isTableLoading ? (
                        <p className="help mt-1">Обновление таблицы...</p>
                    ) : error && hasLoadedOnce ? (
                        <p className="help is-danger mt-1">{error}</p>
                    ) : null}
                </div>
            </div>

            {zayavki.length === 0 ? (
                <p>
                    {searchText.trim()
                        ? "Заявок по вашему запросу не найдено."
                        : "Заявок пока нет."}
                </p>
            ) : (
                <>
                    <div
                        className="table-container zayavki-table-container zayavki-desktop-view"
                        aria-busy={isTableLoading}
                    >
                        <table
                            className="table is-fullwidth is-striped is-hoverable zayavki-resizable-table"
                            style={{ minWidth: `${desktopTableMinWidth}px` }}
                        >
                            <colgroup>
                                {ZAYAVKI_TABLE_COLUMNS.map((column) => (
                                    <col
                                        key={column.key}
                                        style={{
                                            width: `${
                                                columnWidths[column.key] ||
                                                column.width
                                            }px`,
                                        }}
                                    />
                                ))}
                            </colgroup>
                            <thead>
                                <tr>
                                    {ZAYAVKI_TABLE_COLUMNS.map((column) => (
                                        <th
                                            key={column.key}
                                            style={{
                                                width: `${
                                                    columnWidths[column.key] ||
                                                    column.width
                                                }px`,
                                                minWidth: `${column.minWidth}px`,
                                            }}
                                        >
                                            <div className="z-table-head-cell">
                                                <span>{column.label}</span>
                                                <button
                                                    type="button"
                                                    className="z-table-resize-handle"
                                                    aria-label={`Изменить ширину столбца ${column.label}`}
                                                    onMouseDown={(evt) =>
                                                        handleColumnResizeStart(
                                                            column.key,
                                                            evt,
                                                        )
                                                    }
                                                />
                                            </div>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {zayavki.map((item) => (
                                    <tr
                                        key={item._id}
                                        className={getRowClassName(item)}
                                        style={{ cursor: "pointer" }}
                                        onClick={() => openDecisionModal(item)}
                                    >
                                        <td>
                                            {getRequestNumberLabel(item)}
                                        </td>
                                        <td>
                                            {item.createdAt
                                                ? new Date(
                                                      item.createdAt,
                                                  ).toLocaleString("ru-RU")
                                                : "-"}
                                        </td>
                                        <td>
                                            {hasDevicePhoto(item)
                                                ? "Есть"
                                                : "-"}
                                        </td>
                                        <td>
                                            <div className="z-table-ellipsis">
                                                {item.ksa_number ||
                                                    item.ksa_name ||
                                                    item.ksa_id ||
                                                    "-"}
                                            </div>
                                        </td>
                                        <td>
                                            <div className="z-table-ellipsis">
                                                {deviceTypeLabels[
                                                    item.device_type
                                                ] ||
                                                    item.device_type ||
                                                    "-"}
                                            </div>
                                        </td>
                                        <td>
                                            <div className="z-table-ellipsis">
                                                {item.device_name || "-"}
                                            </div>
                                        </td>
                                        <td>
                                            <div className="z-table-ellipsis">
                                                {item.device_serial || "-"}
                                            </div>
                                        </td>
                                        <td>
                                            <span
                                                className={`tag ${getUrgencyTagClass(item)}`}
                                            >
                                                {getUrgencyLabel(item)}
                                            </span>
                                        </td>
                                        <td>
                                            <div className="z-table-ellipsis z-table-ellipsis-wide">
                                                {item.device_issue || "-"}
                                            </div>
                                        </td>

                                        <td>
                                            <div className="zayavki-row-actions">
                                                <button
                                                    type="button"
                                                    className="button is-small is-light is-rounded z-action-btn z-action-btn-view"
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
                                                        className="z-action-icon"
                                                        viewBox="0 0 24 24"
                                                        aria-hidden="true"
                                                    >
                                                        <path
                                                            d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"
                                                            fill="none"
                                                            stroke="currentColor"
                                                            strokeWidth="1.8"
                                                            strokeLinecap="round"
                                                            strokeLinejoin="round"
                                                        />
                                                        <circle
                                                            cx="12"
                                                            cy="12"
                                                            r="3"
                                                            fill="none"
                                                            stroke="currentColor"
                                                            strokeWidth="1.8"
                                                        />
                                                    </svg>
                                                </button>
                                                <button
                                                    type="button"
                                                    className="button is-small is-link is-light is-rounded z-action-btn z-action-btn-edit"
                                                    onClick={(evt) =>
                                                        openEditModal(item, evt)
                                                    }
                                                    title="Редактировать"
                                                    aria-label="Редактировать"
                                                >
                                                    <svg
                                                        className="z-action-icon"
                                                        viewBox="0 0 24 24"
                                                        aria-hidden="true"
                                                    >
                                                        <path
                                                            d="M12 20h9"
                                                            fill="none"
                                                            stroke="currentColor"
                                                            strokeWidth="1.8"
                                                            strokeLinecap="round"
                                                            strokeLinejoin="round"
                                                        />
                                                        <path
                                                            d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5Z"
                                                            fill="none"
                                                            stroke="currentColor"
                                                            strokeWidth="1.8"
                                                            strokeLinecap="round"
                                                            strokeLinejoin="round"
                                                        />
                                                    </svg>
                                                </button>
                                                <button
                                                    type="button"
                                                    className={`button is-small is-danger is-light is-rounded z-action-btn z-action-btn-delete ${
                                                        deletingId === item._id
                                                            ? "is-loading"
                                                            : ""
                                                    }`}
                                                    onClick={(evt) =>
                                                        openDeleteModal(
                                                            item,
                                                            evt,
                                                        )
                                                    }
                                                    disabled={
                                                        deletingId === item._id
                                                    }
                                                    title="Удалить"
                                                    aria-label="Удалить"
                                                >
                                                    <svg
                                                        className="z-action-icon"
                                                        viewBox="0 0 24 24"
                                                        aria-hidden="true"
                                                    >
                                                        <path
                                                            d="M3 6h18"
                                                            fill="none"
                                                            stroke="currentColor"
                                                            strokeWidth="1.8"
                                                            strokeLinecap="round"
                                                            strokeLinejoin="round"
                                                        />
                                                        <path
                                                            d="M8 6V4h8v2"
                                                            fill="none"
                                                            stroke="currentColor"
                                                            strokeWidth="1.8"
                                                            strokeLinecap="round"
                                                            strokeLinejoin="round"
                                                        />
                                                        <path
                                                            d="M19 6l-1 14H6L5 6"
                                                            fill="none"
                                                            stroke="currentColor"
                                                            strokeWidth="1.8"
                                                            strokeLinecap="round"
                                                            strokeLinejoin="round"
                                                        />
                                                        <path
                                                            d="M10 11v5M14 11v5"
                                                            fill="none"
                                                            stroke="currentColor"
                                                            strokeWidth="1.8"
                                                            strokeLinecap="round"
                                                            strokeLinejoin="round"
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
                                className={`zayavka-card ${
                                    getUrgencyValue(item) === "urgent"
                                        ? "zayavka-card-urgent"
                                        : (item.decision || "").trim() &&
                                            (item.decision || "").trim() !== "-"
                                          ? "zayavka-card-resolved"
                                          : ""
                                }`}
                                style={getCardStyle(item)}
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
                                        в„–{" "}
                                        {getRequestNumberLabel(item)}
                                    </span>
                                    <span className="tag is-light">
                                        {item.ksa_number ||
                                            item.ksa_name ||
                                            item.ksa_id ||
                                            "-"}
                                    </span>
                                    <span
                                        className={`tag ${getUrgencyTagClass(item)}`}
                                    >
                                        {getUrgencyLabel(item)}
                                    </span>
                                </div>

                                <div className="zayavka-card-content">
                                    <div className="zayavka-card-image-placeholder">
                                        {hasDevicePhoto(item) ? "Есть" : "-"}
                                    </div>

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
                                            <strong>Срочность:</strong>{" "}
                                            {getUrgencyLabel(item)}
                                        </p>
                                        <p>
                                            <strong>Неправильность:</strong>{" "}
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
                                            openDeleteModal(item, evt)
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
                                Вперёд
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
                <div
                    className="modal-card z-decision-modal"
                    data-resizable-modal-key="decision"
                    style={getModalSizeStyle("decision")}
                >
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
                                        {getRequestNumberLabel(selectedZayavka)}
                                    </span>
                                </p>
                                <p className="mb-2">
                                    <span className="has-text-weight-semibold">
                                        Номер КСА:
                                    </span>{" "}
                                    <span>
                                        {selectedZayavka.ksa_number || "-"}
                                    </span>
                                </p>
                                <p className="mb-2">
                                    <span className="has-text-weight-semibold">
                                        Тип устройства:
                                    </span>{" "}
                                    <span>
                                        {getDeviceTypeText(
                                            selectedZayavka.device_type,
                                        )}
                                    </span>
                                </p>
                                <p className="mb-2">
                                    <span className="has-text-weight-semibold">
                                        Наименование:
                                    </span>{" "}
                                    <span>
                                        {selectedZayavka.device_name || "-"}
                                    </span>
                                </p>
                                <p className="mb-3">
                                    <span className="has-text-weight-semibold">
                                        Серийный номер:
                                    </span>{" "}
                                    <span>
                                        {selectedZayavka.device_serial || "-"}
                                    </span>
                                </p>
                            </>
                        ) : null}
                        {selectedZayavka?.request_basis === "Дооснащение" ? (
                            <div className="field">
                                <label className="label">Решение</label>
                                <div className="control">
                                    <input
                                        className="input"
                                        type="text"
                                        value="Дооснащение"
                                        disabled
                                    />
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className="field">
                                    <label className="label">Вид ремонта</label>
                                    <div className="control">
                                        <div className="select is-fullwidth">
                                            <select
                                                value={decisionKind}
                                                onChange={(e) =>
                                                    setDecisionKind(
                                                        e.target.value,
                                                    )
                                                }
                                            >
                                                <option value="">
                                                    Выбрать вид ремонта
                                                </option>
                                                {REPAIR_DECISION_OPTIONS.map(
                                                    (item) => (
                                                        <option
                                                            key={item.value}
                                                            value={item.value}
                                                        >
                                                            {item.label}
                                                        </option>
                                                    ),
                                                )}
                                            </select>
                                        </div>
                                    </div>
                                </div>
                                {decisionKind === "repair_on_site" ? (
                                    <div className="field">
                                        <label className="label">
                                            Описание ремонта
                                        </label>
                                        <div className="control">
                                            <textarea
                                                className="textarea"
                                                value={decisionText}
                                                onChange={(e) =>
                                                    setDecisionText(
                                                        e.target.value,
                                                    )
                                                }
                                                placeholder="Укажите описание ремонта"
                                                rows="4"
                                            />
                                        </div>
                                    </div>
                                ) : null}
                                {decisionKind === "replacement" ? (
                                    <>
                                        <div className="field">
                                            <label className="label">
                                                Тип устройства
                                            </label>
                                            <div className="control">
                                                <div className="select is-fullwidth">
                                                    <select
                                                        value={
                                                            replacementSelectedDeviceTypeId ||
                                                            (replacementForm.device_type
                                                                ? "__current__"
                                                                : "")
                                                        }
                                                        onChange={
                                                            handleReplacementDeviceTypeChange
                                                        }
                                                    >
                                                        <option value="">
                                                            Выбрать тип устройства
                                                        </option>
                                                        {!replacementSelectedDeviceTypeId &&
                                                        replacementForm.device_type ? (
                                                            <option value="__current__">
                                                                {
                                                                    replacementForm.device_type
                                                                }
                                                            </option>
                                                        ) : null}
                                                        {replacementDeviceTypes.map(
                                                            (item) => {
                                                                const typeId = String(
                                                                    item?.id_type ||
                                                                        "",
                                                                ).trim();
                                                                const typeValue = String(
                                                                    item?.type ||
                                                                        "",
                                                                ).trim();
                                                                if (
                                                                    !typeId ||
                                                                    !typeValue
                                                                ) {
                                                                    return null;
                                                                }

                                                                return (
                                                                    <option
                                                                        key={
                                                                            typeId
                                                                        }
                                                                        value={
                                                                            typeId
                                                                        }
                                                                    >
                                                                        {
                                                                            typeValue
                                                                        }
                                                                    </option>
                                                                );
                                                            },
                                                        )}
                                                    </select>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="field">
                                            <label className="label">
                                                Наименование
                                            </label>
                                            <div className="control">
                                                <input
                                                    className="input"
                                                    type="text"
                                                    list="replacement-device-name-suggestions"
                                                    value={
                                                        replacementForm.device_name
                                                    }
                                                    onChange={
                                                        handleReplacementDeviceNameChange
                                                    }
                                                    disabled={
                                                        !replacementSelectedDeviceTypeId &&
                                                        !replacementForm.device_type
                                                    }
                                                    placeholder={
                                                        replacementSelectedDeviceTypeId ||
                                                        replacementForm.device_type
                                                            ? "Введите или выберите наименование"
                                                            : "Сначала выберите тип устройства"
                                                    }
                                                    autoComplete="off"
                                                />
                                                <datalist id="replacement-device-name-suggestions">
                                                    {replacementDeviceNames.map(
                                                        (item) => {
                                                            const nameValue = String(
                                                                item?.ts_naimenovanie ||
                                                                    "",
                                                            ).trim();
                                                            if (!nameValue) {
                                                                return null;
                                                            }

                                                            return (
                                                                <option
                                                                    key={
                                                                        item.id_naimenovanie ||
                                                                        nameValue
                                                                    }
                                                                    value={
                                                                        nameValue
                                                                    }
                                                                />
                                                            );
                                                        },
                                                    )}
                                                </datalist>
                                            </div>
                                        </div>
                                        <div className="field">
                                            <label className="label">
                                                Серийный номер
                                            </label>
                                            <div className="control">
                                                <input
                                                    className="input"
                                                    type="text"
                                                    list="replacement-device-serial-suggestions"
                                                    value={
                                                        replacementForm.device_serial
                                                    }
                                                    onChange={
                                                        handleReplacementDeviceSerialChange
                                                    }
                                                    disabled={
                                                        !replacementSelectedDeviceNameId &&
                                                        !replacementForm.device_name
                                                    }
                                                    placeholder={
                                                        replacementSelectedDeviceNameId ||
                                                        replacementForm.device_name
                                                            ? "Введите или выберите серийный номер"
                                                            : "Сначала выберите наименование"
                                                    }
                                                    autoComplete="off"
                                                />
                                                <datalist id="replacement-device-serial-suggestions">
                                                    {replacementDeviceSerials.map(
                                                        (item) => {
                                                            const serialValue = String(
                                                                item?.serial_number ||
                                                                    "",
                                                            ).trim();
                                                            if (!serialValue) {
                                                                return null;
                                                            }

                                                            return (
                                                                <option
                                                                    key={
                                                                        item.id_ts ||
                                                                        serialValue
                                                                    }
                                                                    value={
                                                                        serialValue
                                                                    }
                                                                />
                                                            );
                                                        },
                                                    )}
                                                </datalist>
                                            </div>
                                        </div>
                                        <div className="field">
                                            <label className="label">
                                                Инвентарный номер
                                            </label>
                                            <div className="control">
                                                <input
                                                    className="input"
                                                    type="text"
                                                    value={
                                                        replacementForm.inv_number
                                                    }
                                                    onChange={(e) =>
                                                        setReplacementForm(
                                                            (prev) => ({
                                                                ...prev,
                                                                inv_number:
                                                                    e.target
                                                                        .value,
                                                            }),
                                                        )
                                                    }
                                                />
                                            </div>
                                        </div>
                                    </>
                                ) : null}
                            </>
                        )}
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

            <div className={`modal ${isDeleteModalOpen ? "is-active" : ""}`}>
                <div className="modal-background" onClick={closeDeleteModal} />
                <div
                    className="modal-card z-delete-modal"
                    data-resizable-modal-key="delete"
                    style={getModalSizeStyle("delete")}
                >
                    <header className="modal-card-head">
                        <p className="modal-card-title">
                            Подтверждение удаления
                        </p>
                        <button
                            className="delete"
                            aria-label="close"
                            type="button"
                            onClick={closeDeleteModal}
                            disabled={Boolean(deletingId)}
                        />
                    </header>
                    <section className="modal-card-body">
                        <p className="mb-3">
                            Вы действительно хотите удалить заявку?
                        </p>
                        <p className="mb-2">
                            <strong>Серийный номер:</strong>{" "}
                            {deleteCandidate?.device_serial || "-"}
                        </p>
                        <p>
                            <strong>Наименование:</strong>{" "}
                            {deleteCandidate?.device_name || "-"}
                        </p>
                    </section>
                    <footer className="modal-card-foot">
                        <button
                            className={`button is-danger ${
                                deletingId ? "is-loading" : ""
                            }`}
                            type="button"
                            onClick={confirmDeleteZayavka}
                            disabled={
                                !deleteCandidate?._id || Boolean(deletingId)
                            }
                        >
                            Подтвердить удаление
                        </button>
                        <button
                            className="button"
                            type="button"
                            onClick={closeDeleteModal}
                            disabled={Boolean(deletingId)}
                        >
                            Отмена
                        </button>
                    </footer>
                </div>
            </div>

            <div className={`modal ${isDetailsModalOpen ? "is-active" : ""}`}>
                <div className="modal-background" onClick={closeDetailsModal} />
                <div
                    className="modal-card z-details-modal"
                    data-resizable-modal-key="details"
                    style={getModalSizeStyle("details")}
                >
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
                                    <strong>Название:</strong>{" "}
                                    {detailsZayavka.device_name || "-"}
                                </p>
                                <p>
                                    <strong>Серийный номер:</strong>{" "}
                                    {detailsZayavka.device_serial || "-"}
                                </p>
                                <p>
                                    <strong>Основание заявки:</strong>{" "}
                                    {getRequestBasisLabel(
                                        detailsZayavka.request_basis,
                                    )}
                                </p>
                                <p>
                                    <strong>Срочность:</strong>{" "}
                                    {getUrgencyLabel(detailsZayavka)}
                                </p>
                                <p>
                                    <strong>Неправильность:</strong>{" "}
                                    {detailsZayavka.device_issue || "-"}
                                </p>
                                <p>
                                    {" "}
                                    <strong>Решение:</strong>{" "}
                                    {detailsZayavka.decision || "-"}
                                    <strong>Дата решения:</strong>{" "}
                                    {detailsZayavka.decision_date
                                        ? new Date(
                                              detailsZayavka.decision_date,
                                          ).toLocaleDateString("ru-RU")
                                        : "-"}
                                    <strong>Кто завел:</strong>{" "}
                                    {getCreatedByLabel(detailsZayavka)}
                                    <strong>Контактное лицо:</strong>{" "}
                                    {detailsZayavka.contact_person || "-"}
                                </p>
                                {detailsZayavka.repair_description ? (
                                    <p>
                                        <strong>Описание ремонта:</strong>{" "}
                                        {detailsZayavka.repair_description}
                                    </p>
                                ) : null}
                                {detailsZayavka.replacement_device_type ? (
                                    <p>
                                        <strong>Замена - тип устройства:</strong>{" "}
                                        {
                                            detailsZayavka.replacement_device_type
                                        }
                                    </p>
                                ) : null}
                                {detailsZayavka.replacement_device_name ? (
                                    <p>
                                        <strong>Замена - наименование:</strong>{" "}
                                        {
                                            detailsZayavka.replacement_device_name
                                        }
                                    </p>
                                ) : null}
                                {detailsZayavka.replacement_device_serial ? (
                                    <p>
                                        <strong>Замена - серийный номер:</strong>{" "}
                                        {
                                            detailsZayavka.replacement_device_serial
                                        }
                                    </p>
                                ) : null}
                                {detailsZayavka.replacement_inv_number ? (
                                    <p>
                                        <strong>Замена - инвентарный номер:</strong>{" "}
                                        {
                                            detailsZayavka.replacement_inv_number
                                        }
                                    </p>
                                ) : null}
                                <p>
                                    <strong>Фото:</strong>{" "}
                                    {getDevicePhotoDataUrl(detailsZayavka) ? (
                                        <img
                                            src={getDevicePhotoDataUrl(
                                                detailsZayavka,
                                            )}
                                            alt="Фото устройства"
                                            style={{
                                                width: "70%",
                                                maxWidth: "70%",
                                                borderRadius: "18px",
                                            }}
                                        />
                                    ) : (
                                        <p>-</p>
                                    )}
                                </p>
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
                <div
                    className="modal-card z-edit-modal"
                    data-resizable-modal-key="edit"
                    style={getModalSizeStyle("edit")}
                >
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
                                        value={
                                            editSelectedDeviceTypeId ||
                                            (editForm.device_type
                                                ? "__current__"
                                                : "")
                                        }
                                        onChange={handleEditDeviceTypeChange}
                                    >
                                        <option value="">
                                            Выбрать тип устройства
                                        </option>
                                        {!editSelectedDeviceTypeId &&
                                        editForm.device_type ? (
                                            <option value="__current__">
                                                {getDeviceTypeText(
                                                    editForm.device_type,
                                                )}
                                            </option>
                                        ) : null}
                                        {editDeviceTypes.map((item) => {
                                            const typeId = String(
                                                item?.id_type || "",
                                            ).trim();
                                            const typeValue = String(
                                                item?.type || "",
                                            ).trim();
                                            if (!typeId || !typeValue) {
                                                return null;
                                            }

                                            return (
                                                <option
                                                    key={typeId}
                                                    value={typeId}
                                                >
                                                    {typeValue}
                                                </option>
                                            );
                                        })}
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
                                    list="edit-device-name-suggestions"
                                    value={editForm.device_name}
                                    onChange={handleEditDeviceNameChange}
                                    disabled={
                                        !editSelectedDeviceTypeId &&
                                        !editForm.device_type
                                    }
                                    placeholder={
                                        editSelectedDeviceTypeId ||
                                        editForm.device_type
                                            ? "Введите или выберите наименование"
                                            : "Сначала выберите тип устройства"
                                    }
                                    autoComplete="off"
                                />
                                <datalist id="edit-device-name-suggestions">
                                    {editDeviceNames.map((item) => {
                                        const nameValue = String(
                                            item?.ts_naimenovanie || "",
                                        ).trim();
                                        if (!nameValue) {
                                            return null;
                                        }

                                        return (
                                            <option
                                                key={
                                                    item.id_naimenovanie ||
                                                    nameValue
                                                }
                                                value={nameValue}
                                            />
                                        );
                                    })}
                                </datalist>
                            </div>
                        </div>
                        <div className="field">
                            <label className="label">Серийный номер</label>
                            <div className="control">
                                <input
                                    className="input"
                                    type="text"
                                    list="edit-device-serial-suggestions"
                                    value={editForm.device_serial}
                                    onChange={handleEditDeviceSerialChange}
                                    disabled={!editForm.device_name}
                                    placeholder={
                                        editForm.device_name
                                            ? "Введите или выберите серийный номер"
                                            : "Сначала выберите наименование"
                                    }
                                    autoComplete="off"
                                />
                                <datalist id="edit-device-serial-suggestions">
                                    {editDeviceSerials.map((item) => {
                                        const serialValue = String(
                                            item?.serial_number || "",
                                        ).trim();
                                        if (!serialValue) {
                                            return null;
                                        }

                                        return (
                                            <option
                                                key={item.id_ts || serialValue}
                                                value={serialValue}
                                            />
                                        );
                                    })}
                                </datalist>
                            </div>
                        </div>
                        <div className="field">
                            <label className="label">Основание заявки</label>
                            <div className="control">
                                <div className="select is-fullwidth">
                                    <select
                                        value={editForm.request_basis}
                                        onChange={(e) =>
                                            setEditForm((prev) => ({
                                                ...prev,
                                                request_basis: e.target.value,
                                            }))
                                        }
                                    >
                                        <option value="">
                                            Выбрать основание заявки
                                        </option>
                                        {REQUEST_BASIS_OPTIONS.map((item) => (
                                            <option key={item} value={item}>
                                                {item}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>
                        <div className="field">
                            <label className="label">Срочность</label>
                            <div className="control">
                                <div className="select is-fullwidth">
                                    <select
                                        value={editForm.urgency}
                                        onChange={(e) =>
                                            setEditForm((prev) => ({
                                                ...prev,
                                                urgency: e.target.value,
                                            }))
                                        }
                                    >
                                        <option value="not_urgent">
                                            Не срочно
                                        </option>
                                        <option value="urgent">Срочно</option>
                                    </select>
                                </div>
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
                        {/* Поле "Адрес КСА" удалено по запросу */}
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

// FIXME: - переделать модалку решения 1 ремонт 2 замена 3 консульатция и в зависимости от выбора показывать либо поле для ввода решения, либо поле для выбора консультации, либо показать поля для выбора устройства для замены (для ремонта) а также если выбрано ремонт сделать страницу движение техники и добавлять туда в таблицу данные








