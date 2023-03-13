import { Buffer } from "node:buffer";
import { EventEmitter } from "node:events";
import * as hrana from "@libsql/hrana-client";

import type { Database } from "./database.js";

export class Statement extends EventEmitter {
    #database: Database
    #stmt: hrana.Stmt

    lastID: number;
    changes: number;
    
    /** @private */
    constructor(database: Database, sql: string) {
        super();
        this.#database = database;
        this.#stmt = new hrana.Stmt(sql);
        this.lastID = NaN;
        this.changes = 0;
    }

    bind(callback?: (err: Error | null) => void): this;
    bind(...args: any[]): this;
    bind(...args: any[]): this {
        this.#stmt.unbindAll();
        const callback = bindArgs(this.#stmt, args) as ((_: null) => void) | undefined;
        this.#database._enqueue(() => {
            return Promise.resolve(null).then(callback);
        });
        return this;
    }

    reset(callback?: (err: null) => void): this {
        this.#database._enqueue(() => {
            return Promise.resolve(null).then(callback);
        });
        return this;
    }

    finalize(callback?: (err: Error | null) => void): Database {
        this.#database._enqueue(() => {
            return Promise.resolve(null).then(callback);
        });
        return this.#database;
    }

    run(callback?: (this: RunResult, err: Error | null) => void): this;
    run(args: any, callback?: (this: RunResult, err: Error | null) => void): this;
    run(...args: any[]): this;
    run(...args: any[]): this {
        const callback = bindArgs(this.#stmt, args);
        this.#database._enqueue((stream) => {
            const promise = stream.execute(this.#stmt);
            if (callback !== undefined) {
                promise.then((stmtResult) => {
                    this.#setRunResult(stmtResult);
                    callback.apply(this, [null]);
                });
                promise.catch((e) => {
                    callback.apply(this, [e]);
                });
            }
            return promise;
        });
        return this;
    }

    get(callback?: (this: RunResult, err: Error | null, row?: any) => void): this;
    get(args: any, callback?: (this: RunResult, err: Error | null, row?: any) => void): this;
    get(...args: any[]): this;
    get(...args: any[]): this {
        const callback = bindArgs(this.#stmt, args);
        this.#database._enqueue((stream) => {
            const promise = stream.queryRow(this.#stmt);
            if (callback !== undefined) {
                promise.then((rowResult) => {
                    this.#setRunResult(rowResult);
                    callback.apply(this, [null, rowResult.row]);
                });
                promise.catch((e) => {
                    callback.apply(this, [e]);
                });
            }
            return promise;
        });
        return this;
    }

    all(callback?: (this: RunResult, err: Error | null, rows: any[]) => void): this;
    all(args: any, callback?: (this: RunResult, err: Error | null, rows: any[]) => void): this;
    all(...args: any[]): this;
    all(...args: any[]): this {
        const callback = bindArgs(this.#stmt, args);
        this.#database._enqueue((stream) => {
            const promise = stream.query(this.#stmt);
            if (callback !== undefined) {
                promise.then((rowsResult) => {
                    this.#setRunResult(rowsResult);
                    callback.apply(this, [null, rowsResult.rows]);
                });
                promise.catch((e) => {
                    callback.apply(this, [e, []]);
                });
            }
            return promise;
        });
        return this;
    }

    map(callback?: (this: Statement, err: Error | null, rows: Record<any, any>) => void): this;
    map(args: any, callback?: (this: Statement, err: Error | null, rows: Record<any, any>) => void): this;
    map(...args: any[]): this;
    map(...args: any[]): this {
        const callback = bindArgs(this.#stmt, args);
        this.#database._enqueue((stream) => {
            const promise = stream.query(this.#stmt);
            if (callback !== undefined) {
                promise.then((rowsResult) => {
                    this.#setRunResult(rowsResult);
                    const resultObj = mapRowsToObject(rowsResult);
                    callback.apply(this, [null, resultObj]);
                });
                promise.catch((e) => {
                    callback.apply(this, [e, []]);
                });
            }
            return promise;
        });
        return this;
    }

    each(
        callback?: (this: RunResult, err: Error | null, row: any) => void,
        complete?: (err: Error | null, count: number) => void,
    ): this;
    each(
        args: any,
        callback?: (this: RunResult, err: Error | null, row: any) => void,
        complete?: (err: Error | null, count: number) => void,
    ): this;
    each(...args: any[]): this;
    each(...args: any[]): this {
        let completeCallback: Function | undefined;
        if (args.length >= 2 && typeof args[args.length - 1] === "function" &&
            typeof args[args.length - 2] == "function")
        {
            completeCallback = args.pop();
        }

        const rowCallback = bindArgs(this.#stmt, args);
        this.#database._enqueue((stream) => {
            const promise = stream.query(this.#stmt);
            if (rowCallback !== undefined) {
                promise.then((rowsResult) => {
                    this.#setRunResult(rowsResult);
                    for (const row of rowsResult.rows) {
                        rowCallback.apply(this, [null, row]);
                    }
                    if (completeCallback !== undefined) {
                        completeCallback(null, rowsResult.rows.length);
                    }
                });
                promise.catch((e) => {
                    rowCallback.apply(this, [e, []]);
                    if (completeCallback !== undefined) {
                        completeCallback(e, 0);
                    }
                });
            }
            return promise;
        });
        return this;
    }

    #setRunResult(result: hrana.StmtResult) {
        this.lastID = +(result.lastInsertRowid ?? "NaN");
        this.changes = result.affectedRowCount;
    }
}

export interface RunResult extends Statement {
    lastID: number;
    changes: number;
}

// this logic is taken from `Statement::Bind` in `node-sqlite3/src/statement.cc`
function bindArgs(stmt: hrana.Stmt, args: any[]): Function | undefined {
    let callback: Function | undefined = undefined;
    if (args.length > 0 && typeof args[args.length - 1] === "function") {
        callback = args.pop();
    }

    if (args.length > 0) {
        stmt.unbindAll();

        const arg0 = args[0];
        if (Array.isArray(arg0)) {
            stmt.bindIndexes(arg0);
        } else if (typeof arg0 !== "object" || arg0 instanceof RegExp
             || arg0 instanceof Date || Buffer.isBuffer(arg0))
        {
            stmt.bindIndexes(args);
        } else if (typeof arg0 === "object") {
            for (let name of arg0) {
                stmt.bindName(name, arg0[name]);
            }
        } else {
            throw new TypeError("Unsupported type of argument");
        }
    }

    return callback;
}

function mapRowsToObject(rowsResult: hrana.RowsResult): Record<any, any> {
    const resultObj: Record<any, any> = {};
    const singleValue = rowsResult.columnNames.length === 2;
    rowsResult.rows.forEach((row) => {
        resultObj[row[0] as any] = singleValue ? row[1] : row;
    });
    return resultObj;
}
