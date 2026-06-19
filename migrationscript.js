const { getConnection } = require("./services/mysql");

async function getCoreUserId(coreConn, cityId, cityUserId) {
    const [rows] = await coreConn.query(
        `SELECT userId FROM user_cityuser_mapping WHERE cityUserId = ? and cityId = ?`,
        [cityUserId, cityId]
    );
    return rows[0]?.userId;
}

async function migrateForums(cityConn, coreConn, cityId) {
    const [forums] = await cityConn.query(`SELECT * FROM forums`);
    const forumIdMap = new Map();

    for (const forum of forums) {
        // Insert forum into core DB
        const [res] = await coreConn.query(
            `INSERT INTO forums (forumName, description, createdAt, image, isPrivate) VALUES (?, ?, ?, ?, ?)`,
            [
                forum.forumName,
                forum.description,
                forum.createdAt,
                forum.image,
                forum.isPrivate
            ]
        );
        const newForumId = res.insertId;
        forumIdMap.set(forum.id, newForumId);
        console.log({ cityId, id: forum.id, newId: newForumId });

        // Insert mapping into forum_cities
        await coreConn.query(
            `INSERT INTO forum_cities (forumId, cityId) VALUES (?, ?)`,
            [newForumId, cityId]
        );

        const [userKeysUpdate] = await coreConn.query(
            `UPDATE forum_user_keys SET forumId = ? WHERE forumId = ? AND cityId = ?`,
            [newForumId, forum.id, cityId]
        );
        console.log(
            `forum_user_keys updated: ${userKeysUpdate.affectedRows} rows`
        );

        // Update forum_chat
        const [chatUpdate] = await coreConn.query(
            `UPDATE forum_chat SET forumId = ? WHERE forumId = ? AND cityId = ?`,
            [newForumId, forum.id, cityId]
        );
        console.log(`forum_chat updated: ${chatUpdate.affectedRows} rows`);
    }
    return forumIdMap;
}

async function migratePosts(cityConn, coreConn, forumIdMap, cityId) {
    const [posts] = await cityConn.query(`SELECT * FROM forumposts`);
    const postIdMap = new Map();

    for (const post of posts) {
        const newForumId = forumIdMap.get(post.forumId);
        const userId = await getCoreUserId(coreConn, cityId, post.userId);
        if (!userId) {
            console.log("user not found for ", cityId, post.userId);
            continue;
        }

        const [res] = await coreConn.query(
            `INSERT INTO forum_posts (title, description, userId, image, isHidden, status, forumId, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                post.title,
                post.description,
                userId,
                post.image,
                post.isHidden,
                1,
                newForumId,
                post.createdAt
            ]
        );
        postIdMap.set(post.id, res.insertId);
    }

    return postIdMap;
}

async function migrateRequests(cityConn, coreConn, forumIdMap, cityId) {
    const [requests] = await cityConn.query(`SELECT * FROM forumrequests`);

    for (const req of requests) {
        const newForumId = forumIdMap.get(req.forumId);
        const userId = await getCoreUserId(coreConn, cityId, req.userId);
        if (!userId) {
            console.log("user not found for ", cityId, req.userId);
            continue;
        }

        await coreConn.query(
            `INSERT INTO forum_requests (forumId, userId, statusId, createdAt, updatedAt, reason) VALUES (?, ?, ?, ?, ?, ?)`,
            [
                newForumId,
                userId,
                req.statusId,
                req.createdAt,
                req.updatedAt,
                req.reason
            ]
        );
    }
}

async function migrateMembers(cityConn, coreConn, forumIdMap, cityId) {
    const [members] = await cityConn.query(`SELECT * FROM forummembers`);

    for (const member of members) {
        const newForumId = forumIdMap.get(member.forumId);
        const userId = await getCoreUserId(coreConn, cityId, member.userId);
        if (!userId) {
            console.log("user not found for ", cityId, member.userId);
            continue;
        }

        await coreConn.query(
            `INSERT INTO forum_members (forumId, userId, joinedAt, isAdmin) VALUES (?, ?, ?, ?)`,
            [newForumId, userId, member.joinedAt, member.isAdmin]
        );
    }
}

async function migrateComments(
    cityConn,
    coreConn,
    forumIdMap,
    postIdMap,
    cityId
) {
    const [comments] = await cityConn.query(`SELECT * FROM forumcomments`);

    for (const comment of comments) {
        const newForumId = forumIdMap.get(comment.forumId);
        const newPostId = postIdMap.get(comment.postId);
        const userId = await getCoreUserId(coreConn, cityId, comment.userId);
        if (!userId) {
            console.log("user not found for ", cityId, comment.userId);
            continue;
        }

        await coreConn.query(
            `INSERT INTO forum_comments (forumId, postId, userId, comment, createdAt, parentId) VALUES (?, ?, ?, ?, ?, ?)`,
            [
                newForumId,
                newPostId,
                userId,
                comment.comment,
                comment.createdAt,
                comment.parentId
            ]
        );
    }
}

async function migrateReports(
    cityConn,
    coreConn,
    forumIdMap,
    postIdMap,
    cityId
) {
    const [reports] = await cityConn.query(`SELECT * FROM reportedposts`);

    for (const report of reports) {
        const newForumId = forumIdMap.get(report.forumId);
        const newPostId = postIdMap.get(report.postId);
        const userId = await getCoreUserId(coreConn, cityId, report.userId);
        if (!userId) {
            console.log("user not found for ", cityId, report.userId);
            continue;
        }

        await coreConn.query(
            `INSERT INTO post_reports (forumId, userId, postId, reason, createdAt) VALUES (?, ?, ?, ?, ?)`,
            [newForumId, userId, newPostId, report.Reason, report.reportedAt]
        );
    }
}

async function migrateCityDataToCore(cityId) {
    let coreConn, cityConn;

    try {
        console.log(`Starting migration for city ${cityId}`);
        coreConn = await getConnection();
        cityConn = await getConnection(cityId);

        await coreConn.beginTransaction();
        await cityConn.beginTransaction();

        const forumIdMap = await migrateForums(cityConn, coreConn, cityId);
        const postIdMap = await migratePosts(
            cityConn,
            coreConn,
            forumIdMap,
            cityId
        );
        await migrateRequests(cityConn, coreConn, forumIdMap, cityId);
        await migrateMembers(cityConn, coreConn, forumIdMap, cityId);
        await migrateComments(
            cityConn,
            coreConn,
            forumIdMap,
            postIdMap,
            cityId
        );
        await migrateReports(cityConn, coreConn, forumIdMap, postIdMap, cityId);

        await coreConn.commit();
        await cityConn.commit();
        console.log(`✅ Migration completed for city ${cityId}`);
    } catch (err) {
        if (coreConn) await coreConn.rollback();
        if (cityConn) await cityConn.rollback();
        console.error(`❌ Migration failed for city ${cityId}:`, err);
    } finally {
        if (coreConn) coreConn.release();
        if (cityConn) cityConn.release();
    }
}

async function runMigrations() {
    let conn;
    try {
        conn = await getConnection();
        const [cities] = await conn.query(`SELECT id FROM cities`);
        for (const { id } of cities) {
            await migrateCityDataToCore(id);
        }
    } catch (err) {
        console.error("Fatal error during city list fetch or migration:", err);
        process.exit(1);
    } finally {
        if (conn) conn.release();
        process.exit();
    }
}

runMigrations();
