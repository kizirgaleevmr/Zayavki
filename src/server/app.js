import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();
dotenv.config({ path: "./src/server/config.env" });

const Schema = mongoose.Schema;
const app = express();
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));

const PORT = Number(process.env.PORT) || 3002;
const DEFAULT_DB_NAME = "zayzvki";
const MONGO_URI_RAW =
    process.env.ATLAS_URI || "mongodb://127.0.0.1:27017/zayzvki";
const FALLBACK_LOCAL_URI = "mongodb://127.0.0.1:27017/zayzvki";
const MONGO_CONNECT_OPTIONS = {
    serverSelectionTimeoutMS: 5000,
};
const REQUEST_BASIS_OPTIONS = ["Дооснащение", "Ремонт тс"];
const DECISION_KIND_OPTIONS = [
    "supplement",
    "repair_on_site",
    "replacement",
];

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

function isAllowedDevOrigin(origin) {
    return /^https?:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);
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

function createToken() {
    return crypto.randomBytes(32).toString("hex");
}

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
        move_date: { type: Date, default: Date.now },
        status: { type: String, default: "на отправку" },
        delivery_method: { type: String, default: "" },
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

function formatRequestNumber(date, sequenceNumber) {
    const valueDate = date instanceof Date ? date : new Date(date);
    const year = valueDate.getFullYear();
    const month = String(valueDate.getMonth() + 1).padStart(2, "0");
    const day = String(valueDate.getDate()).padStart(2, "0");
    const sequence = String(sequenceNumber).padStart(6, "0");

    return `${year}${month}${day}${sequence}`;
}

async function getZayavkiCountSafe() {
    const fromModel = await Zayavka.countDocuments({});
    if (fromModel > 0) return fromModel;

    const db = mongoose.connection.db;
    const candidates = ["zayavki", "zayavka", "zayavkas", "notes", "note"];

    for (const collectionName of candidates) {
        const count = await db.collection(collectionName).countDocuments({});
        if (count > 0) {
            return count;
        }
    }

    return 0;
}

async function fetchRegionsSafe() {
    const regions = await Region.find({});
    if (regions.length > 0) return regions;

    const db = mongoose.connection.db;
    const fromRegion = await db.collection("region").find({}).toArray();
    if (fromRegion.length > 0) return fromRegion;

    return db.collection("regions").find({}).toArray();
}

async function fetchKsaSafe(filter = {}) {
    const ksa = await Ksa.find(filter);
    if (ksa.length > 0) return ksa;

    const db = mongoose.connection.db;
    const fromKsa = await db.collection("ksa").find(filter).toArray();
    if (fromKsa.length > 0) return fromKsa;

    return db.collection("ksas").find(filter).toArray();
}

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

