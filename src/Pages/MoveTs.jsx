import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PizZip from "pizzip";
import { fetchWithAuth } from "../utils/auth";
import { getApiUrl } from "../utils/api";

const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const EXPENSE_ACT_TEMPLATE_URL = new URL(
    "../shablonAkty/Shablon_R.docx",
    import.meta.url,
).href;
const INCOME_ACT_TEMPLATE_URL = new URL(
    "../shablonAkty/shablon_P.docx",
    import.meta.url,
).href;

function normalizeValue(value) {
    return String(value || "").trim();
}

function formatDate(value) {
    if (!value) return "-";

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return "-";
    }

    return parsed.toLocaleString("ru-RU");
}

function formatDateTimeLocalValue(value) {
    if (!value) return "";

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return "";
    }

    const timezoneOffset = parsed.getTimezoneOffset() * 60000;
    return new Date(parsed.getTime() - timezoneOffset)
        .toISOString()
        .slice(0, 16);
}

function normalizeActType(value) {
    const normalized = normalizeValue(value).toLowerCase();

    if (normalized === "income" || normalized === "приход" || normalized === "п") {
        return "income";
    }

    if (
        normalized === "expense" ||
        normalized === "расход" ||
        normalized === "р"
    ) {
        return "expense";
    }

    return "";
}

function inferActTypeFromLocation(fromLocation) {
    const normalized = normalizeValue(fromLocation).toLowerCase();
    if (!normalized) return "";

    return normalized === "сц бти" ? "expense" : "income";
}

function parseActNumber(value) {
    const normalized = normalizeValue(value);
    const match = normalized.match(/^([^/]+)\/(\d+)-([РП])-([0-9]{2})$/);

    if (!match) return null;

    return {
        regionNumber: match[1],
        sequenceNumber: Number(match[2]),
        yearShort: match[4],
        actType: match[3] === "П" ? "income" : "expense",
    };
}

function getResolvedActType(item = null) {
    return (
        normalizeActType(item?.act_type) ||
        parseActNumber(item?.act_number)?.actType ||
        inferActTypeFromLocation(item?.from_location)
    );
}

function getActTypeLabel(actType) {
    return normalizeActType(actType) === "income"
        ? "Акт прихода"
        : "Акт расхода";
}

function createEditForm(item = null) {
    return {
        request_number: item?.request_number || "",
        move_date: formatDateTimeLocalValue(item?.move_date),
        status: item?.status || "",
        delivery_method: item?.delivery_method || "",
        device_type: item?.device_type || "",
        device_name: item?.device_name || "",
        device_serial: item?.device_serial || "",
        inv_number: item?.inv_number || "",
        from_location: item?.from_location || "",
        to_location: item?.to_location || "",
        quantity: String(item?.quantity ?? 1),
    };
}

function createActForm(item = null) {
    const actNumber = normalizeValue(item?.act_number);

    return {
        request_number: item?.request_number || "",
        act_number: actNumber,
        act_type: getResolvedActType(item),
        act_assignment_mode: actNumber ? "existing" : "new",
        existing_act_number: actNumber,
        move_date: formatDateTimeLocalValue(item?.move_date || new Date()),
    };
}

function formatDateShort(value) {
    if (!value) return "";

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return "";
    }

    const day = String(parsed.getDate()).padStart(2, "0");
    const month = String(parsed.getMonth() + 1).padStart(2, "0");
    const year = String(parsed.getFullYear()).slice(-2);
    return `${day}.${month}.${year}`;
}

function formatDateLong(value) {
    if (!value) return "";

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return "";
    }

    const day = String(parsed.getDate()).padStart(2, "0");
    const month = String(parsed.getMonth() + 1).padStart(2, "0");
    const year = String(parsed.getFullYear());
    return `${day}.${month}.${year}`;
}

function escapeXml(value) {
    return String(value || "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&apos;");
}

function buildWordParagraphXml(text, options = {}) {
    const {
        bold = false,
        size = 28,
        underline = false,
        align = "",
        left = "",
        hanging = "",
        before = "",
        xmlSpace = false,
    } = options;

    const paragraphProps = [];
    if (align) {
        paragraphProps.push(`<w:jc w:val="${align}"/>`);
    }
    if (left || hanging) {
        const attrs = [];
        if (left) attrs.push(`w:left="${left}"`);
        if (hanging) attrs.push(`w:hanging="${hanging}"`);
        paragraphProps.push(`<w:ind ${attrs.join(" ")}/>`);
    }
    if (before) {
        paragraphProps.push(`<w:spacing w:before="${before}"/>`);
    }

    const runProps = [
        `<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/>`,
        bold ? "<w:b/>" : "",
        underline ? '<w:u w:val="single"/>' : "",
        `<w:sz w:val="${size}"/>`,
    ]
        .filter(Boolean)
        .join("");

    return `
        <w:p>
            ${
                paragraphProps.length > 0
                    ? `<w:pPr>${paragraphProps.join("")}</w:pPr>`
                    : ""
            }
            <w:r>
                <w:rPr>${runProps}</w:rPr>
                <w:t${xmlSpace ? ' xml:space="preserve"' : ""}>${escapeXml(text)}</w:t>
            </w:r>
        </w:p>
    `;
}

function buildWordCellXml(text, width) {
    return `
        <w:tc>
            <w:tcPr><w:tcW w:w="${width}" w:type="dxa"/></w:tcPr>
            ${buildWordParagraphXml(text, { size: 28 })}
        </w:tc>
    `;
}

function buildExpenseActRowXml(item, index, requestMeta = {}) {
    const values = [
        String(index + 1),
        item?.device_name || "-",
        item?.device_serial || "-",
        item?.from_location || "-",
        item?.to_location || "-",
        requestMeta?.request_basis || "-",
        item?.request_number || "-",
        requestMeta?.created_by || "-",
    ];
    const widths = ["1101", "2887", "1994", "1994", "1995", "1995", "1995", "1995"];

    return `
        <w:tr>
            ${values
                .map((value, cellIndex) => buildWordCellXml(value, widths[cellIndex]))
                .join("")}
        </w:tr>
    `;
}

