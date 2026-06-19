const express = require("express");
const router = express.Router();
const database = require("../../services/database");
const tables = require("../constants/tableNames");
const AppError = require("../utils/appError");
const authentication = require("../middlewares/authentication");
const services = require("../utils/services");
const sendMail = require("../services/sendMail");
const status = require("../constants/forumStatus");
const tableNames = require("../constants/tableNames");
const getDateInFormate = require("../utils/getDateInFormate");
const { setNewForumUserKeys } = require("../services/forumKeyService");
const axios = require("axios"); // Add at top of file if not already present

// const forumKeyService = require("../services/forumKeyService");

router.post("/", authentication, async function (req, res, next) {
    const forumId = req.forumId;
    const userId = req.userId;
    const publicKey = req.body.publicKey;
    let forum = {};
    const insertionData = {};

    try {
        forum = await services.getForum(forumId);
        const forumMember = await services.getForumMember(
            userId,
            forum.id,
            false
        );
        if (forumMember) {
            return next(new AppError("User already member of the forum", 400));
        }
        insertionData.forumId = forum.id;
        insertionData.userId = userId;
    } catch (err) {
        return next(new AppError(err));
    }

    if (!forum.isPrivate) {
        insertionData.JoinedAt = getDateInFormate(new Date());
        try {
            const response = await database.create(
                tables.FORUM_MEMBERS,
                insertionData
            );
            return res.status(200).json({
                status: "success",
                data: {
                    message: "Member added successfully",
                    id: response.id
                }
            });
        } catch (err) {
            return next(new AppError(err));
        }
    } else {
        const memberRequest = await database.get(
            tableNames.FORUM_REQUEST,
            {
                forumId: forum.id,
                userId: insertionData.userId,
                statusId: status.Pending
            },
            null
        );
        if (!memberRequest.rows || memberRequest.rows.length > 0) {
            return next(
                new AppError(
                    `A pending request to the forum is already present`,
                    400
                )
            );
        }
        insertionData.statusId = status.Pending;
        insertionData.createdAt = getDateInFormate(new Date());
        insertionData.updatedAt = insertionData.createdAt;
        try {
            // add user public key to the user_keys table, if it does not exist already
            if (publicKey && publicKey.length !== 0) {
                const latestUserKey = await database.get(
                    tables.USER_KEYS,
                    { userId },
                    "publicKey",
                    null
                );
                if (
                    !latestUserKey.rows ||
                    latestUserKey.rows.length === 0 ||
                    latestUserKey.rows[0].publicKey !== publicKey
                ) {
                    await database.create(
                        tables.USER_KEYS,
                        {
                            userId,
                            publicKey,
                            createdAt: getDateInFormate(new Date())
                        },
                        null
                    );
                }
            }
            const response = await database.create(
                tables.FORUM_REQUEST,
                insertionData
            );
            return res.status(200).json({
                status: "success",
                data: {
                    message: "Request sent successfully",
                    id: response.id
                }
            });
        } catch (err) {
            return next(new AppError(err));
        }
    }
});

router.get("/", authentication, async function (req, res, next) {
    const forumId = req.forumId;
    const userId = req.userId;
    const params = req.query;
    let forumMember = {};
    let statusId = null;
    try {
        const forum = await services.getForum(forumId);
        forumMember = await services.getForumMember(userId, forum.id);
    } catch (err) {
        if (err instanceof AppError) {
            return next(err);
        }
        return next(new AppError(err));
    }
    if (!forumMember.isAdmin) {
        return next(
            new AppError("You are not allowed to access this resource", 403)
        );
    } else {
        if (params.statusId) {
            const response = await database.get(
                tables.FORUM_REQUEST_STATUS,
                { id: params.statusId },
                null
            );
            if (response && response.rows && response.rows.length === 0) {
                throw new AppError(
                    `Status with id ${params.statusId} does not exist`,
                    400
                );
            }
            statusId = params.statusId;
        }
        try {
            const sqlParams = [forumId];
            if (statusId) {
                sqlParams.push(statusId);
            }
            const query = `SELECT 
                u.id AS cityUserId, u.username, fr.id AS requestId, u.firstname, u.lastname, u.image, fr.statusId, fr.createdAt
                FROM forum_requests fr
                INNER JOIN users u ON u.id = fr.userId 
                WHERE fr.forumId = ? ${statusId ? "AND fr.statusId = ? " : ""} ORDER BY fr.createdAt;`;
            const response = await database.callQuery(query, sqlParams);
            return res.status(200).json({
                status: "success",
                data: response.rows
            });
        } catch (err) {
            return next(new AppError(err));
        }
    }
});

