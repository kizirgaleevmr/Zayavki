const { MongoClient } = require("mongodb");
require("dotenv").config({ path: "./config.env" });
/**
 * Подключение к базе
 */
async function connectDB() {
    const Db = process.env.ATLAS_URI;
    // создаем объект MongoClient и передаем ему строку подключения
    const mongoClient = new MongoClient(Db);
    try {
        // Подключаемся к серверу
        await mongoClient.connect();
        // // обращаемся к базе данных admin
        const db = mongoClient.db("zayzvki");
        // //получение коллекции
        const collection = await db.collection("region");
        const region = await collection.find({}).toArray();
        return region;
    } catch (err) {
        console.error(err);
    } finally {
        // Закрываем подключение при завершении работы или при ошибке
        await mongoClient.close();
        console.log("Подключение закрыто");
    }
}
module.exports = connectDB;
