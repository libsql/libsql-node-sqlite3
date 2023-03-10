export { Database } from "./database.js";
export { Statement } from "./statement.js";
export type { RunResult } from "./statement.js";
export * from "./consts.js";

export function verbose(): sqlite3 {
    return sqlite3;
}

const sqlite3 = exports;
export type sqlite3 = typeof sqlite3;
