const axios = require("axios");
const express = require("express");
const router = express.Router();
const database = require("../../services/database");
const {
    sendPushNotificationToAll
} = require("../../services/sendPushNotification");
const tables = require("../constants/tableNames");
const AppError = require("../utils/appError");
const services = require("../utils/services");
const authentication = require("../middlewares/authentication");
const getDateInFormate = require("../utils/getDateInFormate");
const forumChatConst = require("../constants/forumChatConst");
const reactionTypes = require("../constants/reactionTypes");
const imageUpload = require("../utils/imageUpload");
const pdfUpload = require("../utils/pdfupload");

if (
    process.env.WEBSOCKET_ENABLED &&
    (!process.env.WEBSOCKET_SERVER_ADDR ||
        !process.env.WEBSOCKET_SERVER_ADDR.length)
) {
    throw new Error("WEBSOCKET_SERVER_ADDR must be set in .env");
}

router.get("/", authentication, async function (req, res, next) {
    // params: cityId, forumId
    // query: lastMessageId | (pageNo, pageSize), isReversed(default:true)
    const params = req.query;
    const userId = req.userId;
    const forumId = req.forumId;
    const lastMessageId = params.lastMessageId;
    const pageNo = params.pageNo || 1;
    const pageSize = params.pageSize || forumChatConst.DEFAULT_PAGE_SIZE;
    const isReversed =
        params.isReversed && params.isReversed === "false" ? false : true;

    if (
        (lastMessageId && isNaN(Number(lastMessageId))) ||
        Number(lastMessageId) < 0
    ) {
        return next(
            new AppError(
                `Please enter a positive integer for lastMessageId`,
                400
            )
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
                new AppError(
                    `Please enter a positive integer for pageSize`,
                    400
                )
            );
        }
    }

    try {
        const forum = await services.getForum(forumId);
        // Get forum member info to get joinedAt
        const forumMember = await services.getForumMember(userId, forumId); // will throw error if user is not a member of the forum
        const joinedAt = forumMember.JoinedAt;
        if (!joinedAt) {
            // Fallback: If join date is not available, default to showing all messages (legacy users)
            // You may want to enforce this field in your DB for new users
            return next(
                new AppError(
                    "Forum membership join date not found for user. Please contact support.",
                    500
                )
            );
        }

        // Get all messages as before
        let response = await services.getForumMessages(
            forum,
            lastMessageId,
            isReversed,
            pageNo,
            pageSize,
            joinedAt
        );

        // Only return messages with createdAt >= joinedAt
        if (Array.isArray(response)) {
            response = response.filter((msg) => {
                // If createdAt or joinedAt is missing, skip the message
                if (!msg.createdAt || !joinedAt) return false;
                // Compare as Date objects
                return new Date(msg.createdAt) >= new Date(joinedAt);
            });
        }

        return res.status(200).json({
            status: "success",
            data: response
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
    const forumId = req.forumId;
    const insertionData = {};
    const userId = req.userId;
    const file = req.files?.file;
    const websoketChannelId = `forum_${forumId}`;

    if (!payload) {
        return next(new AppError(`Empty payload sent`, 400));
    }

    const forum = await services.getForum(forumId);
    await services.getForumMember(userId, forumId); // will throw error if user is not a member of the forum
    const user = await services.getUser(userId);

    // Handle file upload if present
    let fileUrl = null;

    if (file) {
        const isImage =
            file.mimetype === "image/png" ||
            file.mimetype === "image/jpeg" ||
            file.mimetype === "image/jpg";
        const isPdf = file.mimetype === "application/pdf";

        if (!isImage && !isPdf) {
            throw new AppError(`Unsupported file type ${file.mimetype}`, 415);
        }
        const fileExtension = isPdf ? "_PDF.pdf" : file.mimetype.split("/")[1];

        const filePath = `user_${userId}/forum_${forumId}/chat_${Date.now()}.${fileExtension}`;
        const { uploadStatus, objectKey } = isPdf
            ? await pdfUpload(file, filePath)
            : await imageUpload(file, filePath);

        if (uploadStatus !== "Success") {
            throw new AppError("File upload failed");
        }

        fileUrl = objectKey;
    }

    // Handle message content
    if (payload.message) {
        insertionData.message = payload.message;
    }

    // Validate that at least a message or file is present
    if (!insertionData.message && !fileUrl) {
        return next(new AppError(`Either message or file is required`, 400));
    }
    // Handle parent message if present
    if (payload.parentId) {
        // Verify parent message exists and is in the same forum
        const parentMessage = await database.get(tables.FORUMS_CHAT, {
            id: payload.parentId,
            forumId
        });
        console.log(parentMessage);
        if (!parentMessage) {
            return next(new AppError(`Parent message not found`, 404));
        }
        insertionData.parentId = payload.parentId;
    }
    if (payload.groupKeyVersion) {
        insertionData.groupKeyVersion = payload.groupKeyVersion;
    }
    insertionData.senderId = userId;
    insertionData.forumId = forum.id;
    insertionData.createdAt = getDateInFormate(new Date());
    insertionData.messageType = 1;
    insertionData.fileUrl = fileUrl;

    try {
        let response = {};
        response = await database.create(
            tables.FORUMS_CHAT,
            insertionData,
            null
        );
        const chatRows = await database.callQuery(
            `
            SELECT 
                fc.*,
                u.username AS username,
                u.firstname AS firstname,
                u.lastname AS lastname,
                parent.message AS parentMessage,
                parentUser.username AS parentUsername,
                parent.groupKeyVersion AS parentGroupKeyVersion,
                COALESCE(r.reactions, JSON_ARRAY()) AS reactions,
                COALESCE(r.reactionCount, 0) AS reactionCount
            FROM ${tables.FORUMS_CHAT} fc
            INNER JOIN ${tables.USER_TABLE} u ON fc.senderId = u.id
            LEFT JOIN ${tables.FORUMS_CHAT} parent ON fc.parentId = parent.id
            LEFT JOIN ${tables.USER_TABLE} parentUser ON parent.senderId = parentUser.id
            LEFT JOIN (
                SELECT 
                    chatId,
                    COUNT(*) as reactionCount,
                    JSON_ARRAYAGG(
                        JSON_OBJECT(
                            'userId', userId,
                            'username', ur.username,
                            'reaction', CASE fcr.reaction 
                                            WHEN 'like' THEN 1 
                                            WHEN 'dislike' THEN 2 
                                            ELSE NULL 
                                        END
                        )
                    ) AS reactions
                FROM ${tables.FORUM_CHAT_REACTIONS} fcr
                INNER JOIN ${tables.USER_TABLE} ur ON fcr.userId = ur.id
                GROUP BY fcr.chatId
            ) r ON fc.id = r.chatId
            WHERE fc.id = ?
            `,
            [response.id]
        );

        const chatObject =
            chatRows.rows && chatRows.rows.length > 0 ? chatRows.rows[0] : null;

        try {
            // send axios request to websocket server websoketChannelId
            if (process.env.WEBSOCKET_ENABLED) {
                await axios.post(
                    `${process.env.WEBSOCKET_SERVER_ADDR}/publish/${websoketChannelId}?accessToken=${process.env.WEBSOCKET_ACCESS_TOKEN}`,
                    {
                        type: forumChatConst.EVENT_NEW_MESSAGE,
                        data: chatObject
                    }
                );
            }
            if (process.env.FIREBASE_PRIVATE) {
                // Get cityIds for this forum
                const citiesQuery = `
                    SELECT cityId 
                    FROM ${tables.FORUM_CITIES}
                    WHERE forumId = ?
                `;

                const forumCities = await database.callQuery(citiesQuery, [
                    forumId
                ]);
                const cityIds = forumCities.rows.map((fc) => fc.cityId);

                const payload = {
                    forumId: `${forumId}`,
                    type: "forum_chat",
                    forumData: JSON.stringify(forum),
                    messageId: `${response.id}`,
                    sender: `${userId}`,
                    cityIds: JSON.stringify(cityIds),
                    ...(insertionData.message && {
                        message: insertionData.message
                    }),
                    ...(insertionData.fileUrl && {
                        fileUrl: insertionData.fileUrl
                    }),
                    ...(insertionData.parentId && {
                        parentId: insertionData.parentId
                    })
                };
                console.dir({ payload }, { depth: null });
                const result = await sendPushNotificationToAll(
                    `groupChat_forum_${forumId}`,
                    forum.forumName,
                    `Nachricht von ${user.username}`,
                    payload
                );
                console.log(result);
            }
        } catch (err) {
            console.debug({ err });
            // Error is not returned to the user.
            // Reason: The message is already saved in the database,
            // the sender of the messages should not be receiving error messages like active users in the forum, etc.
        }

        return res.status(200).json({
            status: "success",
            id: response.id,
            data: chatObject
        });
    } catch (err) {
        return next(new AppError(err));
    }
});

router.post("/:chatId/react", authentication, async function (req, res, next) {
    const chatId = req.params.chatId;
    const forumId = req.forumId;
    const userId = req.userId;
    const { reaction } = req.body;

    if (!reaction || !Object.values(reactionTypes).includes(reaction)) {
        return next(new AppError("Invalid reaction type", 400));
    }

    try {
        const result = await services.handleForumChatReaction(
            userId,
            chatId,
            forumId,
            reaction
        );

        return res.status(200).json(result);
    } catch (err) {
        if (err instanceof AppError) {
            return next(err);
        }
        return next(new AppError(err));
    }
});

router.delete(
    "/:chatId/react",
    authentication,
    async function (req, res, next) {
        const chatId = req.params.chatId;
        const forumId = req.forumId;
        const userId = req.userId;

        try {
            const result = await services.handleForumChatReactionDelete(
                userId,
                chatId,
                forumId
            );

            return res.status(200).json(result);
        } catch (err) {
            if (err instanceof AppError) {
                return next(err);
            }
            return next(new AppError(err));
        }
    }
);

module.exports = router;
