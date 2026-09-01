import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import crypto from "crypto";
import dotenv from "dotenv";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: resolve(__dirname, "../../.env") });
dotenv.config({ path: resolve(__dirname, "config.env") });

const Schema = mongoose.Schema;
const app = express();
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));

const PORT = Number(process.env.PORT) || 3002;
const SERVER_HOST = process.env.SERVER_HOST || "0.0.0.0";
const DEFAULT_DB_NAME = "zayavki";
const MONGO_URI_RAW = process.env.ATLAS_URI || "mongodb://localhost:27017/";
const FALLBACK_LOCAL_URI = "mongodb://localhost:27017/";
const MONGO_CONNECT_OPTIONS = {
    serverSelectionTimeoutMS: 5000,
};
const REQUEST_BASIS_OPTIONS = ["Дооснащение", "Ремонт тс"];
const DECISION_KIND_OPTIONS = ["supplement", "repair_on_site", "replacement"];
const MOVE_TS_ACT_TYPE_OPTIONS = ["expense", "income"];

/**
 * Добавляет имя базы данных в Mongo URI, если оно отсутствует в строке подключения.
 *
 * @param {string} uri Исходная строка подключения MongoDB.
 * @param {string} dbName Имя базы данных по умолчанию.
 * @returns {string} Нормализованная строка подключения.
 */
function ensureMongoDbName(uri, dbName) {
    if (/^mongodb(\+srv)?:\/\/[^/]+\/[^?]+/.test(uri)) {
        return uri;
    }

    const [base, query] = String(uri).split("?");
    const baseNoSlash = base.endsWith("/") ? base.slice(0, -1) : base;
    return query
        ? `${baseNoSlash}/${dbName}?${query}`
        : `${baseNoSlash}/${dbName}`;
}

const MONGO_URI = ensureMongoDbName(MONGO_URI_RAW, DEFAULT_DB_NAME);
const rawClientOrigin = process.env.CLIENT_ORIGIN || "";
const allowedOrigins = rawClientOrigin
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

/**
 * Проверяет, относится ли origin к разрешённым локальным dev-адресам.
 *
 * @param {string} origin Origin входящего запроса.
 * @returns {boolean} `true`, если origin считается безопасным для разработки.
 */
function isAllowedDevOrigin(origin) {
    return /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$/.test(
        origin,
    );
}

app.use(
    cors({
        origin: (origin, callback) => {
            if (!origin) return callback(null, true);
            if (
                allowedOrigins.length === 0 ||
                allowedOrigins.includes(origin) ||
                isAllowedDevOrigin(origin)
            ) {
                return callback(null, true);
            }
            return callback(new Error(`CORS blocked for origin: ${origin}`));
        },
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
    }),
);

const AUTH_LOGIN = process.env.AUTH_LOGIN || "admin";
const AUTH_PASSWORD = process.env.AUTH_PASSWORD || "123456";
const authTokens = new Set();

/**
 * Генерирует случайный токен авторизации.
 *
 * @returns {string} Новый токен.
 */
function createToken() {
    return crypto.randomBytes(32).toString("hex");
}

/**
 * Проверяет bearer-токен и блокирует доступ к защищённым маршрутам без авторизации.
 *
 * @param {import("express").Request} req HTTP-запрос.
 * @param {import("express").Response} res HTTP-ответ.
 * @param {import("express").NextFunction} next Следующий middleware.
 * @returns {void | import("express").Response}
 */
function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization || "";
    const [scheme, token] = authHeader.split(" ");

    if (scheme !== "Bearer" || !token || !authTokens.has(token)) {
        return res.status(401).json({
            message: "Требуется авторизация",
        });
    }

    req.authToken = token;
    return next();
}

const regScheme = new Schema({
    id_reg: { type: String },
    reg: { type: String },
    reg_naimenovanie: { type: String },
});

const ksaScheme = new Schema({
    id_ksa: { type: String },
    reg_id: { type: String },
    nomer_ksa: { type: String },
    ksa_naimenovanie: { type: String },
    ksa_adress: { type: String },
    work_phone: { type: String },
});

const deviceTypeScheme = new Schema(
    {
        id_type: { type: String },
        type: { type: String },
    },
    { collection: "type_ustroistva" },
);

const deviceNameScheme = new Schema(
    {
        id_naimenovanie: { type: String },
        type_id: { type: String },
        ts_naimenovanie: { type: String },
    },
    { collection: "ts_naimenovanie" },
);

const deviceItemScheme = new Schema(
    {
        id_ts: { type: String },
        type_id: { type: String },
        ts_naimenovanie_id: { type: String },
        inv_number: { type: String },
        serial_number: { type: String },
        quantity: { type: String },
        price: { type: String },
        state_id: { type: String },
        status: { type: String },
        comment: { type: String },
        date_shoping: { type: String },
    },
    { collection: "oborudovanie" },
);

const moveTsScheme = new Schema(
    {
        request_number: { type: String, required: true },
        act_number: { type: String, default: "" },
        act_type: {
            type: String,
            enum: [...MOVE_TS_ACT_TYPE_OPTIONS, ""],
            default: "",
        },
        move_date: { type: Date, default: Date.now },
        status: { type: String, default: "на отправку" },
        delivery_method: { type: String, default: "" },
        request_basis: {
            type: String,
            enum: [...REQUEST_BASIS_OPTIONS, ""],
            default: "",
        },
        note: { type: String, default: "-" },
        device_type: { type: String, default: "" },
        device_name: { type: String, default: "" },
        device_serial: { type: String, default: "" },
        inv_number: { type: String, default: "" },
        from_location: { type: String, default: "СЦ БТИ" },
        to_location: { type: String, default: "" },
        quantity: { type: Number, default: 1 },
    },
    { collection: "move_ts", timestamps: true },
);

const zayavkaScheme = new Schema(
    {
        request_number: { type: String, required: true, unique: true },
        region_id: { type: String, required: true },
        region_code: { type: String },
        ksa_id: { type: String, required: true },
        ksa_address: { type: String },
        device_type: { type: String, required: true },
        device_name: { type: String, required: true },
        device_serial: { type: String, required: true },
        request_basis: {
            type: String,
            enum: REQUEST_BASIS_OPTIONS,
            required: true,
        },
        decision_kind: {
            type: String,
            enum: [...DECISION_KIND_OPTIONS, ""],
            default: "",
        },
        device_issue: { type: String, required: true },
        contact_person: { type: String, required: true },
        urgency: {
            type: String,
            enum: ["urgent", "not_urgent"],
            default: "not_urgent",
        },
        decision: { type: String, default: "" },
        decision_date: { type: Date, default: null },
        repair_description: { type: String, default: "" },
        replacement_device_type: { type: String, default: "" },
        replacement_device_name: { type: String, default: "" },
        replacement_device_serial: { type: String, default: "" },
        replacement_inv_number: { type: String, default: "" },
        device_photo: {
            file_name: { type: String },
            mime_type: { type: String },
            data_base64: { type: String },
        },
        created_by: { type: String, default: "-" },
    },
    { timestamps: true },
);

const Ksa = mongoose.model("ksa", ksaScheme);
const Region = mongoose.model("region", regScheme);
const DeviceType = mongoose.model(
    "type_ustroistva",
    deviceTypeScheme,
    "type_ustroistva",
);
const DeviceName = mongoose.model(
    "ts_naimenovanie",
    deviceNameScheme,
    "ts_naimenovanie",
);
const DeviceItem = mongoose.model(
    "oborudovanie",
    deviceItemScheme,
    "oborudovanie",
);
const MoveTs = mongoose.model("move_ts", moveTsScheme, "move_ts");
const Zayavka = mongoose.model("zayavka", zayavkaScheme);

/**
 * Формирует номер заявки в виде `YYYYMMDD######`.
 *
 * @param {string | number | Date} date Дата создания заявки.
 * @param {number} sequenceNumber Порядковый номер в последовательности.
 * @returns {string} Сформированный номер заявки.
 */
function formatRequestNumber(date, sequenceNumber) {
    const valueDate = date instanceof Date ? date : new Date(date);
    const year = valueDate.getFullYear();
    const month = String(valueDate.getMonth() + 1).padStart(2, "0");
    const day = String(valueDate.getDate()).padStart(2, "0");
    const sequence = String(sequenceNumber).padStart(6, "0");

    return `${year}${month}${day}${sequence}`;
}

