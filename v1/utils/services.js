const database = require("../../services/database");
const tables = require("../constants/tableNames");
const AppError = require("./appError");
const status = require("../constants/forumStatus");

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

const getForumMemberStatus = async (forumIds, cityId, userId) => {
    try {
        let result = {};
        let noResponseForumsIDs = {};
        const filteredForumIds = forumIds;
        const forummember = await database.get(
            tables.FORUM_MEMBERS,
            { forumId: forumIds, userId },
            ["forumId", "userId"],
            cityId
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
                ["forumId", "statusId"],
                cityId
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
    cityId,
    throwErrorIfUserNotMember = true,
    cityUser = false
) => {
    try {
        if (isNaN(Number(userId)) || Number(userId) <= 0) {
            throw new AppError(`Invalid userId ${userId}`, 400);
        }

        if (isNaN(Number(forumId)) || Number(forumId) <= 0) {
            throw new AppError(`Invalid forumId ${forumId}`, 400);
        }

        let cityUserId = null;

        if (cityUser) {
            cityUserId = userId;
        } else {
            const response = await database.get(
                tables.USER_CITYUSER_MAPPING_TABLE,
                {
                    userId,
                    cityId
                }
            );
            if (response.rows && response.rows.length === 0) {
                if (!throwErrorIfUserNotMember) {
                    return null;
                }
                throw new AppError(`Invalid User '${userId}' given`, 400);
            }
            cityUserId = response.rows[0].cityUserId;
        }

        const response = await database.get(
            tables.FORUM_MEMBERS,
            {
                forumId,
                userId: cityUserId
            },
            null,
            cityId
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
    cityId,
    forumData,
    lastMessageId,
    isReversed,
    pageNo,
    pageSize
) => {
    try {
        let query;
        const params = [forumData.id, cityId];
        query = `
                SELECT * from ${tables.FORUMS_CHAT}
                WHERE forumId = ? and cityId = ?
            `;
        if (lastMessageId) {
            query += ` AND id > ?`;
            params.push(lastMessageId);
        }
        query += ` ORDER BY id ${isReversed ? "DESC" : "ASC"}`;
        if (pageSize && pageNo) {
            query += ` LIMIT ? OFFSET ?`;
            params.push(Number(pageSize));
            const offset = (pageNo - 1) * pageSize;
            params.push(offset);
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

module.exports = {
    getCity,
    getForum,
    getCityUser,
    getForumMember,
    getForumPost,
    getForumMemberStatus,
    addUserCityMapping,
    getForumMessages,
    getUser
};
