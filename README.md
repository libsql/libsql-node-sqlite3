# `sqlite3` wrapper for libSQL

This package is a drop-in replacement of the Node package [`sqlite3`](https://www.npmjs.com/package/sqlite3) for use with [sqld](https://github.com/libsql/sqld) (the libSQL server mode). Instead of opening a local SQLite database, this package connects to sqld using a WebSocket using the [Hrana protocol](https://github.com/libsql/hrana-client-ts).

## Usage

You can get many applications that use the `sqlite3` package work with sqld just by replacing `require('sqlite3')` with `require('@libsql/sqlite3')`, and using a `ws://` URL instead of a filename:

```javascript
const sqlite3 = require('@libsql/sqlite3').verbose();
const db = new sqlite3.Database('ws://localhost:2023');

db.serialize(() => {
    db.run('CREATE TABLE lorem (info TEXT)');

    const stmt = db.prepare('INSERT INTO lorem VALUES (?)');
    for (let i = 0; i < 10; i++) {
        stmt.run('Ipsum ' + i);
    }
    stmt.finalize();

    db.each('SELECT rowid AS id, info FROM lorem', (err, row) => {
        console.log(row.id + ': ' + row.info);
    });
});

db.close();
```

### URL

The library accepts multiple URL schemas, but it always uses WebSockets internally:

- `ws://`, `http://` and `libsql://` URLs are converted into `ws://` (WebSockets)
- `wss://`, `https://` and `libsqls://` URLs are converted into `wss://` (WebSockets with TLS)

To use a JWT for authentication, you can use the `jwt` query parameter (for example,
`ws://localhost?jwt=<token>`).

### Usage with Knex

You can use this package with Knex.js by replacing the `sqlite3` package in the SQLite dialect:

```javascript
const Knex = require("knex");
const Client_SQLite3 = require("knex/lib/dialects/sqlite3");

class Client_Libsql extends Client_SQLite3 {
    _driver() {
        return require("@libsql/sqlite3");
    }
}

const knex = Knex({
    client: Client_Libsql,
    connection: {
        filename: url,
    },
});
```

## Unsupported features

Most APIs exposed by `sqlite3` should work as expected, but the following features are not yet implemented:

- Flags passed to `new Database()` (they are ignored)
- `Database.exec()`
- `Database.configure()`
- `Database.loadExtension()`
- `Database.interrupt()`
