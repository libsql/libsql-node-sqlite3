export let url = process.env.URL ?? "ws://localhost:8080";
export const isFile = url.startsWith("file:");

const authToken = process.env.AUTH_TOKEN;
if (authToken) {
    const url_ = new URL(url);
    url_.searchParams.set("authToken", authToken);
    url = url_.toString();
}

export const hranaVersion = parseInt(process.env.VERSION ?? "2", 10);