function buildIncomeActItemXml(item, requestMeta = {}) {
    const parts = [
        item?.device_name || "-",
        item?.device_serial || "-",
        item?.from_location || "-",
        item?.to_location || "-",
        requestMeta?.request_basis || "-",
        item?.request_number || "-",
        requestMeta?.created_by || "-",
    ];

    return `
        <w:p>
            <w:pPr>
                <w:pStyle w:val="ListParagraph"/>
                <w:numPr>
                    <w:ilvl w:val="0"/>
                    <w:numId w:val="1"/>
                </w:numPr>
                <w:tabs>
                    <w:tab w:pos="1030" w:val="left" w:leader="none"/>
                    <w:tab w:pos="5025" w:val="left" w:leader="none"/>
                    <w:tab w:pos="6959" w:val="left" w:leader="none"/>
                    <w:tab w:pos="9000" w:val="left" w:leader="none"/>
                    <w:tab w:pos="10365" w:val="left" w:leader="none"/>
                    <w:tab w:pos="12525" w:val="left" w:leader="none"/>
                </w:tabs>
                <w:spacing w:line="240" w:lineRule="auto" w:before="185" w:after="0"/>
                <w:ind w:left="1030" w:right="0" w:hanging="253"/>
                <w:jc w:val="left"/>
                <w:rPr><w:sz w:val="22"/></w:rPr>
            </w:pPr>
            ${parts
                .map(
                    (value, index) => `
                        <w:r>
                            <w:rPr>
                                <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/>
                                <w:color w:val="${
                                    index === 0 ? "3F3F3F" : "0F243F"
                                }"/>
                                <w:sz w:val="22"/>
                            </w:rPr>
                            <w:t>${escapeXml(value)}</w:t>
                        </w:r>
                        ${index < parts.length - 1 ? "<w:r><w:tab/></w:r>" : ""}
                    `,
                )
                .join("")}
        </w:p>
    `;
}

function parseWordFragment(xml, document) {
    const parser = new DOMParser();
    const parsed = parser.parseFromString(
        `<root xmlns:w="${WORD_NS}">${xml}</root>`,
        "application/xml",
    );

    return Array.from(parsed.documentElement.childNodes).map((node) =>
        document.importNode(node, true),
    );
}

function buildExpenseActDocumentXml(templateXml, payload) {
    const { actNumber, moveDate, items, requestMetaByNumber } = payload;
    const parser = new DOMParser();
    const xmlDocument = parser.parseFromString(templateXml, "application/xml");
    const paragraphs = Array.from(xmlDocument.getElementsByTagNameNS(WORD_NS, "p"));
    const table = xmlDocument.getElementsByTagNameNS(WORD_NS, "tbl")[0];

    if (!table) {
        throw new Error("Не найдена таблица в шаблоне Word");
    }

    const titleParagraph = paragraphs.find((paragraph) =>
        paragraph.textContent.includes("АКТ"),
    );
    const dateParagraph = paragraphs.find((paragraph) =>
        paragraph.textContent.trim().startsWith("от"),
    );

    if (!titleParagraph || !dateParagraph) {
        throw new Error("Не найдены ключевые поля в шаблоне Word");
    }

    const titleReplacement = parseWordFragment(
        buildWordParagraphXml(`Акт № ${actNumber}`, {
            bold: true,
            size: 36,
            before: "30",
            align: "center",
        }),
        xmlDocument,
    )[0];

    const dateReplacement = parseWordFragment(
        buildWordParagraphXml(`от\t${formatDateShort(moveDate)}`, {
            bold: true,
            size: 36,
            left: "278",
            before: "27",
            xmlSpace: true,
        }),
        xmlDocument,
    )[0];

    titleParagraph.parentNode.replaceChild(titleReplacement, titleParagraph);
    dateParagraph.parentNode.replaceChild(dateReplacement, dateParagraph);

    const rows = Array.from(table.getElementsByTagNameNS(WORD_NS, "tr"));
    if (rows.length < 2) {
        throw new Error("Не найдена строка-образец в шаблоне Word");
    }

    const sampleRow = rows[1];
    const generatedRows = items.map((item, index) =>
        buildExpenseActRowXml(
            item,
            index,
            requestMetaByNumber.get(normalizeValue(item?.request_number)) || {},
        ),
    );

    const replacementNodes = parseWordFragment(generatedRows.join(""), xmlDocument);
    replacementNodes.forEach((node) => {
        table.insertBefore(node, sampleRow);
    });
    table.removeChild(sampleRow);

    return new XMLSerializer().serializeToString(xmlDocument);
}

