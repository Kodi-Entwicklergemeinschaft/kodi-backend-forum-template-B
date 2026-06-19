const admin = require("firebase-admin");
const database = require("../../services/database");
const tables = require("../constants/tableNames");
const serviceAccount = process.env.FIREBASE_PRIVATE
    ? JSON.parse(process.env.FIREBASE_PRIVATE)
    : {};
const getDateInFormate = require("../utils/getDateInFormate");

try {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
} catch (err) {
    console.log("error in firebase admin initialization", err);
}

async function sendPushNotificationToAll(
    topic,
    title = "Neue Benachrichtigung",
    body = "Schauen Sie mal",
    data = null
) {
    try {
        if (!serviceAccount) return false;

        if (!topic) return false;

        const message = {
            topic,
            notification: {
                title,
                body
            },
            data
        };
        const response = await admin.messaging().send(message);
        return response;
    } catch (err) {
        try {
            const occuredAt = new Date();
            database.create(tables.EXCEPTIONS_TABLE, {
                message: err.message ?? "no message",
                stackTrace: err.stack ?? "no stack",
                occuredAt: getDateInFormate(occuredAt)
            });
        } catch (err) {}
        return false;
    }
}

async function sendPushNotificationsToUser(
    userId,
    title = "BreakingNews",
    body = "Check it out",
    data = null
) {
    const firebaseAdmin = admin.initializeApp(
        {
            credential: admin.credential.cert(serviceAccount)
        },
        "Test"
    );

    const response = await database.get(tables.FIREBASE_TOKEN, { userId });
    if (!response || response.rows?.length === 0) {
        return false;
    }
    response.rows.map(async (token) => {
        const message = {
            token: token.firebaseToken,
            notification: {
                title,
                body
            },
            data
        };
        await firebaseAdmin.messaging().send(message);
    });
    return true;
}

module.exports = { sendPushNotificationToAll, sendPushNotificationsToUser };