/**
 * Извлекает числовую последовательность из номера заявки.
 *
 * @param {unknown} requestNumber Номер заявки.
 * @returns {number} Порядковый номер или `0`, если распознать не удалось.
 */
function parseRequestSequence(requestNumber) {
    const normalized = String(requestNumber || "").trim();
    const match = normalized.match(/(\d{6})$/);
    return match ? Number(match[1]) : 0;
}

/**
 * Возвращает максимальный порядковый номер среди существующих заявок.
 *
 * @returns {Promise<number>} Максимальный номер последовательности.
 */
async function getMaxRequestSequenceSafe() {
    const zayavki = await fetchZayavkiSafe();

    return zayavki.reduce((maxSequence, item) => {
        const nextSequence = parseRequestSequence(item?.request_number);
        return Math.max(maxSequence, nextSequence);
    }, 0);
}

/**
 * Генерирует следующий номер заявки для указанной даты.
 *
 * @param {string | number | Date} date Дата новой заявки.
 * @returns {Promise<string>} Следующий номер заявки.
 */
async function getNextRequestNumber(date) {
    const valueDate = date instanceof Date ? date : new Date(date);
    const nextSequenceNumber = (await getMaxRequestSequenceSafe()) + 1;
    return formatRequestNumber(valueDate, nextSequenceNumber);
}

/**
 * Безопасно получает список регионов из основной или резервной коллекции.
 *
 * @returns {Promise<Record<string, any>[]>} Список регионов.
 */
async function fetchRegionsSafe() {
    const regions = await Region.find({});
    if (regions.length > 0) return regions;

    const db = mongoose.connection.db;
    const fromRegion = await db.collection("region").find({}).toArray();
    if (fromRegion.length > 0) return fromRegion;

    return db.collection("regions").find({}).toArray();
}

/**
 * Безопасно получает список КСА с учётом доступных коллекций.
 *
 * @param {Record<string, any>} [filter={}] Фильтр MongoDB.
 * @returns {Promise<Record<string, any>[]>} Список КСА.
 */
async function fetchKsaSafe(filter = {}) {
    const ksa = await Ksa.find(filter);
    if (ksa.length > 0) return ksa;

    const db = mongoose.connection.db;
    const fromKsa = await db.collection("ksa").find(filter).toArray();
    if (fromKsa.length > 0) return fromKsa;

    return db.collection("ksas").find(filter).toArray();
}

/**
 * Получает список типов устройств из основной или совместимой коллекции.
 *
 * @returns {Promise<Record<string, any>[]>} Список типов устройств.
 */
async function fetchDeviceTypesSafe() {
    const fromModel = await DeviceType.find({}).sort({ id_type: 1 }).lean();
    if (fromModel.length > 0) return fromModel;

    const db = mongoose.connection.db;
    const candidates = ["type_ustroistva", "type_ustroystva", "device_types"];

    for (const collectionName of candidates) {
        const deviceTypes = await db
            .collection(collectionName)
            .find({})
            .sort({ id_type: 1 })
            .toArray();
        if (deviceTypes.length > 0) {
            return deviceTypes;
        }
    }

    return [];
}

/**
 * Получает список наименований устройств по типу.
 *
 * @param {unknown} typeId Идентификатор типа устройства.
 * @returns {Promise<Record<string, any>[]>} Список наименований устройств.
 */
async function fetchDeviceNamesSafe(typeId) {
    const normalizedTypeId = String(typeId || "").trim();
    if (!normalizedTypeId) return [];

    const variants = new Set([normalizedTypeId]);
    const numeric = Number(normalizedTypeId);
    if (!Number.isNaN(numeric)) {
        variants.add(String(numeric));
    }

    const filter = { type_id: { $in: Array.from(variants) } };
    const fromModel = await DeviceName.find(filter)
        .sort({ ts_naimenovanie: 1 })
        .lean();
    if (fromModel.length > 0) return fromModel;

    const db = mongoose.connection.db;
    const candidates = ["ts_naimenovanie", "device_names"];

    for (const collectionName of candidates) {
        const deviceNames = await db
            .collection(collectionName)
            .find(filter)
            .sort({ ts_naimenovanie: 1 })
            .toArray();
        if (deviceNames.length > 0) {
            return deviceNames;
        }
    }

    return [];
}

/**
 * Получает список серийных номеров устройств по идентификатору наименования.
 *
 * @param {unknown} nameId Идентификатор наименования устройства.
 * @returns {Promise<Record<string, any>[]>} Список устройств/серийных номеров.
 */
async function fetchDeviceSerialsSafe(nameId) {
    const normalizedNameId = String(nameId || "").trim();
    if (!normalizedNameId) return [];

    const variants = new Set([normalizedNameId]);
    const numeric = Number(normalizedNameId);
    if (!Number.isNaN(numeric)) {
        variants.add(String(numeric));
    }

    const filter = { ts_naimenovanie_id: { $in: Array.from(variants) } };
    const fromModel = await DeviceItem.find(filter)
        .sort({ serial_number: 1 })
        .lean();
    if (fromModel.length > 0) return fromModel;

    const db = mongoose.connection.db;
    const candidates = ["oborudovanie", "equipment"];

    for (const collectionName of candidates) {
        const deviceItems = await db
            .collection(collectionName)
            .find(filter)
            .sort({ serial_number: 1 })
            .toArray();
        if (deviceItems.length > 0) {
            return deviceItems;
        }
    }

    return [];
}

/**
 * Ищет устройство по серийному номеру в основной или резервной коллекции.
 *
 * @param {unknown} serialNumber Серийный номер устройства.
 * @returns {Promise<Record<string, any> | null>} Найденное устройство или `null`.
 */
async function findDeviceItemBySerialSafe(serialNumber) {
    const normalizedSerial = String(serialNumber || "").trim();
    if (!normalizedSerial) return null;

    const variants = Array.from(new Set([normalizedSerial]));
    const fromModel = await DeviceItem.findOne({
        serial_number: { $in: variants },
    }).lean();
    if (fromModel) return fromModel;

    const db = mongoose.connection.db;
    const candidates = ["oborudovanie", "equipment"];

    for (const collectionName of candidates) {
        const item = await db.collection(collectionName).findOne({
            serial_number: { $in: variants },
        });
        if (item) {
            return item;
        }
    }

    return null;
}

/**
 * Получает список движений техники и обогащает их основанием заявки.
 *
 * @returns {Promise<Record<string, any>[]>} Список перемещений техники.
 */
async function fetchMoveTsSafe() {
    const fromModel = await MoveTs.find({})
        .sort({ move_date: -1, createdAt: -1 })
        .lean();
    if (fromModel.length > 0) {
        return enrichMoveTsItemsWithRequestBasis(fromModel);
    }

    const db = mongoose.connection.db;
    const candidates = ["move_ts", "movee_ts"];

    for (const collectionName of candidates) {
        const docs = await db
            .collection(collectionName)
            .find({})
            .sort({ move_date: -1, createdAt: -1 })
            .toArray();
        if (docs.length > 0) {
            return enrichMoveTsItemsWithRequestBasis(docs);
        }
    }

    return [];
}

/**
 * Формирует запрос по `_id` для записи движения техники.
 *
 * @param {unknown} id Идентификатор записи.
 * @returns {Record<string, any> | null} Mongo-запрос по `_id` или `null`.
 */
function buildMoveTsIdQuery(id) {
    const normalizedId = String(id || "").trim();
    if (!normalizedId) return null;

    if (mongoose.Types.ObjectId.isValid(normalizedId)) {
        return { _id: new mongoose.Types.ObjectId(normalizedId) };
    }

    return { _id: normalizedId };
}

/**
 * Нормализует строковое значение для записей движения техники.
 *
 * @param {unknown} value Исходное значение.
 * @returns {string} Нормализованная строка.
 */
function normalizeMoveTsString(value) {
    return String(value || "").trim();
}

/**
 * Подставляет в записи движения техники основание связанной заявки.
 *
 * @param {Record<string, any>[]} [items=[]] Исходные записи.
 * @returns {Promise<Record<string, any>[]>} Обогащённые записи.
 */
