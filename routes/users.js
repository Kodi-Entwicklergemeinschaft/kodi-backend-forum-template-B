const express = require("express");
const router = express.Router();
const database = require("../services/database");
const tables = require("../constants/tableNames");
const AppError = require("../utils/appError");
const status = require("../constants/forumStatus");
const roles = require("../constants/roles");
const authentication = require("../middlewares/authentication");
const services = require("../utils/services");
const getDateInFormate = require("../utils/getDateInFormate");
const forumKeyService = require("../services/forumKeyService");

router.get("/:id/forums", authentication, async function (req, res, next) {
    const userId = req.params.id;
    const params = req.query;
    const pageNo = params.pageNo || 1;
    const pageSize = params.pageSize || 9;

    if (isNaN(Number(userId)) || Number(userId) <= 0) {
        next(new AppError(`Invalid UserId ${userId}`, 400));
        return;
    }

    if (isNaN(Number(pageNo)) || Number(pageNo) <= 0) {
        return next(
            new AppError(`Please enter a positive integer for pageNo`, 400)
        );
    }

    if (
        isNaN(Number(pageSize)) ||
        Number(pageSize) <= 0 ||
        Number(pageSize) > 20
    ) {
        return next(
            new AppError(
                `Please enter a positive integer less than or equal to 20 for pageSize`,
                400
            )
        );
    }

    try {
        const cityUsers = await database.get(tables.USER_CITYUSER_MAPPING_TABLE, {
            userId
        }, null)
        const queries = [];
        for (const cityUser of cityUsers.rows) {
            const query = `SELECT 
                forumName, forumId, fm.id as memberId, image, isPrivate, isAdmin, JoinedAt, ${cityUser.cityId} as cityId FROM 
                heidi_city_${cityUser.cityId}.forums f 
                INNER JOIN 
                heidi_city_${cityUser.cityId}.forummembers fm on f.id = fm.forumId
                where userId = ${cityUser.cityUserId}`;
            queries.push(query);
        }
        if (cityUsers.rows.length > 0) {
            const query = `select * from (
                ${queries.join(" union all ")}
            ) a order by forumname LIMIT ${(pageNo - 1) * pageSize}, ${pageSize};`;
            const response = await database.callQuery(query);

            return res.status(200).json({
                status: "success",
                data: response.rows
            });
        } else {
            return res.status(200).json({
                status: "success",
                data: []
            });
        }

    } catch (err) {
        return next(new AppError(err));
    }

});

// get all requests a user has created
router.get("/:id/memberRequests", authentication, async function (req, res, next) {
    const userId = parseInt(req.params.id)
    const params = req.query;
    const filters = {};
    const requests = [];
    const filterMemberRequest = { userId };

    if (userId !== req.userId && req.roleId !== roles.Admin) {
        return next(new AppError('You are not allowed to access this resource', 403))
    }

    if (isNaN(Number(userId)) || Number(userId) <= 0) {
        return next(new AppError(`Invalid userId given`, 400));
    }
    if (params.statusId) {
        if (Object.values(status).includes(parseInt(params.statusId))) {
            filters.statusId = parseInt(params.statusId);
        } else {
            return next(new AppError(`Invalid statusId given`, 400));
        }
    }
    if (params.cityId) {
        await services.getCity(params.cityId)
        filterMemberRequest.cityId = params.cityId;
    }

    try {
        let response = await database.get(tables.USER_CITYUSER_MAPPING_TABLE, filterMemberRequest)
        const cityUsers = response.rows;
        for (const cityUser of cityUsers) {
            filters.userId = cityUser.cityUserId
            response = await database.get(tables.FORUM_REQUEST, filters, null, cityUser.cityId)
            if (response.rows.length > 0) {
                response.rows.map(r => r.cityId === cityUser.cityId)
                requests.push(...response.rows);
            }
        }
        return res.status(200).json({
            status: "success",
            data: requests
        });
    } catch (err) {
        return next(new AppError(err));
    }
});

