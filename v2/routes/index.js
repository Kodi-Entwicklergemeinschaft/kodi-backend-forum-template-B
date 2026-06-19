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
const chatRouter = require("./postChat");

const router = express.Router();

router.get("/", (req, res) => {
    return res.send("Welcome to v2 Routes!!!!!!");
});
// no changes i think here
router.use("/users", usersRouter);
// remove cityId here
router.use("/forums", forumsRouter);
// removing cityid here
router.use(
    "/forums/:forumId/posts",
    function (req, res, next) {
        req.forumId = req.params.forumId;
        next();
    },
    forumsPostRouter
);
// removing cityid here
// not in use
router.use(
    "/forums/:forumId/posts/:postId/chat",
    function (req, res, next) {
        req.forumId = req.params.forumId;
        req.postId = req.params.postId;
        next();
    },
    chatRouter
);

router.use(
    "/forums/:forumId/posts/:postId/reports",
    function (req, res, next) {
        req.forumId = req.params.forumId;
        req.postId = req.params.postId;
        next();
        console.log("in the reports secontion");
    },
    forumPostReportsRouter
);

router.use(
    "/forums/:forumId/memberRequests",
    function (req, res, next) {
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
    "/forums/:forumId/members",
    function (req, res, next) {
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
// removing city id here
router.use(
    "/forums/:forumId/posts/:postId/comments",
    function (req, res, next) {
        req.forumId = req.params.forumId;
        req.postId = req.params.postId;
        next();
    },
    forumPostCommentsRouter
);

// removing city id here
router.use(
    "/forums/:forumId/chat",
    function (req, res, next) {
        req.forumId = req.params.forumId;
        next();
    },
    forumChatRouter
);
// removing cityid here
router.use(
    "/forums/:forumId/chat/v2",
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
