const express = require("express");
const router = express.Router();
const database = require("../../services/database");
const tables = require("../constants/tableNames");
const AppError = require("../utils/appError");
const authentication = require("../middlewares/authentication");
const services = require("../utils/services");
const getDateInFormate = require("../utils/getDateInFormate");

router.post("/", authentication, async function (req, res, next) {
    const postId = req.postId;
    const payload = req.body;
    const forumId = req.forumId;
    const userId = req.userId;

    if (!payload) {
        return next(new AppError(`Empty payload sent`, 400));
    }
    const Reason = payload.Reason;

    try {
        const forum = await services.getForum(forumId);
        const forumUser = await services.getForumMember(userId, forum.id);
        const forumPost = await services.getForumPost(
            postId,
            forum.id,
            forumUser
        );
        const currentTime = getDateInFormate(new Date());
        const response = await database.create(tables.POST_REPORTS, {
            forumId,
            Reason,
            userId: forumUser.userId,
            postId: forumPost.id,
            createdAt: currentTime
        });

        return res.status(200).json({
            status: "success",
            id: response.id
        });
    } catch (err) {
        return next(new AppError(err));
    }
});

router.get("/", authentication, async function (req, res, next) {
    const postId = req.postId;
    const forumId = req.forumId;
    const userId = req.userId;

    try {
        const forum = await services.getForum(forumId);
        const forumUser = await services.getForumMember(userId, forum.id);
        const forumPost = await services.getForumPost(
            postId,
            forum.id,
            forumUser
        );

        if (!forumUser.isAdmin) {
            return next(
                new AppError(`Only admins can call this endpoint`, 403)
            );
        }

        const response = await database.get(
            tables.POST_REPORTS,
            {
                forumId,
                postId: forumPost.id
            },
            null
        );

        return res.status(200).json({
            status: "success",
            data: response.rows
        });
    } catch (err) {
        return next(new AppError(err));
    }
});

module.exports = router;
