const express = require("express");
const usersRouter = require("./users");
const forumsRouter = require("./forums");
const forumsPostRouter = require("./forumPosts");
const forumPostReportsRouter = require("./forumPostReports");
const forumMembersRouter = require("./forumMembers");
const forumsMemberRequestsRouter = require("./forumMemberRequest");
const forumPostCommentsRouter = require("./forumPostComments");
const forumChatRouter = require("./forumChat");
const forumChatRouterV2 = require("./forumChatV2");
const AppError = require("../utils/appError");

const router = express.Router();

router.get("/", (req, res) => {
    return res.send("Welcome to v1 Routes!!!!!!");
});
router.use("/users", usersRouter);
router.use(
    "/cities/:cityId/forums",
    function (req, res, next) {
        if (
            isNaN(Number(req.params.cityId)) ||
            Number(req.params.cityId) <= 0
        ) {
            return next(new AppError(`Invalid city id given`, 400));
        }
        req.cityId = req.params.cityId;
        next();
    },
    forumsRouter
);
router.use(
    "/cities/:cityId/forums/:forumId/posts",
    function (req, res, next) {
        if (
            isNaN(Number(req.params.cityId)) ||
            Number(req.params.cityId) <= 0
        ) {
            return next(new AppError("Invalid city id given", 400));
        }
        req.cityId = req.params.cityId;
        req.forumId = req.params.forumId;
        next();
    },
    forumsPostRouter
);
router.use(
    "/cities/:cityId/forums/:forumId/posts/:postId/reports",
    function (req, res, next) {
        if (
            isNaN(Number(req.params.cityId)) ||
            Number(req.params.cityId) <= 0
        ) {
            return next(new AppError("Invalid city id given", 400));
        }
        req.cityId = req.params.cityId;
        req.forumId = req.params.forumId;
        req.postId = req.params.postId;
        next();
    },
    forumPostReportsRouter
);
router.use(
    "/cities/:cityId/forums/:forumId/memberRequests",
    function (req, res, next) {
        if (
            isNaN(Number(req.params.cityId)) ||
            Number(req.params.cityId) <= 0
        ) {
            return next(new AppError("Invalid city id given", 400));
        }
        if (
            isNaN(Number(req.params.forumId)) ||
            Number(req.params.forumId) <= 0
        ) {
            return next(new AppError("Invalid forumId given", 400));
        }
        req.cityId = req.params.cityId;
        req.forumId = req.params.forumId;
        next();
    },
    forumsMemberRequestsRouter
);
router.use(
    "/cities/:cityId/forums/:forumId/members",
    function (req, res, next) {
        if (
            isNaN(Number(req.params.cityId)) ||
            Number(req.params.cityId) <= 0
        ) {
            return next(new AppError("Invalid city id given", 400));
        }
        if (
            isNaN(Number(req.params.forumId)) ||
            Number(req.params.forumId) <= 0
        ) {
            return next(new AppError("Invalid forumId given", 400));
        }
        req.cityId = req.params.cityId;
        req.forumId = req.params.forumId;
        next();
    },
    forumMembersRouter
);
router.use(
    "/cities/:cityId/forums/:forumId/posts/:postId/comments",
    function (req, res, next) {
        if (
            isNaN(Number(req.params.cityId)) ||
            Number(req.params.cityId) <= 0
        ) {
            return next(new AppError(`Invalid city id given`, 400));
        }
        req.cityId = req.params.cityId;
        req.forumId = req.params.forumId;
        req.postId = req.params.postId;
        next();
    },
    forumPostCommentsRouter
);

router.use(
    "/cities/:cityId/forums/:forumId/chat",
    function (req, res, next) {
        if (
            isNaN(Number(req.params.cityId)) ||
            Number(req.params.cityId) <= 0
        ) {
            return next(new AppError("Invalid city id given", 400));
        }
        req.cityId = req.params.cityId;
        req.forumId = req.params.forumId;
        next();
    },
    forumChatRouter
);

router.use(
    "/cities/:cityId/forums/:forumId/chat/v2",
    function (req, res, next) {
        if (
            isNaN(Number(req.params.cityId)) ||
            Number(req.params.cityId) <= 0
        ) {
            return next(new AppError("Invalid city id given", 400));
        }
        req.cityId = req.params.cityId;
        req.forumId = req.params.forumId;
        next();
    },
    forumChatRouterV2
);

module.exports = router;
