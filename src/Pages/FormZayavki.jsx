import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchWithAuth, getAuthHeaders, AUTH_USER_KEY } from "../utils/auth";

export default function FormZayavki() {
    const navigate = useNavigate();
    const [reg, setReg] = useState([]);
    const [checkRegion, setCheckRegion] = useState("");
    const [ksa, setKsa] = useState([]);
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
    const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:3002";
    const deviceTypeLabels = {
        terminal: "Терминал",
        printer: "Принтер",
        scanner: "Сканер",
        pc: "ПК",
        other: "Другое",
    };

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

    function checkKsa(evt) {
        setSelectedKsa(evt.target.value);
    }

    function fileToDataUrl(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

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
                ksa_address:
                    selectedKsaItem?.ksa_adress ||
                    selectedKsaItem?.ksa_address ||
                    "",
                device_type: formData.get("device_type"),
                device_name: formData.get("device_name"),
                device_serial: formData.get("device_serial"),
                device_issue: formData.get("device_issue"),
                contact_person: formData.get("contact_person"),
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

            const deviceTypeValue = formData.get("device_type");
            setSuccessData({
                deviceType:
                    deviceTypeLabels[deviceTypeValue] || deviceTypeValue,
                deviceSerial: formData.get("device_serial"),
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
            navigate("/zayavki/all");
        } catch (error) {
            setSubmitMessage(error.message || "Ошибка отправки заявки");
        } finally {
            setIsSubmitting(false);
        }
    }

    useEffect(() => {
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
                    setReg(region);
                }
            } catch (error) {
                console.error("Error details:", error);
            }
        }

        getRegion();
    }, [apiUrl]);

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
                    setKsa(ksaData);
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
                                    <select name="device_type" required>
                                        <option value="">
                                            Выбрать тип устройства
                                        </option>
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
                                    name="device_name"
                                    placeholder="Введите наименование"
                                    required
                                />
                            </div>
                        </div>
                        <div className="field">
                            <label className="label">
                                Серийный номер устройства
                            </label>
                            <div className="control">
                                <input
                                    className="input"
                                    type="text"
                                    name="device_serial"
                                    placeholder="Введите серийный номер"
                                    required
                                />
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
                <div className="modal-card">
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

// TODO:- [ ]  добавить при добавление решения в заявки информацию о том кто добавил решение (фио и должность) и дату добавления решения

//TODO!- [ ]  добавить при добавление решения в заявки информацию о том кто добавил решение (фио и должность) и дату добавления решения
//TODO! -  добавить при решение заявки информацию для отгрузки оборудования и информацию кто отгрузил оборудования куда отгрузил и дату отгрузки
