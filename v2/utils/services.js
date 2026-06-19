const database = require("../../services/database");

const tables = require("../constants/tableNames");
const AppError = require("./appError");
const status = require("../constants/forumStatus");
const getDateInFormate = require("./getDateInFormate");
const { default: axios } = require("axios");

const getCities = async (cityIds = [], checkForums = true) => {
    try {
        if (!Array.isArray(cityIds) || cityIds.length === 0) {
            throw new AppError("Invalid cityIds array", 400);
        }

        // Filter out invalid city IDs and throw an error if any are found
        const validCityIds = cityIds.filter(
            (id) => typeof id === "number" && !isNaN(id) && id > 0
        );
        if (validCityIds.length !== cityIds.length) {
            throw new AppError("One or more cityIds are invalid", 400);
        }

        // Fetch city data from the database using the list of valid city IDs
        const response = await database.get(tables.CITIES_TABLE, {
            id: validCityIds
        });

        if (!response || !response.rows || response.rows.length === 0) {
            throw new AppError("No valid cities found", 404);
        }

        // Optionally filter cities that don't support forums
        const cities = response.rows.filter((city) => {
            if (checkForums && !city.hasForum) {
                console.warn(
                    `CityId ${city.id} cannot create forum-related endpoints`
                );
                return false;
            }
            return true;
        });

        if (cities.length === 0) {
            throw new AppError("No cities with valid forum support found", 400);
        }

        return cities;
    } catch (err) {
        if (err instanceof AppError) {
            throw err;
        }
        throw new AppError(err.message || "An unexpected error occurred");
    }
};

const getCity = async (cityId, checkForums = true) => {
    try {
        if (isNaN(Number(cityId)) || Number(cityId) <= 0) {
            throw new AppError(`Invalid cityId ${cityId}`, 400);
        }
        const response = await database.get(tables.CITIES_TABLE, {
            id: cityId
        });
        if (!response || !response.rows || response.rows.length === 0) {
            throw new AppError(`CityId ${cityId} not present`, 404);
        }

        if (!response.rows[0].hasForum && checkForums) {
            throw new AppError(
                `CityId ${cityId} can not create forum related endpoints`,
                400
            );
        }

        return response.rows[0];
    } catch (err) {
        if (err instanceof AppError) {
            throw err;
        }
        throw new AppError(err);
    }
};

const getForumNew = async (forumId) => {
    try {
        if (isNaN(Number(forumId)) || Number(forumId) <= 0) {
            throw new AppError(`Invalid forumId ${forumId}`, 400);
        }
        const response = await database.get(
            tables.FORUMS,
            { id: forumId },
            null
        );
        if (!response || !response.rows || response.rows.length === 0) {
            throw new AppError(`Forums with id ${forumId} does not exist`, 404);
        }
        // Get associated cityIds for this forum
        const citiesQuery = `
            SELECT cityId 
            FROM ${tables.FORUM_CITIES}
            WHERE forumId = ?
        `;
        const citiesResponse = await database.callQuery(citiesQuery, [forumId]);

        const forum = response.rows[0];
        forum.cityIds = citiesResponse.rows.map((row) => row.cityId);

        return forum;
    } catch (err) {
        if (err instanceof AppError) {
            throw err;
        }
        throw new AppError(err);
    }
};
const getForumsForAdmin = async (userId, pageNo, pageSize) => {
    try {
        // Build a query that joins forums and forum_members tables
        const query = `
            SELECT f.id, f.forumName, f.createdAt, f.description, f.image, f.status, f.isPrivate 
            FROM ${tables.FORUMS} f
            INNER JOIN ${tables.FORUM_MEMBERS} fm ON f.id = fm.forumId
            WHERE fm.userId = ? AND fm.isAdmin = 1
            ORDER BY f.id desc
            LIMIT ? OFFSET ?
        `;

        const offset = (pageNo - 1) * pageSize;
        const params = [userId, pageSize, offset];

        const response = await database.callQuery(query, params);
        return response.rows;
    } catch (err) {
        if (err instanceof AppError) {
            throw err;
        }
        throw new AppError(err);
    }
};