async function enrichMoveTsItemsWithRequestBasis(items = []) {
    if (!Array.isArray(items) || items.length === 0) {
        return [];
    }

    const requestBasisByNumber = new Map(
        (await fetchZayavkiSafe()).map((item) => [
            String(item?.request_number || "").trim(),
            normalizeRequestBasis(item?.request_basis),
        ]),
    );

    return items.map((item) => {
        const requestNumber = String(item?.request_number || "").trim();
        const requestBasis =
            normalizeRequestBasis(item?.request_basis) ||
            requestBasisByNumber.get(requestNumber) ||
            "";

        return {
            ...item,
            request_basis: requestBasis,
        };
    });
}

/**
 * Приводит тип акта движения техники к внутреннему значению.
 *
 * @param {unknown} value Исходное значение типа акта.
 * @returns {"expense" | "income" | ""} Нормализованный тип акта.
 */
function normalizeMoveTsActType(value) {
    const normalized = String(value || "")
        .trim()
        .toLowerCase();

    if (
        normalized === "income" ||
        normalized === "приход" ||
        normalized === "п" ||
        normalized === "incoming"
    ) {
        return "income";
    }

    if (
        normalized === "expense" ||
        normalized === "расход" ||
        normalized === "р" ||
        normalized === "outgoing"
    ) {
        return "expense";
    }

    return "";
}

/**
 * Определяет тип акта по локации отправления.
 *
 * @param {unknown} fromLocation Значение `from_location`.
 * @returns {"expense" | "income" | ""} Определённый тип акта.
 */
function inferMoveTsActTypeFromLocation(fromLocation) {
    const normalizedLocation =
        normalizeMoveTsString(fromLocation).toLowerCase();
    if (!normalizedLocation) return "";

    return normalizedLocation === "сц бти" ? "expense" : "income";
}

/**
 * Разбирает номер акта по шаблону `регион/номер-буква-год`.
 *
 * @param {unknown} value Номер акта.
 * @returns {{
 *   regionNumber: string,
 *   sequenceNumber: number,
 *   letter: string,
 *   yearShort: string,
 *   actType: "expense" | "income"
 * } | null} Разобранные части номера или `null`.
 */
function parseMoveTsActNumber(value) {
    const normalized = normalizeMoveTsString(value);
    const match = normalized.match(/^([^/]+)\/(\d+)-([РП])-([0-9]{2})$/);

    if (!match) return null;

    return {
        regionNumber: match[1],
        sequenceNumber: Number(match[2]),
        letter: match[3],
        yearShort: match[4],
        actType: match[3] === "П" ? "income" : "expense",
    };
}

/**
 * Возвращает буквенный код типа акта.
 *
 * @param {unknown} actType Тип акта.
 * @returns {"П" | "Р"} Буквенный код для номера акта.
 */
function getMoveTsActLetter(actType) {
    return normalizeMoveTsActType(actType) === "income" ? "П" : "Р";
}

/**
 * Нормализует режим назначения номера акта.
 *
 * @param {unknown} value Исходное значение режима.
 * @returns {"new" | "existing" | "manual" | ""} Нормализованный режим.
 */
function normalizeMoveTsActAssignmentMode(value) {
    const normalized = String(value || "")
        .trim()
        .toLowerCase();

    if (normalized === "new") return "new";
    if (normalized === "existing") return "existing";
    if (normalized === "manual") return "manual";

    return "";
}

/**
 * Приводит дату движения техники к объекту `Date`.
 *
 * @param {unknown} value Исходное значение даты.
 * @param {Date | null} fallbackValue Значение по умолчанию.
 * @returns {Date | null} Валидная дата или fallback.
 */
function normalizeMoveTsDate(value, fallbackValue) {
    if (!value) return fallbackValue;

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return null;
    }

    return parsed;
}

/**
 * Нормализует количество единиц техники.
 *
 * @param {unknown} value Исходное количество.
 * @returns {number | null} Округлённое положительное количество или `null`.
 */
function normalizeMoveTsQuantity(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return null;
    }

    return Math.round(parsed);
}

async function getRegionNumberByRequestNumberSafe(requestNumber) {
    const normalizedRequestNumber = normalizeMoveTsString(requestNumber);
    if (!normalizedRequestNumber) return "";

    const zayavki = await fetchZayavkiSafe();
    const zayavka = zayavki.find(
        (item) =>
            normalizeMoveTsString(item?.request_number) ===
            normalizedRequestNumber,
    );

    const directRegionNumber =
        normalizeMoveTsString(zayavka?.region_code) ||
        normalizeMoveTsString(zayavka?.reg);
    if (directRegionNumber) {
        return directRegionNumber;
    }

    const normalizedRegionId = normalizeMoveTsString(
        zayavka?.region_id || zayavka?.id_reg,
    );
    if (!normalizedRegionId) return "";

    const regions = await fetchRegionsSafe();
    const region = regions.find(
        (item) =>
            normalizeMoveTsString(item?.id_reg) === normalizedRegionId ||
            normalizeMoveTsString(item?.reg) === normalizedRegionId,
    );

    return normalizeMoveTsString(region?.reg);
}

async function generateMoveTsActNumberSafe({
    requestNumber,
    actType,
    moveDate,
}) {
    const normalizedActType = normalizeMoveTsActType(actType);
    if (!normalizedActType) {
        throw new Error("Не указан тип акта");
    }

    const regionNumber =
        await getRegionNumberByRequestNumberSafe(requestNumber);
    if (!regionNumber) {
        throw new Error("Не удалось определить номер региона для акта");
    }

    const actDate = normalizeMoveTsDate(moveDate, new Date()) || new Date();
    const yearShort = String(actDate.getFullYear()).slice(-2);
    const existingItems = await fetchMoveTsSafe();

    const maxSequence = existingItems.reduce((maxValue, item) => {
        const parsedActNumber = parseMoveTsActNumber(item?.act_number);
        if (!parsedActNumber) return maxValue;

        if (
            parsedActNumber.regionNumber !== regionNumber ||
            parsedActNumber.actType !== normalizedActType ||
            parsedActNumber.yearShort !== yearShort
        ) {
            return maxValue;
        }

        return Math.max(maxValue, parsedActNumber.sequenceNumber || 0);
    }, 0);

    return `${regionNumber}/${maxSequence + 1}-${getMoveTsActLetter(
        normalizedActType,
    )}-${yearShort}`;
}

async function fetchMoveTsByIdSafe(id) {
    const query = buildMoveTsIdQuery(id);
    if (!query) return null;

    const fromModel = await MoveTs.findOne(query).lean();
    if (fromModel) return fromModel;

    const db = mongoose.connection.db;
    const candidates = ["move_ts", "movee_ts"];

    for (const collectionName of candidates) {
        const item = await db.collection(collectionName).findOne(query);
        if (item) return item;
    }

    return null;
}

async function buildMoveTsUpdatePayload(body = {}, currentItem = null) {
    const moveDate = normalizeMoveTsDate(body.move_date, null);
    const quantity = normalizeMoveTsQuantity(body.quantity);
    const requestBasis =
        normalizeRequestBasis(body.request_basis) ||
        normalizeRequestBasis(currentItem?.request_basis);
    const note =
        normalizeMoveTsString(body.note) ||
        normalizeMoveTsString(currentItem?.note) ||
        "-";
    const assignmentMode = normalizeMoveTsActAssignmentMode(
        body.act_assignment_mode,
    );
    const manualActNumber = normalizeMoveTsString(body.act_number);
    const existingActNumber = normalizeMoveTsString(body.existing_act_number);
    const parsedManualActNumber = parseMoveTsActNumber(manualActNumber);
    const parsedExistingActNumber = parseMoveTsActNumber(existingActNumber);
    let actType =
        normalizeMoveTsActType(body.act_type) ||
        parsedExistingActNumber?.actType ||
        parsedManualActNumber?.actType ||
        normalizeMoveTsActType(currentItem?.act_type) ||
        parseMoveTsActNumber(currentItem?.act_number)?.actType ||
        inferMoveTsActTypeFromLocation(body.from_location);
    let actNumber = manualActNumber;

    if (!normalizeMoveTsString(body.request_number)) {
        return {
            error: "Не указан номер заявки",
        };
    }

    if (!moveDate) {
        return {
            error: "Не указана корректная дата движения",
        };
    }

    if (!quantity) {
        return {
            error: "Количество должно быть больше нуля",
        };
    }

    if (assignmentMode === "existing") {
        if (!existingActNumber) {
            return {
                error: "Не выбран существующий акт",
            };
        }

        actNumber = existingActNumber;
        actType = parsedExistingActNumber?.actType || actType;
    }

    if (assignmentMode === "new") {
        if (!actType) {
            return {
                error: "Не выбран тип акта",
            };
        }

        try {
            actNumber = await generateMoveTsActNumberSafe({
                requestNumber: body.request_number,
                actType,
                moveDate,
            });
        } catch (error) {
            return {
                error: error?.message || "Не удалось сформировать номер акта",
            };
        }
    }

    if (assignmentMode === "manual" && manualActNumber) {
        actType = parsedManualActNumber?.actType || actType;
    }

    if (!assignmentMode && !manualActNumber) {
        actNumber = "";
    }

    return {
        payload: {
            request_number: normalizeMoveTsString(body.request_number),
            act_number: actNumber,
            act_type: actType,
            move_date: moveDate,
            status: normalizeMoveTsString(body.status),
            delivery_method: normalizeMoveTsString(body.delivery_method),
            request_basis: requestBasis,
            note,
            device_type: normalizeMoveTsString(body.device_type),
            device_name: normalizeMoveTsString(body.device_name),
            device_serial: normalizeMoveTsString(body.device_serial),
            inv_number: normalizeMoveTsString(body.inv_number),
            from_location: normalizeMoveTsString(body.from_location),
            to_location: normalizeMoveTsString(body.to_location),
            quantity,
        },
    };
}