// delete the request sent to join a forum
router.delete("/:id", authentication, async function (req, res, next) {
    const forumId = req.forumId;
    const userId = req.userId;
    const memberRequestId = req.params.id;

    try {
        const forum = await services.getForum(forumId);

        const response = await database.get(
            tables.FORUM_REQUEST,
            { id: memberRequestId, forumId: forum.id, userId },
            null
        );
        if (!response.rows || response.rows.length <= 0) {
            return next(
                new AppError(
                    `No request with request id ${memberRequestId} found!`,
                    404
                )
            );
        }

        await database.deleteData(tables.FORUM_REQUEST, {
            id: memberRequestId
        });
        return res.status(200).json({
            status: "success",
            message: "User request deleted successfully"
        });
    } catch (err) {
        if (err instanceof AppError) {
            return next(err);
        }
        return next(new AppError(err));
    }
});

router.patch("/:id", authentication, async function (req, res, next) {
    const forumId = req.forumId;
    const userId = req.userId; // userId of the current user
    const memberRequestId = req.params.id; // memberRequestId of the request to be changed
    const payload = req.body;
    const language = payload.language || "de";

    // You may want to move this to a config file or env variable

    try {
        const forum = await services.getForum(forumId);
        const forumMember = await services.getForumMember(userId, forum.id);

        if (!forumMember.isAdmin) {
            return next(
                new AppError("You are not allowed to access this resource", 403)
            );
        } else {
            let response = await database.get(
                tables.FORUM_REQUEST,
                { id: memberRequestId, forumId },
                "forumId, userId"
            );
            if (!response.rows || response.rows.length <= 0) {
                return next(
                    new AppError(
                        `No request with request id ${memberRequestId} found.`,
                        404
                    )
                );
            }

            const requestingUsersId = response.rows[0].userId;
            response = await database.get(
                tables.USER_TABLE,
                { id: requestingUsersId },
                null
            );
            if (!response.rows || response.rows.length <= 0) {
                return next(
                    new AppError(`No user with user id ${userId} found.`, 400)
                );
            }

            const prospectiveMember = response.rows[0];
            if (payload.accept !== true && payload.accept !== false) {
                return next(new AppError(`Invalid input for 'accept'`, 400));
            }

            if (payload.accept) {
                const insertionData = {
                    userId: prospectiveMember.id,
                    forumId,
                    isAdmin: 0,
                    JoinedAt: getDateInFormate(new Date())
                };
                // transaction
                const coreTransaction = await database.createTransaction();
                try {
                    response = await database.createWithTransaction(
                        tables.FORUM_MEMBERS,
                        insertionData,
                        coreTransaction
                    );
                    const acceptedEmail = require(
                        `../emailTemplates/${language}/memberRequestAccept`
                    );
                    const { subject, body } = acceptedEmail(
                        prospectiveMember.firstname,
                        prospectiveMember.lastname,
                        forum.forumName
                    );
                    try {
                        // TODO: uncomment before commit
                        sendMail(prospectiveMember.email, subject, null, body);
                    } catch (error) {
                        console.log(
                            "error sending email - forum member request - patch",
                            error
                        );
                    }
                    const updationData = {
                        statusId: status.Accepted,
                        updatedAt: getDateInFormate(new Date())
                    };
                    // transaction
                    await database.updateWithTransaction(
                        tables.FORUM_REQUEST,
                        updationData,
                        { id: memberRequestId },
                        coreTransaction
                    );
                    await setNewForumUserKeys(forumId, coreTransaction);
                    try {
                        if (process.env.WEBSOCKET_ENABLED) {
                            const websoketChannelId = `forum_${forumId}`;
                            await axios.post(
                                `${process.env.WEBSOCKET_SERVER_ADDR}/publish/${websoketChannelId}?accessToken=${process.env.WEBSOCKET_ACCESS_TOKEN}`,
                                {
                                    type: "new_user_joined",
                                    data: forum
                                }
                            );
                        }
                    } catch (error) {
                        console.log(
                            "error sending websocket notification - forum member request - patch",
                            error
                        );
                    }

                    await database.commitTransaction(coreTransaction);
                    return res.status(200).json({
                        status: "success",
                        message: "User request accepted.",
                        id: response.id
                    });
                } catch (error) {
                    await database.rollbackTransaction(coreTransaction);
                    return next(new AppError(error));
                }
            } else {
                if (!payload.reason) {
                    return next(
                        new AppError(
                            "Reason for rejection should not be empty",
                            400
                        )
                    );
                }
                const updationData = {
                    statusId: status.Rejected,
                    updatedAt: getDateInFormate(new Date()),
                    reason: payload.reason
                };
                await database.update(tables.FORUM_REQUEST, updationData, {
                    id: memberRequestId
                });
                const rejectedEmail = require(
                    `../emailTemplates/${language}/memberRequestReject`
                );
                const { subject, body } = rejectedEmail(
                    prospectiveMember.firstname,
                    prospectiveMember.lastname,
                    forum.forumName,
                    req.body.reason
                );
                await sendMail(prospectiveMember.email, subject, null, body);

                return res.status(200).json({
                    status: "success",
                    data: {
                        message: "User request rejected."
                    }
                });
            }
        }
    } catch (err) {
        if (err instanceof AppError) {
            return next(err);
        }
        return next(new AppError(err));
    }
});

module.exports = router;
