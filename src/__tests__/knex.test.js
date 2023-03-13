const Knex = require("knex");
const Client_SQLite3 = require("knex/lib/dialects/sqlite3");
const { url } = require("./helpers.js");

class Client_Libsql extends Client_SQLite3 {
    _driver() {
        return require("..");
    }
}

describe("Use in Knex", () => {
    let knex;
    beforeAll(() => {
        knex = Knex({
            client: Client_Libsql,
            connection: {
                filename: url,
            },
            useNullAsDefault: true,
        });
    });
    afterAll(() => {
        knex.destroy();
    });

    test("create table", async () => {
        await knex.schema.createTable("t", (t) => {
            t.integer("id").primary();
            t.text("a").notNullable();
            t.text("b");
        });
    });

    test("insert row", async () => {
        await knex("t").insert({id: 1, a: "one", b: "ten"});
        await knex("t").insert({id: 2, a: "two", b: "twenty"});
    });

    test("get row", async () => {
        const rows = await knex("t").select().orderBy("id");
        expect(rows).toStrictEqual([
            {id: 1, a: "one", b: "ten"},
            {id: 2, a: "two", b: "twenty"},
        ]);
    });
});
