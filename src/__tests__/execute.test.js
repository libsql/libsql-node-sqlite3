const sqlite3 = require("..");
const { url, isFile, hranaVersion } = require("./helpers.js");

function throwOnErr(err) {
    if (err !== null) {
        throw err;
    }
}

let db;
beforeEach((done) => {
    db = new sqlite3.Database(url, throwOnErr);
    db.serialize();
    db.run("DROP TABLE IF EXISTS t", throwOnErr);
    db.run("CREATE TABLE t (id INTEGER PRIMARY KEY, a, b)", throwOnErr);
    db.run("INSERT INTO t (id, a, b) VALUES (1, 'one', 'ten')", throwOnErr);
    db.run("INSERT INTO t (id, a, b) VALUES (2, 'two', 'twenty')", throwOnErr);
    db.run("INSERT INTO t (id, a, b) VALUES (3, 'three', 'thirty')", throwOnErr);
    db.wait(done);
});
afterEach((done) => {
    db.close(done);
});

describe("Database.run()", () => {
    test("statement without params", (done) => {
        db.run("INSERT INTO t (a) VALUES ('four'), ('five')", function (err) {
            done();
            expect(err).toBeNull();
            if (!isFile) {
                expect(this).toBeInstanceOf(sqlite3.Statement);
            }
            expect(this.changes).toStrictEqual(2);
        });
    });

    test("returned rowid", (done) => {
        db.run("INSERT INTO t (id) VALUES (10)", function (err) {
            done();
            expect(err).toBeNull();
            expect(this.lastID).toStrictEqual(10);
        });
    });

    test("error when executing statement", (done) => {
        db.run("FOOBAR", function (err) {
            done();
            expect(err).not.toBeNull();
            if (!isFile) {
                expect(err).toBeInstanceOf(Error);
            } else {
                expect(err.name).toStrictEqual("Error");
            }
        });
    });
});

describe("Database.get()", () => {
    test("statement without params", (done) => {
        db.get("SELECT 1 AS a, 2 AS b", function (err, row) {
            done();
            expect(err).toBeNull();
            if (!isFile) {
                expect(this).toBeInstanceOf(sqlite3.Statement);
            }
            expect(Object.entries(row)).toStrictEqual([["a", 1], ["b", 2]]);
            expect(Object.keys(row)).toStrictEqual(["a", "b"]);
        });
    });

    test("params in array", (done) => {
        db.get("SELECT ? AS a, ? AS b", ["one", 2], (err, row) => {
            done();
            expect(err).toBeNull();
            expect(Object.entries(row)).toStrictEqual([["a", "one"], ["b", 2]]);
        });
    });

    test("params as arguments", (done) => {
        db.get("SELECT ? AS a, ? AS b", "one", 2, (err, row) => {
            done();
            expect(err).toBeNull();
            expect(Object.entries(row)).toStrictEqual([["a", "one"], ["b", 2]]);
        });
    });

    test("params in object with prefixes", (done) => {
        db.get("SELECT $one AS a, @two AS b, :three AS c", {$one: 1, "@two": 2, ":three": 3}, (err, row) => { 
            done();
            expect(err).toBeNull();
            expect(Object.entries(row)).toStrictEqual([["a", 1], ["b", 2], ["c", 3]]);
        });
    });

    (!isFile ? test : test.skip)("params in object without prefixes", (done) => {
        db.get("SELECT $one AS a, @two AS b, :three AS c", {one: 1, two: 2, three: 3}, (err, row) => { 
            done();
            expect(err).toBeNull();
            expect(row).toStrictEqual({ a: 1, b: 2, c: 3 });
            expect(Object.entries(row)).toStrictEqual([["a", 1], ["b", 2], ["c", 3]]);
        });
    });

    test("no result rows", (done) => {
        db.get("SELECT 1 WHERE 1 = 0", (err, row) => {
            done();
            expect(err).toBeNull();
            expect(row).toBeUndefined();
        });
    });
});

describe("Database.all()", () => {
    test("statement without params", (done) => {
        db.all("SELECT id, a, b FROM t ORDER BY id", function (err, rows) {
            done();
            expect(err).toBeNull();
            expect(rows).toEqual([
                { id: 1, a: "one", b: "ten" },
                { id: 2, a: "two", b: "twenty" },
                { id: 3, a: "three", b: "thirty" },
            ]);
        });
    });

    test("with undefined", (done) => {
        db.all("SELECT 1", undefined, function (err, rows) {
            done();
            expect(err).toBeNull();
        });
    });

    test("with undefined in array", (done) => {
        db.all("SELECT 1", [undefined], function (err, rows) {
            done();
            expect(err).toBeNull();
        });
    });

    test("with undefined in object", (done) => {
        db.all("SELECT 1", {x: undefined}, function (err, rows) {
            done();
            expect(err).toBeNull();
        });
    });
});

describe("Database.map()", () => {
    test("two columns", (done) => {
        db.map("SELECT a, b FROM t ORDER BY id", function (err, rows) {
            done();
            expect(err).toBeNull();
            expect(rows).toEqual({
                "one": "ten",
                "two": "twenty",
                "three": "thirty",
            });
        });
    });

    test("three columns", (done) => {
        db.map("SELECT a, b, id FROM t ORDER BY id", function (err, rows) {
            done();
            expect(err).toBeNull();
            expect(rows).toEqual({
                "one": {a: "one", b: "ten", id: 1},
                "two": {a: "two", b: "twenty", id: 2},
                "three": {a: "three", b: "thirty", id: 3},
            });
        });
    });

    test("one column", (done) => {
        db.map("SELECT a FROM t ORDER BY id", function (err, rows) {
            done();
            expect(err).toBeNull();
            expect(rows).toEqual({
                "one": undefined,
                "two": undefined,
                "three": undefined,
            });
        });
    });
});

describe("Database.each()", () => {
    test("only row callback", (done) => {
        let i = 0;
        db.each("SELECT id, a FROM t ORDER BY id", function (err, row) {
            expect(err).toBeNull();
            if (!isFile) {
                expect(this).toBeInstanceOf(sqlite3.Statement);
            }
            if (i == 0) {
                expect(row).toEqual({ id: 1, a: "one" });
            } else if (i == 1) {
                expect(row).toEqual({ id: 2, a: "two" });
            } else if (i == 2) {
                expect(row).toEqual({ id: 3, a: "three" });
                done();
            } else {
                throw new Error("Unexpected row");
            }
            ++i;
        });
    });

    test("completion callback", (done) => {
        let i = 0;
        db.each("SELECT id, a FROM t ORDER BY id", function (err, row) {
            expect(err).toBeNull();
            if (!isFile) {
                expect(this).toBeInstanceOf(sqlite3.Statement);
            }
            ++i;
        }, function (err, count) {
            done();
            expect(err).toBeNull();
            expect(count).toStrictEqual(3);
            expect(i).toStrictEqual(3);
        });
    });
});

(hranaVersion >= 2 ? describe : describe.skip)("Database.exec()", () => {
    test("successful execution", (done) => {
        db.exec("CREATE TABLE t2 (a); INSERT INTO t2 VALUES ('one'), ('two'); DROP TABLE t2", function (err) {
            done();
            expect(this).toStrictEqual(db);
            expect(err).toBeNull();
        });
    });

    test("error during execution", (done) => {
        db.exec("SELECT 1; SELECT foo; SELECT 2", function (err) {
            done();
            expect(this).toStrictEqual(db);
            if (!isFile) {
                expect(err).toBeInstanceOf(Error);
            } else {
                expect(err.name).toStrictEqual("Error");
            }
        });
    });
});
