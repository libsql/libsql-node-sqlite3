import { EventEmitter } from "node:events";
import * as hrana from "@libsql/hrana-client";

import { OPEN_READWRITE, OPEN_CREATE, OPEN_FULLMUTEX } from "./consts.js";
import type { RunResult } from "./statement.js";
import { Statement } from "./statement.js";

export class Database extends EventEmitter {
    #client: hrana.Client | undefined
    #stream: hrana.Stream | undefined

    constructor(url: string, callback?: (err: Error | null) => void);
    constructor(url: string, mode?: number, callback?: (err: Error | null) => void);
    constructor(url: string, ...args: any[]) {
        let mode: number = OPEN_READWRITE | OPEN_CREATE | OPEN_FULLMUTEX;
        let callback: ((err: Error | null) => void) | undefined;

        let argI = 0;
        if (argI < args.length && typeof args[argI] === "number") {
            mode = args[argI++];
        }
        if (argI < args.length && typeof args[argI] === "function") {
            callback = args[argI++];
        }
        if (argI < args.length && argI < 2) {
            throw new TypeError("Invalid arguments");
        }

        const parsedUrl = parseUrl(url);

        super();
        this.#client = undefined;
        this.#stream = undefined;

        try {
            this.#client = hrana.open(parsedUrl.hranaUrl, parsedUrl.jwt);
            this.#stream = this.#client.openStream();
        } catch (e) {
            if (e instanceof hrana.ClientError) {
                if (callback !== undefined) {
                    callback(e);
                } else {
                    this.emit("error", e);
                }
                return;
            }
            throw e;
        }

        if (callback !== undefined) {
            queueMicrotask(() => callback!(null));
        }
        this.emit("open");
    }

    close(callback?: (err: Error | null) => void): void {
        if (this.#client !== undefined) {
            this.#client.close();
        }
        if (callback !== undefined) {
            queueMicrotask(() => callback(null));
        }
        this.emit("close");
    }

    run(sql: string, callback?: (this: RunResult, err: Error | null) => void): this;
    run(sql: string, params: any, callback?: (this: RunResult, err: Error | null) => void): this;
    run(sql: string, ...args: any[]): this;
    run(sql: string, ...args: any[]): this {
        this.#statement(sql).run(...args);
        return this;
    }

    get(sql: string, callback?: (this: Statement, err: Error | null, row: any) => void): this;
    get(sql: string, params: any, callback?: (this: Statement, err: Error | null, row: any) => void): this;
    get(sql: string, ...args: any[]): this;
    get(sql: string, ...args: any[]): this {
        this.#statement(sql).get(...args);
        return this;
    }

    all(sql: string, callback?: (this: Statement, err: Error | null, rows: any[]) => void): this;
    all(sql: string, params: any, callback?: (this: Statement, err: Error | null, rows: any[]) => void): this;
    all(sql: string, ...args: any[]): this;
    all(sql: string, ...args: any[]): this {
        this.#statement(sql).all(...args);
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
        this.#statement(sql).each(...args);
        return this;
    }


    prepare(sql: string, callback?: (this: Statement, err: Error | null) => void): Statement;
    prepare(sql: string, params: any, callback?: (this: Statement, err: Error | null) => void): Statement;
    prepare(sql: string, ...args: any[]): Statement;
    prepare(sql: string, ...args: any[]): Statement {
        return this.#statement(sql).bind(...args);
    }

    #statement(sql: string): Statement {
        if (this.#stream === undefined) {
            throw new Error("The Database was not opened successfully");
        }
        return new Statement(this, this.#stream, sql);
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
        if (callback !== undefined) {
            queueMicrotask(callback);
        }
    }

    parallelize(callback?: () => void): void {
        if (callback !== undefined) {
            queueMicrotask(callback);
        }
    }

    // methods that are not implemented:
    //
    // exec(sql: string, callback?: (this: Statement, err: Error | null) => void): this;
    // configure(option: "busyTimeout", value: number): void;
    // configure(option: "limit", id: number, value: number): void;
    // loadExtension(filename: string, callback?: (err: Error | null) => void): this;
    // wait(callback?: (param: null) => void): this;
    // interrupt(): void;
}


type ParsedUrl = {
    hranaUrl: string,
    jwt: string | undefined,
};

function parseUrl(urlStr: string): ParsedUrl {
    const url = new URL(urlStr);

    let jwt: string | undefined = undefined;
    for (const [key, value] of url.searchParams.entries()) {
        if (key === "jwt") {
            jwt = value;
        } else {
            throw new TypeError(`Unknown URL query argument ${JSON.stringify(key)}`);
        }
    }

    let hranaScheme: string;
    if (url.protocol === "libsql" || url.protocol === "http") {
        hranaScheme = "ws";
    } else if (url.protocol === "libsqls" || url.protocol === "https") {
        hranaScheme = "wss";
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

    const hranaUrl = `${hranaScheme}://${url.host}${url.pathname}`;
    return { hranaUrl, jwt };
}
