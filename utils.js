/**
 * @template T
 * @param {T[]} arr 
 * @param {T} value 
 * @returns {T[]}
 */
function removeItemOnce(arr, value) {
    var index = arr.indexOf(value);
    if (index > -1) {
        arr.splice(index, 1);
    }
    return arr;
}

module.exports = {
    removeItemOnce,
}
