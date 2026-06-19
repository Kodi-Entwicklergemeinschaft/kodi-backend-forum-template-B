const express = require("express");
const router = express.Router();
const database = require("../../services/database");
const tables = require("../constants/tableNames");
const storedProcedures = require("../constants/storedProcedures");
const services = require("../utils/services");
const AppError = require("../utils/appError");
const authentication = require("../middlewares/authentication");
const forumKeyService = require("../services/forumKeyService");

router.get("/", authentication, async function (req, res, next) {
    const forumId = req.forumId;

    try {
        const forum = await services.getForum(forumId);
        const forumUser = await services.getForumMember(
            req.userId,
            forum.id,
            false
        );

        if (!forumUser) {
            return next(
                new AppError(`You are not allowed to access this resource`, 403)
            );
        }

        const query = `SELECT 
        u.id as userId, u.username, fm.id AS memberId, u.firstname, u.lastname, u.image, fm.isAdmin, fm.JoinedAt as joinedAt
        FROM forum_members fm
        inner join
        heidi_core.users u on u.id = fm.userId 
        WHERE fm.forumId = ? ORDER BY fm.isAdmin DESC, fm.JoinedAt DESC;`;

        const response = await database.callQuery(query, [forum.id]);

        return res.status(200).json({
            status: "success",
            data: response.rows
        });
    } catch (err) {
        if (err instanceof AppError) {
            return next(err);
        }
        return next(new AppError(err));
    }
});

router.post("/get-forum-keys", authentication, async function (req, res, next) {
    const forumId = req.forumId;
    const payload = req.body;
    let groupKeyVersions = payload.groupKeyVersions;
    if (
        !groupKeyVersions ||
        !groupKeyVersions.length ||
        !Array.isArray(groupKeyVersions)
    ) {
        // return the latest groupKey for the user
        groupKeyVersions = [];
    }
    groupKeyVersions = groupKeyVersions.map((gkv) => parseInt(gkv));

    try {
        const forum = await services.getForum(forumId);
        const forumUser = await services.getForumMember(
            req.userId,
            forum.id,
            false
        );

        if (!forumUser) {
            return next(
                new AppError(`You are not allowed to access this resource`, 403)
            );
        }

        let groupKeyVersionsFilter = "";
        let limitClause = "limit 1";

        if (groupKeyVersions.length > 0) {
            groupKeyVersionsFilter = `and fuk.groupKeyVersion in (${groupKeyVersions.join(",")})`;
            limitClause = "";
        }

        const query = `
        SELECT fuk.* from ${tables.FORUM_USER_KEYS} fuk
        inner join ${tables.USER_KEYS} uk 
        on fuk.userKeyId = uk.id and uk.userId = ? 
        and fuk.forumId = ? 
        ${groupKeyVersionsFilter} 
        order by fuk.id desc
        ${limitClause};
        `;
        const response = await database.callQuery(query, [req.userId, forumId]);

        return res.status(200).json({
            status: "success",
            data: response.rows
        });
    } catch (err) {
        if (err instanceof AppError) {
            return next(err);
        }
        return next(new AppError(err));
    }
});

router.delete("/:id", authentication, async function (req, res, next) {
    const userId = req.userId;
    const forumId = req.forumId;

    try {
        if (isNaN(Number(req.params.id)) || Number(req.params.id) <= 0) {
            return next(new AppError("Invalid member id given", 400));
        }

        const memberId = parseInt(req.params.id);
        const forum = await services.getForum(forumId);
        let response = await database.get(
            tables.FORUM_MEMBERS,
            { forumId, id: memberId },
            null
        );
        if (!response.rows || response.rows.length === 0) {
            return next(
                new AppError(
                    `Member '${memberId}' not present in forum '${forumId}'`,
                    404
                )
            );
        }
        const forumUser = await services.getForumMember(
            response.rows[0].userId,
            forum.id,
            true,
            true
        );
        const currentuser = await services.getForumMember(userId, forum.id);

        if (forumUser.id !== memberId && !currentuser.isAdmin) {
            return next(
                new AppError(`You are not allowed to access this resource`, 403)
            );
        }

        response = await database.get(
            tables.FORUM_MEMBERS,
            { forumId: forum.id },
            null
        );
        const forumUsers = response.rows;

        if (forumUsers.length === 1) {
            return next(
                new AppError(
                    "You cannot leave the forum as you are the only member. Delete forum instead",
                    400
                )
            );
        }

        if (
            forumUser.id === memberId &&
            forumUser.isAdmin &&
            forumUsers.filter((fm) => fm.isAdmin).length === 1
        ) {
            return next(
                new AppError(
                    "You cannot leave the forum as you are the only admin. First, make someone else an admin before leaving",
                    400
                )
            );
        }

        const coreTransaction = await database.createTransaction();
        try {
            await database.callStoredProcedureWithTransaction(
                storedProcedures.DELETE_FORUM_MEMBER,
                [forumId, forumUser.userId],
                coreTransaction
            );
            await forumKeyService.setNewForumUserKeys(
                forumId,
                coreTransaction,
                coreTransaction
            );

            await database.commitTransaction(coreTransaction);

            return res.status(200).json({
                status: "success"
            });
        } catch (error) {
            await database.rollbackTransaction(coreTransaction);
            throw error; // this will be caught by the catch block below
        }
    } catch (err) {
        if (err instanceof AppError) {
            return next(err);
        }
        return next(new AppError(err));
    }
});

router.patch("/:id", authentication, async function (req, res, next) {
    const userId = req.userId;
    const forumId = req.forumId;
    const payload = req.body;

    try {
        if (isNaN(Number(req.params.id)) || Number(req.params.id) <= 0) {
            return next(new AppError("Invalid member id given", 400));
        }

        const memberId = parseInt(req.params.id);
        const forum = await services.getForum(forumId);
        const response = await database.get(
            tables.FORUM_MEMBERS,
            { forumId: forum.id },
            null
        );
        const forumUsers = response.rows;
        const forumUser = forumUsers.find((fu) => fu.id === memberId);
        if (!forumUser) {
            return next(
                new AppError(
                    `Member '${memberId}' not present in forum '${forumId}'`,
                    404
                )
            );
        }

        const currentuser = await services.getForumMember(userId, forum.id);

        const updationData = {};

        if (payload.isAdmin === 0 || payload.isAdmin === 1) {
            if (!currentuser.isAdmin) {
                return next(
                    new AppError(
                        `You are not allowed to call this endpoint`,
                        403
                    )
                );
            } else {
                if (
                    !payload.isAdmin &&
                    currentuser.id === memberId &&
                    forumUsers.filter((fm) => fm.isAdmin).length === 1
                ) {
                    return next(
                        new AppError(
                            "You cannot remove yourself as a common member as you are the only admin. First, make someone else an admin before becoming just a member",
                            400
                        )
                    );
                }
                updationData.isAdmin = payload.isAdmin;
            }
        }

        if (updationData) {
            await database.update(tables.FORUM_MEMBERS, updationData, {
                id: memberId
            });
        }

        return res.status(200).json({
            status: "success"
        });
    } catch (err) {
        if (err instanceof AppError) {
            return next(err);
        }
        return next(new AppError(err));
    }
});

module.exports = router;
