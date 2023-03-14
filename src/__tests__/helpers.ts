const url_ = new URL(process.env.URL ?? "ws://localhost:2023");
const jwt = process.env.JWT;
if (jwt) {
    url_.searchParams.set("jwt", jwt);
}
export const url = url_.toString();
