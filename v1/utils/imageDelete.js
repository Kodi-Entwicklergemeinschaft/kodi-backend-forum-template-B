const ObsClient = require("./eSDK_Storage_OBS_V2.1.4_Node.js/lib/obs");

const imageDelete = async (imagePath, onSuccess, onFail) => {
    const server = process.env.BUCKET_HOST;

    /*
     * Initialize a obs client instance with your account for accessing OBS
     */
    const obs = new ObsClient({
        accessKeyId: process.env.BUCKET_ACCESS_KEY,
        secretAccessKey: process.env.BUCKET_SECRET_KEY,
        server
    });

    const bucketName = process.env.BUCKET_NAME;

    try {
        obs.deleteObject(
            {
                Bucket: bucketName,
                Quiet: false,
                Key: imagePath
            },
            async (err, result) => {
                if (!err && result.CommonMsg.Status < 300) {
                    onSuccess();
                    // return "Success";
                } else {
                    onFail();
                    // return "Failed";
                }
            }
        );
    } catch (e) {
        return e;
    }
};

module.exports = imageDelete;