const getForum = async (forumId, cityId) => {
    try {
        if (isNaN(Number(forumId)) || Number(forumId) <= 0) {
            throw new AppError(`Invalid forumId ${forumId}`, 400);
        }
        const response = await database.get(
            tables.FORUMS,
            { id: forumId },
            null,
            cityId
        );
        if (!response || !response.rows || response.rows.length === 0) {
            throw new AppError(`Forums with id ${forumId} does not exist`, 404);
        }

        return response.rows[0];
    } catch (err) {
        if (err instanceof AppError) {
            throw err;
        }
        throw new AppError(err);
    }
};

const getForumMemberStatus = async (forumIds, userId) => {
    try {
        let result = {};
        let noResponseForumsIDs = {};
        const filteredForumIds = forumIds;
        const forummember = await database.get(
            tables.FORUM_MEMBERS,
            { forumId: forumIds, userId },
            ["forumId", "userId"]
        );
        if (forummember.rows) {
            result = forummember.rows.map((member) => {
                if (forumIds.includes(+member.forumId)) {
                    const index = filteredForumIds.indexOf(+member.forumId);
                    if (index !== -1) {
                        filteredForumIds.splice(index, 1);
                    }
                }
                return {
                    "forumId": +member.forumId,
                    "statusId": status.Accepted
                };
            });
        }
        if (filteredForumIds.length > 0) {
            const response = await database.get(
                tables.FORUM_REQUEST,
                { forumId: filteredForumIds, userId },
                ["forumId", "statusId"]
            );
            const temp = response.rows.map((row) => row.forumId);
            noResponseForumsIDs = filteredForumIds
                .filter((forumId) => !temp.includes(+forumId))
                .map((id) => {
                    return { "forumId": +id, "statusId": 0 };
                });
            return [...result, ...response.rows, ...noResponseForumsIDs];
        } else {
            return [...result];
        }
    } catch (err) {
        if (err instanceof AppError) {
            throw err;
        }
        throw new AppError(err);
    }
};

const getCityUser = async (
    userId,
    cityId,
    throwErrorIfUserNotMember = true
) => {
    try {
        const response = await database.get(
            tables.USER_CITYUSER_MAPPING_TABLE,
            { userId, cityId }
        );
        if (!response || !response.rows || response.rows.length === 0) {
            if (!throwErrorIfUserNotMember) {
                return null;
            }
            throw new AppError(`Invalid User '${userId}' given`, 400);
        }

        return response.rows[0];
    } catch (err) {
        if (err instanceof AppError) {
            throw err;
        }
        throw new AppError(err);
    }
};

const getForumMember = async (
    userId,
    forumId,
    throwErrorIfUserNotMember = true
) => {
    try {
        if (isNaN(Number(userId)) || Number(userId) <= 0) {
            throw new AppError(`Invalid userId ${userId}`, 400);
        }

        if (isNaN(Number(forumId)) || Number(forumId) <= 0) {
            throw new AppError(`Invalid forumId ${forumId}`, 400);
        }

        const response = await database.get(
            "forum_members",
            {
                forumId,
                userId
            },
            null
        );

        if (!response || !response.rows || response.rows.length === 0) {
            if (!throwErrorIfUserNotMember) {
                return null;
            }
            throw new AppError(
                `User Not found in This Forum '${forumId}' given`,
                403
            );
        }
        return response.rows[0];
    } catch (err) {
        if (err instanceof AppError) {
            throw err;
        }
        throw new AppError(err);
    }
};

const getForumPost = async (postId, forumId, forumMember, cityId) => {
    try {
        if (!postId || isNaN(Number(postId)) || Number(postId) <= 0) {
            throw new AppError(`Invalid postId ${postId}`, 400);
        }
        const response = await database.get(
            tables.FORUMS_POST,
            {
                forumId,
                id: postId
            },
            null,
            cityId
        );

        if (response && response.rows && response.rows.length === 0) {
            throw new AppError(
                `Post '${postId}' Not found in This Forum '${forumId}' given`,
                400
            );
        }
        const post = response.rows[0];
        if (post.isHidden && !forumMember.isAdmin) {
            throw new AppError(
                `You dont have authorization to view this Post`,
                403
            );
        }
        return post;
    } catch (err) {
        if (err instanceof AppError) {
            throw err;
        }
        throw new AppError(err);
    }
};