async function updateMoveTsByIdSafe(id, payload) {
    const query = buildMoveTsIdQuery(id);
    if (!query) return null;

    const fromModel = await MoveTs.findOneAndUpdate(query, payload, {
        new: true,
        runValidators: true,
    }).lean();
    if (fromModel) return fromModel;

    const db = mongoose.connection.db;
    const candidates = ["move_ts", "movee_ts"];

    for (const collectionName of candidates) {
        const collection = db.collection(collectionName);
        const updateResult = await collection.updateOne(query, {
            $set: payload,
        });

        if (updateResult.matchedCount > 0) {
            return collection.findOne(query);
        }
    }

    return null;
}

async function deleteMoveTsByIdSafe(id) {
    const query = buildMoveTsIdQuery(id);
    if (!query) return null;

    const fromModel = await MoveTs.findOneAndDelete(query).lean();
    if (fromModel) return fromModel;

    const db = mongoose.connection.db;
    const candidates = ["move_ts", "movee_ts"];

    for (const collectionName of candidates) {
        const deleted = await db
            .collection(collectionName)
            .findOneAndDelete(query);
        if (deleted) {
            return deleted;
        }
    }

    return null;
}

async function deleteMoveTsByRequestNumberSafe(requestNumber, statuses = []) {
    const normalizedRequestNumber = normalizeMoveTsString(requestNumber);
    if (!normalizedRequestNumber) {
        return { deletedCount: 0, source: "" };
    }

    const normalizedStatuses = Array.isArray(statuses)
        ? statuses.map((item) => normalizeMoveTsString(item)).filter(Boolean)
        : [];
    const query = {
        request_number: normalizedRequestNumber,
    };

    if (normalizedStatuses.length > 0) {
        query.status = { $in: normalizedStatuses };
    }

    const fromModel = await MoveTs.deleteMany(query);
    if (fromModel?.deletedCount > 0) {
        return {
            deletedCount: fromModel.deletedCount,
            source: "model:move_ts",
        };
    }

    const db = mongoose.connection.db;
    const candidates = ["move_ts", "movee_ts"];

    for (const collectionName of candidates) {
        const result = await db.collection(collectionName).deleteMany(query);
        if (result?.deletedCount > 0) {
            return {
                deletedCount: result.deletedCount,
                source: `collection:${collectionName}`,
            };
        }
    }

    return { deletedCount: 0, source: "" };
}

async function fetchZayavkiSafe() {
    const fromModel = await Zayavka.find({}).sort({ createdAt: -1 }).lean();
    if (fromModel.length > 0) return fromModel;

    const db = mongoose.connection.db;
    const candidates = ["zayavki", "zayavka", "zayavkas", "notes", "note"];

    for (const collectionName of candidates) {
        const docs = await db.collection(collectionName).find({}).toArray();
        if (docs.length > 0) {
            docs.sort((a, b) => {
                const da = new Date(a.createdAt || 0).getTime();
                const dbb = new Date(b.createdAt || 0).getTime();
                return dbb - da;
            });
            return docs;
        }
    }

    return [];
}

/**
 * Проверяет, считается ли решение по заявке заполненным.
 *
 * @param {unknown} decision Текст решения.
 * @returns {boolean} `true`, если решение присутствует и не равно `-`.
 */
function isResolvedDecision(decision) {
    const value = String(decision || "").trim();
    return value.length > 0 && value !== "-";
}

/**
 * Экранирует спецсимволы строки для безопасной подстановки в регулярное выражение.
 *
 * @param {string} value Исходная строка.
 * @returns {string} Экранированная строка.
 */
function escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Приводит срочность заявки к одному из допустимых внутренних значений.
 *
 * @param {unknown} value Исходное значение срочности.
 * @returns {"urgent" | "not_urgent"} Нормализованная срочность.
 */
function normalizeUrgency(value) {
    const normalized = String(value || "")
        .trim()
        .toLowerCase();
    return normalized === "urgent" ? "urgent" : "not_urgent";
}

/**
 * Нормализует основание заявки.
 *
 * @param {unknown} value Исходное значение основания заявки.
 * @returns {string} Каноническое значение основания или пустая строка.
 */
function normalizeRequestBasis(value) {
    const normalized = String(value || "")
        .trim()
        .toLowerCase();
    const match = REQUEST_BASIS_OPTIONS.find(
        (item) => item.toLowerCase() === normalized,
    );

    return match || "";
}

/**
 * Нормализует тип решения по заявке.
 *
 * @param {unknown} value Исходное значение типа решения.
 * @returns {string} Каноническое значение типа решения или пустая строка.
 */
function normalizeDecisionKind(value) {
    const normalized = String(value || "")
        .trim()
        .toLowerCase();
    const match = DECISION_KIND_OPTIONS.find(
        (item) => item.toLowerCase() === normalized,
    );

    return match || "";
}

/**
 * Возвращает номер КСА по идентификатору с fallback на уже известное значение.
 *
 * @param {unknown} ksaId Идентификатор КСА.
 * @param {string} [fallbackNumber=""] Резервный номер КСА.
 * @returns {Promise<string>} Номер КСА.
 */
async function getKsaNumberSafe(ksaId, fallbackNumber = "") {
    const normalizedKsaId = String(ksaId || "").trim();
    if (!normalizedKsaId) {
        return String(fallbackNumber || "").trim();
    }

    const ksaList = await fetchKsaSafe({ id_ksa: normalizedKsaId });
    const firstKsa = Array.isArray(ksaList) ? ksaList[0] : null;

    return (
        String(firstKsa?.nomer_ksa || "").trim() ||
        String(fallbackNumber || "").trim()
    );
}

/**
 * Создаёт или обновляет запись движения техники для решения по дооснащению.
 *
 * @param {{
 *   requestNumber: string,
 *   ksaId: string,
 *   ksaNumber: string,
 *   deviceType: string,
 *   deviceName: string,
 *   deviceSerial: string,
 *   requestBasis: string
 * }} params Параметры заявки.
 * @returns {Promise<Record<string, any> | null>} Запись движения техники или `null`.
 */
async function upsertMoveTsForSupplementDecision({
    requestNumber,
    ksaId,
    ksaNumber,
    deviceType,
    deviceName,
    deviceSerial,
    requestBasis,
}) {
    if (normalizeRequestBasis(requestBasis) !== "Дооснащение") {
        return null;
    }

    const [deviceItem, destinationKsaNumber] = await Promise.all([
        findDeviceItemBySerialSafe(deviceSerial),
        getKsaNumberSafe(ksaId, ksaNumber),
    ]);

    return MoveTs.findOneAndUpdate(
        {
            request_number: String(requestNumber || "").trim(),
            status: "на отправку",
        },
        {
            $set: {
                act_number: "",
                act_type: "expense",
                move_date: new Date(),
                status: "на отправку",
                delivery_method: "",
                request_basis: normalizeRequestBasis(requestBasis),
                note: "-",
                device_type: String(deviceType || "").trim(),
                device_name: String(deviceName || "").trim(),
                device_serial: String(deviceSerial || "").trim(),
                inv_number: String(deviceItem?.inv_number || "").trim(),
                from_location: "СЦ БТИ",
                to_location: destinationKsaNumber,
                quantity: 1,
            },
        },
        {
            new: true,
            upsert: true,
            setDefaultsOnInsert: true,
        },
    );
}

