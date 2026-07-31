import { MongoClient } from "mongodb";
// const url = "mongodb://marsel:4HDus8bl@localhost:27017/";

// создаем объект MongoClient и передаем ему строку подключения
// const mongoClient = new MongoClient(url);

/**
 * асинхронная функция для получение данных регион
 */
async function region() {
    const url = "mongodb://marsel:4HDus8bl@localhost:27017/";

    // создаем объект MongoClient и передаем ему строку подключения
    const mongoClient = new MongoClient(url);

    try {
        // Подключаемся к серверу
        await mongoClient.connect();
        // обращаемся к базе данных admin
        const db = mongoClient.db("zayavki");
        //получение коллекции
        const collection = await db.collection("region");
        const region = await collection.find({}).toArray();
        console.log(region);
    } catch (err) {
        console.log(err);
    } finally {
        // Закрываем подключение при завершении работы или при ошибке
        await mongoClient.close();
        console.log("Подключение закрыто");
    }
}
export default region;