const getForumMessages = async (
    forumData,
    lastMessageId,
    isReversed,
    pageNo,
    pageSize,
    joinedAt
) => {
    try {
        let query;
        const params = [forumData.id];
        query = `
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
            WHERE fc.forumId = ?
        `;

        if (lastMessageId) {
            query += ` AND fc.id > ?`;
            params.push(lastMessageId);
        }
        if (joinedAt) {
            query += ` AND fc.createdAt > ?`;
            params.push(joinedAt);
        }
        query += `
            GROUP BY fc.id
            ORDER BY fc.id ${isReversed ? "DESC" : "ASC"}
        `;

        if (pageSize && pageNo) {
            query += ` LIMIT ? OFFSET ?`;
            params.push(Number(pageSize));
            params.push((pageNo - 1) * pageSize);
        }

        const response = await database.callQuery(query, params);
        return response.rows;
    } catch (err) {
        if (err instanceof AppError) {
            throw err;
        }
        throw new AppError(err);
    }
};

const addUserCityMapping = async (userId, cityId) => {
    try {
        let response = await database.get(tables.USER_CITYUSER_MAPPING_TABLE, {
            cityId,
            userId
        });

        let cityUserId = 0;
        if (!response.rows || response.rows.length === 0) {
            const query =
                "id, username, firstname, lastname, email, phoneNumber, image, description, website, roleId";
            const userResponse = await database.get(
                tables.USER_TABLE,
                { id: userId },
                query
            );
            const user = userResponse.rows[0];
            userId = user.id;
            delete user.id;
            response = await database.create(tables.USER_TABLE, user, cityId);
            cityUserId = response.id;
            await database.create(tables.USER_CITYUSER_MAPPING_TABLE, {
                cityId,
                userId,
                cityUserId
            });
            return cityUserId;
        } else {
            return response.rows[0].cityUserId;
        }
    } catch (err) {
        if (err instanceof AppError) {
            throw err;
        }
        throw new AppError(err);
    }
};

const getUser = async (userId) => {
    try {
        const query =
            "id, username, firstname, lastname, email, phoneNumber, image, description, website, roleId";
        const userResponse = await database.get(
            tables.USER_TABLE,
            { id: userId },
            query
        );
        if (!userResponse.rows || userResponse.rows.length === 0) {
            return null;
        } else {
            return userResponse.rows[0];
        }
    } catch (err) {
        if (err instanceof AppError) {
            throw err;
        }
        throw new AppError(err);
    }
};

