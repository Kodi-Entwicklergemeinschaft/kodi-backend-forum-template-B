const database = require("../../services/database");
const tables = require("../constants/tableNames");
const encryptionService = require("../utils/encryption");
const getDateInFormate = require("../utils/getDateInFormate");

const setNewForumUserKeys = async (
    cityId,
    forumId,
    coreTransaction,
    cityTransaction
) => {
    const forumAesKey = encryptionService.createAesKey();
    const city = await database.get(tables.CITIES_TABLE, { id: cityId });
    if (!city.rows.length) {
        return;
    }
    // get forum_members
    const forumMembersQuery = `
    SELECT distinct ucum.userId from heidi_core.${tables.USER_KEYS} uk
    inner join heidi_core.${tables.USER_CITYUSER_MAPPING_TABLE} ucum
    on ucum.userId = uk.userId and ucum.cityId = ?
    inner join heidi_city_${city.rows[0].id}.${tables.FORUM_MEMBERS} fm
    on fm.userId = ucum.cityUserId and fm.forumId = ?
    `;
    const forumMembersData = await database.callQueryWithTransaction(
        forumMembersQuery,
        [cityId, forumId],
        cityTransaction
    );
    if (!forumMembersData.rows.length) {
        return;
    }
    // get user ids from forum_members
    const forumMemberUserIds = forumMembersData.rows.map((row) => row.userId);

    // get forum_members and their public keys
    const userPublicKeysQuery = `
        SELECT uk.id, uk.userId, uk.publicKey from ${tables.USER_KEYS} uk 
        JOIN (
            SELECT userId, MAX(id) AS maxId 
            FROM ${tables.USER_KEYS} 
            WHERE userId in (${forumMemberUserIds.join(",")})
            GROUP BY userId
        ) latest 
        ON uk.userId = latest.userId AND uk.id = latest.maxId`;

    const userPublicKeyData = await database.callQueryWithTransaction(
        userPublicKeysQuery,
        null,
        coreTransaction
    );
    const userPublicKeyMap = userPublicKeyData.rows.reduce((acc, row) => {
        acc[row.userId] = {
            id: row.id,
            publicKey: row.publicKey
        };
        return acc;
    }, {});

    function getRandInt(min, max) {
        return String(Math.floor(Math.random() * (max - min + 1)) + min);
    }

    // get latest key version from FORUM_USER_KEYS sort by createdAt
    const forumKeyVersionQuery = `SELECT groupKeyVersion FROM ${tables.FORUM_USER_KEYS} WHERE forumId = ? ORDER BY createdAt DESC LIMIT 1`;
    const forumKeyVersionData = await database.callQueryWithTransaction(
        forumKeyVersionQuery,
        [forumId],
        coreTransaction
    );
    const latestForumKeyVersion = forumKeyVersionData.rows.length
        ? forumKeyVersionData.rows[0].groupKeyVersion
        : getRandInt(100);
    const actualNumber = String(Number(latestForumKeyVersion)).slice(0, -3);
    const forumKeyVersion = Number(
        String(Number(actualNumber) + 1) + getRandInt(100, 999)
    );

    // encrypt forum aes key with each user's public key
    const promises = [];
    const userPublicKeys = Object.keys(userPublicKeyMap);
    for (let i = 0; i < userPublicKeys.length; i++) {
        const userId = userPublicKeys[i];
        const encryptedAesKey = encryptionService.encryptWithPublicKey(
            userPublicKeyMap[userId].publicKey,
            forumAesKey
        );
        const insertionData = {
            forumId,
            cityId,
            groupKeyVersion: forumKeyVersion,
            userKeyId: userPublicKeyMap[userId].id,
            encryptedForumAesKey: encryptedAesKey,
            createdAt: getDateInFormate(new Date())
        };
        promises.push(
            database.createWithTransaction(
                tables.FORUM_USER_KEYS,
                insertionData,
                coreTransaction
            )
        );
        // await database.createWithTransaction(tables.FORUM_USER_KEYS, insertionData, coreTransaction);
    }
    await Promise.all(promises);
};

const generateNewKeysForAllUserForums = async (userId, coreTransaction) => {
    // get use cityuser mappings for the user
    const userCityUserMappingQuery = `
    SELECT cityId, cityUserId from ${tables.USER_CITYUSER_MAPPING_TABLE}
    where userId = ?`;
    const userCityUserMappingData = await database.callQuery(
        userCityUserMappingQuery,
        [userId],
        null
    );
    if (!userCityUserMappingData.rows.length) {
        return;
    }
    const cityUserMappingDataValues = userCityUserMappingData.rows;
    for (let i = 0; i < cityUserMappingDataValues.length; i++) {
        // get the forums user was a member of
        const { cityId, cityUserId } = cityUserMappingDataValues[i];
        const forumMembersQuery = `
        SELECT forumId from ${tables.FORUM_MEMBERS} fm
        inner join ${tables.FORUMS} f
        on f.id = fm.forumId and f.isPrivate = 1
        and fm.userId = ?
        `;
        const forumMembersData = await database.callQuery(
            forumMembersQuery,
            [cityUserId],
            cityId
        );
        if (!forumMembersData.rows.length) {
            continue;
        }
        const forumIds = forumMembersData.rows.map((row) => row.forumId);
        const cityTransaction = await database.createTransaction(cityId);
        const processes = [];
        for (let j = 0; j < forumIds.length; j++) {
            processes.push(
                setNewForumUserKeys(
                    cityId,
                    forumIds[j],
                    coreTransaction,
                    cityTransaction
                )
            );
        }
        await Promise.all(processes);
        await database.commitTransaction(cityTransaction);
    }
};

module.exports = {
    setNewForumUserKeys,
    generateNewKeysForAllUserForums
};
