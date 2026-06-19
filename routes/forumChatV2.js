const axios = require("axios");
const express = require("express");
const router = express.Router();
const database = require("../services/database");
const { sendPushNotificationToAll } = require("../services/sendPushNotification");
const tables = require("../constants/tableNames");
const AppError = require("../utils/appError");
const services = require("../utils/services");
const authentication = require("../middlewares/authentication");
const getDateInFormate = require("../utils/getDateInFormate");
const forumChatConst = require("../constants/forumChatConst");
const messageTypes = require("../constants/messageTypes");

if (process.env.WEBSOCKET_ENABLED && (!process.env.WEBSOCKET_SERVER_ADDR || !process.env.WEBSOCKET_SERVER_ADDR.length)) {
    throw new Error("WEBSOCKET_SERVER_ADDR must be set in .env");
}

router.get("/", authentication, async function (req, res, next) {
    // params: cityId, forumId
    // query: lastMessageId | (pageNo, pageSize), isReversed(default:true)
    const params = req.query;
    const userId = req.userId;
    const cityId = req.cityId;
    const forumId = req.forumId;
    const lastMessageId = params.lastMessageId;
    const pageNo = params.pageNo || 1;
    const pageSize = params.pageSize || forumChatConst.DEFAULT_PAGE_SIZE;
    const isReversed = params.isReversed && params.isReversed === "false" ? false : true;

    if (lastMessageId && isNaN(Number(lastMessageId)) || Number(lastMessageId) < 0) {
        return next(
            new AppError(`Please enter a positive integer for lastMessageId`, 400)
        );
    }
    if (!lastMessageId && (pageNo || pageSize)) {
        if (isNaN(Number(pageNo)) || Number(pageNo) < 0) {
            return next(
                new AppError(`Please enter a positive integer for pageNo`, 400)
            );
        }
        if (isNaN(Number(pageSize)) || Number(pageSize) <= 0) {
            return next(
                new AppError(`Please enter a positive integer for pageSize`, 400)
            );
        }
    }

    try {
        const city = await services.getCity(cityId);
        const forum = await services.getForum(forumId, city.id);
        await services.getForumMember(userId, forumId, cityId); // will throw error if user is not a member of the forum

        const response = await services.getForumMessages(city.id, forum, lastMessageId, isReversed, pageNo, pageSize);
        return res.status(200).json({
            status: "success",
            data: response,
        });
    } catch (err) {
        if (err instanceof AppError) {
            return next(err);
        }
        return next(new AppError(err));
    }
});

router.post("/", authentication, async function (req, res, next) {
    const payload = req.body;
    const cityId = req.cityId;
    const forumId = req.forumId;
    const insertionData = {};
    const userId = req.userId;
    const websoketChannelId = `city_${cityId}_forum_${forumId}`;

    if (!payload) {
        return next(new AppError(`Empty payload sent`, 400));
    }
    const city = await services.getCity(cityId);
    const forum = await services.getForum(forumId, city.id);
    await services.getForumMember(userId, forumId, cityId); // will throw error if user is not a member of the forum
    const user = await services.getUser(userId)

    if (!payload.messageType || Object.values(messageTypes).indexOf(payload.messageType) === -1) {
        return next(new AppError(`Invalid payload: messageType is required`, 400));
    }
    if (!payload.message) {
        return next(new AppError(`Invalid payload: message is required`, 400));
    }
    if (!payload.groupKeyVersion) {
        if (forum.isPrivate) {
            return next(new AppError(`Invalid payload: groupKeyVersion is required for private forums`, 400));
        }
        insertionData.groupKeyVersion = 0;
    }else{
        insertionData.groupKeyVersion = payload.groupKeyVersion;
        // check if the groupKeyVersion is the latest
        const query = `
        SELECT fuk.id, fuk.groupKeyVersion FROM ${tables.FORUM_USER_KEYS} fuk
        inner join ${tables.USER_KEYS} uk
        on fuk.userKeyId = uk.id and fuk.forumId = ? and uk.userId = ?
        ORDER BY fuk.groupKeyVersion DESC LIMIT 1`;
        const response = await database.callQuery(query, [forumId, userId]);
        // if (!response.rows.length || !response.rows[0].groupKeyVersion !== payload.groupKeyVersion) {
        //     return next(new AppError(`Invalid payload: groupKeyVersion is not the latest`, 400));
        // }
        if(!response.rows.length){
            return next(new AppError(`Invalid request`, 400));
        }else if (response.rows[0].groupKeyVersion !== payload.groupKeyVersion){
            return next(new AppError(`Invalid payload: groupKeyVersion is not the latest`, 400));
        }
    }
    if (payload.message.length > forumChatConst.CHARACTER_LIMIT) {
        // TODO: implement
    }
    insertionData.senderId = userId;
    insertionData.forumId = forum.id;
    insertionData.cityId = city.id;
    insertionData.message = payload.message;
    insertionData.messageType = payload.messageType;
    insertionData.createdAt = getDateInFormate(new Date());

    try {
        let response = {};
        response = await database.create(
            tables.FORUMS_CHAT,
            insertionData,
            null
        );
        try {
            // send axios request to websocket server websoketChannelId
            if (process.env.WEBSOCKET_ENABLED) {
                await axios.post(`${process.env.WEBSOCKET_SERVER_ADDR}/publish/${websoketChannelId}?accessToken=${process.env.WEBSOCKET_ACCESS_TOKEN}`, { type: forumChatConst.EVENT_NEW_MESSAGE });
            }
            if (process.env.FIREBASE_PRIVATE) {
                await sendPushNotificationToAll(`groupChat_city_${cityId}_forum_${forumId}`, forum.forumName, `Message from ${user.username}`, {
                    cityId: `${cityId}`,
                    forumId: `${forumId}`,
                    messageId: `${response.id}`,
                    sender: `${userId}`,
                    message: JSON.stringify(payload.message),
                });
            }
            
        } catch (err) {
            // Error is not returned to the user. 
            // Reason: The message is already saved in the database, 
            // the sender of the messages should not be receiving error messages like active users in the forum, etc.
        }
        return res.status(200).json({
            status: "success",
            id: response.id,
        });
    } catch (err) {
        return next(new AppError(err));
    }
});

module.exports = router;
