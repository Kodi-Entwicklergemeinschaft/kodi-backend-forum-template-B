const database = require("../../services/database");
async function radiusSearch(lat0, lon0, D, cityId) {
    const connection = await database.getConnection(cityId);
    connection.connect();
    const query = `SELECT * FROM Data WHERE 6371 * 2 * ASIN(SQRT(POWER(SIN((? - abs(latitude)) * pi()/180 / 2), 2) + COS(?) * COS(abs(latitude) * pi()/180) * POWER(SIN((? - longitude) * pi()/180 / 2), 2))) <= ?`;
    const queryParams = [lat0, (lat0 * Math.PI) / 180, lon0, D];
    const [rows, fields] = await connection.execute(query, queryParams);
    connection.end();
    return { rows, fields };
}

module.exports = radiusSearch;
