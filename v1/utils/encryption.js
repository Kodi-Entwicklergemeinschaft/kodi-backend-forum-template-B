const crypto = require("crypto");

const createAesKey = () => {
    return crypto.randomBytes(32).toString("base64");
};

const encryptWithPublicKey = (publicKey, value) => {
    return crypto
        .publicEncrypt(publicKey, Buffer.from(value))
        .toString("base64");
};

module.exports = {
    createAesKey,
    encryptWithPublicKey
};
