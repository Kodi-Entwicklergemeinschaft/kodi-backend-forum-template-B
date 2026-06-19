function getDateInFormate(date) {
    return date.toISOString().slice(0,10) + " " + date.toLocaleString("CET", {hour: '2-digit', hour12: false,  minute:'2-digit', second:'2-digit'})
}

module.exports = getDateInFormate;
