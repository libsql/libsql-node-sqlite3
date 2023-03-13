import { EventEmitter } from "node:events";
import * as hrana from "@libsql/hrana-client";

import { OPEN_READWRITE, OPEN_CREATE, OPEN_FULLMUTEX } from "./consts.js";
import type { RunResult } from "./statement.js";
import { Statement } from "./statement.js";

type WaitingJob = {
    execute: () => Promise<unknown>,
    serialize: boolean,
}

export class Database extends EventEmitter {
    #client: hrana.Client;
    #stream: hrana.Stream;
    #serialize: boolean;
    #waitingJobs: Array<WaitingJob>;
    #pendingPromises: Set<Promise<unknown>>;

    constructor(url: string | URL, callback?: (err: Error | null) => void);
    constructor(url: string | URL, mode?: number, callback?: (err: Error | null) => void);
    constructor(url: string | URL, ...args: any[]) {
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

        const parsedUrl = parseUrl(url);

        super();
        this.#client = hrana.open(parsedUrl.hranaUrl, parsedUrl.jwt);
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

    exec(sql: string, callback?: (this: Statement, err: Error | null) => void): this {
        throw new Error("Database.exec() is not implemented");
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


type ParsedUrl = {
    hranaUrl: string,
    jwt: string | undefined,
};

function parseUrl(urlStr: string | URL): ParsedUrl {
    const url = urlStr instanceof URL ? urlStr : new URL(urlStr);

    let jwt: string | undefined = undefined;
    for (const [key, value] of url.searchParams.entries()) {
        if (key === "jwt") {
            jwt = value;
        } else {
            throw new TypeError(`Unknown URL query argument ${JSON.stringify(key)}`);
        }
    }

    let hranaScheme: string;
    if (url.protocol === "libsql:" || url.protocol === "http:") {
        hranaScheme = "ws:";
    } else if (url.protocol === "libsqls:" || url.protocol === "https:") {
        hranaScheme = "wss:";
    } else {
        hranaScheme = url.protocol;
    }

    if (url.username || url.password) {
        throw new TypeError("The libsql WebSocket protocol (Hrana) does not support " +
            "basic authentication, please use JWT instead");
    }
    if (url.hash) {
        throw new TypeError("URL fragments are not supported");
    }

    const hranaUrl = `${hranaScheme}//${url.host}${url.pathname}`;
    return { hranaUrl, jwt };
}
