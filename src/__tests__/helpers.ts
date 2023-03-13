export const url = new URL(process.env.URL ?? "ws://localhost:2023");

const jwt = process.env.JWT;
if (jwt) {
    url.searchParams.set("jwt", jwt);
}
