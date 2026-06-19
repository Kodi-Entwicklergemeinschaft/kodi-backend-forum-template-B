const express = require("express");
const router = express.Router();
const database = require("../services/database");
const tables = require("../constants/tableNames");
const AppError = require("../utils/appError");
const services = require("../utils/services");
const authentication = require("../middlewares/authentication");
const storedProcedures = require("../constants/storedProcedures");
const imageUpload = require("../utils/imageUpload");
const imageDelete = require("../utils/imageDelete");
const getDateInFormate = require("../utils/getDateInFormate")

router.get("/", authentication, async function (req, res, next) {
    const params = req.query;
    const cityId = req.cityId;
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
        const city = await services.getCity(cityId);
        const forum = await services.getForum(forumId, city.id);
        filters.forumId = forum.id;
        const forumUser = await services.getForumMember(userId, forumId, cityId);

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
            cityId,
            pageNo,
            pageSize,
            ["createdAt"],
            true
        );
        return res.status(200).json({
            status: "success",
            data: response.rows,
        });
    } catch (err) {
        if (err instanceof AppError) {
            return next(err);
        }
        return next(new AppError(err));
    }
});

router.get("/:id", authentication, async function (req, res, next) {
    const params = req.query;
    const cityId = req.cityId;
    const forumId = req.forumId;
    const userId = req.userId;
    const filters = { isHidden: false };
    const postId = req.params.id;

    const city = await services.getCity(cityId);
    const forum = await services.getForum(forumId, city.id);
    filters.forumId = forum.id;
    const forumUser = await services.getForumMember(userId, forumId, cityId);

    if (params.includeHidden) {
        if (!forumUser.isAdmin) {
            filters.isHidden = false;
        }
    } else {
        filters.isHidden = false;
    }
    try {
        filters.id = postId;
        const post = await services.getForumPost(
            postId,
            forumId,
            forumUser,
            cityId
        );

        return res.status(200).json({
            status: "success",
            data: post,
        });
    } catch (err) {
        if (err instanceof AppError) {
            return next(err);
        }
        return next(new AppError(err));
    }
});

router.post("/", authentication, async function (req, res, next) {
    const payload = req.body;
    const cityId = req.cityId;
    const forumId = req.forumId;
    const insertionData = {};
    const userId = req.userId;

    if (!payload) {
        return next(new AppError(`Empty payload sent`, 400));
    }
    const city = await services.getCity(cityId);
    const forum = await services.getForum(forumId, city.id);
    insertionData.forumId = forum.id;
    const forumMember = await services.getForumMember(userId, forumId, cityId);
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
    insertionData.createdAt = getDateInFormate(new Date())

    try {
        let response = {};
        response = await database.create(
            tables.FORUMS_POST,
            insertionData,
            cityId
        );
        return res.status(200).json({
            status: "success",
            id: response.id,
        });
    } catch (err) {
        return next(new AppError(err));
    }
});

router.patch("/:id", authentication, async function (req, res, next) {
    const postId = req.params.id;
    const payload = req.body;
    const cityId = req.cityId;
    const forumId = req.forumId;
    const updationData = {};
    const userId = req.userId;

    if (!payload) {
        return next(new AppError(`Empty payload sent`, 400));
    }

    const city = await services.getCity(cityId);
    await services.getForum(forumId, city.id);
    const forumMember = await services.getForumMember(userId, forumId, cityId);

    if (!postId) {
        return next(new AppError(`PostId is not present`, 400));
    } else {
        if (isNaN(Number(postId)) || Number(postId) <= 0) {
            next(new AppError(`Invalid postId ${postId}`, 400));
            return;
        }
        const post = await services.getForumPost(
            postId,
            forumId,
            forumMember,
            cityId
        );

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

        await database.update(
            tables.FORUMS_POST,
            updationData,
            { id: post.id },
            cityId
        );

        return res.status(200).json({
            status: "success",
        });
    }
});

router.delete("/:id", authentication, async function (req, res, next) {
    const postId = req.params.id;
    const cityId = req.cityId;
    const forumId = req.forumId;
    const userId = req.userId;

    const city = await services.getCity(cityId);
    await services.getForum(forumId, city.id);
    const forumMember = await services.getForumMember(userId, forumId, cityId);

    await services.getForumPost(
        postId,
        forumId,
        forumMember,
        cityId
    );

    try {
        const imagePath = `user_${userId}/city_${cityId}_forum_${forumId}_post_${postId}`;
        const onSucccess = async () => {
            const updationData = {};
            updationData.image = "";
            await database.callStoredProcedure(
                storedProcedures.DELETE_FORUM_POST,
                [forumId, postId],
                cityId
            );
            return res.status(200).json({
                status: "success",
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

router.post(
    "/:id/imageUpload",
    authentication,
    async function (req, res, next) {
        const postId = req.params.id;
        const cityId = req.cityId;
        const forumId = req.forumId;
        const userId = req.userId;

        if (isNaN(Number(postId)) || Number(postId) <= 0) {
            next(new AppError(`Invalid PostId ${postId}`, 404));
            return;
        }

        const city = await services.getCity(cityId);
        await services.getForum(forumId, city.id);
        const forumMember = await services.getForumMember(
            userId,
            forumId,
            cityId
        );
        await services.getForumPost(
            postId,
            forumId,
            forumMember,
            cityId
        );

        const { image } = req.files || {};

        if (!image) {
            next(new AppError(`Image not uploaded`, 400));
            return;
        }

        try {
            const imagePath = `user_${userId}/city_${cityId}_forum_${forumId}_post_${postId}`;
            const updationData = {};

            const { uploadStatus, objectKey } = await imageUpload(
                image,
                imagePath
            );
            updationData.image = objectKey;
            if (uploadStatus === "Success") {
                await database.update(
                    tables.FORUMS_POST,
                    updationData,
                    { id: postId },
                    cityId
                );
                return res.status(200).json({
                    status: "success",
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
        const cityId = req.cityId;
        const forumId = req.forumId;
        const userId = req.userId;

        if (isNaN(Number(postId)) || Number(postId) <= 0) {
            next(new AppError(`Invalid PostId ${postId}`, 404));
            return;
        }

        const city = await services.getCity(cityId);
        await services.getForum(forumId, city.id);
        const forumMember = await services.getForumMember(
            userId,
            forumId,
            cityId
        );

        await services.getForumPost(
            postId,
            forumId,
            forumMember,
            cityId
        );

        try {
            const imagePath = `user_${userId}/city_${cityId}_forum_${forumId}_post_${postId}`;

            const onSucccess = async () => {
                const updationData = {};
                updationData.image = "";

                await database.update(
                    tables.FORUMS_POST,
                    updationData,
                    { id: postId },
                    cityId
                );
                return res.status(200).json({
                    status: "success",
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
