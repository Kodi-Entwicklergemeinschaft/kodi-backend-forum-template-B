const express = require("express");
const router = express.Router();
const database = require("../services/database");
const tables = require("../constants/tableNames");
const AppError = require("../utils/appError");
const authentication = require("../middlewares/authentication");
const services = require("../utils/services");
const getDateInFormate = require("../utils/getDateInFormate")

router.post("/", authentication, async function (req, res, next) {
    const postId = req.postId;
    const payload = req.body;
    const cityId = req.cityId;
    const forumId = req.forumId;
    const userId = req.userId;
    const Reason = req.Reason;

    if (!payload) {
        return next(new AppError(`Empty payload sent`, 400));
    }

    try {
        const city = await services.getCity(cityId);
        const forum = await services.getForum(forumId, city.id);
        const forumUser = await services.getForumMember(userId, forum.id, city.id);
        const forumPost = await services.getForumPost(postId, forum.id, forumUser, city.id);
        const currentTime = getDateInFormate(new Date())
        const response = await database.create(
            tables.POST_REPORTS,
            {
                forumId,
                Reason,
                userId: forumUser.userId,
                postId: forumPost.id,
                createdAt: currentTime
            },
            cityId
        );

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
    const payload = req.body;
    const cityId = req.cityId;
    const forumId = req.forumId;
    const userId = req.userId;

    if (!payload) {
        return next(new AppError(`Empty payload sent`, 400));
    }
        
    try {
        const city = await services.getCity(cityId);
        const forum = await services.getForum(forumId, city.id);
        const forumUser = await services.getForumMember(userId, forum.id, city.id);
        const forumPost = await services.getForumPost(postId, forum.id, forumUser, city.id);

        if (!forumUser.isAdmin) {
            return next(
                new AppError(
                    `Only admins can call this endpoint`,
                    403
                )
            );
        }

        const response = await database.get(
            tables.POST_REPORTS,
            { 
                forumId,
                postId: forumPost.id
            },
            null,
            cityId);

        return res.status(200).json({
            status: "success",
            data: response.rows
        });
    } catch (err) {
        return next(new AppError(err));
    }
});

module.exports = router;
