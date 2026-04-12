import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import crypto from "crypto";
import dotenv from "dotenv";
// import * as db from "./utils/DataBaseUtils.js";
// import bodyParser from "body-parser";

dotenv.config();
dotenv.config({ path: "./src/server/config.env" });

const Schema = mongoose.Schema;
const app = express();
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));

// app.use(bodyParser.json());

const PORT = Number(process.env.PORT) || 3002;
const DEFAULT_DB_NAME = "zayzvki";
const MONGO_URI_RAW =
    process.env.ATLAS_URI || "mongodb://127.0.0.1:27017/zayzvki";
const FALLBACK_LOCAL_URI = "mongodb://127.0.0.1:27017/zayzvki";

function ensureMongoDbName(uri, dbName) {
    // already has db name in path: mongodb://host:27017/mydb or mongodb+srv://.../mydb
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

for (const devOrigin of ["http://localhost:5173", "http://127.0.0.1:5173"]) {
    if (!allowedOrigins.includes(devOrigin)) {
        allowedOrigins.push(devOrigin);
    }
}

app.use(
    cors({
        origin: (origin, callback) => {
            if (!origin) return callback(null, true);
            if (
                allowedOrigins.length === 0 ||
                allowedOrigins.includes(origin)
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
const zayavkaScheme = new Schema(
    {
        region_id: { type: String, required: true },
        region_code: { type: String },
        ksa_id: { type: String, required: true },
        ksa_address: { type: String },
        device_type: { type: String, required: true },
        device_name: { type: String, required: true },
        device_serial: { type: String, required: true },
        device_issue: { type: String, required: true },
        contact_person: { type: String, required: true },
        decision: { type: String, default: "" },
        decision_date: { type: Date, default: null },
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
const Zayavka = mongoose.model("zayavka", zayavkaScheme);

async function fetchRegionsSafe() {
    let regions = await Region.find({});
    if (regions.length > 0) return regions;

    const db = mongoose.connection.db;
    const fromRegion = await db.collection("region").find({}).toArray();
    if (fromRegion.length > 0) return fromRegion;

    const fromRegions = await db.collection("regions").find({}).toArray();
    return fromRegions;
}

async function fetchKsaSafe(filter = {}) {
    let ksa = await Ksa.find(filter);
    if (ksa.length > 0) return ksa;

    const db = mongoose.connection.db;
    const fromKsa = await db.collection("ksa").find(filter).toArray();
    if (fromKsa.length > 0) return fromKsa;

    const fromKsas = await db.collection("ksas").find(filter).toArray();
    return fromKsas;
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

function enrichZayavka(zayavka, regionById, ksaById) {
    const regionItem = regionById.get(String(zayavka.region_id));
    const ksaItem = ksaById.get(String(zayavka.ksa_id));

    return {
        ...zayavka,
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

    // 1) Try model collection first
    const deletedByModel = await Zayavka.findByIdAndDelete(idString);
    if (deletedByModel) {
        return { deleted: true, source: "model:zayavka" };
    }

    // 2) Fallback collections (same list as in fetchZayavkiSafe)
    const db = mongoose.connection.db;
    const collections = ["zayavki", "zayavka", "zayavkas", "notes", "note"];
    const filters = [{ _id: idString }];

    if (mongoose.Types.ObjectId.isValid(idString)) {
        filters.push({ _id: new mongoose.Types.ObjectId(idString) });
    }

    // Extra fallback for legacy documents where custom id fields were used.
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
        return { updated: true, source: "model:zayavka", doc: updatedByModel };
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

async function main() {
    try {
        try {
            await mongoose.connect(MONGO_URI);
        } catch (primaryError) {
            console.error(
                "[Mongo] primary connect failed:",
                primaryError.message,
            );
            if (MONGO_URI !== FALLBACK_LOCAL_URI) {
                console.log("[Mongo] trying fallback local uri...");
                await mongoose.connect(FALLBACK_LOCAL_URI);
            } else {
                throw primaryError;
            }
        }
        app.listen(PORT);
        console.log(`Сервер запущен на порту ${PORT}`);
    } catch (err) {
        return console.log(err);
    }
}

app.post("/auth/login", async (req, res) => {
    try {
        const { login, password } = req.body;

        if (!login || !password) {
            return res.status(400).json({
                message: "Укажите логин и пароль",
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

app.get("/region", authMiddleware, async (req, res) => {
    const region = await fetchRegionsSafe();
    res.send(region);
    return region;
});

app.post("/zayavki", authMiddleware, async (req, res) => {
    try {
        const {
            region_id,
            region_code,
            ksa_id,
            ksa_address,
            device_type,
            device_name,
            device_serial,
            device_issue,
            contact_person,
            device_photo,
            created_by,
        } = req.body;

        if (
            !region_id ||
            !ksa_id ||
            !device_type ||
            !device_name ||
            !device_serial ||
            !device_issue ||
            !contact_person
        ) {
            return res.status(400).json({
                message: "Не заполнены обязательные поля",
            });
        }

        const created = await Zayavka.create({
            region_id,
            region_code: region_code || "",
            ksa_id,
            ksa_address: ksa_address || "",
            device_type,
            device_name,
            device_serial,
            device_issue,
            contact_person,
            device_photo: device_photo || null,
            created_by: created_by || "-",
        });

        return res.status(201).json({
            message: "Заявка сохранена",
            id: created._id,
        });
    } catch (error) {
        console.error("[POST /zayavki] error:", error);
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

        const mongoFilter = {};
        if (status === "resolved") {
            mongoFilter.decision = { $nin: ["", "-", null] };
        } else if (status === "unresolved") {
            mongoFilter.$or = [
                { decision: { $exists: false } },
                { decision: null },
                { decision: "" },
                { decision: "-" },
            ];
        }
        if (search) {
            const regex = new RegExp(escapeRegex(search), "i");
            mongoFilter.$or = [
                ...(mongoFilter.$or || []),
                { device_serial: regex },
                { device_name: regex },
                { device_issue: regex },
                { contact_person: regex },
                { ksa_id: regex },
                { ksa_address: regex },
            ];
        }

        const totalFromModel = await Zayavka.countDocuments(mongoFilter);
        let zayavkiPage = [];
        let total = totalFromModel;

        if (totalFromModel > 0) {
            zayavkiPage = await Zayavka.find(mongoFilter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean();
        } else {
            let allFallback = await fetchZayavkiSafe();

            allFallback = allFallback.filter((item) => {
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
                if (!search) return true;
                const searchable = [
                    item.device_serial,
                    item.device_name,
                    item.device_issue,
                    item.contact_person,
                    item.ksa_id,
                    item.ksa_address,
                ]
                    .filter(Boolean)
                    .join(" ")
                    .toLowerCase();
                return searchable.includes(search.toLowerCase());
            });

            total = allFallback.length;
            zayavkiPage = allFallback.slice(skip, skip + limit);
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

        const items = zayavkiPage.map((zayavka) => {
            const enriched = enrichZayavka(zayavka, regionById, ksaById);
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
            device_issue,
            contact_person,
            ksa_address,
        } = req.body;

        if (
            !String(device_type || "").trim() ||
            !String(device_name || "").trim() ||
            !String(device_serial || "").trim() ||
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
            device_issue: String(device_issue).trim(),
            contact_person: String(contact_person).trim(),
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
        const { decision, decision_date } = req.body;

        if (!decision || !String(decision).trim()) {
            return res.status(400).json({
                message: "Поле 'Принятое решение' обязательно",
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

        const updated = await Zayavka.findByIdAndUpdate(
            id,
            {
                $set: {
                    decision: String(decision).trim(),
                    decision_date: parsedDate,
                },
            },
            { new: true },
        );

        if (!updated) {
            return res.status(404).json({
                message: "Заявка не найдена",
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

main();
