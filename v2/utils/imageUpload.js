const ObsClient = require("./eSDK_Storage_OBS_V2.1.4_Node.js/lib/obs");
const http = require("http");

const imageUpload = async (image, imagePath) => {
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
    const objectKey = imagePath;
    const formParams = {
        acl: obs.enums.AclPublicRead,
        "content-type": "image/jpeg",
        "x-amz-meta-meta1": "value1",
        "x-amz-meta-meta2": "value2"
    };
    const res = obs.createV4PostSignatureSync({
        Bucket: bucketName,
        Key: objectKey,
        Expires: 3600,
        FormParams: formParams
    });

    /*
     * Start to post object
     */
    formParams.key = objectKey;
    formParams.policy = res.Policy;
    formParams["x-amz-algorithm"] = res.Algorithm;
    formParams["x-amz-credential"] = res.Credential;
    formParams["x-amz-date"] = res.Date;
    formParams["x-amz-signature"] = res.Signature;

    const boundary = "9431149156168";

    /*
     * Construct form data
     */
    const buffers = [];
    let first = true;

    let buffer = [];
    for (const key in formParams) {
        if (!first) {
            buffer.push("\r\n");
        } else {
            first = false;
        }

        buffer.push("--");
        buffer.push(boundary);
        buffer.push("\r\n");
        buffer.push('Content-Disposition: form-data; name="');
        buffer.push(String(key));
        buffer.push('"\r\n\r\n');
        buffer.push(String(formParams[key]));
    }

    buffer = buffer.join("");
    buffers.push(buffer);

    /*
     * Construct file description
     */
    buffer = [];
    buffer.push("\r\n");
    buffer.push("--");
    buffer.push(boundary);
    buffer.push("\r\n");
    buffer.push('Content-Disposition: form-data; name="file"; filename="');
    buffer.push("myfile");
    buffer.push('"\r\n');
    buffer.push("Content-Type: image/jpeg");
    buffer.push("\r\n\r\n");

    buffer = buffer.join("");
    buffers.push(buffer);

    buffer = [];
    buffer.push("\r\n--");
    buffer.push(boundary);
    buffer.push("--\r\n");

    buffer = buffer.join("");
    buffers.push(buffer);

    const options = {
        method: "POST",
        host: server,
        port: 80,
        path: "/" + bucketName,
        headers: {
            "User-Agent": "OBS/Test",
            "Content-Type": "multipart/form-data; boundary=" + boundary
        }
    };
    try {
        const uploadStatus = await makeHttpRequest(options, buffers, image);
        return { uploadStatus, objectKey };
    } catch (e) {
        return e;
    }
};

function makeHttpRequest(options, buffers, image) {
    return new Promise((resolve, reject) => {
        const req = http.request(options, (response) => {
            let uploadStatus;

            response.on("data", (chunk) => {
                buffers.push(chunk);
            });

            response.on("end", () => {
                if (response.statusCode < 300) {
                    uploadStatus = "Success";
                    resolve(uploadStatus);
                } else {
                    uploadStatus = "Fail";
                    reject(uploadStatus);
                }
            });
        });

        req.on("error", (err) => {
            console.log(err);
            reject(err);
        });
        req.write(buffers[0]);
        req.write(buffers[1]);
        req.write(image.data);
        req.write(buffers[2]);
        req.end();
    });
}

module.exports = imageUpload;
