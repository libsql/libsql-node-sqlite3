class Database {
    constructor(url: string) {
    }

    serialize(callback: () => void) {
        callback();
    }

    run(query: string) {
    }

    prepare(query: string) {
        return new Statement();
    }

    each(query: string, callback: (err: Error, row: any) => void) {
    }

    close() {
    }
}

class Statement {
    run() {
    }

    finalize() {
    }
}

const sqlite3 = {
    Database: Database,
    verbose: () => {
        return sqlite3;
    }
}

module.exports = sqlite3;

export {}
