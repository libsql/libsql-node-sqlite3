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
        this.#database._enqueue(() => Promise.resolve(null).then(callback));
        return this;
    }

    reset(callback?: (err: null) => void): this {
        this.#database._enqueue(() => Promise.resolve(null).then(callback));
        return this;
    }

    finalize(callback?: (err: Error | null) => void): Database {
        this.#database._enqueue(() => Promise.resolve(null).then(callback));
        return this.#database;
    }

    run(callback?: (this: RunResult, err: Error | null) => void): this;
    run(args: any, callback?: (this: RunResult, err: Error | null) => void): this;
    run(...args: any[]): this;
    run(...args: any[]): this {
        const callback = bindArgs(this.#stmt, args);
        this.#database._enqueueStream((stream) => stream.run(this.#stmt)
            .then((stmtResult) => {
                this.#setRunResult(stmtResult);
                if (callback !== undefined) {
                    callback.apply(this, [null]);
                }
            })
            .catch((e) => {
                if (callback !== undefined) {
                    callback.apply(this, [e]);
                }
            })
        );
        return this;
    }

    get(callback?: (this: RunResult, err: Error | null, row?: any) => void): this;
    get(args: any, callback?: (this: RunResult, err: Error | null, row?: any) => void): this;
    get(...args: any[]): this;
    get(...args: any[]): this {
        const callback = bindArgs(this.#stmt, args);
        this.#database._enqueueStream((stream) => stream.queryRow(this.#stmt)
            .then((rowResult) => {
                this.#setRunResult(rowResult);
                if (callback !== undefined) {
                    callback.apply(this, [null, rowResult.row]);
                }
            })
            .catch((e) => {
                if (callback !== undefined) {
                    callback.apply(this, [e]);
                }
            }),
        );
        return this;
    }

    all(callback?: (this: RunResult, err: Error | null, rows: any[]) => void): this;
    all(args: any, callback?: (this: RunResult, err: Error | null, rows: any[]) => void): this;
    all(...args: any[]): this;
    all(...args: any[]): this {
        const callback = bindArgs(this.#stmt, args);
        this.#database._enqueueStream((stream) => stream.query(this.#stmt)
            .then((rowsResult) => {
                this.#setRunResult(rowsResult);
                if (callback !== undefined) {
                    callback.apply(this, [null, rowsResult.rows]);
                }
            })
            .catch((e) => {
                if (callback !== undefined) {
                    callback.apply(this, [e, []]);
                }
            }),
        );
        return this;
    }

    map(callback?: (this: Statement, err: Error | null, rows: Record<any, any>) => void): this;
    map(args: any, callback?: (this: Statement, err: Error | null, rows: Record<any, any>) => void): this;
    map(...args: any[]): this;
    map(...args: any[]): this {
        const callback = bindArgs(this.#stmt, args);
        this.#database._enqueueStream((stream) => stream.query(this.#stmt)
            .then((rowsResult) => {
                this.#setRunResult(rowsResult);
                if (callback !== undefined) {
                    const resultObj = mapRowsToObject(rowsResult);
                    callback.apply(this, [null, resultObj]);
                }
            })
            .catch((e) => {
                if (callback !== undefined) {
                    callback.apply(this, [e, []]);
                }
            }),
        );
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
        this.#database._enqueueStream((stream) => stream.query(this.#stmt)
            .then((rowsResult) => {
                this.#setRunResult(rowsResult);
                if (rowCallback !== undefined) {
                    for (const row of rowsResult.rows) {
                        rowCallback.apply(this, [null, row]);
                    }
                }
                if (completeCallback !== undefined) {
                    completeCallback(null, rowsResult.rows.length);
                }
            })
            .catch((e) => {
                if (rowCallback !== undefined) {
                    rowCallback.apply(this, [e, []]);
                }
                if (completeCallback !== undefined) {
                    completeCallback(e, 0);
                }
            }),
        );
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
            for (let i = 0; i < arg0.length; ++i) {
                if (arg0[i] !== undefined) {
                    stmt.bindIndex(i + 1, arg0[i]);
                }
            }
        } else if (typeof arg0 !== "object" || arg0 instanceof RegExp
             || arg0 instanceof Date || Buffer.isBuffer(arg0))
        {
            for (let i = 0; i < args.length; ++i) {
                if (args[i] !== undefined) {
                    stmt.bindIndex(i + 1, args[i]);
                }
            }
        } else if (typeof arg0 === "object") {
            for (let name in arg0) {
                if (arg0[name] !== undefined) {
                    stmt.bindName(name, arg0[name]);
                }
            }
        } else {
            throw new TypeError("Unsupported type of argument");
        }
    }

    return callback;
}

function mapRowsToObject(rowsResult: hrana.RowsResult): Record<any, any> {
    const resultObj: Record<any, any> = {};
    const columnCount = rowsResult.columnNames.length;
    rowsResult.rows.forEach((row) => {
        let value;
        if (columnCount === 2) {
            value = row[1];
        } else if (columnCount === 1) {
            value = undefined;
        } else {
            value = row;
        }
        resultObj[row[0] as any] = value;
    });
    return resultObj;
}
