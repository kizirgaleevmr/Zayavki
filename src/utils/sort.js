/**
 * Сравнивает два текстовых значения с учётом русской локали и числовых фрагментов.
 *
 * @param {unknown} left Левое значение для сравнения.
 * @param {unknown} right Правое значение для сравнения.
 * @returns {number} Результат сравнения для `Array.prototype.sort`.
 */
export function compareTextValues(left, right) {
    return String(left || "").localeCompare(String(right || ""), "ru", {
        numeric: true,
        sensitivity: "base",
    });
}

/**
 * Возвращает отсортированную копию массива объектов по указанному полю.
 *
 * @template T
 * @param {T[]} items Исходный массив.
 * @param {keyof T} fieldName Имя поля, по которому выполняется сортировка.
 * @returns {T[]} Новый отсортированный массив.
 */
export function sortByField(items, fieldName) {
    return [...items].sort((left, right) =>
        compareTextValues(left?.[fieldName], right?.[fieldName]),
    );
}

/**
 * Сортирует список регионов по коду региона.
 *
 * @param {Record<string, any>[]} items Список регионов.
 * @returns {Record<string, any>[]} Отсортированный список регионов.
 */
export function sortRegions(items) {
    return sortByField(items, "reg");
}

/**
 * Сортирует список КСА по номеру.
 *
 * @param {Record<string, any>[]} items Список КСА.
 * @returns {Record<string, any>[]} Отсортированный список КСА.
 */
export function sortKsa(items) {
    return sortByField(items, "nomer_ksa");
}

/**
 * Сортирует типы устройств по названию.
 *
 * @param {Record<string, any>[]} items Список типов устройств.
 * @returns {Record<string, any>[]} Отсортированный список.
 */
export function sortDeviceTypes(items) {
    return sortByField(items, "type");
}

/**
 * Сортирует наименования устройств по текстовому названию.
 *
 * @param {Record<string, any>[]} items Список наименований устройств.
 * @returns {Record<string, any>[]} Отсортированный список.
 */
export function sortDeviceNames(items) {
    return sortByField(items, "ts_naimenovanie");
}

/**
 * Сортирует серийные номера устройств.
 *
 * @param {Record<string, any>[]} items Список устройств.
 * @returns {Record<string, any>[]} Отсортированный список.
 */
export function sortDeviceSerials(items) {
    return sortByField(items, "serial_number");
}
