const os = require("os");
const path = require("path");
const fs = require("fs");

// Menyiapkan server uji dengan database sementara
async function startServer() {
    const file = path.join(
        os.tmpdir(),
        "jurnal-test-" +
            process.pid +
            "-" +
            Date.now() +
            "-" +
            Math.random().toString(36).slice(2) +
            ".db",
    );
    process.env.TURSO_DATABASE_URL = "file:" + file.replace(/\\/g, "/");
    process.env.SESSION_SECRET = "rahasia-uji-minimal-16-karakter";
    delete process.env.VERCEL;
    process.env.NODE_ENV = "test";
    for (const k of Object.keys(require.cache))
        if (k.includes(path.sep + "src" + path.sep)) delete require.cache[k];
    const app = require("../src/app");
    const server = await new Promise((r) => {
        const s = app.listen(0, () => r(s));
    });
    const base = "http://127.0.0.1:" + server.address().port;
    let cookie = "";
    async function rpc(fn, ...args) {
        const res = await fetch(base + "/api/rpc/" + fn, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(cookie ? { Cookie: cookie } : {}),
            },
            body: JSON.stringify({ args }),
        });
        const sc = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
        if (sc.length) cookie = sc[0].split(";")[0].replace(/^sid=$/, "");
        return {
            status: res.status,
            body: await res.json(),
            setCookie: sc[0] || "",
        };
    }
    return {
        base,
        rpc,
        setCookie: (c) => {
            cookie = c;
        },
        getCookie: () => cookie,
        db: () => require("../src/db"),
        close: async () => {
            await new Promise((r) => server.close(r));
            try {
                require("../src/db").closeDb();
            } catch (e) {}
            for (const e of ["", "-wal", "-shm", "-journal"]) {
                try {
                    fs.rmSync(file + e, {
                        force: true,
                        maxRetries: 5,
                        retryDelay: 100,
                    });
                } catch (err) {}
            }
        },
    };
}
module.exports = { startServer };
