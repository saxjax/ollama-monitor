(function installDateTimeSort(global) {
  function normalize(direction) {
    return direction === "asc" ? "asc" : "desc";
  }

  function compareValues(left, right, direction = "desc") {
    const leftValue = Number.isFinite(left) ? left : 0;
    const rightValue = Number.isFinite(right) ? right : 0;
    const delta = leftValue - rightValue;
    return normalize(direction) === "asc" ? delta : -delta;
  }

  function compareDateTimes(left, right, direction = "desc", read = (value) => value) {
    const leftTime = Date.parse(read(left));
    const rightTime = Date.parse(read(right));
    return compareValues(Number.isFinite(leftTime) ? leftTime : 0, Number.isFinite(rightTime) ? rightTime : 0, direction);
  }

  function label(direction) {
    return normalize(direction) === "asc" ? "Oldest first" : "Newest first";
  }

  global.SaxjaxDateTimeSort = Object.freeze({ normalize, compareValues, compareDateTimes, label });
})(globalThis);