async function fetchMoveTsSafe() {
    const fromModel = await MoveTs.find({}).sort({ move_date: -1, createdAt: -1 }).lean();
    if (fromModel.length > 0) return fromModel;

    const db = mongoose.connection.db;
    const candidates = ["move_ts", "movee_ts"];

    for (const collectionName of candidates) {
        const docs = await db
            .collection(collectionName)
            .find({})
            .sort({ move_date: -1, createdAt: -1 })
            .toArray();
        if (docs.length > 0) {
            return docs;
        }
    }

    return [];
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

function isResolvedDecision(decision) {
    const value = String(decision || "").trim();
    return value.length > 0 && value !== "-";
}

function escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeUrgency(value) {
    const normalized = String(value || "")
        .trim()
        .toLowerCase();
    return normalized === "urgent" ? "urgent" : "not_urgent";
}

function normalizeRequestBasis(value) {
    const normalized = String(value || "").trim().toLowerCase();
    const match = REQUEST_BASIS_OPTIONS.find(
        (item) => item.toLowerCase() === normalized,
    );

    return match || "";
}

function normalizeDecisionKind(value) {
    const normalized = String(value || "").trim().toLowerCase();
    const match = DECISION_KIND_OPTIONS.find(
        (item) => item.toLowerCase() === normalized,
    );

    return match || "";
}

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

async function createMoveTsForZayavka({
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

    return MoveTs.create({
        request_number: String(requestNumber || "").trim(),
        act_number: "",
        move_date: new Date(),
        status: "на отправку",
        delivery_method: "",
        device_type: String(deviceType || "").trim(),
        device_name: String(deviceName || "").trim(),
        device_serial: String(deviceSerial || "").trim(),
        inv_number: String(deviceItem?.inv_number || "").trim(),
        from_location: "СЦ БТИ",
        to_location: destinationKsaNumber,
        quantity: 1,
    });
}

async function upsertMoveTsForReplacementDecision({
    requestNumber,
    ksaId,
    ksaNumber,
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
                move_date: new Date(),
                status: "на отправку",
                delivery_method: "",
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

function getCreatedByValue(item) {
    return item?.created_by || item?.createdBy || item?.author || "";
}

function matchesSearchTerm(value, normalizedSearch) {
    return String(value || "")
        .toLowerCase()
        .includes(normalizedSearch);
}

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
        const totalZayavki = await getZayavkiCountSafe();
        const requestNumber = formatRequestNumber(now, totalZayavki + 1);
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
            decision:
                normalizedRequestBasis === "Дооснащение"
                    ? "Дооснащение"
                    : "",
            decision_kind:
                normalizedRequestBasis === "Дооснащение" ? "supplement" : "",
            decision_date:
                normalizedRequestBasis === "Дооснащение" ? now : null,
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

        await createMoveTsForZayavka({
            requestNumber,
            ksaId: ksa_id,
            ksaNumber: ksa_number,
            deviceType: device_type,
            deviceName: device_name,
            deviceSerial: device_serial,
            requestBasis: normalizedRequestBasis,
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
                message:
                    "Не заполнены обязательные поля для редактирования",
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

        if (!decision_date) {
            return res.status(400).json({
                message:
                    "Поле 'Дата решения' обязательно",
            });
        }

        const parsedDate = new Date(decision_date);
        if (Number.isNaN(parsedDate.getTime())) {
            return res.status(400).json({
                message: "Некорректная дата решения",
            });
        }

        const requestBasis = normalizeRequestBasis(zayavka.request_basis);
        let nextDecision = "";
        let nextDecisionKind = "";
        let nextRepairDescription = "";
        let nextReplacementDeviceType = "";
        let nextReplacementDeviceName = "";
        let nextReplacementDeviceSerial = "";
        let nextReplacementInvNumber = "";

        if (requestBasis === "Дооснащение") {
            nextDecision = "Дооснащение";
            nextDecisionKind = "supplement";
        } else {
            const normalizedDecisionKind = normalizeDecisionKind(decision_kind);

            if (!normalizedDecisionKind || normalizedDecisionKind === "supplement") {
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

        if (nextDecisionKind === "replacement") {
            await upsertMoveTsForReplacementDecision({
                requestNumber: zayavka.request_number,
                ksaId: zayavka.ksa_id,
                ksaNumber: zayavka.ksa_number,
                deviceType: nextReplacementDeviceType,
                deviceName: nextReplacementDeviceName,
                deviceSerial: nextReplacementDeviceSerial,
                invNumber: nextReplacementInvNumber,
            });
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

async function main() {
    app.listen(PORT, () => {
        console.log(`Сервер запущен на порту ${PORT}`);
    });

    try {
        await mongoose.connect(MONGO_URI, MONGO_CONNECT_OPTIONS);
        console.log("[Mongo] connected");
    } catch (primaryError) {
        console.error(
            "[Mongo] primary connect failed:",
            primaryError.message,
        );

        if (MONGO_URI === FALLBACK_LOCAL_URI) {
            return;
        }

        try {
            console.log("[Mongo] trying fallback local uri...");
            await mongoose.connect(FALLBACK_LOCAL_URI, MONGO_CONNECT_OPTIONS);
            console.log("[Mongo] connected to fallback local uri");
        } catch (fallbackError) {
            console.error(
                "[Mongo] fallback connect failed:",
                fallbackError.message,
            );
        }
    }
}

main();


