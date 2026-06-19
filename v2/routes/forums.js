const express = require("express");
const router = express.Router();
const database = require("../../services/database");
const tables = require("../constants/tableNames");
const storedProcedures = require("../constants/storedProcedures");
const AppError = require("../utils/appError");
const services = require("../utils/services");
const authentication = require("../middlewares/authentication");
const imageUpload = require("../utils/imageUpload");
const imageDelete = require("../utils/imageDelete");
const getDateInFormate = require("../utils/getDateInFormate");
const tableNames = require("../constants/tableNames");

// Return all forums in a (if city in query then forums of a city)
router.get("/", async function (req, res, next) {
    const { pageNo = 1, pageSize = 9, cityId } = req.query;

    // Validate page number
    if (isNaN(Number(pageNo)) || Number(pageNo) <= 0) {
        return next(
            new AppError("Please enter a positive integer for pageNo", 400)
        );
    }

    // Validate page size
    if (
        isNaN(Number(pageSize)) ||
        Number(pageSize) <= 0 ||
        Number(pageSize) > 20
    ) {
        return next(
            new AppError(
                "Please enter a positive integer between 1 and 20 for pageSize",
                400
            )
        );
    }

    try {
        let response;

        if (cityId) {
            // Validate cityId
            if (isNaN(Number(cityId)) || Number(cityId) <= 0) {
                return next(new AppError("Invalid cityId", 400));
            }

            // Get city to validate existence and forum support
            const city = await services.getCity(cityId);
            if (!city) {
                return next(
                    new AppError(`City with ID ${cityId} not found`, 404)
                );
            }

            // Fetch forums linked to the given cityId via forum_cities with all associated cities
            const forumsQuery = `
                SELECT f.id, f.forumName, f.createdAt, f.description, f.image, f.isPrivate,
                       GROUP_CONCAT(DISTINCT fc2.cityId) as cityIds
                FROM ${tables.FORUMS} f
                JOIN ${tables.FORUM_CITIES} fc ON f.id = fc.forumId AND fc.cityId = ?
                LEFT JOIN ${tables.FORUM_CITIES} fc2 ON f.id = fc2.forumId
                WHERE f.status = 1
                GROUP BY f.id, f.forumName, f.createdAt, f.description, f.image, f.isPrivate
                ORDER BY f.id DESC
                LIMIT ? OFFSET ?
            `;

            const offset = (pageNo - 1) * pageSize;
            const forumsResult = await database.callQuery(forumsQuery, [
                city.id,
                parseInt(pageSize),
                parseInt(offset)
            ]);

            // Transform the result to include cityIds as an array
            const transformedRows = forumsResult.rows.map((row) => ({
                ...row,
                cityIds: row.cityIds
                    ? row.cityIds.split(",").map((id) => parseInt(id))
                    : []
            }));

            response = { rows: transformedRows };
        } else {
            // Fetch all forums with their associated city IDs
            const forumsQuery = `
                SELECT f.id, f.forumName, f.createdAt, f.description, f.image, f.isPrivate,
                       GROUP_CONCAT(fc.cityId) as cityIds
                FROM ${tables.FORUMS} f
                LEFT JOIN ${tables.FORUM_CITIES} fc ON f.id = fc.forumId
                WHERE f.status = 1
                GROUP BY f.id, f.forumName, f.createdAt, f.description, f.image, f.isPrivate
                ORDER BY f.id DESC
                LIMIT ? OFFSET ?
            `;

            const offset = (pageNo - 1) * pageSize;
            const forumsResult = await database.callQuery(forumsQuery, [
                parseInt(pageSize),
                parseInt(offset)
            ]);

            // Transform the result to include cityIds as an array
            const transformedRows = forumsResult.rows.map((row) => ({
                ...row,
                cityIds: row.cityIds
                    ? row.cityIds.split(",").map((id) => parseInt(id))
                    : []
            }));

            response = { rows: transformedRows };
        }

        return res.status(200).json({
            status: "success",
            data: response.rows
        });
    } catch (err) {
        if (err instanceof AppError) {
            return next(err);
        }
        return next(new AppError(err.message || "Failed to fetch forums"));
    }
});
// get listing of forums for a user who is admin add pagination with default pageNo 1 and pageSize 10
router.get("/listings", authentication, async function (req, res, next) {
    const { pageNo = 1, pageSize = 10 } = req.query;
    const userId = req.userId;
    const forums = await services.getForumsForAdmin(
        userId,
        parseInt(pageNo),
        parseInt(pageSize)
    );
    return res.status(200).json({
        status: "success",
        data: forums
    });
});
// create a route to change forums status where only admin can change the status
router.patch("/:id/status", authentication, async function (req, res, next) {
    const forumId = req.params.id;
    const userId = req.userId;
    const payload = req.body;
    const status = payload?.status;
    // validate status should 1 or 2
    if (status !== 1 && status !== 2) {
        return next(new AppError(`Invalid status`, 400));
    }
    const forum = await services.getForumNew(forumId);
    const forumUser = await services.getForumMember(userId, forum.id);
    if (!forumUser.isAdmin) {
        return next(new AppError(`Only admins can call this endpoint`, 403));
    }
    await database.update(tables.FORUMS, { status }, { id: forum.id });
    return res.status(200).json({ status: "success" });
});

