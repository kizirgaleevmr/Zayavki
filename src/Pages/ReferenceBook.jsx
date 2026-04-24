import { useEffect, useMemo, useState } from "react";
import { fetchWithAuth } from "../utils/auth";
import { getApiUrl } from "../utils/api";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

function normalizeValue(value) {
    return String(value || "").trim();
}

function buildSearchText(item) {
    return [
        item?.id_ksa,
        item?.reg_id,
        item?.reg,
        item?.nomer_ksa,
        item?.ksa_naimenovanie,
        item?.ksa_adress,
        item?.work_phone,
    ]
        .map((value) => normalizeValue(value).toLowerCase())
        .join(" ");
}

function getPageNumbers(currentPage, totalPages) {
    if (totalPages <= 1) return [1];

    const pages = new Set([1, totalPages, currentPage]);

    for (let page = currentPage - 1; page <= currentPage + 1; page += 1) {
        if (page > 1 && page < totalPages) {
            pages.add(page);
        }
    }

    return Array.from(pages).sort((a, b) => a - b);
}

export default function ReferenceBook() {
    const apiUrl = getApiUrl();
    const [items, setItems] = useState([]);
    const [regions, setRegions] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState("");
    const [search, setSearch] = useState("");
    const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0]);
    const [page, setPage] = useState(1);

    useEffect(() => {
        async function loadKsa() {
            try {
                setIsLoading(true);
                setError("");

                const [ksaResponse, regionResponse] = await Promise.all([
                    fetchWithAuth(`${apiUrl}/ksa`, {
                        method: "GET",
                    }),
                    fetchWithAuth(`${apiUrl}/region`, {
                        method: "GET",
                    }),
                ]);

                if (!ksaResponse.ok) {
                    let message = "Не удалось получить справочник КСА";
                    try {
                        const errorBody = await ksaResponse.json();
                        if (errorBody?.message) {
                            message = errorBody.message;
                        }
                    } catch {
                        // ignore parse error
                    }
                    throw new Error(message);
                }

                if (!regionResponse.ok) {
                    let message = "Не удалось получить справочник регионов";
                    try {
                        const errorBody = await regionResponse.json();
                        if (errorBody?.message) {
                            message = errorBody.message;
                        }
                    } catch {
                        // ignore parse error
                    }
                    throw new Error(message);
                }

                const [ksaData, regionData] = await Promise.all([
                    ksaResponse.json(),
                    regionResponse.json(),
                ]);
                setItems(Array.isArray(ksaData) ? ksaData : []);
                setRegions(Array.isArray(regionData) ? regionData : []);
            } catch (loadError) {
                setError(
                    loadError.message ||
                        "Ошибка загрузки справочника КСА и регионов",
                );
                setItems([]);
                setRegions([]);
            } finally {
                setIsLoading(false);
            }
        }

        loadKsa();
    }, [apiUrl]);

    const regionNumberById = useMemo(() => {
        const map = new Map();

        regions.forEach((regionItem) => {
            const regionId = normalizeValue(regionItem?.id_reg);
            const regionNumber =
                normalizeValue(regionItem?.reg) ||
                normalizeValue(regionItem?.id_reg);

            if (regionId) {
                map.set(regionId, regionNumber || "-");
            }
        });

        return map;
    }, [regions]);

    const filteredItems = useMemo(() => {
        const query = normalizeValue(search).toLowerCase();
        if (!query) {
            return items;
        }

        return items.filter((item) => buildSearchText(item).includes(query));
    }, [items, search]);

    const totalPages = Math.max(
        1,
        Math.ceil(filteredItems.length / Math.max(pageSize, 1)),
    );
    const safePage = Math.min(page, totalPages);
    const startIndex = (safePage - 1) * pageSize;
    const endIndex = startIndex + pageSize;

    const paginatedItems = useMemo(
        () => filteredItems.slice(startIndex, endIndex),
        [endIndex, filteredItems, startIndex],
    );

    const visibleFrom = filteredItems.length === 0 ? 0 : startIndex + 1;
    const visibleTo = Math.min(endIndex, filteredItems.length);
    const pageNumbers = getPageNumbers(safePage, totalPages);

    useEffect(() => {
        setPage(1);
    }, [search, pageSize]);

    useEffect(() => {
        if (page > totalPages) {
            setPage(totalPages);
        }
    }, [page, totalPages]);

    return (
        <section className="container reference-book-page">
            <div className="box">
                <div className="is-flex is-justify-content-space-between is-align-items-flex-end is-flex-wrap-wrap mb-4 reference-book-toolbar">
                    <div>
                        <h1 className="title is-4 mb-2">Справочник КСА</h1>
                        <p className="has-text-grey">
                            Найдено записей: {filteredItems.length}
                        </p>
                    </div>

                    <div className="field is-grouped is-grouped-multiline mb-0">
                        <div className="control">
                            <input
                                className="input"
                                type="text"
                                placeholder="Поиск по номеру, адресу, названию, телефону"
                                value={search}
                                onChange={(event) =>
                                    setSearch(event.target.value)
                                }
                                style={{ minWidth: "320px", maxWidth: "100%" }}
                            />
                        </div>
                        <div className="control">
                            <div className="select">
                                <select
                                    value={pageSize}
                                    onChange={(event) =>
                                        setPageSize(Number(event.target.value))
                                    }
                                >
                                    {PAGE_SIZE_OPTIONS.map((option) => (
                                        <option key={option} value={option}>
                                            {option} на странице
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>
                </div>

                {error ? <p className="help is-danger mb-4">{error}</p> : null}

                {isLoading ? (
                    <p>Загрузка...</p>
                ) : filteredItems.length === 0 ? (
                    <p>По вашему запросу записи КСА не найдены.</p>
                ) : (
                    <>
                        <div className="table-container reference-book-table-container">
                            <table className="table is-fullwidth is-striped is-hoverable reference-book-table">
                                <thead>
                                    <tr>
                                        <th>№</th>
                                        <th>Регион</th>
                                        <th>Номер КСА</th>
                                        <th>Наименование</th>
                                        <th>Адрес</th>
                                        <th>Телефон</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginatedItems.map((item, index) => (
                                        <tr
                                            key={
                                                item._id ||
                                                item.id_ksa ||
                                                `${item.nomer_ksa}-${index}`
                                            }
                                        >
                                            <td>{startIndex + index + 1}</td>
                                            <td>
                                                {regionNumberById.get(
                                                    normalizeValue(
                                                        item.reg_id ||
                                                            item.id_reg ||
                                                            item.reg,
                                                    ),
                                                ) ||
                                                    item.reg ||
                                                    item.reg_id ||
                                                    "-"}
                                            </td>
                                            <td>{item.nomer_ksa || "-"}</td>
                                            <td>
                                                {item.ksa_naimenovanie || "-"}
                                            </td>
                                            <td>{item.ksa_adress || "-"}</td>
                                            <td>{item.work_phone || "-"}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="is-flex is-justify-content-space-between is-align-items-center is-flex-wrap-wrap mt-4" style={{ gap: "12px" }}>
                            <p className="has-text-grey mb-0">
                                Показано {visibleFrom}-{visibleTo} из{" "}
                                {filteredItems.length}
                            </p>

                            <div className="buttons are-small mb-0">
                                <button
                                    type="button"
                                    className="button"
                                    disabled={safePage <= 1}
                                    onClick={() => setPage((prev) => prev - 1)}
                                >
                                    Назад
                                </button>

                                {pageNumbers.map((pageNumber, index) => {
                                    const previousPage = pageNumbers[index - 1];
                                    const shouldShowGap =
                                        previousPage &&
                                        pageNumber - previousPage > 1;

                                    return (
                                        <span
                                            key={`page-${pageNumber}`}
                                            className="is-flex is-align-items-center"
                                        >
                                            {shouldShowGap ? (
                                                <span className="px-2">...</span>
                                            ) : null}
                                            <button
                                                type="button"
                                                className={`button ${
                                                    safePage === pageNumber
                                                        ? "is-link"
                                                        : ""
                                                }`}
                                                onClick={() =>
                                                    setPage(pageNumber)
                                                }
                                            >
                                                {pageNumber}
                                            </button>
                                        </span>
                                    );
                                })}

                                <button
                                    type="button"
                                    className="button"
                                    disabled={safePage >= totalPages}
                                    onClick={() => setPage((prev) => prev + 1)}
                                >
                                    Вперед
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </section>
    );
}
