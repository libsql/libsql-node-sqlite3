export { Database } from "./database.js";
export { Statement } from "./statement.js";
export type { RunResult } from "./statement.js";
export * from "./consts.js";

import { Database } from "./database.js";
import { Statement } from "./statement.js";
import { extendTrace } from "./trace.js";

// This code is adapted from node-sqlite3
let isVerbose = false;
export function verbose(): sqlite3 {
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

const sqlite3 = exports;
export type sqlite3 = typeof sqlite3;
