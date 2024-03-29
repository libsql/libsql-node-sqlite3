import { EventEmitter } from "node:events";
import * as hrana from "@libsql/hrana-client";

import { OPEN_READWRITE, OPEN_CREATE, OPEN_FULLMUTEX, OPEN_URI } from "./consts.js";
import type { RunResult } from "./statement.js";
import { Statement } from "./statement.js";

type WaitingJob = {
    execute: () => Promise<unknown>,
    serialize: boolean,
}

export class Database extends EventEmitter {
    // the ts-expect-errors are needed because the constructor may return early with another instance

    // @ts-expect-error
    #client: hrana.Client;
    // @ts-expect-error
    #stream: hrana.Stream;
    // @ts-expect-error
    #serialize: boolean;
    // @ts-expect-error
    #waitingJobs: Array<WaitingJob>;
    // @ts-expect-error
    #pendingPromises: Set<Promise<unknown>>;

    constructor(url: string, callback?: (err: Error | null) => void);
    constructor(url: string, mode?: number, callback?: (err: Error | null) => void);
    constructor(url: string, ...args: any[]) {
        let callback: ((err: Error | null) => void) | undefined;
        if (args.length >= 1 && typeof args[args.length - 1] === "function") {
            callback = args.pop();
        }

        let mode: number = OPEN_READWRITE | OPEN_CREATE | OPEN_FULLMUTEX;
        if (args.length === 1 && typeof args[0] === "number") {
            mode = args.shift();
        } else if (args.length >= 1) {
            throw new TypeError("Invalid arguments");
        }

        if (url.startsWith("file:")) {
            const sqlite3 = require("sqlite3");
            return new sqlite3.Database(url, mode | OPEN_URI, callback);
        }

        const parsedUrl = hrana.parseLibsqlUrl(url);

        super();
        if (parsedUrl.hranaHttpUrl !== undefined) {
            this.#client = hrana.openHttp(parsedUrl.hranaHttpUrl, parsedUrl.authToken);
        } else {
            this.#client = hrana.openWs(parsedUrl.hranaWsUrl!, parsedUrl.authToken);
        }
        this.#stream = this.#client.openStream();
        this.#serialize = false;
        this.#pendingPromises = new Set();
        this.#waitingJobs = [];

        this.#enqueueJob({
            execute: () => this.#stream.queryValue("SELECT 1")
                .then(() => {
                    if (callback !== undefined) {
                        callback(null);
                    }
                    this.emit("open");
                })
                .catch((err) => {
                    if (callback !== undefined) {
                        callback(err);
                    } else {
                        this.emit("error", err);
                    }
                }),
            serialize: true,
        });
    }

    /** @private */
    _enqueueStream(execute: (stream: hrana.Stream) => Promise<unknown>): void {
        this.#enqueueJob({
            execute: () => {
                return execute(this.#stream);
            },
            serialize: this.#serialize,
        });
    }

    /** @private */
    _enqueue(execute: () => Promise<unknown>): void {
        this.#enqueueJob({
            execute,
            serialize: this.#serialize,
        });
    }

    #enqueueJob(job: WaitingJob): void {
        this.#waitingJobs.push(job);
        queueMicrotask(() => this.#pumpJobs());
    }

    #pumpJobs(): void {
        let jobI = 0;
        while (jobI < this.#waitingJobs.length) {
            const job = this.#waitingJobs[jobI];
            if (!job.serialize || this.#pendingPromises.size === 0) {
                this.#waitingJobs.splice(jobI, 1);

                const promise = job.execute();
                this.#pendingPromises.add(promise);
                promise.finally(() => {
                    this.#pendingPromises.delete(promise);
                    this.#pumpJobs();
                });
            } else {
                jobI += 1;
            }
        }
    }

    close(callback?: (err: Error | null) => void): void {
        this.#enqueueJob({
            execute: () => {
                this.#client.close();
                if (callback !== undefined) {
                    callback(null);
                }
                this.emit("close");
                return Promise.resolve();
            },
            serialize: true,
        });
    }

    run(sql: string, callback?: (this: RunResult, err: Error | null) => void): this;
    run(sql: string, params: any, callback?: (this: RunResult, err: Error | null) => void): this;
    run(sql: string, ...args: any[]): this;
    run(sql: string, ...args: any[]): this {
        new Statement(this, sql).run(...args);
        return this;
    }

    get(sql: string, callback?: (this: Statement, err: Error | null, row: any) => void): this;
    get(sql: string, params: any, callback?: (this: Statement, err: Error | null, row: any) => void): this;
    get(sql: string, ...args: any[]): this;
    get(sql: string, ...args: any[]): this {
        new Statement(this, sql).get(...args);
        return this;
    }

    all(sql: string, callback?: (this: Statement, err: Error | null, rows: any[]) => void): this;
    all(sql: string, params: any, callback?: (this: Statement, err: Error | null, rows: any[]) => void): this;
    all(sql: string, ...args: any[]): this;
    all(sql: string, ...args: any[]): this {
        new Statement(this, sql).all(...args);
        return this;
    }

    map(
        sql: string,
        callback?: (this: Statement, err: Error | null, rows: Record<any, any>) => void,
    ): this;
    map(
        sql: string,
        params: any,
        callback?: (this: Statement, err: Error | null, rows: Record<any, any>) => void,
    ): this;
    map(sql: string, ...args: any[]): this;
    map(sql: string, ...args: any[]): this {
        new Statement(this, sql).map(...args);
        return this;
    }

    each(
        sql: string,
        callback?: (this: Statement, err: Error | null, row: any) => void,
        complete?: (err: Error | null, count: number) => void,
    ): this;
    each(
        sql: string,
        params: any,
        callback?: (this: Statement, err: Error | null, row: any) => void,
        complete?: (err: Error | null, count: number) => void,
    ): this;
    each(sql: string, ...args: any[]): this;
    each(sql: string, ...args: any[]): this {
        new Statement(this, sql).each(...args);
        return this;
    }

    prepare(sql: string, callback?: (this: Statement, err: Error | null) => void): Statement;
    prepare(sql: string, params: any, callback?: (this: Statement, err: Error | null) => void): Statement;
    prepare(sql: string, ...args: any[]): Statement;
    prepare(sql: string, ...args: any[]): Statement {
        return new Statement(this, sql).bind(...args);
    }

    // on(event: "trace", listener: (sql: string) => void): this;
    // on(event: "profile", listener: (sql: string, time: number) => void): this;
    // on(event: "change", listener: (type: string, database: string, table: string, rowid: number) => void): this;
    on(event: "error", listener: (err: Error) => void): this;
    on(event: "open" | "close", listener: () => void): this;
    on(event: string, listener: (...args: any[]) => void): this;
    on(event: string, listener: (...args: any[]) => void): this {
        return super.on(event, listener);
    }

    serialize(callback?: () => void): void {
        const old = this.#serialize;
        this.#serialize = true;
        if (callback !== undefined) {
            callback();
            this.#serialize = old;
        }
    }

    parallelize(callback?: () => void): void {
        const old = this.#serialize;
        this.#serialize = false;
        if (callback !== undefined) {
            callback();
            this.#serialize = old;
        }
    }

    wait(callback?: (param: null) => void): this {
        this._enqueue(() => {
            return Promise.resolve(null).then(callback);
        });
        return this;
    }

    exec(sql: string, callback?: (this: Database, err: Error | null) => void): this {
        const executeSequence = async (stream: hrana.Stream): Promise<void> => {
            const version = await this.#client.getVersion();
            if (version < 2) {
                throw new Error(
                    "Database.exec() is supported only with newer servers that implement version 2 " +
                        "of the Hrana protocol",
                );
            }
            return await stream.sequence(sql);
        };

        this._enqueueStream((stream) => executeSequence(stream)
            .then(() => {
                if (callback !== undefined) {
                    callback.apply(this, [null]);
                }
            })
            .catch((e) => {
                if (callback !== undefined) {
                    callback.apply(this, [e]);
                } else {
                    this.emit("error", e);
                }
            })
        );
        return this;
    }

    //configure(option: "busyTimeout", value: number): void;
    //configure(option: "limit", id: number, value: number): void;
    configure(option: string, ...args: any[]): void {
        throw new Error(`${JSON.stringify(option)} is not a supported configuration option`);
    }

    loadExtension(filename: string, callback?: (err: Error | null) => void): this {
        throw new Error("Database.loadExtension() is not implemented");
    }

    interrupt(): void {
        throw new Error("Database.interrupt() is not implemented");
    }
}
