const sqlite3 = require("..");
const { url } = require("./helpers.js");

function throwOnErr(err) {
    if (err !== null) {
        throw err;
    }
}

let db;
beforeEach((done) => {
    db = new sqlite3.Database(url, throwOnErr);
    db.serialize();
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
            expect(this).toBeInstanceOf(sqlite3.Statement);
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
            expect(err).toBeInstanceOf(Error);
        });
    });
});

describe("Database.get()", () => {
    test("statement without params", (done) => {
        db.get("SELECT 1 AS a, 2 AS b", function (err, row) {
            done();
            expect(err).toBeNull();
            expect(this).toBeInstanceOf(sqlite3.Statement);
            expect(row).toStrictEqual({ a: 1, b: 2 });
            expect(Object.keys(row)).toStrictEqual(["a", "b"]);
        });
    });

    test("params in array", (done) => {
        db.get("SELECT ? AS a, ? AS b", ["one", 2], (err, row) => {
            done();
            expect(err).toBeNull();
            expect(row).toStrictEqual({ a: "one", b: 2});
        });
    });

    test("params as arguments", (done) => {
        db.get("SELECT ? AS a, ? AS b", "one", 2, (err, row) => {
            done();
            expect(err).toBeNull();
            expect(row).toStrictEqual({ a: "one", b: 2});
        });
    });

    test("params in object with prefixes", (done) => {
        db.get("SELECT $one AS a, @two AS b, :three AS c", {$one: 1, "@two": 2, ":three": 3}, (err, row) => { 
            done();
            expect(err).toBeNull();
            expect(row).toStrictEqual({ a: 1, b: 2, c: 3 });
        });
    });

    test("params in object without prefixes", (done) => {
        db.get("SELECT $one AS a, @two AS b, :three AS c", {one: 1, two: 2, three: 3}, (err, row) => { 
            done();
            expect(err).toBeNull();
            expect(row).toStrictEqual({ a: 1, b: 2, c: 3 });
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
            expect(rows).toStrictEqual([
                { id: 1, a: "one", b: "ten" },
                { id: 2, a: "two", b: "twenty" },
                { id: 3, a: "three", b: "thirty" },
            ]);
        });
    });
});

describe("Database.map()", () => {
    test("two columns", (done) => {
        db.map("SELECT a, b FROM t ORDER BY id", function (err, rows) {
            done();
            expect(err).toBeNull();
            expect(rows).toStrictEqual({
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
            expect(rows).toStrictEqual({
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
            expect(rows).toStrictEqual({
                "one": {a: "one"},
                "two": {a: "two"},
                "three": {a: "three"},
            });
        });
    });
});

describe("Database.each()", () => {
    test("only row callback", (done) => {
        let i = 0;
        db.each("SELECT id, a FROM t ORDER BY id", function (err, row) {
            expect(err).toBeNull();
            expect(this).toBeInstanceOf(sqlite3.Statement);
            if (i == 0) {
                expect(row).toStrictEqual({ id: 1, a: "one" });
            } else if (i == 1) {
                expect(row).toStrictEqual({ id: 2, a: "two" });
            } else if (i == 2) {
                expect(row).toStrictEqual({ id: 3, a: "three" });
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
            expect(this).toBeInstanceOf(sqlite3.Statement);
            ++i;
        }, function (err, count) {
            done();
            expect(err).toBeNull();
            expect(count).toStrictEqual(3);
            expect(i).toStrictEqual(3);
        });
    });
});
