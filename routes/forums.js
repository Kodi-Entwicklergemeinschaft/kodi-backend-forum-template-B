const express = require("express");
const router = express.Router();
const database = require("../services/database");
const tables = require("../constants/tableNames");
const storedProcedures = require("../constants/storedProcedures");
const AppError = require("../utils/appError");
const services = require("../utils/services");
const authentication = require("../middlewares/authentication");
const imageUpload = require("../utils/imageUpload");
const imageDelete = require("../utils/imageDelete");
const getDateInFormate = require("../utils/getDateInFormate");

// Return all forums in a city
router.get("/", async function (req, res, next) {
    const params = req.query;
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
        const city = await services.getCity(req.cityId);
        const response = await database.get(tables.FORUMS, null, `id, forumName, createdAt, description, image, isPrivate, ${city.id} as cityId`, city.id, pageNo, pageSize);
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

//  Get a particular forum
router.get("/:id", async function (req, res, next) {
    try {
        const forumId = req.params.id;
        const cityId = req.cityId;
        const city = await services.getCity(cityId);
        const forum = await services.getForum(forumId, city.id);

        return res.status(200).json({
            status: "success",
            data: forum,
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
    try {
        const city = await services.getCity(cityId);

        if (!payload.forumName) {
            return next(new AppError(`Forum Name is not present`, 400));
        }

        if (!payload.description) {
            return next(new AppError(`Description is not present`, 400));
        }

        if (payload.isPrivate !== false && payload.isPrivate !== true) {
            return next(new AppError(`Invalid value for isPrivate`, 400));
        }
        const currentTime = getDateInFormate(new Date())

        let insertionData = {
            forumName: payload.forumName,
            image: payload.image,
            description: payload.description,
            isPrivate: payload.isPrivate,
            createdAt: currentTime,
        };

        let response = await database.create(
            tables.FORUMS,
            insertionData,
            city.id
        );
        const forumId = response.id;

        const cityUserId = await services.addUserCityMapping(req.userId, req.cityId)

        insertionData = {
            forumId,
            userId: cityUserId,
            JoinedAt: currentTime,
            isAdmin: true,
        };

        response = await database.create(
            tables.FORUM_MEMBERS,
            insertionData,
            cityId
        );

        return res.status(200).json({
            status: "success",
            id: forumId,
        });
    } catch (err) {
        if (err instanceof AppError) {
            return next(err);
        }
        return next(new AppError(err));
    }
});

//  Description Update a forum. (Only admins can do this)
router.patch("/:id", authentication, async function (req, res, next) {
    const forumId = req.params.id;
    const userId = req.userId;
    const cityId = req.cityId;
    const payload = req.body;
    const updationData = {};

    try {
        const city = await services.getCity(cityId);
        const forum = await services.getForum(forumId, city.id);
        const forumUser = await services.getForumMember(
            userId,
            forum.id,
            city.id
        );

        if (!forumUser.isAdmin) {
            return next(
                new AppError(`Only admins can call this endpoint`, 403)
            );
        }

        if (payload.forumName) {
            if (payload.forumName.length > 255) {
                return next(
                    new AppError(
                        `Length of forum name cannot exceed 255 characters`,
                        400
                    )
                );
            }
            updationData.forumName = payload.forumName;
        }

        if (payload.description) {
            if (payload.description.length > 10000) {
                return next(
                    new AppError(
                        `Length of Description cannot exceed 10000 characters`,
                        400
                    )
                );
            }
            updationData.description = payload.description;
        }

        if (payload.image && payload.removeImage) {
            return next(
                new AppError(
                    `Invalid Input, image and removeImage both fields present`,
                    400
                )
            );
        }
        if (payload.image) {
            updationData.image = payload.image;
        }
        if (payload.removeImage) {
            updationData.image = null;
        }

        await database.update(
            tables.FORUMS,
            updationData,
            { id: forum.id },
            cityId
        );
        return res.status(200).json({
            status: "success",
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
    const forumId = req.params.id;
    const cityId = req.cityId;

    try {
        const city = await services.getCity(cityId);
        const forum = await services.getForum(forumId, city.id);
        const forumUser = await services.getForumMember(userId, forum.id, city.id);

        if (!forumUser.isAdmin) {
            return next(new AppError(`You are not allowed to access this resource`, 403));
        }

        await database.callStoredProcedure(storedProcedures.DELETE_FORUM, [forumId], cityId);

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

router.get("/:id/reports", authentication, async function (req, res, next) {
    const cityId = req.cityId;
    const forumId = req.params.id;
    const userId = req.userId;
    const minReports = req.query.minReports || 3;

    try {
        const city = await services.getCity(cityId);
        const forum = await services.getForum(forumId, city.id);
        const forumUser = await services.getForumMember(userId, forum.id, city.id);

        if (!forumUser.isAdmin) {
            return next(
                new AppError(`Only admins can call this endpoint`, 403)
            );
        }

        if (isNaN(Number(minReports)) || Number(minReports) <= 0) {
            next(
                new AppError(`Invalid params minReports '${minReports}'`, 400)
            );
            return;
        }

        const query = `SELECT 
            fp.id, fp.title, fp.image, fp.isHidden, COUNT(fp.id) AS numberOfReports 
            FROM reportedposts rp
            INNER JOIN
            forumposts fp on rp.postId = fp.id
            WHERE fp.forumId = ${forumId}
            GROUP BY fp.id, fp.title, fp.image, fp.isHidden 
            HAVING numberOfReports >= ${minReports}
            ORDER BY numberOfReports DESC;`;
        const response = await database.callQuery(query, null, cityId);
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

router.post(
    "/:id/imageUpload",
    authentication,
    async function (req, res, next) {
        const forumId = req.params.id;
        const cityId = req.cityId;
        const userId = req.userId;

        if (isNaN(Number(forumId)) || Number(forumId) <= 0) {
            next(new AppError(`Invalid Forum ${forumId}`, 404));
            return;
        }

        const city = await services.getCity(cityId);
        await services.getForum(forumId, city.id);
        const forumMember = await services.getForumMember(
            userId,
            forumId,
            cityId
        );

        if (!forumMember.isAdmin) {
            next(new AppError(`Only admins can update/upload images`, 403));
        }

        const { image } = req.files || {};

        if (!image) {
            next(new AppError(`Image not uploaded`, 400));
            return;
        }

        try {
            const imagePath = `user_${userId}/city_${cityId}_forum_${forumId}_image`;
            const updationData = {};

            const { uploadStatus, objectKey } = await imageUpload(
                image,
                imagePath
            );
            updationData.image = objectKey;
            if (uploadStatus === "Success") {
                await database.update(
                    tables.FORUMS,
                    updationData,
                    { id: forumId },
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
        const forumId = req.params.id;
        const cityId = req.cityId;
        const userId = req.userId;

        if (isNaN(Number(forumId)) || Number(forumId) <= 0) {
            next(new AppError(`Invalid Forum ${forumId}`, 404));
            return;
        }


        try {
            const city = await services.getCity(cityId);
            await services.getForum(forumId, city.id);
            await services.getForumMember(
                userId,
                forumId,
                cityId
            );
            const imagePath = `user_${userId}/city_${cityId}_forum_${forumId}_image`;

            const onSuccess = async () => {
                const updationData = {};
                updationData.image = "";
                await database.update(
                    tables.FORUMS,
                    updationData,
                    { id: forumId },
                    cityId
                );
                return res.status(200).json({
                    status: "success",
                });
            };
            const onFail = async () => {
                return next(new AppError("Image Delete failed"));
            };

            await imageDelete(imagePath, onSuccess, onFail);
        } catch (err) {
            if (err instanceof AppError) {
                return next(err);
            }
            return next(new AppError(err));
        }
    }
);

module.exports = router;
