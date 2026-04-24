import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchWithAuth, getAuthHeaders, AUTH_USER_KEY } from "../utils/auth";
import { getApiUrl } from "../utils/api";
import {
    sortDeviceNames,
    sortDeviceSerials,
    sortDeviceTypes,
    sortKsa,
    sortRegions,
} from "../utils/sort";

const REQUEST_BASIS_OPTIONS = ["Дооснащение", "Ремонт тс"];

/**
 * Страница создания новой заявки на ремонт или дооснащение техники.
 *
 * @returns {JSX.Element} Форма создания заявки.
 */
export default function FormZayavki() {
    const navigate = useNavigate();
    const [reg, setReg] = useState([]);
    const [checkRegion, setCheckRegion] = useState("");
    const [ksa, setKsa] = useState([]);
    const [deviceTypes, setDeviceTypes] = useState([]);
    const [deviceNames, setDeviceNames] = useState([]);
    const [deviceSerials, setDeviceSerials] = useState([]);
    const [selectedDeviceTypeId, setSelectedDeviceTypeId] = useState("");
    const [selectedDeviceNameId, setSelectedDeviceNameId] = useState("");
    const [selectedDeviceName, setSelectedDeviceName] = useState("");
    const [selectedDeviceSerial, setSelectedDeviceSerial] = useState("");
    const [selectedRegion, setSelectedRegion] = useState({
        id: "",
        code: "",
    });
    const [selectedKsa, setSelectedKsa] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitMessage, setSubmitMessage] = useState("");
    const [showSuccessModal, setShowSuccessModal] = useState(false);
    const [successData, setSuccessData] = useState({
        deviceType: "",
        deviceSerial: "",
        ksa: "",
    });
    const apiUrl = getApiUrl();

    /**
     * Возвращает текстовое название типа устройства по его идентификатору.
     *
     * @param {string} typeId Идентификатор типа устройства.
     * @returns {string} Название типа устройства.
     */
    function getDeviceTypeLabel(typeId) {
        const match = deviceTypes.find(
            (item) =>
                String(item?.id_type || "").trim() ===
                String(typeId || "").trim(),
        );
        return String(match?.type || "").trim();
    }

    /**
     * Обновляет выбранный регион и сбрасывает зависящие от него поля.
     *
     * @param {React.ChangeEvent<HTMLSelectElement>} evt Событие изменения select.
     * @returns {void}
     */
    function checkReg(evt) {
        const selectedId = evt.target.value;
        const selectedOption = evt.target.options[evt.target.selectedIndex];
        const selectedCode = selectedOption?.getAttribute("data-reg") || "";

        setSelectedRegion({
            id: selectedId,
            code: selectedCode,
        });
        setCheckRegion(selectedId);
        setSelectedKsa("");
    }

    /**
     * Сохраняет выбранный идентификатор КСА.
     *
     * @param {React.ChangeEvent<HTMLSelectElement>} evt Событие изменения select.
     * @returns {void}
     */
    function checkKsa(evt) {
        setSelectedKsa(evt.target.value);
    }

    /**
     * Обновляет выбранный тип устройства и сбрасывает связанные поля.
     *
     * @param {React.ChangeEvent<HTMLSelectElement>} evt Событие изменения select.
     * @returns {void}
     */
    function checkDeviceType(evt) {
        setSelectedDeviceTypeId(evt.target.value);
        setSelectedDeviceNameId("");
        setSelectedDeviceName("");
        setSelectedDeviceSerial("");
        setDeviceSerials([]);
    }

    /**
     * Обновляет выбранное наименование устройства и пытается найти его идентификатор.
     *
     * @param {React.ChangeEvent<HTMLInputElement>} evt Событие изменения поля.
     * @returns {void}
     */
    function checkDeviceName(evt) {
        const nextNameValue = evt.target.value;
        const selectedItem = deviceNames.find(
            (item) =>
                String(item?.ts_naimenovanie || "")
                    .trim()
                    .toLowerCase() ===
                String(nextNameValue || "")
                    .trim()
                    .toLowerCase(),
        );

        setSelectedDeviceNameId(
            String(selectedItem?.id_naimenovanie || "").trim(),
        );
        setSelectedDeviceName(nextNameValue);
        setSelectedDeviceSerial("");
    }

    /**
     * Сохраняет введённый или выбранный серийный номер устройства.
     *
     * @param {React.ChangeEvent<HTMLInputElement>} evt Событие изменения поля.
     * @returns {void}
     */
    function checkDeviceSerial(evt) {
        setSelectedDeviceSerial(evt.target.value);
    }

    /**
     * Преобразует файл в data URL для отправки вместе с заявкой.
     *
     * @param {File} file Загружаемый файл.
     * @returns {Promise<string | ArrayBuffer | null>} Data URL содержимого файла.
     */
    function fileToDataUrl(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    /**
     * Формирует payload и отправляет заявку на сервер.
     *
     * @param {React.FormEvent<HTMLFormElement>} evt Событие отправки формы.
     * @returns {Promise<void>}
     */
    async function handleSubmit(evt) {
        evt.preventDefault();
        setSubmitMessage("");
        setIsSubmitting(true);

        try {
            const form = evt.currentTarget;
            const formData = new FormData(form);
            const photoFile = formData.get("device_photo");
            const selectedKsaItem = ksa.find(
                (item) => item.id_ksa === selectedKsa,
            );
            let photoPayload = null;

            if (photoFile && photoFile.size > 0) {
                const dataUrl = await fileToDataUrl(photoFile);
                photoPayload = {
                    file_name: photoFile.name,
                    mime_type: photoFile.type,
                    data_base64: dataUrl,
                };
            } else {
                photoPayload = {
                    file_name: "нету фото",
                    mime_type: "",
                    data_base64: "",
                };
            }

            // Получаем имя пользователя
            let createdBy = "-";
            try {
                const userStr = localStorage.getItem(AUTH_USER_KEY);
                if (userStr) {
                    const user = JSON.parse(userStr);
                    createdBy = user.login || user.name || "-";
                }
            } catch {}

            const payload = {
                region_id: selectedRegion.id,
                region_code: selectedRegion.code,
                ksa_id: selectedKsa,
                ksa_number: selectedKsaItem?.nomer_ksa || "",
                ksa_address:
                    selectedKsaItem?.ksa_adress ||
                    selectedKsaItem?.ksa_address ||
                    "",
                device_type: getDeviceTypeLabel(selectedDeviceTypeId),
                device_name: selectedDeviceName,
                device_serial: selectedDeviceSerial,
                request_basis: formData.get("request_basis"),
                device_issue: formData.get("device_issue"),
                contact_person: formData.get("contact_person"),
                urgency: formData.get("urgency"),
                device_photo: photoPayload,
                created_by: createdBy,
            };

            const response = await fetchWithAuth(`${apiUrl}/zayavki`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(payload),
            });

            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.message || "Ошибка отправки заявки");
            }

            const deviceTypeValue = getDeviceTypeLabel(selectedDeviceTypeId);
            setSuccessData({
                deviceType: deviceTypeValue,
                deviceSerial: selectedDeviceSerial,
                ksa:
                    selectedKsaItem?.nomer_ksa ||
                    selectedKsaItem?.ksa_naimenovanie ||
                    selectedKsa,
            });
            setShowSuccessModal(true);
            setSubmitMessage("Заявка успешно отправлена");
            form.reset();
            setCheckRegion("");
            setSelectedRegion({ id: "", code: "" });
            setSelectedKsa("");
            setKsa([]);
            setSelectedDeviceTypeId("");
            setSelectedDeviceNameId("");
            setSelectedDeviceName("");
            setSelectedDeviceSerial("");
            setDeviceNames([]);
            setDeviceSerials([]);
            navigate("/zayavki/all");
        } catch (error) {
            setSubmitMessage(error.message || "Ошибка отправки заявки");
        } finally {
            setIsSubmitting(false);
        }
    }

    useEffect(() => {
        async function getDeviceTypes() {
            try {
                const response = await fetch(`${apiUrl}/device-types`, {
                    method: "GET",
                    headers: {
                        ...getAuthHeaders(),
                    },
                });

                if (response.ok) {
                    const typeData = await response.json();
                    setDeviceTypes(
                        Array.isArray(typeData)
                            ? sortDeviceTypes(typeData)
                            : [],
                    );
                } else {
                    setDeviceTypes([]);
                }
            } catch (error) {
                setDeviceTypes([]);
                console.error("Error details:", error);
            }
        }

        async function getRegion() {
            try {
                const response = await fetch(`${apiUrl}/region`, {
                    method: "GET",
                    headers: {
                        ...getAuthHeaders(),
                    },
                });

                if (response.ok) {
                    const region = await response.json();
                    setReg(Array.isArray(region) ? sortRegions(region) : []);
                }
            } catch (error) {
                console.error("Error details:", error);
            }
        }

        getDeviceTypes();
        getRegion();
    }, [apiUrl]);

    useEffect(() => {
        async function getDeviceNamesByType() {
            if (!selectedDeviceTypeId) {
                setDeviceNames([]);
                setSelectedDeviceNameId("");
                setSelectedDeviceName("");
                setDeviceSerials([]);
                setSelectedDeviceSerial("");
                return;
            }

            try {
                const response = await fetch(
                    `${apiUrl}/device-names?typeId=${encodeURIComponent(selectedDeviceTypeId)}`,
                    {
                        method: "GET",
                        headers: {
                            ...getAuthHeaders(),
                        },
                    },
                );

                if (response.ok) {
                    const nameData = await response.json();
                    setDeviceNames(
                        Array.isArray(nameData)
                            ? sortDeviceNames(nameData)
                            : [],
                    );
                } else {
                    setDeviceNames([]);
                }
            } catch (error) {
                setDeviceNames([]);
                console.error("Error details:", error);
            }
        }

        getDeviceNamesByType();
    }, [apiUrl, selectedDeviceTypeId]);

    useEffect(() => {
        async function getDeviceSerialsByName() {
            if (!selectedDeviceNameId) {
                setDeviceSerials([]);
                setSelectedDeviceSerial("");
                return;
            }

            try {
                const response = await fetch(
                    `${apiUrl}/device-serials?nameId=${encodeURIComponent(selectedDeviceNameId)}`,
                    {
                        method: "GET",
                        headers: {
                            ...getAuthHeaders(),
                        },
                    },
                );

                if (response.ok) {
                    const serialData = await response.json();
                    setDeviceSerials(
                        Array.isArray(serialData)
                            ? sortDeviceSerials(serialData)
                            : [],
                    );
                } else {
                    setDeviceSerials([]);
                }
            } catch (error) {
                setDeviceSerials([]);
                console.error("Error details:", error);
            }
        }

        getDeviceSerialsByName();
    }, [apiUrl, selectedDeviceNameId]);

    useEffect(() => {
        async function getKsaByRegion() {
            if (!selectedRegion.id && !selectedRegion.code) {
                setKsa([]);
                return;
            }

            try {
                console.log("[FormZayavki] fetch /ksa with:", {
                    regId: selectedRegion.id,
                    regCode: selectedRegion.code,
                });

                const response = await fetch(
                    `${apiUrl}/ksa?regId=${encodeURIComponent(
                        selectedRegion.id,
                    )}&regCode=${encodeURIComponent(selectedRegion.code)}`,
                    {
                        method: "GET",
                        headers: {
                            ...getAuthHeaders(),
                        },
                    },
                );

                if (response.ok) {
                    const ksaData = await response.json();
                    setKsa(Array.isArray(ksaData) ? sortKsa(ksaData) : []);
                    console.log(
                        "[FormZayavki] /ksa response count:",
                        ksaData.length,
                    );
                }
            } catch (error) {
                console.error("Error details:", error);
            }
        }

        getKsaByRegion();
    }, [apiUrl, selectedRegion]);

    return (
        <section className="container form-zayavki-page">
            <form
                action="#"
                method="post"
                encType="multipart/form-data"
                onSubmit={handleSubmit}
            >
                <div className="fixed-grid has-1-cols z-form-grid">
                    <div className="grid">
                        <div className="field">
                            <label className="label">Регион</label>
                            <div className="control">
                                <div className="select">
                                    <select
                                        name="region_id"
                                        onChange={checkReg}
                                        value={checkRegion}
                                        required
                                    >
                                        <option value="">Выбрать регион</option>
                                        {reg.map((item) => (
                                            <option
                                                key={item.id_reg}
                                                value={item.id_reg}
                                                data-reg={item.reg}
                                            >
                                                {item.reg_naimenovanie}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>
                        <div className="field">
                            <label className="label">КСА</label>
                            <div className="control">
                                <div className="select">
                                    <select
                                        name="ksa_id"
                                        onChange={checkKsa}
                                        value={selectedKsa}
                                        disabled={
                                            !selectedRegion.id &&
                                            !selectedRegion.code
                                        }
                                        required
                                    >
                                        <option value="">
                                            {selectedRegion.id ||
                                            selectedRegion.code
                                                ? "Выбрать КСА"
                                                : "Сначала выберите регион"}
                                        </option>
                                        {ksa.map((item) => (
                                            <option
                                                key={item.id_ksa}
                                                value={item.id_ksa}
                                            >
                                                {item.nomer_ksa}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="grid">
                        <div className="field">
                            <label className="label">Тип устройства</label>
                            <div className="control">
                                <div className="select">
                                    <select
                                        name="device_type"
                                        required
                                        value={selectedDeviceTypeId}
                                        onChange={checkDeviceType}
                                    >
                                        <option value="">
                                            Выбрать тип устройства
                                        </option>
                                        {deviceTypes.map((item) => {
                                            const typeId = String(
                                                item?.id_type || "",
                                            ).trim();
                                            const typeValue = String(
                                                item?.type || "",
                                            ).trim();
                                            if (!typeId || !typeValue)
                                                return null;

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
                                    name="device_name"
                                    list="device-name-suggestions"
                                    required
                                    value={selectedDeviceName}
                                    onChange={checkDeviceName}
                                    disabled={!selectedDeviceTypeId}
                                    placeholder={
                                        selectedDeviceTypeId
                                            ? "Введите или выберите наименование"
                                            : "Сначала выберите тип устройства"
                                    }
                                    autoComplete="off"
                                />
                                <datalist id="device-name-suggestions">
                                    {deviceNames.map((item) => {
                                        const nameValue = String(
                                            item?.ts_naimenovanie || "",
                                        ).trim();
                                        if (!nameValue) return null;

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
                            <label className="label">
                                Сериийный номер устройства
                            </label>
                            <div className="control">
                                <input
                                    className="input"
                                    type="text"
                                    name="device_serial"
                                    list="device-serial-suggestions"
                                    required
                                    value={selectedDeviceSerial}
                                    onChange={checkDeviceSerial}
                                    disabled={!selectedDeviceNameId}
                                    placeholder={
                                        selectedDeviceNameId
                                            ? "Введите или выберите серийный номер"
                                            : "Сначала выберите наименование"
                                    }
                                    autoComplete="off"
                                />
                                <datalist id="device-serial-suggestions">
                                    {deviceSerials.map((item) => {
                                        const serialValue = String(
                                            item?.serial_number || "",
                                        ).trim();
                                        if (!serialValue) return null;

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
                    </div>
                    <div className="grid">
                        <div className="field">
                            <label className="label">Фото устройства</label>
                            <div className="control">
                                <input
                                    className="input"
                                    type="file"
                                    name="device_photo"
                                    accept="image/*"
                                />
                            </div>
                        </div>
                        <div className="field">
                            <label className="label">Основание заявки</label>
                            <div className="control">
                                <div className="select">
                                    <select
                                        name="request_basis"
                                        required
                                        defaultValue=""
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
                                <div className="select">
                                    <select
                                        name="urgency"
                                        required
                                        defaultValue=""
                                    >
                                        <option value="">
                                            Выбрать срочность
                                        </option>
                                        <option value="urgent">Срочно</option>
                                        <option value="not_urgent">
                                            Не срочно
                                        </option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="grid">
                        {" "}
                        <div className="field">
                            <label className="label">
                                Описание неисправности устройства
                            </label>
                            <div className="control">
                                <textarea
                                    className="textarea"
                                    name="device_issue"
                                    placeholder="Опишите проблему"
                                    rows="4"
                                    required
                                />
                            </div>
                        </div>
                        <div className="field">
                            <label className="label">
                                Контактное лицо для обращения
                            </label>
                            <div className="control">
                                <input
                                    className="input"
                                    type="text"
                                    name="contact_person"
                                    placeholder="ФИО и телефон"
                                    required
                                />
                            </div>
                        </div>
                        <div className="field">
                            <div className="control">
                                <button
                                    className={`button is-link ${
                                        isSubmitting ? "is-loading" : ""
                                    }`}
                                    type="submit"
                                    disabled={isSubmitting}
                                >
                                    Отправить заявку
                                </button>
                            </div>
                            {submitMessage ? (
                                <p className="help is-info">{submitMessage}</p>
                            ) : null}
                        </div>
                    </div>
                </div>
            </form>
            <div className={`modal ${showSuccessModal ? "is-active" : ""}`}>
                <div
                    className="modal-background"
                    onClick={() => setShowSuccessModal(false)}
                />
                <div className="modal-card z-success-modal">
                    <header className="modal-card-head">
                        <p className="modal-card-title">Заявка добавлена</p>
                        <button
                            className="delete"
                            aria-label="close"
                            type="button"
                            onClick={() => setShowSuccessModal(false)}
                        />
                    </header>
                    <section className="modal-card-body">
                        <p>
                            <strong>Серийный номер:</strong>{" "}
                            {successData.deviceSerial}
                        </p>
                        <p>
                            <strong>Тип устройства:</strong>{" "}
                            {successData.deviceType}
                        </p>
                        <p>
                            <strong>КСА:</strong> {successData.ksa}
                        </p>
                    </section>
                    <footer className="modal-card-foot">
                        <button
                            className="button is-success"
                            type="button"
                            onClick={() => setShowSuccessModal(false)}
                        >
                            Ок
                        </button>
                    </footer>
                </div>
            </div>
        </section>
    );
}

//TODO:- [x]  добавить при добавление решения в заявки информацию о том кто добавил решение (фио и должность) и дату добавления решения
//FIXME: -  добавить при решение заявки информацию для отгрузки оборудования и информацию кто отгрузил оборудования куда отгрузил и дату отгрузки
//FIXME: - перенсти иконки редактирования удаления и просмотр в модалку по клику по строке



