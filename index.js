require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const AppError = require("./utils/appError");
const errorHandler = require("./utils/errorHandler");
const fileUpload = require("express-fileupload");
const apiVersions = require("./utils/apiVersion");
const bridgeRoutes = require("./bridgeRoutes");

// defining the Express app
const app = express();

// defining an array to work as the database (temporary solution)
// const message = {
//     message: "Hello world! Welcome to HEIDI Forums!"
// };

// adding Helmet to enhance your Rest API's security
app.use(helmet());

// using bodyParser to parse JSON bodies into JS objects
app.use(bodyParser.json());

// enabling CORS for all requests
app.use(cors());

// adding morgan to log HTTP requests
app.use(morgan("combined"));

app.use(
    fileUpload({
        limits: {
            fileSize: 250000000
        },
        abortOnLimit: true
    })
);

const availailableVersions = Object.keys(apiVersions);
const latestVersion = availailableVersions
    .sort((a, b) => {
        const versionA = parseInt(a.replace("v", ""));
        const versionB = parseInt(a.replace("v", ""));
        return versionA - versionB;
    })
    .pop();

// Apply versioned routes
for (const version in apiVersions) {
    app.use(`/${version}`, apiVersions[version].router);
}

// Apply bridge routes for non-versioned URLs when BRIDGE_ENABLED is true
if (process.env.BRIDGE_ENABLED === "True") {
    app.use("", bridgeRoutes);
}
app.use("/", (req, res, next) => {
    res.redirect(`/${latestVersion}`);
});

app.all("*", (req, res, next) => {
    next(new AppError(`The URL ${req.originalUrl} does not exists`, 404));
});
app.use(errorHandler);

// starting the server
app.listen(process.env.PORT, () => {
    console.log(`listening on port ${process.env.PORT}`);
});

process.on("uncaughtException", function (err) {
    console.error(
        `${new Date().toUTCString()}: UncaughtException: ${err.message}\n${err.stack}`
    );
    process.exit(1);
});
