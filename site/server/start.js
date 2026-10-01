// Set production mode without relying on shell-specific environment syntax.
process.env.NODE_ENV = "production";
await import("./index.js");
