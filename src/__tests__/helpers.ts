const url_ = new URL(process.env.URL ?? "ws://localhost:8080");
const authToken = process.env.AUTH_TOKEN;
if (authToken) {
    url_.searchParams.set("authToken", authToken);
}
export const url = url_.toString();

export const hranaVersion = parseInt(process.env.VERSION ?? "2", 10);
