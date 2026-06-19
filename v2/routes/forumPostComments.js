const express = require("express");
const router = express.Router();
const database = require("../../services/database");
const tables = require("../constants/tableNames");
const AppError = require("../utils/appError");
const authentication = require("../middlewares/authentication");
const storedProcedures = require("../constants/storedProcedures");
const services = require("../utils/services");
const getDateInFormate = require("../utils/getDateInFormate");

router.get("/", authentication, async function (req, res, next) {
    const params = req.query;
    const forumId = req.forumId;
    const userId = req.userId;
    const postId = req.postId;
    const filters = {};
    const pageNo = params.pageNo || 1;
    const pageSize = params.pageSize || 9;
    const parentId = params.parentId || null;

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

    const forum = await services.getForum(forumId);
    filters.forumId = forum.id;
    const forumMember = await services.getForumMember(userId, forumId);

    const post = await services.getForumPost(postId, forumId, forumMember);
    filters.postId = post.id;
    try {
        if (parentId) {
            if (isNaN(Number(parentId)) || Number(parentId) <= 0) {
                throw new AppError(`Invalid parentId ${parentId}`, 400);
            }
            const response = await database.get(
                tables.FORUM_COMMENTS,
                {
                    id: parentId
                },
                null
            );
            if (response.rows && response.rows.length === 0) {
                return next(
                    new AppError(`Invalid ParentId '${parentId}' given`, 400)
                );
            }
        }
        const response = await database.callStoredProcedure(
            storedProcedures.GET_COMMENTS,
            [
                parseInt(forumId),
                parseInt(postId),
                parentId,
                (pageNo - 1) * pageSize,
                pageSize
            ]
        );

        return res.status(200).json({
            status: "success",
            data: response[0][0]
        });
    } catch (err) {
        return next(new AppError(err));
    }
});

router.post("/", authentication, async function (req, res, next) {
    const payload = req.body;
    const forumId = req.forumId;
    const postId = req.postId;
    const insertionData = {};
    const userId = req.userId;
    if (!payload) {
        return next(new AppError(`Empty payload sent`, 400));
    }

    const forum = await services.getForum(forumId);
    insertionData.forumId = forum.id;
    const forumMember = await services.getForumMember(userId, forumId);
    insertionData.userId = forumMember.userId;
    const post = await services.getForumPost(postId, forumId, forumMember);
    insertionData.postId = post.id;

    if (!payload.comment) {
        return next(new AppError(`Comment is not present`, 400));
    } else if (payload.comment.length > 1000) {
        return next(
            new AppError(`Length of Comment cannot exceed 1000 characters`, 400)
        );
    } else {
        insertionData.comment = payload.comment;
    }

    if (payload.parentId) {
        try {
            const response = await database.get(
                tables.FORUM_COMMENTS,
                {
                    id: payload.parentId
                },
                null
            );
            if (response.rows && response.rows.length === 0) {
                return next(
                    new AppError(
                        `Invalid ParentId '${payload.parentId}' given`,
                        400
                    )
                );
            }
            insertionData.parentId = payload.parentId;
        } catch (err) {
            return next(new AppError(err));
        }
    } else {
        insertionData.parentId = null;
    }

    insertionData.createdAt = getDateInFormate(new Date());

    try {
        let response = {};
        response = await database.create(tables.FORUM_COMMENTS, insertionData);
        insertionData.id = response.id;
        return res.status(200).json({
            status: "success",
            data: insertionData
        });
    } catch (err) {
        return next(new AppError(err));
    }
});

router.delete("/:id", authentication, async function (req, res, next) {
    const forumId = req.forumId;
    const postId = req.postId;
    const commentId = req.params.id;
    const filter = {};
    const userId = req.userId;

    const forum = await services.getForum(forumId);
    const forumMember = await services.getForumMember(userId, forum.id);

    const post = await services.getForumPost(postId, forumId, forumMember);
    filter.postId = post.id;

    if (!commentId) {
        return next(new AppError(`CommentId is not given`, 404));
    } else {
        try {
            const response = await database.get(
                tables.FORUM_COMMENTS,
                {
                    id: commentId
                },
                null
            );
            if (response.rows && response.rows.length === 0) {
                return next(
                    new AppError(`Invalid CommentId '${postId}' given`, 404)
                );
            }
        } catch (err) {
            return next(new AppError(err));
        }
    }

    try {
        database
            .deleteData(tables.FORUM_COMMENTS, { parentId: commentId })
            .then((response) => {})
            .catch((err) => {
                return next(new AppError(err));
            });

        database
            .deleteData(tables.FORUM_COMMENTS, { id: commentId })
            .then((response) => {})
            .catch((err) => {
                return next(new AppError(err));
            });
        return res.status(200).json({
            status: "success"
        });
    } catch (err) {
        return next(new AppError(err));
    }
});

module.exports = router;