/**
 * Создаёт или обновляет расходное движение техники для решения "Замена".
 *
 * @param {{
 *   requestNumber: string,
 *   ksaId: string,
 *   ksaNumber: string,
 *   requestBasis: string,
 *   deviceType: string,
 *   deviceName: string,
 *   deviceSerial: string,
 *   invNumber: string
 * }} params Параметры движения техники.
 * @returns {Promise<Record<string, any> | null>} Запись движения техники.
 */
async function upsertMoveTsForReplacementDecision({
    requestNumber,
    ksaId,
    ksaNumber,
    requestBasis,
    deviceType,
    deviceName,
    deviceSerial,
    invNumber,
}) {
    const destinationKsaNumber = await getKsaNumberSafe(ksaId, ksaNumber);

    return MoveTs.findOneAndUpdate(
        {
            request_number: String(requestNumber || "").trim(),
            status: "на отправку",
        },
        {
            $set: {
                act_number: "",
                act_type: "expense",
                move_date: new Date(),
                status: "на отправку",
                delivery_method: "",
                request_basis: normalizeRequestBasis(requestBasis),
                note: "-",
                device_type: String(deviceType || "").trim(),
                device_name: String(deviceName || "").trim(),
                device_serial: String(deviceSerial || "").trim(),
                inv_number: String(invNumber || "").trim(),
                from_location: "СЦ БТИ",
                to_location: destinationKsaNumber,
                quantity: 1,
            },
        },
        {
            new: true,
            upsert: true,
            setDefaultsOnInsert: true,
        },
    );
}

/**
 * Создаёт или обновляет входящее движение техники для забора оборудования.
 *
 * @param {{
 *   requestNumber: string,
 *   ksaId: string,
 *   ksaNumber: string,
 *   requestBasis: string,
 *   deviceType: string,
 *   deviceName: string,
 *   deviceSerial: string
 * }} params Параметры движения техники.
 * @returns {Promise<Record<string, any> | null>} Запись движения техники.
 */
async function upsertMoveTsForPickupDecision({
    requestNumber,
    ksaId,
    ksaNumber,
    requestBasis,
    deviceType,
    deviceName,
    deviceSerial,
}) {
    const [sourceKsaNumber, deviceItem] = await Promise.all([
        getKsaNumberSafe(ksaId, ksaNumber),
        findDeviceItemBySerialSafe(deviceSerial),
    ]);

    return MoveTs.findOneAndUpdate(
        {
            request_number: String(requestNumber || "").trim(),
            status: "на забор",
        },
        {
            $set: {
                act_number: "",
                act_type: "income",
                move_date: new Date(),
                status: "на забор",
                delivery_method: "",
                request_basis: normalizeRequestBasis(requestBasis),
                note: "-",
                device_type: String(deviceType || "").trim(),
                device_name: String(deviceName || "").trim(),
                device_serial: String(deviceSerial || "").trim(),
                inv_number: String(deviceItem?.inv_number || "").trim(),
                from_location: sourceKsaNumber,
                to_location: "СЦ БТИ",
                quantity: 1,
            },
        },
        {
            new: true,
            upsert: true,
            setDefaultsOnInsert: true,
        },
    );
}

/**
 * Возвращает имя автора заявки независимо от варианта поля в документе.
 *
 * @param {Record<string, any>} item Документ заявки.
 * @returns {string} Имя автора или пустая строка.
 */
function getCreatedByValue(item) {
    return item?.created_by || item?.createdBy || item?.author || "";
}

/**
 * Проверяет, содержит ли значение поисковую подстроку.
 *
 * @param {unknown} value Проверяемое значение.
 * @param {string} normalizedSearch Уже нормализованный поисковый запрос.
 * @returns {boolean} `true`, если подстрока найдена.
 */
function matchesSearchTerm(value, normalizedSearch) {
    return String(value || "")
        .toLowerCase()
        .includes(normalizedSearch);
}

/**
 * Находит идентификаторы КСА, совпадающих с поисковым запросом.
 *
 * @param {Record<string, any>[]} ksaList Список КСА.
 * @param {string} search Поисковый запрос.
 * @returns {string[]} Список идентификаторов КСА.
 */
function getMatchingKsaIds(ksaList, search) {
    const normalizedSearch = String(search || "")
        .trim()
        .toLowerCase();
    if (!normalizedSearch) return [];

    return ksaList
        .filter((item) =>
            [
                item.id_ksa,
                item.nomer_ksa,
                item.ksa_naimenovanie,
                item.ksa_adress,
                item.ksa_address,
            ].some((value) => matchesSearchTerm(value, normalizedSearch)),
        )
        .map((item) => String(item.id_ksa || "").trim())
        .filter(Boolean);
}

/**
 * Проверяет, соответствует ли заявка поисковому запросу.
 *
 * @param {Record<string, any>} item Документ заявки.
 * @param {string} search Поисковый запрос.
 * @returns {boolean} `true`, если заявка подходит под поиск.
 */
function matchesZayavkaSearch(item, search) {
    const normalizedSearch = String(search || "")
        .trim()
        .toLowerCase();
    if (!normalizedSearch) return true;

    return [
        item.request_number,
        item.device_serial,
        item.device_name,
        item.request_basis,
        item.device_issue,
        item.contact_person,
        item.ksa_id,
        item.ksa_number,
        item.ksa_name,
        item.ksa_address,
        getCreatedByValue(item),
    ].some((value) => matchesSearchTerm(value, normalizedSearch));
}

/**
 * Обогащает заявку вычисленными данными региона, КСА и срочности.
 *
 * @param {Record<string, any>} zayavka Исходная заявка.
 * @param {Map<string, Record<string, any>>} regionById Карта регионов по идентификатору.
 * @param {Map<string, Record<string, any>>} ksaById Карта КСА по идентификатору.
 * @returns {Record<string, any>} Обогащённая заявка.
 */
function enrichZayavka(zayavka, regionById, ksaById) {
    const regionItem = regionById.get(String(zayavka.region_id));
    const ksaItem = ksaById.get(String(zayavka.ksa_id));

    return {
        ...zayavka,
        urgency: normalizeUrgency(zayavka.urgency),
        region_name: regionItem?.reg_naimenovanie || "",
        ksa_number: ksaItem?.nomer_ksa || "",
        ksa_name: ksaItem?.ksa_naimenovanie || "",
        ksa_address:
            zayavka.ksa_address ||
            ksaItem?.ksa_adress ||
            ksaItem?.ksa_address ||
            "",
    };
}

async function deleteZayavkaSafe(id) {
    const idString = String(id);
    const deletedByModel = await Zayavka.findByIdAndDelete(idString);
    if (deletedByModel) {
        return { deleted: true, source: "model:zayavka" };
    }

    const db = mongoose.connection.db;
    const collections = ["zayavki", "zayavka", "zayavkas", "notes", "note"];
    const filters = [{ _id: idString }];

    if (mongoose.Types.ObjectId.isValid(idString)) {
        filters.push({ _id: new mongoose.Types.ObjectId(idString) });
    }

    filters.push({ id: idString });
    filters.push({ id_note: idString });
    filters.push({ id_zayavka: idString });

    for (const collectionName of collections) {
        for (const filter of filters) {
            const result = await db
                .collection(collectionName)
                .deleteOne(filter);
            if (result?.deletedCount > 0) {
                return {
                    deleted: true,
                    source: `collection:${collectionName}`,
                };
            }
        }
    }

    return { deleted: false, source: "" };
}

