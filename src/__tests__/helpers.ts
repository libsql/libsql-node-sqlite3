const url_ = new URL(process.env.URL ?? "ws://localhost:2023");
const authToken = process.env.AUTH_TOKEN;
if (authToken) {
    url_.searchParams.set("authToken", authToken);
}
export const url = url_.toString();