function buildIncomeActDocumentXml(templateXml, payload) {
    const { actNumber, moveDate, items, requestMetaByNumber } = payload;
    const parser = new DOMParser();
    const xmlDocument = parser.parseFromString(templateXml, "application/xml");
    const paragraphs = Array.from(xmlDocument.getElementsByTagNameNS(WORD_NS, "p"));

    const titleParagraph = paragraphs.find((paragraph) =>
        paragraph.textContent.includes("АКТ"),
    );
    const dateParagraph = paragraphs.find((paragraph) =>
        paragraph.textContent.trim().startsWith("от"),
    );
    const firstListParagraph = paragraphs.find(
        (paragraph) =>
            paragraph.getElementsByTagNameNS(WORD_NS, "numPr").length > 0,
    );
    const footerParagraph = paragraphs.find(
        (paragraph) =>
            paragraph.textContent.trim().startsWith("Передал"),
    );

    if (!titleParagraph || !dateParagraph || !firstListParagraph || !footerParagraph) {
        throw new Error("Не найдены ключевые поля в шаблоне Word");
    }

    const titleReplacement = parseWordFragment(
        buildWordParagraphXml(`Акт № ${actNumber}`, {
            bold: true,
            size: 36,
            before: "30",
            align: "center",
        }),
        xmlDocument,
    )[0];

    const dateReplacement = parseWordFragment(
        buildWordParagraphXml(`от\t${formatDateLong(moveDate)}`, {
            bold: true,
            size: 36,
            left: "278",
            before: "27",
            xmlSpace: true,
        }),
        xmlDocument,
    )[0];

    titleParagraph.parentNode.replaceChild(titleReplacement, titleParagraph);
    dateParagraph.parentNode.replaceChild(dateReplacement, dateParagraph);

    const listParagraphs = paragraphs.filter(
        (paragraph) =>
            paragraph.getElementsByTagNameNS(WORD_NS, "numPr").length > 0,
    );

    const generatedItemsXml = items
        .map((item) =>
            buildIncomeActItemXml(
                item,
                requestMetaByNumber.get(normalizeValue(item?.request_number)) || {},
            ),
        )
        .join("");

    const replacementNodes = parseWordFragment(generatedItemsXml, xmlDocument);
    replacementNodes.forEach((node) => {
        footerParagraph.parentNode.insertBefore(node, footerParagraph);
    });

    listParagraphs.forEach((paragraph) => {
        paragraph.parentNode.removeChild(paragraph);
    });

    return new XMLSerializer().serializeToString(xmlDocument);
}