//  Get a particular forum
router.get("/:id", async function (req, res, next) {
    try {
        const forumId = req.params.id;
        // const cityId = req.cityId;
        // const city = await services.getCity(cityId);
        const forum = await services.getForumNew(forumId);

        return res.status(200).json({
            status: "success",
            data: forum
        });
    } catch (err) {
        if (err instanceof AppError) {
            return next(err);
        }
        return next(new AppError(err));
    }
});
// create a forum
router.post("/", authentication, async function (req, res, next) {
    const payload = req.body;
    const userId = req.userId;
    const cityIds = payload.cityIds;
    try {
        await services.getCities(cityIds);

        if (!payload.forumName) {
            return next(new AppError(`Forum Name is not present`, 400));
        }

        if (!payload.description) {
            return next(new AppError(`Description is not present`, 400));
        }

        if (payload.isPrivate !== false && payload.isPrivate !== true) {
            return next(new AppError(`Invalid value for isPrivate`, 400));
        }
        const currentTime = getDateInFormate(new Date());

        let insertionData = {
            forumName: payload.forumName,
            image: payload.image,
            description: payload.description,
            isPrivate: payload.isPrivate,
            createdAt: currentTime
        };

        let response = await database.create(tables.FORUMS, insertionData);
        const forumId = response.id;

        // no need for this
        // const cityUserId = await services.addUserCityMapping(req.userId, req.cityId)
        const forumCitiesData = cityIds.map((cityId) => [forumId, cityId]);

        const query = `INSERT INTO ${tableNames.FORUM_CITIES} (forumId,cityId) values ${forumCitiesData.map(() => "(?,?)").join(",")}`;

        // i want to call here call query
        const params = forumCitiesData.flat();

        await database.callQuery(query, params);

        insertionData = {
            forumId,
            userId,
            JoinedAt: currentTime,
            isAdmin: true
        };

        response = await database.create("forum_members", insertionData);

        return res.status(200).json({
            status: "success",
            id: forumId
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
    const payload = req.body;
    const updationData = {};

    try {
        const forum = await services.getForumNew(forumId);
        const forumUser = await services.getForumMember(userId, forum.id);

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

        await database.update(tables.FORUMS, updationData, { id: forum.id });
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

// delet a forum (only admin)
router.delete("/:id", authentication, async function (req, res, next) {
    const userId = req.userId;
    const forumId = req.params.id;

    try {
        const forum = await services.getForumNew(forumId);
        const forumUser = await services.getForumMember(userId, forum.id);

        if (!forumUser.isAdmin) {
            return next(
                new AppError(`You are not allowed to access this resource`, 403)
            );
        }

        await database.callStoredProcedure(storedProcedures.DELETE_FORUM, [
            forumId
        ]);

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
    const forumId = req.params.id;
    const userId = req.userId;
    const minReports = req.query.minReports || 3;

    try {
        const forum = await services.getForumNew(forumId);
        const forumUser = await services.getForumMember(userId, forum.id);

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
            FROM forum_post_reports rp
            INNER JOIN
            forum_posts fp on rp.postId = fp.id
            WHERE fp.forumId = ${forumId}
            GROUP BY fp.id, fp.title, fp.image, fp.isHidden 
            HAVING numberOfReports >= ${minReports}
            ORDER BY numberOfReports DESC;`;
        const response = await database.callQuery(query, null);
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

router.post(
    "/:id/imageUpload",
    authentication,
    async function (req, res, next) {
        const forumId = req.params.id;
        const userId = req.userId;

        if (isNaN(Number(forumId)) || Number(forumId) <= 0) {
            next(new AppError(`Invalid Forum ${forumId}`, 404));
            return;
        }
        try {
            await services.getForumNew(forumId);
        } catch (e) {
            return next(new AppError(e));
        }

        const forumMember = await services.getForumMember(userId, forumId);

        if (!forumMember.isAdmin) {
            next(new AppError(`Only admins can update/upload images`, 403));
        }

        const { image } = req.files || {};

        if (!image) {
            next(new AppError(`Image not uploaded`, 400));
            return;
        }

        try {
            const imagePath = `user_${userId}/forum_${forumId}_image`;
            const updationData = {};

            const { uploadStatus, objectKey } = await imageUpload(
                image,
                imagePath
            );
            updationData.image = objectKey;
            if (uploadStatus === "Success") {
                await database.update(tables.FORUMS, updationData, {
                    id: forumId
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
        const forumId = req.params.id;
        const userId = req.userId;

        if (isNaN(Number(forumId)) || Number(forumId) <= 0) {
            next(new AppError(`Invalid Forum ${forumId}`, 404));
            return;
        }

        try {
            await services.getForumNew(forumId);
            await services.getForumMember(userId, forumId);
            const imagePath = `user_${userId}/forum_${forumId}_image`;

            const onSuccess = async () => {
                const updationData = {};
                updationData.image = "";
                await database.update(tables.FORUMS, updationData, {
                    id: forumId
                });
                return res.status(200).json({
                    status: "success"
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

// Get count of member requests for forums where user is admin
router.get(
    "/:id/member-requests/count",
    authentication,
    async function (req, res, next) {
        const userId = req.userId;
        const forumId = req.params.id;

        try {
            if (isNaN(Number(forumId)) || Number(forumId) <= 0) {
                return next(new AppError(`Invalid forumId ${forumId}`, 400));
            }

            // Get the count of pending member requests for the specific forum where user is admin
            const query = `
            SELECT COUNT(*) as requestCount 
            FROM forum_requests fmr
            INNER JOIN forum_members fm ON fm.forumId = fmr.forumId
            WHERE fm.userId = ? AND fm.isAdmin = true AND fmr.statusId = 1 AND fmr.forumId = ?`;

            const response = await database.callQuery(query, [userId, forumId]);

            return res.status(200).json({
                status: "success",
                data: {
                    count: response.rows[0].requestCount
                }
            });
        } catch (err) {
            if (err instanceof AppError) {
                return next(err);
            }
            return next(
                new AppError(
                    err.message || "Failed to fetch member request count"
                )
            );
        }
    }
);

module.exports = router;
