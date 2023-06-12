const consts = require("./consts.js");
const { Database } = require("./database.js");
const { Statement } = require("./statement.js");
const { extendTrace } = require("./trace.js");

const sqlite3 = {
    Database,
    Statement,
};
module.exports = exports = sqlite3;

let isVerbose = false;
sqlite3.verbose = function() {
    if (!isVerbose) {
        ["prepare", "get", "run", "all", "each", "map", "close", "exec"].forEach((name) => {
            extendTrace(Database.prototype, name);
        });
        ["bind", "get", "run", "all", "each", "map", "reset", "finalize"].forEach((name) => {
            extendTrace(Statement.prototype, name);
        });
        isVerbose = true;
    }
    return sqlite3;
}

for (const [key, value] of Object.entries(consts)) {
    sqlite3[key] = value;
}
