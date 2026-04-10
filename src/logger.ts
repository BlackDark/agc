// src/logger.ts
import pino from "pino";

const level = process.env.LOG_LEVEL?.trim().toLowerCase() === "debug" ? "debug" : "info";

export const logger = pino({
  level,
  base: undefined, // no pid/hostname noise
  timestamp: pino.stdTimeFunctions.isoTime,
});
