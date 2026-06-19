const express = require("express");
const router = express.Router();
const database = require("../../services/database");
const tables = require("../constants/tableNames");
const AppError = require("../utils/appError");
const services = require("../utils/services");
const authentication = require("../middlewares/authentication");
const storedProcedures = require("../constants/storedProcedures");
const imageUpload = require("../utils/imageUpload");
const imageDelete = require("../utils/imageDelete");
const getDateInFormate = require("../utils/getDateInFormate");
const postStatus = require("../constants/postStatus");

// get posts of a forum
router.get("/", authentication, async function (req, res, next) {
    const params = req.query;
    const forumId = req.forumId;
    const userId = req.userId;
    const filters = { forumId, isHidden: false };
    const pageNo = params.pageNo || 1;
    const pageSize = params.pageSize || 9;

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
        const forum = await services.getForumNew(forumId);
        filters.forumId = forum.id;
        const forumUser = await services.getForumMember(userId, forumId);

        if (forumUser.isAdmin) {
            if (params.includeHidden === true) {
                delete filters.isHidden;
            } else if (params.isHidden === true) {
                filters.isHidden = true;
            }
        }

        let response = {};
        response = await database.get(
            tables.FORUMS_POST,
            filters,
            null,
            null,
            pageNo,
            pageSize,
            ["createdAt"],
            true
        );
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

// get a single post
router.get("/:id", authentication, async function (req, res, next) {
    const params = req.query;
    const forumId = req.forumId;
    const userId = req.userId;
    const filters = { isHidden: false };
    const postId = req.params.id;

    const forum = await services.getForumNew(forumId);
    filters.forumId = forum.id;
    const forumUser = await services.getForumMember(userId, forumId);

    if (params.includeHidden) {
        if (!forumUser.isAdmin) {
            filters.isHidden = false;
        }
    } else {
        filters.isHidden = false;
    }
    try {
        filters.id = postId;
        const post = await services.getForumPost(postId, forumId, forumUser);

        return res.status(200).json({
            status: "success",
            data: post
        });
    } catch (err) {
        if (err instanceof AppError) {
            return next(err);
        }
        return next(new AppError(err));
    }
});
// create a post
router.post("/", authentication, async function (req, res, next) {
    const payload = req.body;
    const forumId = req.forumId;
    const insertionData = {};
    const userId = req.userId;

    if (!payload) {
        return next(new AppError(`Empty payload sent`, 400));
    }
    const forum = await services.getForum(forumId);
    insertionData.forumId = forum.id;
    const forumMember = await services.getForumMember(userId, forumId);
    insertionData.userId = forumMember.userId;

    if (!payload.description) {
        return next(new AppError(`Description is not present`, 400));
    } else if (payload.description.length > 10000) {
        return next(
            new AppError(
                `Length of Description cannot exceed 10000 characters`,
                400
            )
        );
    } else {
        insertionData.description = payload.description;
    }

    if (!payload.title) {
        return next(new AppError(`Title is not present`, 400));
    } else if (payload.title.length > 255) {
        return next(
            new AppError(`Length of Title cannot exceed 255 characters`, 400)
        );
    } else {
        insertionData.title = payload.title;
    }
    if (payload.image) {
        insertionData.image = payload.image;
    }
    if (payload.isHidden) {
        if (typeof payload.isHidde === "boolean") {
            insertionData.isHidden = payload.isHidden;
        } else {
            next(new AppError(`Invalid type of isHidden`, 400));
        }
    } else {
        insertionData.isHidden = false;
    }
    insertionData.createdAt = getDateInFormate(new Date());
    if (forumMember.isAdmin) {
        insertionData.status = postStatus.Approved;
    } else {
        insertionData.status = postStatus.Pending;
    }

    try {
        let response = {};
        response = await database.create(tables.FORUMS_POST, insertionData);
        return res.status(200).json({
            status: "success",
            id: response.id
        });
    } catch (err) {
        return next(new AppError(err));
    }
});

// update a post
router.patch("/:id", authentication, async function (req, res, next) {
    const postId = req.params.id;
    const payload = req.body;
    const forumId = req.forumId;
    const updationData = {};
    const userId = req.userId;

    if (!payload) {
        return next(new AppError(`Empty payload sent`, 400));
    }

    await services.getForumNew(forumId);
    const forumMember = await services.getForumMember(userId, forumId);

    if (!postId) {
        return next(new AppError(`PostId is not present`, 400));
    } else {
        if (isNaN(Number(postId)) || Number(postId) <= 0) {
            next(new AppError(`Invalid postId ${postId}`, 400));
            return;
        }
        const post = await services.getForumPost(postId, forumId, forumMember);

        if (payload.description && payload.description.length > 10000) {
            return next(
                new AppError(
                    `Length of Description cannot exceed 10000 characters`,
                    400
                )
            );
        }
        updationData.description = payload.description;

        if (payload.title) {
            if (payload.title.length > 255) {
                return next(
                    new AppError(
                        `Length of Title cannot exceed 255 characters`,
                        400
                    )
                );
            }
            updationData.title = payload.title;
        }
        if (payload.image) {
            updationData.image = payload.image;
        }

        if (payload.isHidden) {
            if (!forumMember.isAdmin) {
                next(new AppError(`Only admins can update this field`, 403));
            }
            if (payload.isHidden === true || payload.isHidden === false) {
                updationData.isHidden = payload.isHidden;
            } else {
                next(new AppError(`Invalid type isHidden`, 400));
            }
        }

        await database.update(tables.FORUMS_POST, updationData, {
            id: post.id
        });

        return res.status(200).json({
            status: "success"
        });
    }
});

router.delete("/:id", authentication, async function (req, res, next) {
    const postId = req.params.id;
    const forumId = req.forumId;
    const userId = req.userId;
    await services.getForum(forumId);
    const forumMember = await services.getForumMember(userId, forumId);

    await services.getForumPost(postId, forumId, forumMember);

    try {
        const imagePath = `user_${userId}/forum_${forumId}_post_${postId}`;
        const onSucccess = async () => {
            const updationData = {};
            updationData.image = "";
            await database.callStoredProcedure(
                storedProcedures.DELETE_FORUM_POST,
                [forumId, postId]
            );
            return res.status(200).json({
                status: "success"
            });
        };
        const onFail = async () => {
            return next(new AppError("Image Delete failed"));
        };
        await imageDelete(imagePath, onSucccess, onFail);
    } catch (err) {
        return next(new AppError(err));
    }
});

router.patch("/:id/status", authentication, async function (req, res, next) {
    const postId = req.params.id;
    const forumId = req.forumId;
    const userId = req.userId;
    const { status } = req.body;

    try {
        const forumUser = await services.getForumMember(userId, forumId);

        if (!forumUser.isAdmin) {
            return next(
                new AppError("Only forum admins can change post status", 403)
            );
        }

        if (!["Approved", "Feedback"].includes(status)) {
            return next(
                new AppError("Invalid status. Use Approved or Feedback", 400)
            );
        }

        await database.update(
            tables.FORUMS_POST,
            { status: postStatus[status] },
            { id: postId }
        );
        return res
            .status(200)
            .json({ status: "success", message: "Post status updated" });
    } catch (err) {
        return next(new AppError(err.message, 500));
    }
});

// resubmission of a post
router.put("/resubmit", authentication, async (req, res, next) => {
    const { forumId, postId } = req.params;
    const userId = req.userId;
    const { title, description, image } = req.body;

    try {
        const post = await services.getForumPost(postId, forumId);
        if (post.userId !== userId) {
            return next(
                new AppError("Only the post creator can resubmit", 403)
            );
        }
        if (post.status !== postStatus.Feedback) {
            return next(
                new AppError("Only the feedback post can be resubmitted", 403)
            );
        }

        await database.update(
            tables.FORUMS_POST,
            { id: postId },
            {
                title,
                description,
                image,
                status: "Pending"
            }
        );

        return res.status(200).json({
            status: "success",
            message: "Post resubmitted for approval"
        });
    } catch (err) {
        return next(new AppError(err.message, 500));
    }
});

router.post(
    "/:id/imageUpload",
    authentication,
    async function (req, res, next) {
        const postId = req.params.id;
        const forumId = req.forumId;
        const userId = req.userId;

        if (isNaN(Number(postId)) || Number(postId) <= 0) {
            next(new AppError(`Invalid PostId ${postId}`, 404));
            return;
        }

        await services.getForum(forumId);
        const forumMember = await services.getForumMember(userId, forumId);
        await services.getForumPost(postId, forumId, forumMember);

        const { image } = req.files || {};

        if (!image) {
            next(new AppError(`Image not uploaded`, 400));
            return;
        }

        try {
            const imagePath = `user_${userId}/forum_${forumId}_post_${postId}`;
            const updationData = {};

            const { uploadStatus, objectKey } = await imageUpload(
                image,
                imagePath
            );
            updationData.image = objectKey;
            if (uploadStatus === "Success") {
                await database.update(tables.FORUMS_POST, updationData, {
                    id: postId
                });
                return res.status(200).json({
                    status: "success"
                });
            }
            return next(new AppError("Image Upload failed"));
        } catch (err) {
            return next(new AppError(err));
        }
    }
);

router.delete(
    "/:id/imageDelete",
    authentication,
    async function (req, res, next) {
        const postId = req.params.id;
        const forumId = req.forumId;
        const userId = req.userId;

        if (isNaN(Number(postId)) || Number(postId) <= 0) {
            next(new AppError(`Invalid PostId ${postId}`, 404));
            return;
        }

        await services.getForum(forumId);
        const forumMember = await services.getForumMember(userId, forumId);

        await services.getForumPost(postId, forumId, forumMember);

        try {
            const imagePath = `user_${userId}/forum_${forumId}_post_${postId}`;

            const onSucccess = async () => {
                const updationData = {};
                updationData.image = "";

                await database.update(tables.FORUMS_POST, updationData, {
                    id: postId
                });
                return res.status(200).json({
                    status: "success"
                });
            };
            const onFail = async () => {
                return next(new AppError("Image Delete failed"));
            };
            await imageDelete(imagePath, onSucccess, onFail);
        } catch (err) {
            return next(new AppError(err));
        }
    }
);

module.exports = router;
