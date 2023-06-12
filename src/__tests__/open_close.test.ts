import * as sqlite3 from "..";
import { url, isFile } from "./helpers.js";

describe("open/close", () => {
    test("open and close the test database", (done) => {
        let openDone = false;
        const db = new sqlite3.Database(url, (err) => {
            expect(err).toBeNull();
            openDone = true;
        });
        expect(openDone).toBeFalsy();

        db.close((err) => {
            done();
            expect(err).toBeNull();
            expect(openDone).toBeTruthy();
        });
    });

    test("open connection error", (done) => {
        let openDone = false;
        const db = new sqlite3.Database("ws://domain-does-not-exist", (err) => {
            expect(err).toBeInstanceOf(Error);
            openDone = true;
        });
        expect(openDone).toBeFalsy();

        db.close((err) => {
            done();
            expect(err).toBeNull();
            expect(openDone).toBeTruthy();
        });
    });

    (!isFile ? test : test.skip)("close database multiple times", (done) => {
        const db = new sqlite3.Database(url, (err) => expect(err).toBeNull());

        let closeCounter = 0;
        for (let i = 0; i < 10; ++i) {
            const counter = i;
            db.close((err) => {
                expect(err).toBeNull();
                expect(closeCounter++).toStrictEqual(counter);
                if (closeCounter === 10) {
                    done();
                }
            });
        }
    });
});