function escapeHtml(value) {
    return String(value || "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function buildActHtml(selectedItem, actItems) {
    const resolvedActType = getResolvedActType(selectedItem);
    const title = getActTypeLabel(resolvedActType);
    const normalizedItems =
        Array.isArray(actItems) && actItems.length > 0 ? actItems : [selectedItem];
    const headerRows = [
        ["Номер акта", selectedItem?.act_number || "-"],
        ["Дата", formatDate(selectedItem?.move_date)],
        ["Тип акта", title],
    ];

    const headerRowsHtml = headerRows
        .map(
            ([label, value]) => `
                <tr>
                    <th>${escapeHtml(label)}</th>
                    <td>${escapeHtml(value)}</td>
                </tr>
            `,
        )
        .join("");

    const itemRowsHtml = normalizedItems
        .map(
            (item, index) => `
                <tr>
                    <td>${index + 1}</td>
                    <td>${escapeHtml(item?.request_number || "-")}</td>
                    <td>${escapeHtml(item?.device_type || "-")}</td>
                    <td>${escapeHtml(item?.device_name || "-")}</td>
                    <td>${escapeHtml(item?.device_serial || "-")}</td>
                    <td>${escapeHtml(item?.inv_number || "-")}</td>
                    <td>${escapeHtml(item?.from_location || "-")}</td>
                    <td>${escapeHtml(item?.to_location || "-")}</td>
                    <td>${escapeHtml(item?.quantity ?? "-")}</td>
                </tr>
            `,
        )
        .join("");

    return `<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8" />
    <title>${escapeHtml(title)}</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 32px;
            color: #222;
        }
        .page {
            max-width: 1100px;
            margin: 0 auto;
        }
        h1 {
            margin: 0 0 12px;
            font-size: 28px;
        }
        .meta {
            margin-bottom: 24px;
            color: #555;
            font-size: 14px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
        }
        th,
        td {
            border: 1px solid #cfcfcf;
            padding: 10px 12px;
            text-align: left;
            vertical-align: top;
        }
        th {
            background: #f7f7f7;
        }
        .item-table {
            margin-top: 24px;
        }
        .signatures {
            margin-top: 48px;
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 32px;
        }
        .signature-line {
            border-top: 1px solid #555;
            padding-top: 8px;
            min-height: 48px;
        }
    </style>
</head>
<body>
    <div class="page">
        <h1>${escapeHtml(title)}</h1>
        <div class="meta">Сформировано: ${escapeHtml(
            new Date().toLocaleString("ru-RU"),
        )}</div>
        <table>
            <tbody>
                ${headerRowsHtml}
            </tbody>
        </table>
        <table class="item-table">
            <thead>
                <tr>
                    <th>№</th>
                    <th>По какой заявке</th>
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
                ${itemRowsHtml}
            </tbody>
        </table>
        <div class="signatures">
            <div class="signature-line">Сдал</div>
            <div class="signature-line">Принял</div>
        </div>
    </div>
</body>
</html>`;
}

function compareActNumbers(left, right) {
    const leftParsed = parseActNumber(left.act_number);
    const rightParsed = parseActNumber(right.act_number);

    if (leftParsed && rightParsed) {
        if (leftParsed.yearShort !== rightParsed.yearShort) {
            return rightParsed.yearShort.localeCompare(leftParsed.yearShort);
        }

        if (leftParsed.regionNumber !== rightParsed.regionNumber) {
            return leftParsed.regionNumber.localeCompare(
                rightParsed.regionNumber,
                "ru",
                { numeric: true },
            );
        }

        return rightParsed.sequenceNumber - leftParsed.sequenceNumber;
    }

    return right.act_number.localeCompare(left.act_number, "ru", {
        numeric: true,
    });
}

export default function MoveTs() {
    const apiUrl = getApiUrl();
    const requestMetaByNumberRef = useRef(new Map());
    const [items, setItems] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState("");
    const [selectedItemId, setSelectedItemId] = useState("");
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editForm, setEditForm] = useState(createEditForm());
    const [modalError, setModalError] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isActModalOpen, setIsActModalOpen] = useState(false);
    const [actForm, setActForm] = useState(createActForm());
    const [actModalError, setActModalError] = useState("");
    const [actModalPreview, setActModalPreview] = useState("");
    const [isActModalPreviewLoading, setIsActModalPreviewLoading] =
        useState(false);
    const [isActSaving, setIsActSaving] = useState(false);

    const loadMoveTs = useCallback(async () => {
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
            setError(loadError.message || "Ошибка загрузки движения техники");
            setItems([]);
        } finally {
            setIsLoading(false);
        }
    }, [apiUrl]);

    const ensureRequestMetaLoaded = useCallback(async () => {
        if (requestMetaByNumberRef.current.size > 0) {
            return requestMetaByNumberRef.current;
        }

        const response = await fetchWithAuth(`${apiUrl}/zayavki`, {
            method: "GET",
        });

        const responseBody = await response.json().catch(() => null);
        if (!response.ok) {
            throw new Error(
                responseBody?.message ||
                    "Не удалось получить данные заявок для Word-шаблона",
            );
        }

        const nextMap = new Map();
        (Array.isArray(responseBody) ? responseBody : []).forEach((item) => {
            const requestNumber = normalizeValue(item?.request_number);
            if (!requestNumber) return;

            nextMap.set(requestNumber, {
                request_basis: normalizeValue(item?.request_basis) || "-",
                created_by: normalizeValue(item?.created_by) || "-",
            });
        });

        requestMetaByNumberRef.current = nextMap;
        return nextMap;
    }, [apiUrl]);

    useEffect(() => {
        loadMoveTs();
    }, [loadMoveTs]);

    const actOptions = useMemo(() => {
        const map = new Map();

        items.forEach((item) => {
            const actNumber = normalizeValue(item?.act_number);
            if (!actNumber) return;

            const actType = getResolvedActType(item);
            const existing = map.get(actNumber);

            if (existing) {
                existing.count += 1;
                return;
            }

            map.set(actNumber, {
                act_number: actNumber,
                act_type: actType,
                count: 1,
            });
        });

        return Array.from(map.values()).sort(compareActNumbers);
    }, [items]);

    const filteredActModalOptions = useMemo(() => {
        const currentActType = normalizeActType(actForm.act_type);
        return actOptions.filter((item) => {
            if (!currentActType) return true;
            return normalizeActType(item.act_type) === currentActType;
        });
    }, [actForm.act_type, actOptions]);

    const visibleActModalNumber = useMemo(() => {
        if (actForm.act_assignment_mode === "existing") {
            return normalizeValue(actForm.existing_act_number);
        }

        if (actForm.act_assignment_mode === "new") {
            return normalizeValue(actModalPreview);
        }

        return normalizeValue(actForm.act_number);
    }, [
        actForm.act_assignment_mode,
        actForm.act_number,
        actForm.existing_act_number,
        actModalPreview,
    ]);

    const selectedItem = useMemo(() => {
        if (!selectedItemId) return null;

        return (
            items.find(
                (item) => normalizeValue(item?._id) === normalizeValue(selectedItemId),
            ) || null
        );
    }, [items, selectedItemId]);

    useEffect(() => {
        if (!isModalOpen || !selectedItem) return;

        if (!isEditing) {
            setEditForm(createEditForm(selectedItem));
        }

        if (!isActModalOpen) {
            setActForm(createActForm(selectedItem));
        }
    }, [isActModalOpen, isEditing, isModalOpen, selectedItem]);

    useEffect(() => {
        if (selectedItemId && !selectedItem) {
            setIsModalOpen(false);
            setIsActModalOpen(false);
            setIsEditing(false);
            setSelectedItemId("");
            setEditForm(createEditForm());
            setActForm(createActForm());
            setModalError("");
            setActModalError("");
            setActModalPreview("");
            setIsActModalPreviewLoading(false);
        }
    }, [selectedItem, selectedItemId]);

    function openModal(item) {
        setSelectedItemId(item?._id || "");
        setEditForm(createEditForm(item));
        setModalError("");
        setIsEditing(false);
        setIsActModalOpen(false);
        setActForm(createActForm(item));
        setActModalError("");
        setActModalPreview("");
        setIsActModalPreviewLoading(false);
        setIsModalOpen(true);
    }

    function closeModal() {
        setIsModalOpen(false);
        setSelectedItemId("");
        setIsEditing(false);
        setEditForm(createEditForm());
        setModalError("");
        setIsActModalOpen(false);
        setActForm(createActForm());
        setActModalError("");
        setActModalPreview("");
        setIsActModalPreviewLoading(false);
    }

    function openActModal() {
        if (!selectedItem) return;

        setActForm(createActForm(selectedItem));
        setActModalError("");
        setActModalPreview("");
        setIsActModalPreviewLoading(false);
        setIsActModalOpen(true);
    }

    function closeActModal() {
        setIsActModalOpen(false);
        setActForm(createActForm(selectedItem));
        setActModalError("");
        setActModalPreview("");
        setIsActModalPreviewLoading(false);
    }

    function handleEditFieldChange(event) {
        const { name, value } = event.target;
        setEditForm((prev) => ({
            ...prev,
            [name]: value,
        }));
    }

    function handleActFieldChange(event) {
        const { name, value } = event.target;

        setActForm((prev) => {
            const nextForm = {
                ...prev,
                [name]: value,
            };

            if (name === "act_type") {
                const nextActType = normalizeActType(value);
                const selectedExistingAct = actOptions.find(
                    (item) => item.act_number === prev.existing_act_number,
                );

                if (
                    selectedExistingAct &&
                    normalizeActType(selectedExistingAct.act_type) !== nextActType
                ) {
                    nextForm.existing_act_number = "";
                }
            }

            if (name === "act_assignment_mode") {
                if (value === "new") {
                    nextForm.act_number = "";
                }

                if (value === "manual") {
                    nextForm.existing_act_number = "";
                }

                if (value !== "existing") {
                    nextForm.existing_act_number =
                        value === "manual" ? "" : nextForm.existing_act_number;
                }
            }

            if (name === "existing_act_number") {
                nextForm.act_number = value;
            }

            return nextForm;
        });
    }

    useEffect(() => {
        let isCancelled = false;

        async function loadActModalPreview() {
            if (
                !isActModalOpen ||
                actForm.act_assignment_mode !== "new" ||
                !normalizeValue(actForm.request_number) ||
                !normalizeActType(actForm.act_type)
            ) {
                setActModalPreview("");
                setIsActModalPreviewLoading(false);
                return;
            }

            try {
                setIsActModalPreviewLoading(true);

                const query = new URLSearchParams({
                    requestNumber: actForm.request_number,
                    actType: actForm.act_type,
                });

                if (normalizeValue(actForm.move_date)) {
                    query.set("moveDate", actForm.move_date);
                }

                const response = await fetchWithAuth(
                    `${apiUrl}/move-ts/act-preview?${query.toString()}`,
                    {
                        method: "GET",
                    },
                );

                const responseBody = await response.json().catch(() => null);
                if (!response.ok) {
                    throw new Error(
                        responseBody?.message ||
                            "Не удалось сформировать номер акта",
                    );
                }

                if (!isCancelled) {
                    setActModalPreview(responseBody?.act_number || "");
                }
            } catch (previewError) {
                if (!isCancelled) {
                    setActModalPreview("");
                    setActModalError(
                        previewError.message || "Ошибка формирования номера акта",
                    );
                }
            } finally {
                if (!isCancelled) {
                    setIsActModalPreviewLoading(false);
                }
            }
        }

        loadActModalPreview();

        return () => {
            isCancelled = true;
        };
    }, [
        actForm.act_assignment_mode,
        actForm.act_type,
        actForm.move_date,
        actForm.request_number,
        apiUrl,
        isActModalOpen,
    ]);

    async function handleSave() {
        if (!selectedItem?._id) {
            setModalError("Не удалось определить запись для редактирования");
            return;
        }

        try {
            setIsSaving(true);
            setModalError("");

            const response = await fetchWithAuth(
                `${apiUrl}/move-ts/${selectedItem._id}`,
                {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        ...editForm,
                        quantity: Number(editForm.quantity),
                        act_number: selectedItem.act_number || "",
                        act_type: selectedItem.act_type || "",
                    }),
                },
            );

            const responseBody = await response.json().catch(() => null);
            if (!response.ok) {
                throw new Error(
                    responseBody?.message ||
                        "Не удалось сохранить изменения движения техники",
                );
            }

            setItems((prev) =>
                prev.map((item) =>
                    item._id === responseBody._id ? responseBody : item,
                ),
            );
            setEditForm(createEditForm(responseBody));
            setIsEditing(false);
        } catch (saveError) {
            setModalError(
                saveError.message || "Ошибка сохранения движения техники",
            );
        } finally {
            setIsSaving(false);
        }
    }

    async function handleDelete() {
        if (!selectedItem?._id) {
            setModalError("Не удалось определить запись для удаления");
            return;
        }

        const isConfirmed = window.confirm(
            "Удалить запись движения техники?",
        );
        if (!isConfirmed) {
            return;
        }

        try {
            setIsDeleting(true);
            setModalError("");

            const response = await fetchWithAuth(
                `${apiUrl}/move-ts/${selectedItem._id}`,
                {
                    method: "DELETE",
                },
            );

            const responseBody = await response.json().catch(() => null);
            if (!response.ok) {
                throw new Error(
                    responseBody?.message ||
                        "Не удалось удалить запись движения техники",
                );
            }

            setItems((prev) =>
                prev.filter((item) => item._id !== selectedItem._id),
            );
            closeModal();
        } catch (deleteError) {
            setModalError(
                deleteError.message || "Ошибка удаления движения техники",
            );
        } finally {
            setIsDeleting(false);
        }
    }

    function printActForItem(item, sourceItems) {
        const normalizedActNumber = normalizeValue(item?.act_number);
        const actItems = normalizedActNumber
            ? sourceItems.filter(
                  (sourceItem) =>
                      normalizeValue(sourceItem.act_number) === normalizedActNumber,
              )
            : [item];

        const printWindow = window.open(
            "",
            "_blank",
            "noopener,noreferrer,width=1200,height=800",
        );

        if (!printWindow) {
            setModalError("Не удалось открыть окно для печати акта");
            return;
        }

        printWindow.document.open();
        printWindow.document.write(buildActHtml(item, actItems));
        printWindow.document.close();
        printWindow.focus();
        printWindow.print();
    }

    async function downloadActDocx(item, sourceItems) {
        const normalizedActNumber = normalizeValue(item?.act_number);
        const actItems = normalizedActNumber
            ? sourceItems.filter(
                  (sourceItem) =>
                      normalizeValue(sourceItem.act_number) === normalizedActNumber,
              )
            : [item];
        const actType = getResolvedActType(item);
        const isIncomeAct = actType === "income";

        const [templateBuffer, requestMetaByNumber] = await Promise.all([
            fetch(
                isIncomeAct
                    ? INCOME_ACT_TEMPLATE_URL
                    : EXPENSE_ACT_TEMPLATE_URL,
            ).then(async (response) => {
                if (!response.ok) {
                    throw new Error("Не удалось загрузить шаблон Word");
                }

                return response.arrayBuffer();
            }),
            ensureRequestMetaLoaded(),
        ]);

        const zip = new PizZip(templateBuffer);
        const documentFile = zip.file("word/document.xml");
        if (!documentFile) {
            throw new Error("В шаблоне Word отсутствует document.xml");
        }

        const payload = {
            actNumber: item?.act_number || "",
            moveDate: item?.move_date,
            items: actItems,
            requestMetaByNumber,
        };
        const nextDocumentXml = (
            isIncomeAct ? buildIncomeActDocumentXml : buildExpenseActDocumentXml
        )(
            documentFile.asText(),
            payload,
        );

        zip.file("word/document.xml", nextDocumentXml);

        const blob = zip.generate({
            type: "blob",
            mimeType:
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        });

        const safeActNumber = normalizeValue(item?.act_number).replaceAll("/", "-");
        const fileName = `Akt_${
            isIncomeAct ? "Prikhoda" : "Raskhoda"
        }_${safeActNumber || "bez-nomera"}.docx`;
        const downloadUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");

        link.href = downloadUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(downloadUrl);
    }

    async function handleSaveAct(shouldPrint = false) {
        if (!selectedItem?._id) {
            setActModalError("Не удалось определить запись для формирования акта");
            return;
        }

        if (
            actForm.act_assignment_mode === "existing" &&
            !normalizeValue(actForm.existing_act_number)
        ) {
            setActModalError("Выберите существующий акт");
            return;
        }

        if (
            actForm.act_assignment_mode === "new" &&
            !normalizeActType(actForm.act_type)
        ) {
            setActModalError("Выберите тип акта");
            return;
        }

        try {
            setIsActSaving(true);
            setActModalError("");

            const response = await fetchWithAuth(
                `${apiUrl}/move-ts/${selectedItem._id}`,
                {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        request_number: selectedItem.request_number,
                        move_date: actForm.move_date,
                        status: selectedItem.status,
                        delivery_method: selectedItem.delivery_method,
                        device_type: selectedItem.device_type,
                        device_name: selectedItem.device_name,
                        device_serial: selectedItem.device_serial,
                        inv_number: selectedItem.inv_number,
                        from_location: selectedItem.from_location,
                        to_location: selectedItem.to_location,
                        quantity: Number(selectedItem.quantity || 1),
                        act_type: actForm.act_type,
                        act_assignment_mode: actForm.act_assignment_mode,
                        act_number: actForm.act_number,
                        existing_act_number: actForm.existing_act_number,
                    }),
                },
            );

            const responseBody = await response.json().catch(() => null);
            if (!response.ok) {
                throw new Error(
                    responseBody?.message ||
                        "Не удалось сохранить данные акта",
                );
            }

            const nextItems = items.map((item) =>
                item._id === responseBody._id ? responseBody : item,
            );

            setItems(nextItems);
            setEditForm(createEditForm(responseBody));
            setActForm(createActForm(responseBody));
            setIsActModalOpen(false);

            if (shouldPrint) {
                await downloadActDocx(responseBody, nextItems);
            }
        } catch (saveError) {
            setActModalError(saveError.message || "Ошибка формирования акта");
        } finally {
            setIsActSaving(false);
        }
    }

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
                                    <tr
                                        key={
                                            item._id ||
                                            `${item.request_number}-${index}`
                                        }
                                        onClick={() => openModal(item)}
                                        onKeyDown={(event) => {
                                            if (
                                                event.key === "Enter" ||
                                                event.key === " "
                                            ) {
                                                event.preventDefault();
                                                openModal(item);
                                            }
                                        }}
                                        role="button"
                                        tabIndex={0}
                                        style={{ cursor: "pointer" }}
                                    >
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

            <div className={`modal ${isModalOpen ? "is-active" : ""}`}>
                <div
                    className="modal-background"
                    onClick={closeModal}
                    aria-hidden="true"
                />
                <div className="modal-card" style={{ width: "min(960px, 96vw)" }}>
                    <header className="modal-card-head">
                        <div>
                            <p className="modal-card-title">Движение техники</p>
                            {selectedItem ? (
                                <>
                                    <p className="is-size-7 has-text-grey mt-2">
                                        {getActTypeLabel(
                                            getResolvedActType(selectedItem),
                                        )}
                                    </p>
                                    <p className="is-size-7 has-text-grey mt-1">
                                        Номер акта:{" "}
                                        {selectedItem.act_number || "не задан"}
                                    </p>
                                </>
                            ) : null}
                        </div>
                        <button
                            className="delete"
                            aria-label="close"
                            onClick={closeModal}
                            type="button"
                        />
                    </header>

                    <section className="modal-card-body">
                        {modalError ? (
                            <p className="help is-danger mb-4">{modalError}</p>
                        ) : null}

                        {selectedItem ? (
                            <>
                                <div className="box has-background-light mb-5">
                                    <p className="heading mb-2">Реквизиты акта</p>
                                    <div className="columns is-variable is-3 mb-0">
                                        <div className="column is-5">
                                            <p className="is-size-7 has-text-grey mb-1">
                                                Номер акта
                                            </p>
                                            <p
                                                className="title is-4 mb-0"
                                                style={{ wordBreak: "break-word" }}
                                            >
                                                {selectedItem.act_number ||
                                                    "не задан"}
                                            </p>
                                        </div>
                                        <div className="column is-3">
                                            <p className="is-size-7 has-text-grey mb-1">
                                                Тип акта
                                            </p>
                                            <p className="subtitle is-6 mb-0">
                                                {getActTypeLabel(
                                                    getResolvedActType(
                                                        selectedItem,
                                                    ),
                                                )}
                                            </p>
                                        </div>
                                        <div className="column is-4">
                                            <p className="is-size-7 has-text-grey mb-1">
                                                Дата акта
                                            </p>
                                            <p className="subtitle is-6 mb-0">
                                                {formatDate(selectedItem.move_date)}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {isEditing ? (
                                    <div className="columns is-multiline">
                                        <div className="column is-6">
                                            <label className="label">
                                                По какой заявке
                                            </label>
                                            <input
                                                className="input"
                                                name="request_number"
                                                onChange={handleEditFieldChange}
                                                value={editForm.request_number}
                                            />
                                        </div>
                                        <div className="column is-6">
                                            <label className="label">Дата</label>
                                            <input
                                                className="input"
                                                name="move_date"
                                                onChange={handleEditFieldChange}
                                                type="datetime-local"
                                                value={editForm.move_date}
                                            />
                                        </div>
                                        <div className="column is-6">
                                            <label className="label">Статус</label>
                                            <input
                                                className="input"
                                                name="status"
                                                onChange={handleEditFieldChange}
                                                value={editForm.status}
                                            />
                                        </div>
                                        <div className="column is-6">
                                            <label className="label">
                                                Способ доставки
                                            </label>
                                            <input
                                                className="input"
                                                name="delivery_method"
                                                onChange={handleEditFieldChange}
                                                value={editForm.delivery_method}
                                            />
                                        </div>
                                        <div className="column is-6">
                                            <label className="label">
                                                Тип устройства
                                            </label>
                                            <input
                                                className="input"
                                                name="device_type"
                                                onChange={handleEditFieldChange}
                                                value={editForm.device_type}
                                            />
                                        </div>
                                        <div className="column is-6">
                                            <label className="label">
                                                Наименование
                                            </label>
                                            <input
                                                className="input"
                                                name="device_name"
                                                onChange={handleEditFieldChange}
                                                value={editForm.device_name}
                                            />
                                        </div>
                                        <div className="column is-6">
                                            <label className="label">
                                                Серийный номер
                                            </label>
                                            <input
                                                className="input"
                                                name="device_serial"
                                                onChange={handleEditFieldChange}
                                                value={editForm.device_serial}
                                            />
                                        </div>
                                        <div className="column is-6">
                                            <label className="label">
                                                Инвентарный номер
                                            </label>
                                            <input
                                                className="input"
                                                name="inv_number"
                                                onChange={handleEditFieldChange}
                                                value={editForm.inv_number}
                                            />
                                        </div>
                                        <div className="column is-6">
                                            <label className="label">Откуда</label>
                                            <input
                                                className="input"
                                                name="from_location"
                                                onChange={handleEditFieldChange}
                                                value={editForm.from_location}
                                            />
                                        </div>
                                        <div className="column is-6">
                                            <label className="label">Куда</label>
                                            <input
                                                className="input"
                                                name="to_location"
                                                onChange={handleEditFieldChange}
                                                value={editForm.to_location}
                                            />
                                        </div>
                                        <div className="column is-6">
                                            <label className="label">
                                                Количество
                                            </label>
                                            <input
                                                className="input"
                                                min="1"
                                                name="quantity"
                                                onChange={handleEditFieldChange}
                                                type="number"
                                                value={editForm.quantity}
                                            />
                                        </div>
                                    </div>
                                ) : (
                                    <div className="content">
                                        <div className="columns is-multiline">
                                            <div className="column is-6">
                                                <strong>По какой заявке:</strong>{" "}
                                                {selectedItem.request_number || "-"}
                                            </div>
                                            <div className="column is-6">
                                                <strong>Дата:</strong>{" "}
                                                {formatDate(selectedItem.move_date)}
                                            </div>
                                            <div className="column is-6">
                                                <strong>Статус:</strong>{" "}
                                                {selectedItem.status || "-"}
                                            </div>
                                            <div className="column is-6">
                                                <strong>Способ доставки:</strong>{" "}
                                                {selectedItem.delivery_method || "-"}
                                            </div>
                                            <div className="column is-6">
                                                <strong>Тип устройства:</strong>{" "}
                                                {selectedItem.device_type || "-"}
                                            </div>
                                            <div className="column is-6">
                                                <strong>Наименование:</strong>{" "}
                                                {selectedItem.device_name || "-"}
                                            </div>
                                            <div className="column is-6">
                                                <strong>Серийный номер:</strong>{" "}
                                                {selectedItem.device_serial || "-"}
                                            </div>
                                            <div className="column is-6">
                                                <strong>Инвентарный номер:</strong>{" "}
                                                {selectedItem.inv_number || "-"}
                                            </div>
                                            <div className="column is-6">
                                                <strong>Откуда:</strong>{" "}
                                                {selectedItem.from_location || "-"}
                                            </div>
                                            <div className="column is-6">
                                                <strong>Куда:</strong>{" "}
                                                {selectedItem.to_location || "-"}
                                            </div>
                                            <div className="column is-6">
                                                <strong>Количество:</strong>{" "}
                                                {selectedItem.quantity ?? "-"}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </>
                        ) : null}
                    </section>

                    <footer className="modal-card-foot is-justify-content-space-between">
                        <div className="buttons">
                            {isEditing ? (
                                <>
                                    <button
                                        className={`button is-success ${
                                            isSaving ? "is-loading" : ""
                                        }`}
                                        onClick={handleSave}
                                        type="button"
                                    >
                                        Сохранить
                                    </button>
                                    <button
                                        className="button"
                                        onClick={() => {
                                            setEditForm(createEditForm(selectedItem));
                                            setModalError("");
                                            setIsEditing(false);
                                        }}
                                        type="button"
                                    >
                                        Отмена
                                    </button>
                                </>
                            ) : (
                                <>
                                    <button
                                        className="button is-link"
                                        onClick={() => {
                                            setEditForm(createEditForm(selectedItem));
                                            setModalError("");
                                            setIsEditing(true);
                                        }}
                                        type="button"
                                    >
                                        Редактировать
                                    </button>
                                    <button
                                        className={`button is-danger ${
                                            isDeleting ? "is-loading" : ""
                                        }`}
                                        onClick={handleDelete}
                                        type="button"
                                    >
                                        Удалить
                                    </button>
                                    <button
                                        className="button is-primary"
                                        onClick={openActModal}
                                        type="button"
                                    >
                                        Сформировать акт
                                    </button>
                                </>
                            )}
                        </div>
                        <button
                            className="button"
                            onClick={closeModal}
                            type="button"
                        >
                            Закрыть
                        </button>
                    </footer>
                </div>
            </div>

            <div className={`modal ${isActModalOpen ? "is-active" : ""}`}>
                <div
                    className="modal-background"
                    onClick={closeActModal}
                    aria-hidden="true"
                />
                <div className="modal-card" style={{ width: "min(760px, 96vw)" }}>
                    <header className="modal-card-head">
                        <div>
                            <p className="modal-card-title">Формирование акта</p>
                            <p className="is-size-7 has-text-grey mt-2">
                                Номер формируется по шаблону:
                                регион/порядковый номер-буква-год
                            </p>
                        </div>
                        <button
                            className="delete"
                            aria-label="close"
                            onClick={closeActModal}
                            type="button"
                        />
                    </header>

                    <section className="modal-card-body">
                        {actModalError ? (
                            <p className="help is-danger mb-4">
                                {actModalError}
                            </p>
                        ) : null}

                        <div className="box has-background-light mb-5">
                            <p className="heading mb-2">Реквизиты акта</p>
                            <div className="columns is-variable is-3 mb-0">
                                <div className="column is-6">
                                    <p className="is-size-7 has-text-grey mb-1">
                                        Номер акта
                                    </p>
                                    <p
                                        className="title is-4 mb-0"
                                        style={{ wordBreak: "break-word" }}
                                    >
                                        {isActModalPreviewLoading
                                            ? "Формируется..."
                                            : visibleActModalNumber || "не задан"}
                                    </p>
                                </div>
                                <div className="column is-3">
                                    <p className="is-size-7 has-text-grey mb-1">
                                        Тип акта
                                    </p>
                                    <p className="subtitle is-6 mb-0">
                                        {getActTypeLabel(actForm.act_type)}
                                    </p>
                                </div>
                                <div className="column is-3">
                                    <p className="is-size-7 has-text-grey mb-1">
                                        Дата акта
                                    </p>
                                    <p className="subtitle is-6 mb-0">
                                        {formatDate(actForm.move_date || new Date())}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="columns is-multiline">
                            <div className="column is-6">
                                <label className="label">Тип акта</label>
                                <div className="select is-fullwidth">
                                    <select
                                        name="act_type"
                                        onChange={handleActFieldChange}
                                        value={actForm.act_type}
                                    >
                                        <option value="">Не выбран</option>
                                        <option value="expense">
                                            Акт расхода
                                        </option>
                                        <option value="income">
                                            Акт прихода
                                        </option>
                                    </select>
                                </div>
                            </div>

                            <div className="column is-6">
                                <label className="label">Режим</label>
                                <div className="select is-fullwidth">
                                    <select
                                        name="act_assignment_mode"
                                        onChange={handleActFieldChange}
                                        value={actForm.act_assignment_mode}
                                    >
                                        <option value="new">
                                            Сформировать новый акт
                                        </option>
                                        <option value="existing">
                                            Добавить в существующий акт
                                        </option>
                                        <option value="manual">
                                            Ввести вручную
                                        </option>
                                    </select>
                                </div>
                            </div>

                            <div className="column is-6">
                                <label className="label">Номер акта</label>
                                {actForm.act_assignment_mode === "existing" ? (
                                    <div className="select is-fullwidth">
                                        <select
                                            name="existing_act_number"
                                            onChange={handleActFieldChange}
                                            value={actForm.existing_act_number}
                                        >
                                            <option value="">Выберите акт</option>
                                            {filteredActModalOptions.map((item) => (
                                                <option
                                                    key={item.act_number}
                                                    value={item.act_number}
                                                >
                                                    {item.act_number} ({item.count} ед.)
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                ) : actForm.act_assignment_mode === "manual" ? (
                                    <input
                                        className="input"
                                        name="act_number"
                                        onChange={handleActFieldChange}
                                        value={actForm.act_number}
                                    />
                                ) : (
                                    <input
                                        className="input"
                                        value={
                                            isActModalPreviewLoading
                                                ? "Формируется номер акта..."
                                                : visibleActModalNumber ||
                                                  "Номер будет присвоен автоматически"
                                        }
                                        readOnly
                                    />
                                )}
                                <p className="help">
                                    Расход: 74/1-Р-26, приход: 56/1-П-26
                                </p>
                            </div>

                            <div className="column is-6">
                                <label className="label">Дата акта</label>
                                <input
                                    className="input"
                                    name="move_date"
                                    onChange={handleActFieldChange}
                                    type="datetime-local"
                                    value={actForm.move_date}
                                />
                            </div>

                            <div className="column is-6">
                                <label className="label">По какой заявке</label>
                                <input
                                    className="input"
                                    readOnly
                                    value={selectedItem?.request_number || ""}
                                />
                            </div>

                            <div className="column is-6">
                                <label className="label">Откуда</label>
                                <input
                                    className="input"
                                    readOnly
                                    value={selectedItem?.from_location || ""}
                                />
                            </div>
                        </div>
                    </section>

                    <footer className="modal-card-foot is-justify-content-space-between">
                        <div className="buttons">
                            <button
                                className={`button is-link ${
                                    isActSaving ? "is-loading" : ""
                                }`}
                                onClick={() => handleSaveAct(false)}
                                type="button"
                            >
                                Сохранить акт
                            </button>
                            <button
                                className={`button is-primary ${
                                    isActSaving ? "is-loading" : ""
                                }`}
                                onClick={() => handleSaveAct(true)}
                                type="button"
                            >
                                Сохранить и скачать Word
                            </button>
                        </div>
                        <button
                            className="button"
                            onClick={closeActModal}
                            type="button"
                        >
                            Закрыть
                        </button>
                    </footer>
                </div>
            </div>
        </section>
    );
}