async function updateZayavkaSafe(id, updateData) {
    const idString = String(id);

    const updatedByModel = await Zayavka.findByIdAndUpdate(
        idString,
        { $set: updateData },
        { new: true },
    ).lean();
    if (updatedByModel) {
        return {
            updated: true,
            source: "model:zayavka",
            doc: updatedByModel,
        };
    }

    const db = mongoose.connection.db;
    const collections = ["zayavki", "zayavka", "zayavkas", "notes", "note"];
    const filters = [{ _id: idString }];

    if (mongoose.Types.ObjectId.isValid(idString)) {
        filters.push({ _id: new mongoose.Types.ObjectId(idString) });
    }

    filters.push({ id: idString });
    filters.push({ id_note: idString });
    filters.push({ id_zayavka: idString });

    for (const collectionName of collections) {
        for (const filter of filters) {
            const result = await db
                .collection(collectionName)
                .findOneAndUpdate(
                    filter,
                    { $set: updateData },
                    { returnDocument: "after" },
                );
            const updatedDoc = result?.value || result || null;
            if (updatedDoc && updatedDoc._id) {
                return {
                    updated: true,
                    source: `collection:${collectionName}`,
                    doc: updatedDoc,
                };
            }
        }
    }

    return { updated: false, source: "", doc: null };
}

async function updateZayavkaByRequestNumberSafe(requestNumber, updateData) {
    const normalizedRequestNumber = String(requestNumber || "").trim();
    if (!normalizedRequestNumber) {
        return { updated: false, source: "", doc: null };
    }

    const updatedByModel = await Zayavka.findOneAndUpdate(
        { request_number: normalizedRequestNumber },
        { $set: updateData },
        { new: true },
    ).lean();
    if (updatedByModel) {
        return {
            updated: true,
            source: "model:zayavka",
            doc: updatedByModel,
        };
    }

    const db = mongoose.connection.db;
    const collections = ["zayavki", "zayavka", "zayavkas", "notes", "note"];

    for (const collectionName of collections) {
        const result = await db
            .collection(collectionName)
            .findOneAndUpdate(
                { request_number: normalizedRequestNumber },
                { $set: updateData },
                { returnDocument: "after" },
            );
        const updatedDoc = result?.value || result || null;
        if (updatedDoc && updatedDoc._id) {
            return {
                updated: true,
                source: `collection:${collectionName}`,
                doc: updatedDoc,
            };
        }
    }

    return { updated: false, source: "", doc: null };
}

async function resetZayavkaDecisionByRequestNumberSafe(requestNumber) {
    return updateZayavkaByRequestNumberSafe(requestNumber, {
        decision: "",
        decision_kind: "",
        decision_date: null,
        repair_description: "",
        replacement_device_type: "",
        replacement_device_name: "",
        replacement_device_serial: "",
        replacement_inv_number: "",
    });
}

async function deleteZayavkaHandler(req, res) {
    try {
        const { id } = req.params;
        const { deleted, source } = await deleteZayavkaSafe(id);

        if (!deleted) {
            return res.status(404).json({
                message: "Заявка не найдена",
            });
        }

        console.log(`[DELETE /zayavki/:id] deleted from ${source}`);
        return res.status(200).json({
            message: "Заявка удалена",
            id,
        });
    } catch (error) {
        console.error("[DELETE /zayavki/:id] error:", error);
        return res.status(500).json({
            message: "Ошибка удаления заявки",
        });
    }
}

app.post("/auth/login", async (req, res) => {
    try {
        const { login, password } = req.body;

        if (!login || !password) {
            return res.status(400).json({
                message: "Введите логин и пароль",
            });
        }

        if (login !== AUTH_LOGIN || password !== AUTH_PASSWORD) {
            return res.status(401).json({
                message: "Неверный логин или пароль",
            });
        }

        const token = createToken();
        authTokens.add(token);

        return res.status(200).json({
            token,
            user: { login },
        });
    } catch (error) {
        console.error("[POST /auth/login] error:", error);
        return res.status(500).json({
            message: "Ошибка авторизации",
        });
    }
});

app.post("/auth/logout", authMiddleware, async (req, res) => {
    authTokens.delete(req.authToken);
    return res.status(200).json({
        message: "Выход выполнен",
    });
});

app.get("/auth/me", authMiddleware, async (req, res) => {
    return res.status(200).json({
        ok: true,
    });
});

app.use((req, res, next) => {
    if (mongoose.connection.readyState === 1) {
        return next();
    }

    return res.status(503).json({
        message: "База данных временно недоступна",
    });
});

app.get("/region", authMiddleware, async (req, res) => {
    const region = await fetchRegionsSafe();
    res.send(region);
    return region;
});

app.get("/device-types", authMiddleware, async (req, res) => {
    const deviceTypes = await fetchDeviceTypesSafe();
    res.send(deviceTypes);
    return deviceTypes;
});

app.get("/device-names", authMiddleware, async (req, res) => {
    const { typeId } = req.query;
    const deviceNames = await fetchDeviceNamesSafe(typeId);
    res.send(deviceNames);
    return deviceNames;
});

app.get("/device-serials", authMiddleware, async (req, res) => {
    const { nameId } = req.query;
    const deviceSerials = await fetchDeviceSerialsSafe(nameId);
    res.send(deviceSerials);
    return deviceSerials;
});

app.get("/move-ts", authMiddleware, async (req, res) => {
    try {
        const items = await fetchMoveTsSafe();
        return res.status(200).json(items);
    } catch (error) {
        console.error("[GET /move-ts] error:", error);
        return res.status(500).json({
            message: "Ошибка получения движения техники",
        });
    }
});

app.get("/move-ts/act-preview", authMiddleware, async (req, res) => {
    try {
        const requestNumber = normalizeMoveTsString(req.query.requestNumber);
        const actType = normalizeMoveTsActType(req.query.actType);
        const moveDate =
            normalizeMoveTsDate(req.query.moveDate, null) || new Date();

        if (!requestNumber) {
            return res.status(400).json({
                message: "Не указан номер заявки",
            });
        }

        if (!actType) {
            return res.status(400).json({
                message: "Не указан тип акта",
            });
        }

        const actNumber = await generateMoveTsActNumberSafe({
            requestNumber,
            actType,
            moveDate,
        });

        return res.status(200).json({
            act_number: actNumber,
            act_type: actType,
        });
    } catch (error) {
        console.error("[GET /move-ts/act-preview] error:", error);
        return res.status(500).json({
            message: "Ошибка формирования номера акта",
        });
    }
});

app.patch("/move-ts/:id", authMiddleware, async (req, res) => {
    try {
        const currentItem = await fetchMoveTsByIdSafe(req.params.id);
        if (!currentItem) {
            return res.status(404).json({
                message: "Запись движения техники не найдена",
            });
        }

        const { error, payload } = await buildMoveTsUpdatePayload(
            req.body,
            currentItem,
        );
        if (error) {
            return res.status(400).json({ message: error });
        }

        const updated = await updateMoveTsByIdSafe(req.params.id, payload);
        if (!updated) {
            return res.status(404).json({
                message: "Запись движения техники не найдена",
            });
        }

        return res.status(200).json(updated);
    } catch (error) {
        console.error("[PATCH /move-ts/:id] error:", error);
        return res.status(500).json({
            message: "Ошибка обновления движения техники",
        });
    }
});

app.delete("/move-ts/:id", authMiddleware, async (req, res) => {
    try {
        const deleted = await deleteMoveTsByIdSafe(req.params.id);
        if (!deleted) {
            return res.status(404).json({
                message: "Запись движения техники не найдена",
            });
        }

        const deletedRequestNumber = String(
            deleted.request_number || "",
        ).trim();
        if (deletedRequestNumber) {
            await resetZayavkaDecisionByRequestNumberSafe(deletedRequestNumber);
        }

        return res.status(200).json({
            success: true,
            deleted_id: deleted._id || req.params.id,
        });
    } catch (error) {
        console.error("[DELETE /move-ts/:id] error:", error);
        return res.status(500).json({
            message: "Ошибка удаления движения техники",
        });
    }
});

