import pino from "pino";

export const log = pino({
  redact: {
    paths: ["email", "*.email", "phone", "*.phone", "password", "*.password", "authorization", "req.headers.authorization", "req.headers.cookie"],
    censor: "[redacted]",
  },
});
