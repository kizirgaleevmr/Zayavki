export function compareTextValues(left, right) {
    return String(left || "").localeCompare(String(right || ""), "ru", {
        numeric: true,
        sensitivity: "base",
    });
}

export function sortByField(items, fieldName) {
    return [...items].sort((left, right) =>
        compareTextValues(left?.[fieldName], right?.[fieldName]),
    );
}

export function sortRegions(items) {
    return sortByField(items, "reg");
}

export function sortKsa(items) {
    return sortByField(items, "nomer_ksa");
}

export function sortDeviceTypes(items) {
    return sortByField(items, "type");
}

export function sortDeviceNames(items) {
    return sortByField(items, "ts_naimenovanie");
}

export function sortDeviceSerials(items) {
    return sortByField(items, "serial_number");
}