const handleForumChatReaction = async (userId, chatId, forumId, reaction) => {
    try {
        // First check if the forum exists and is active
        const forum = await getForum(forumId);
        if (forum.status !== "active") {
            throw new AppError("Forum is not active", 400);
        }

        // Check if user is a forum member
        await getForumMember(userId, forumId);

        // Check if chat message exists
        const chatQuery = `SELECT * FROM ${tables.FORUMS_CHAT} WHERE id = ? AND forumId = ?`;
        const chatResponse = await database.callQuery(chatQuery, [
            chatId,
            forumId
        ]);
        if (!chatResponse.rows || chatResponse.rows.length === 0) {
            throw new AppError("Chat message not found", 404);
        }

        // Check if user has already reacted to this chat
        const existingReactionQuery = `SELECT * FROM ${tables.FORUM_CHAT_REACTIONS} WHERE userId = ? AND chatId = ?`;
        const existingReaction = await database.callQuery(
            existingReactionQuery,
            [userId, chatId]
        );
        const websoketChannelId = `forum_${forumId}`;
        const user = await database.get(tables.USER_TABLE, { id: userId });
        console.log({ user });
        const payload = {
            reaction,
            userId,
            forumId,
            chatId,
            username: user.rows[0]?.username
        };
        console.log({ payload });
        if (existingReaction.rows && existingReaction.rows.length > 0) {
            // If same reaction, do nothing
            if (existingReaction.rows[0].reaction === reaction) {
                return {
                    status: "success",
                    message: "Reaction already exists"
                };
            }

            // If different reaction, update it
            await database.callQuery(
                `UPDATE ${tables.FORUM_CHAT_REACTIONS} SET reaction = ? WHERE userId = ? AND chatId = ?`,
                [reaction, userId, chatId]
            );
            try {
                if (process.env.WEBSOCKET_ENABLED) {
                    await axios.post(
                        `${process.env.WEBSOCKET_SERVER_ADDR}/publish/${websoketChannelId}?accessToken=${process.env.WEBSOCKET_ACCESS_TOKEN}`,
                        {
                            type: "reactionUpdate",
                            data: payload
                        }
                    );
                }
            } catch (err) {
                console.log(err);
            }
            return {
                status: "success",
                message: "Reaction updated"
            };
        }

        // Create new reaction
        await database.create(tables.FORUM_CHAT_REACTIONS, {
            userId,
            chatId,
            reaction,
            createdAt: getDateInFormate(new Date())
        });

        try {
            if (process.env.WEBSOCKET_ENABLED) {
                await axios.post(
                    `${process.env.WEBSOCKET_SERVER_ADDR}/publish/${websoketChannelId}?accessToken=${process.env.WEBSOCKET_ACCESS_TOKEN}`,
                    {
                        type: "reactionUpdate",
                        data: payload
                    }
                );
            }
        } catch (err) {
            console.log(err);
        }

        return {
            status: "success",
            message: "Reaction added"
        };
    } catch (err) {
        if (err instanceof AppError) {
            throw err;
        }
        throw new AppError(err);
    }
};

const handleForumChatReactionDelete = async (userId, chatId, forumId) => {
    try {
        // First check if the forum exists and is active
        const forum = await getForum(forumId);
        if (forum.status !== "active") {
            throw new AppError("Forum is not active", 400);
        }

        // Check if user is a forum member
        await getForumMember(userId, forumId);

        // Check if chat message exists
        const chatQuery = `SELECT * FROM ${tables.FORUMS_CHAT} WHERE id = ? AND forumId = ?`;
        const chatResponse = await database.callQuery(chatQuery, [
            chatId,
            forumId
        ]);
        if (!chatResponse.rows || chatResponse.rows.length === 0) {
            throw new AppError("Chat message not found", 404);
        }

        // Check if user has a reaction to this chat
        const existingReactionQuery = `SELECT * FROM ${tables.FORUM_CHAT_REACTIONS} WHERE userId = ? AND chatId = ?`;
        const existingReaction = await database.callQuery(
            existingReactionQuery,
            [userId, chatId]
        );

        if (!existingReaction.rows || existingReaction.rows.length === 0) {
            return {
                status: "success",
                message: "No reaction to delete"
            };
        }

        // Delete the reaction
        await database.callQuery(
            `DELETE FROM ${tables.FORUM_CHAT_REACTIONS} WHERE userId = ? AND chatId = ?`,
            [userId, chatId]
        );

        const websoketChannelId = `forum_${forumId}`;
        const user = await database.get(tables.USER_TABLE, { id: userId });
        const payload = {
            userId,
            forumId,
            chatId,
            username: user.username
        };

        try {
            if (process.env.WEBSOCKET_ENABLED) {
                await axios.post(
                    `${process.env.WEBSOCKET_SERVER_ADDR}/publish/${websoketChannelId}?accessToken=${process.env.WEBSOCKET_ACCESS_TOKEN}`,
                    {
                        type: "reactionDelete",
                        data: payload
                    }
                );
            }
        } catch (err) {
            console.log(err);
        }

        return {
            status: "success",
            message: "Reaction deleted"
        };
    } catch (err) {
        if (err instanceof AppError) {
            throw err;
        }
        throw new AppError(err);
    }
};

module.exports = {
    getCity,
    getCities,
    getForumNew,
    getForum,
    getForumsForAdmin,
    getCityUser,
    getForumMember,
    getForumPost,
    getForumMemberStatus,
    addUserCityMapping,
    getForumMessages,
    getUser,
    handleForumChatReaction,
    handleForumChatReactionDelete
};