router.get("/:id/reportedPosts", authentication, async function (req, res, next) {
    const userId = parseInt(req.params.id);
    const filters = {};
    const requests = [];

    if (userId !== req.userId || req.roleId === roles.Admin) {
        return next(new AppError('You are not allowed to access this resource', 403));
    }

    if (isNaN(Number(userId)) || Number(userId) <= 0) {
        return next(new AppError(`Invalid userId given`, 400));
    }

    try {
        let response = await database.get(tables.USER_CITYUSER_MAPPING_TABLE, { userId })
        const cityUsers = response.rows;
        for (const cityUser of cityUsers) {
            filters.userId = cityUser.cityUserId
            response = await database.get(tables.POST_REPORTS, filters, null, cityUser.cityId)
            if (response.rows.length > 0) {
                response.rows.map(r => r.cityId === cityUser.cityId)
                requests.append(response.rows);
            }
        }
        return res.status(200).json({
            status: "success",
            data: requests
        });
    } catch (err) {
        return next(new AppError(err));
    }
});

router.get('/:id/cities/:cityId/forums/:forumsId/checkMembership', authentication, async function (req, res, next) {
    const userId = parseInt(req.params.id);
    const forumId = parseInt(req.params.forumsId);
    const cityId = parseInt(req.params.cityId);

    if (isNaN(Number(userId)) || Number(userId) <= 0) {
        return next(new AppError(`Invalid userId given`, 400));
    }
    if (userId !== req.userId) {
        return next(new AppError('You are not allowed to access this resource', 403))
    }

    try {
        const city = await services.getCity(cityId);
        const forum = await services.getForum(forumId, city.id);
        const response = await services.getForumMember(userId, forum.id, cityId, false);
        if (!response) {
            res.status(200).json({
                isMember: false
            });
        } else {
            return res.status(200).json({
                isMember: true,
                memberId: response.id
            });
        }
    } catch (err) {
        return next(new AppError(err));
    }
});

router.get('/:id/cities/:cityId/checkMembership', authentication, async function (req, res, next) {
    const userId = parseInt(req.params.id);
    const cityId = parseInt(req.params.cityId);
    const params = req.query;
    const forumIds = params.forumIds.split(',').map(Number);


    if (isNaN(Number(userId)) || Number(userId) <= 0) {
        return next(new AppError(`Invalid userId given`, 400));
    }
    if (userId !== req.userId) {
        return next(new AppError('You are not allowed to access this resource', 403))
    }
    const cityUser = await services.getCityUser(userId, cityId, false);
    if (!cityUser) {
        const data = forumIds.map(forumId => { return { "forumId": +forumId, "statusId": 0 } })
        return res.status(200).json({
            status: "success",
            data
        });
    }
    try {
        const response = await services.getForumMemberStatus(forumIds, cityId, cityUser?.cityUserId);
        if (!response) {
            res.status(200).json({
                status: "success",
                data: []
            });
        } else {
            return res.status(200).json({
                status: "success",
                data: response
            });
        }
    } catch (err) {
        return next(new AppError(err));
    }
});

router.post("/update-key", authentication, async function (req, res, next) {
    // endpoint to add a new key for a user (for forum chat)
    const payload = req.body;
    const userId = req.userId;
    const publicKey = payload.publicKey;
    if (!publicKey || !publicKey.length) {
        return next(new AppError(`Invalid publicKey`, 400));
    }
    const transaction = await database.createTransaction()
    try {
        // set the user_keys for the admin
        await database.createWithTransaction(tables.USER_KEYS, { userId, publicKey, createdAt: getDateInFormate(new Date()) }, transaction);

        // when a user changes a key, 
        // new forum key has to be created and encrypted with the new key
        // and all other members key should change too
        await forumKeyService.generateNewKeysForAllUserForums(userId, transaction);
        await database.commitTransaction(transaction);
        return res.status(200).json({
            status: "success"
        });
    } catch (err) {
        if (err instanceof AppError) {
            return next(err);
        }
        await database.rollbackTransaction(transaction);
        return next(new AppError(err));
    }
});
module.exports = router;