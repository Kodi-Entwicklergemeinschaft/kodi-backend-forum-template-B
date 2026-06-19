const v1Routes = require("../v1/routes/index");
const v2Routes = require("../v2/routes");

module.exports = {
    "v1": {
        router: v1Routes
    },
    "v2": {
        router: v2Routes
    }
};