app.post("/zayavki", authMiddleware, async (req, res) => {
    let created = null;
    try {
        const {
            region_id,
            region_code,
            ksa_id,
            ksa_number,
            ksa_address,
            device_type,
            device_name,
            device_serial,
            request_basis,
            device_issue,
            contact_person,
            urgency,
            device_photo,
            created_by,
        } = req.body;

        if (
            !region_id ||
            !ksa_id ||
            !device_type ||
            !device_name ||
            !device_serial ||
            !normalizeRequestBasis(request_basis) ||
            !device_issue ||
            !contact_person
        ) {
            return res.status(400).json({
                message: "Не заполнены обязательные поля",
            });
        }

        const now = new Date();
        const requestNumber = await getNextRequestNumber(now);
        const normalizedRequestBasis = normalizeRequestBasis(request_basis);

        created = await Zayavka.create({
            request_number: requestNumber,
            region_id,
            region_code: region_code || "",
            ksa_id,
            ksa_address: ksa_address || "",
            device_type,
            device_name,
            device_serial,
            request_basis: normalizedRequestBasis,
            decision: "",
            decision_kind: "",
            decision_date: null,
            repair_description: "",
            replacement_device_type: "",
            replacement_device_name: "",
            replacement_device_serial: "",
            replacement_inv_number: "",
            device_issue,
            contact_person,
            urgency: normalizeUrgency(urgency),
            device_photo: device_photo || null,
            created_by: created_by || "-",
        });

        return res.status(201).json({
            message: "Заявка сохранена",
            id: created._id,
            request_number: created.request_number,
        });
    } catch (error) {
        console.error("[POST /zayavki] error:", error);

        if (created?._id) {
            try {
                await deleteZayavkaSafe(created._id);
            } catch (cleanupError) {
                console.error("[POST /zayavki] rollback error:", cleanupError);
            }
        }

        return res.status(500).json({
            message: "Ошибка сохранения заявки",
        });
    }
});

app.get("/zayavki", authMiddleware, async (req, res) => {
    try {
        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 20));
        const status = String(req.query.status || "all");
        const includePhoto = String(req.query.includePhoto || "0") === "1";
        const search = String(req.query.search || "").trim();
        const skip = (page - 1) * limit;

        const [regions, ksaList] = await Promise.all([
            fetchRegionsSafe(),
            fetchKsaSafe({}),
        ]);
        const regionById = new Map(
            regions.map((regionItem) => [
                String(regionItem.id_reg),
                regionItem,
            ]),
        );
        const ksaById = new Map(
            ksaList.map((ksaItem) => [String(ksaItem.id_ksa), ksaItem]),
        );
        const matchingKsaIds = search ? getMatchingKsaIds(ksaList, search) : [];

        const mongoFilters = [];
        if (status === "resolved") {
            mongoFilters.push({
                decision: { $nin: ["", "-", null] },
            });
        } else if (status === "unresolved") {
            mongoFilters.push({
                $or: [
                    { decision: { $exists: false } },
                    { decision: null },
                    { decision: "" },
                    { decision: "-" },
                ],
            });
        }
        if (search) {
            const regex = new RegExp(escapeRegex(search), "i");
            const searchConditions = [
                { device_serial: regex },
                { device_name: regex },
                { device_issue: regex },
                { contact_person: regex },
                { created_by: regex },
                { ksa_id: regex },
                { ksa_address: regex },
            ];

            if (matchingKsaIds.length > 0) {
                searchConditions.push({ ksa_id: { $in: matchingKsaIds } });
            }

            mongoFilters.push({
                $or: searchConditions,
            });
        }

        const mongoFilter =
            mongoFilters.length === 0
                ? {}
                : mongoFilters.length === 1
                  ? mongoFilters[0]
                  : { $and: mongoFilters };

        const totalFromModel = await Zayavka.countDocuments(mongoFilter);
        let zayavkiPage = [];
        let total = totalFromModel;
        const usedFallback = totalFromModel === 0;

        if (totalFromModel > 0) {
            zayavkiPage = await Zayavka.find(mongoFilter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean();
        } else {
            let allFallback = await fetchZayavkiSafe();

            allFallback = allFallback
                .map((item) => enrichZayavka(item, regionById, ksaById))
                .filter((item) => {
                    if (
                        status === "resolved" &&
                        !isResolvedDecision(item.decision)
                    ) {
                        return false;
                    }
                    if (
                        status === "unresolved" &&
                        isResolvedDecision(item.decision)
                    ) {
                        return false;
                    }

                    return matchesZayavkaSearch(item, search);
                });

            total = allFallback.length;
            zayavkiPage = allFallback.slice(skip, skip + limit);
        }

        const items = zayavkiPage.map((zayavka) => {
            const enriched = usedFallback
                ? zayavka
                : enrichZayavka(zayavka, regionById, ksaById);
            if (includePhoto) {
                return enriched;
            }

            return {
                ...enriched,
                device_photo: enriched.device_photo
                    ? {
                          file_name: enriched.device_photo.file_name || "",
                          mime_type: enriched.device_photo.mime_type || "",
                      }
                    : null,
            };
        });

        return res.status(200).json({
            items,
            total,
            page,
            limit,
            totalPages: Math.max(1, Math.ceil(total / limit)),
        });
    } catch (error) {
        console.error("[GET /zayavki] error:", error);
        return res.status(500).json({
            message: "Ошибка получения списка заявок",
        });
    }
});

app.get("/zayavki/:id", authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const idString = String(id);
        let zayavka = await Zayavka.findById(idString).lean();

        if (!zayavka) {
            const db = mongoose.connection.db;
            const collections = [
                "zayavki",
                "zayavka",
                "zayavkas",
                "notes",
                "note",
            ];
            const filters = [{ _id: idString }];

            if (mongoose.Types.ObjectId.isValid(idString)) {
                filters.push({ _id: new mongoose.Types.ObjectId(idString) });
            }
            filters.push({ id: idString });
            filters.push({ id_note: idString });
            filters.push({ id_zayavka: idString });

            for (const collectionName of collections) {
                for (const filter of filters) {
                    zayavka = await db
                        .collection(collectionName)
                        .findOne(filter);
                    if (zayavka) break;
                }
                if (zayavka) break;
            }
        }

        if (!zayavka) {
            return res.status(404).json({
                message: "Заявка не найдена",
            });
        }

        const [regions, ksaList] = await Promise.all([
            fetchRegionsSafe(),
            fetchKsaSafe({}),
        ]);
        const regionById = new Map(
            regions.map((regionItem) => [
                String(regionItem.id_reg),
                regionItem,
            ]),
        );
        const ksaById = new Map(
            ksaList.map((ksaItem) => [String(ksaItem.id_ksa), ksaItem]),
        );

        return res
            .status(200)
            .json(enrichZayavka(zayavka, regionById, ksaById));
    } catch (error) {
        console.error("[GET /zayavki/:id] error:", error);
        return res.status(500).json({
            message: "Ошибка получения заявки",
        });
    }
});

app.delete("/zayavki/:id", authMiddleware, deleteZayavkaHandler);
app.post("/zayavki/:id/delete", authMiddleware, deleteZayavkaHandler);

app.patch("/zayavki/:id", authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const {
            device_type,
            device_name,
            device_serial,
            request_basis,
            device_issue,
            contact_person,
            urgency,
            ksa_address,
        } = req.body;

        if (
            !String(device_type || "").trim() ||
            !String(device_name || "").trim() ||
            !String(device_serial || "").trim() ||
            !normalizeRequestBasis(request_basis) ||
            !String(device_issue || "").trim() ||
            !String(contact_person || "").trim()
        ) {
            return res.status(400).json({
                message: "Не заполнены обязательные поля для редактирования",
            });
        }

        const updateData = {
            device_type: String(device_type).trim(),
            device_name: String(device_name).trim(),
            device_serial: String(device_serial).trim(),
            request_basis: normalizeRequestBasis(request_basis),
            device_issue: String(device_issue).trim(),
            contact_person: String(contact_person).trim(),
            urgency: normalizeUrgency(urgency),
            ksa_address: String(ksa_address || "").trim(),
        };

        const { updated, doc } = await updateZayavkaSafe(id, updateData);

        if (!updated || !doc) {
            return res.status(404).json({
                message: "Заявка не найдена",
            });
        }

        return res.status(200).json({
            message: "Заявка обновлена",
            zayavka: doc,
        });
    } catch (error) {
        console.error("[PATCH /zayavki/:id] error:", error);
        return res.status(500).json({
            message: "Ошибка обновления заявки",
        });
    }
});

