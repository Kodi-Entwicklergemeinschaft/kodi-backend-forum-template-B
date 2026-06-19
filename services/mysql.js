const mysql = require("mysql2/promise");
require("dotenv").config();

const corePool = mysql.createPool({
    connectionLimit: process.env.DATABASE_POOL_MAX || 10, // default 10
    host: process.env.DATABASE_HOST,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
    port: process.env.DATABASE_PORT || 3306
});
const pool = { 0: corePool };

async function getConnection(cityId) {
    if (pool[cityId || 0]) {
        const connection = await pool[cityId || 0].getConnection();
        return connection;
    }
    const coreConnection = await pool[0].getConnection();
    const [rows] = await coreConnection.query(
        `SELECT * FROM cities WHERE id = ?;`,
        [cityId]
    );
    coreConnection.release();
    const cityConnectionString = rows[0].connectionString;
    const cityConnectionConfig = {};
    cityConnectionString.split(";").forEach((element) => {
        const elementList = element.split("=");
        cityConnectionConfig[elementList[0]] = elementList[1];
    });
    cityConnectionConfig.host = cityConnectionConfig.server;
    cityConnectionConfig.connectionLimit = process.env.DATABASE_POOL_MAX || 10;
    delete cityConnectionConfig.server;
    const cityConnection = mysql.createPool(cityConnectionConfig);
    pool[cityId] = cityConnection;
    const connection = cityConnection.getConnection();
    return connection;
}

module.exports = { getConnection };
