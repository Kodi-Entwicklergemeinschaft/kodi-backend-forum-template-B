const uncaughtException = require(`../emailTemplates/uncaughtException`);
const database = require('../services/database');
const tables = require('../constants/tableNames');
const axios = require("axios");
const getDateInFormate = require("./getDateInFormate")

module.exports = (err, req, res, next) => {
    err.statusCode = err.statusCode || 500;
    err.status = err.status || "error"; 
    if (err.statusCode === 500) {
        const occuredAt = new Date()
        database.create(tables.EXCEPTIONS_TABLE, { message:err.message, stackTrace:err.stack, occuredAt: getDateInFormate(occuredAt) })
        if (process.env.ENVIRONMENT === 'production') {
            const content = uncaughtException(process.env.REGION, err.message, err.stack, getDateInFormate(occuredAt))
            axios.post(process.env.WEBHOOK, content)
        }
    }
    res.status(err.statusCode).json({
        status: err.status,
        message: err.message,
    });
};