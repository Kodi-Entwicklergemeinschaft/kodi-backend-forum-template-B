const express = require("express");
const authentication = require("../middlewares/authentication");
const router = express.Router();
const services = require("../utils/services");
const AppError = require("../utils/appError");
const database = require("../../services/database");
const tables = require("../constants/tableNames");

// Fetch Chat History
router.get("/", authentication, async (req, res, next) => {
    const forumId = req.forumId;
    const postId = req.postId;
    const userId = req.userId;
    console.log("we are here babua", forumId, postId, req.params);

    try {
        const post = await services.getForumPost(postId, forumId);
        const forumUser = await services.getForumMember(userId, forumId);
        console.log({ post });
        if (post.status !== "Feedback") {
            return next(
                new AppError("Chat not available for non-feedback posts", 403)
            );
        }

        if (!(forumUser.isAdmin || post.userId === userId)) {
            return next(new AppError("Access denied", 403));
        }

        const chatHistory = await database.get(tables.POST_CHAT, { postId });
        return res
            .status(200)
            .json({ status: "success", data: chatHistory.rows });
    } catch (err) {
        console.error(err);
        return next(new AppError(err.message, 500));
    }
});

// Send Message
router.post("/", authentication, async (req, res, next) => {
    const forumId = req.forumId;
    const postId = req.postId;
    const userId = req.userId;
    const { message } = req.body;

    try {
        const post = await services.getForumPost(postId, forumId);
        const forumUser = await services.getForumMember(userId, forumId);

        if (!(forumUser.isAdmin || post.userId === userId)) {
            return next(new AppError("Access denied", 403));
        }

        await database.create(tables.POST_CHAT, {
            postId,
            senderId: userId,
            message
        });

        return res
            .status(201)
            .json({ status: "success", message: "Message sent" });
    } catch (err) {
        return next(new AppError(err.message, 500));
    }
});

module.exports = router;