app.patch("/zayavki/:id/decision", authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const {
            request_basis,
            decision,
            decision_date,
            decision_kind,
            repair_description,
            replacement_device_type,
            replacement_device_name,
            replacement_device_serial,
            replacement_inv_number,
        } = req.body;

        const zayavka = await Zayavka.findById(id).lean();
        if (!zayavka) {
            return res.status(404).json({
                message: "Заявка не найдена",
            });
        }

        const nextRequestBasis =
            normalizeRequestBasis(request_basis) ||
            normalizeRequestBasis(zayavka.request_basis);
        if (!nextRequestBasis) {
            return res.status(400).json({
                message: "Выберите основание заявки",
            });
        }

        if (!decision_date) {
            return res.status(400).json({
                message: "Поле 'Дата решения' обязательно",
            });
        }

        const parsedDate = new Date(decision_date);
        if (Number.isNaN(parsedDate.getTime())) {
            return res.status(400).json({
                message: "Некорректная дата решения",
            });
        }

        let nextDecision = "";
        let nextDecisionKind = "";
        let nextRepairDescription = "";
        let nextReplacementDeviceType = "";
        let nextReplacementDeviceName = "";
        let nextReplacementDeviceSerial = "";
        let nextReplacementInvNumber = "";

        if (nextRequestBasis === "Дооснащение") {
            nextDecision = "Дооснащение";
            nextDecisionKind = "supplement";
        } else {
            const normalizedDecisionKind = normalizeDecisionKind(decision_kind);

            if (
                !normalizedDecisionKind ||
                normalizedDecisionKind === "supplement"
            ) {
                return res.status(400).json({
                    message: "Выберите вид ремонта",
                });
            }

            if (normalizedDecisionKind === "repair_on_site") {
                if (!String(repair_description || "").trim()) {
                    return res.status(400).json({
                        message: "Укажите описание ремонта",
                    });
                }

                nextDecision = "Ремонт на месте";
                nextDecisionKind = "repair_on_site";
                nextRepairDescription = String(repair_description).trim();
            }

            if (normalizedDecisionKind === "replacement") {
                if (
                    !String(replacement_device_type || "").trim() ||
                    !String(replacement_device_name || "").trim() ||
                    !String(replacement_device_serial || "").trim() ||
                    !String(replacement_inv_number || "").trim()
                ) {
                    return res.status(400).json({
                        message: "Заполните все поля для замены",
                    });
                }

                nextDecision = "Замена";
                nextDecisionKind = "replacement";
                nextReplacementDeviceType = String(
                    replacement_device_type,
                ).trim();
                nextReplacementDeviceName = String(
                    replacement_device_name,
                ).trim();
                nextReplacementDeviceSerial = String(
                    replacement_device_serial,
                ).trim();
                nextReplacementInvNumber = String(
                    replacement_inv_number,
                ).trim();
            }

            if (!nextDecision) {
                nextDecision = String(decision || "").trim();
            }
        }

        const updated = await Zayavka.findByIdAndUpdate(
            id,
            {
                $set: {
                    request_basis: nextRequestBasis,
                    decision: nextDecision,
                    decision_kind: nextDecisionKind,
                    decision_date: parsedDate,
                    repair_description: nextRepairDescription,
                    replacement_device_type: nextReplacementDeviceType,
                    replacement_device_name: nextReplacementDeviceName,
                    replacement_device_serial: nextReplacementDeviceSerial,
                    replacement_inv_number: nextReplacementInvNumber,
                },
            },
            { new: true },
        ).lean();

        if (nextRequestBasis === "Дооснащение") {
            await Promise.all([
                upsertMoveTsForSupplementDecision({
                    requestNumber: zayavka.request_number,
                    ksaId: zayavka.ksa_id,
                    ksaNumber: zayavka.ksa_number,
                    requestBasis: nextRequestBasis,
                    deviceType: zayavka.device_type,
                    deviceName: zayavka.device_name,
                    deviceSerial: zayavka.device_serial,
                }),
                deleteMoveTsByRequestNumberSafe(zayavka.request_number, [
                    "на забор",
                ]),
            ]);
        } else if (nextDecisionKind === "replacement") {
            await Promise.all([
                upsertMoveTsForReplacementDecision({
                    requestNumber: zayavka.request_number,
                    ksaId: zayavka.ksa_id,
                    ksaNumber: zayavka.ksa_number,
                    requestBasis: nextRequestBasis,
                    deviceType: nextReplacementDeviceType,
                    deviceName: nextReplacementDeviceName,
                    deviceSerial: nextReplacementDeviceSerial,
                    invNumber: nextReplacementInvNumber,
                }),
                upsertMoveTsForPickupDecision({
                    requestNumber: zayavka.request_number,
                    ksaId: zayavka.ksa_id,
                    ksaNumber: zayavka.ksa_number,
                    requestBasis: nextRequestBasis,
                    deviceType: zayavka.device_type,
                    deviceName: zayavka.device_name,
                    deviceSerial: zayavka.device_serial,
                }),
            ]);
        } else {
            await deleteMoveTsByRequestNumberSafe(zayavka.request_number);
        }

        return res.status(200).json({
            message: "Решение сохранено",
            zayavka: updated,
        });
    } catch (error) {
        console.error("[PATCH /zayavki/:id/decision] error:", error);
        return res.status(500).json({
            message: "Ошибка сохранения решения",
        });
    }
});

// Получить КСА (опционально фильтровать по региону ?regId=...)
app.get("/ksa", authMiddleware, async (req, res) => {
    const { regId, regCode } = req.query;
    console.log("[GET /ksa] query:", { regId, regCode });

    const candidates = [regId, regCode]
        .filter(Boolean)
        .map((value) => String(value).trim())
        .filter((value) => value.length > 0);

    const variants = new Set(candidates);

    for (const value of candidates) {
        const numeric = Number(value);
        if (!Number.isNaN(numeric)) {
            variants.add(String(numeric));
            variants.add(String(numeric).padStart(2, "0"));
        }
    }

    const variantList = Array.from(variants);
    const filter =
        variantList.length > 0
            ? {
                  $or: [
                      { reg_id: { $in: variantList } },
                      { id_reg: { $in: variantList } },
                      { reg: { $in: variantList } },
                  ],
              }
            : {};

    const ksa = await fetchKsaSafe(filter);

    if (ksa.length > 0) {
        console.log("[GET /ksa] first result sample:", {
            id_ksa: ksa[0].id_ksa,
            reg_id: ksa[0].reg_id,
            id_reg: ksa[0].id_reg,
            reg: ksa[0].reg,
            ksa_naimenovanie: ksa[0].ksa_naimenovanie,
        });
    } else {
        const sample = await Ksa.findOne({}, { reg_id: 1, id_reg: 1, reg: 1 });
        console.log("[GET /ksa] sample from collection:", sample);
    }

    res.send(ksa);
    return ksa;
});

const RECONNECT_INTERVAL_MS = 30000;
let connected = false;

async function connectMongo() {
    if (connected) {
        return;
    }

    console.log("[Mongo] using MONGO_URI:", MONGO_URI);

    try {
        await mongoose.connect(MONGO_URI, MONGO_CONNECT_OPTIONS);
        connected = true;
        console.log("[Mongo] connected");
        return;
    } catch (primaryError) {
        console.error("[Mongo] primary connect failed:", primaryError.message);
    }

    if (MONGO_URI !== FALLBACK_LOCAL_URI) {
        try {
            console.log("[Mongo] trying fallback local uri...");
            await mongoose.connect(FALLBACK_LOCAL_URI, MONGO_CONNECT_OPTIONS);
            connected = true;
            console.log("[Mongo] connected to fallback local uri");
            return;
        } catch (fallbackError) {
            console.error(
                "[Mongo] fallback connect failed:",
                fallbackError.message,
            );
        }
    }

    console.error(
        "[Mongo] could not connect to any MongoDB URI. Server remains running, retrying in",
        RECONNECT_INTERVAL_MS / 1000,
        "seconds.",
    );
    setTimeout(connectMongo, RECONNECT_INTERVAL_MS);
}

mongoose.connection.on("disconnected", () => {
    connected = false;
    console.error("[Mongo] connection lost, retrying...");
    setTimeout(connectMongo, RECONNECT_INTERVAL_MS);
});

async function main() {
    app.listen(PORT, SERVER_HOST, () => {
        console.log(`Сервер запущен на ${SERVER_HOST}:${PORT}`);
    });

    await connectMongo();
}

main();
