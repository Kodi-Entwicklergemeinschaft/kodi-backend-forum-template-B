const express = require("express");
const usersRouter = require("../v2/routes/users");
const forumsRouter = require("../v2/routes/forums");
const forumsPostRouter = require("../v2/routes/forumPosts");
const forumPostReportsRouter = require("../v2/routes/forumPostReports");
const forumMembersRouter = require("../v2/routes/forumMembers");
const forumsMemberRequestsRouter = require("../v2/routes/forumMemberRequest");
const forumPostCommentsRouter = require("../v2/routes/forumPostComments");
const forumChatRouter = require("../v2/routes/forumChat");
const forumChatRouterV2 = require("../v2/routes/forumChatV2");
const AppError = require("../utils/appError");

const router = express.Router();

router.get("/", (req, res) => {
    return res.send("Welcome to base Routes");
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
        req.query.cityId = req.params.cityId;
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
