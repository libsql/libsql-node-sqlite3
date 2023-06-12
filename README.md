# `sqlite3` wrapper for libSQL

This package is a drop-in replacement of the Node package [`sqlite3`](https://www.npmjs.com/package/sqlite3) for use with [sqld](https://github.com/libsql/sqld) (the libSQL server mode). Instead of opening a local SQLite database, this package connects to sqld using a WebSocket using the [Hrana protocol](https://github.com/libsql/hrana-client-ts).

## Usage

You can get many applications that use the `sqlite3` package work with sqld just by replacing `require('sqlite3')` with `require('@libsql/sqlite3')`, and using a `libsql://` URL instead of a filename:

```javascript
const sqlite3 = require('@libsql/sqlite3').verbose();
const db = new sqlite3.Database('libsql://localhost:2023?tls=0');

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

The library accepts the same URL schemas as [`@libsql/client`][libsql-client-ts]:

- `http://` and `https://` connect to a libsql server over HTTP,
- `ws://` and `wss://` connect to the server over WebSockets,
- `libsql://` connects to the server using the default protocol (which is now HTTP). `libsql://` URLs use TLS by default, but you can use `?tls=0` to disable TLS (e.g. when you run your own instance of the server locally).

To use a JWT for authentication, you can use the `authToken` query parameter (for example,
`ws://localhost?authToken=<token>`).

You can also pass a `file:` URL to `new sqlite3.Database()` to use the original `sqlite3` package. The returned database will be a `Database` from `sqlite3`, not the `Database` from `@libsql/sqlite3`. You will need to install `sqlite3` yourself, this package does not depend on `sqlite3`.

[libsql-client-ts]: https://github.com/libsql/libsql-client-ts

### Usage with Knex

You can use this package with Knex.js by replacing the `sqlite3` package in the SQLite dialect.

#### JavaScript

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

#### TypeScript

```typescript
import { Knex, knex } from "knex";
const Client_SQLite3 = require("knex/lib/dialects/sqlite3");

class Client_Libsql extends Client_SQLite3 {
    _driver() {
        return require("@libsql/sqlite3");
    }
}
const db = knex({
    client: Client_Libsql as any,
    connection: {
        filename: url,
    },
});
```

## Unsupported features

Most APIs exposed by `sqlite3` should work as expected, but the following features are not implemented:

- Flags passed to `new Database()` (they are ignored)
- `Database.configure()`
- `Database.loadExtension()`
- `Database.interrupt()`

## License

This project is licensed under the MIT license.

### Contribution

Unless you explicitly state otherwise, any contribution intentionally submitted for inclusion in `@libsql/sqlite3` by you, shall be licensed as MIT, without any additional terms or conditions.
