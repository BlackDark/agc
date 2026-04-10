// src/config.ts
import { z } from "zod";

export class ConfigError extends Error {}

const NotifyEvent = z.enum(["claimed", "error", "login_required", "nothing"]);

/** Env often uses DEBUG/INFO; z.enum is case-sensitive. */
const logLevel = z.preprocess(
  (v) => {
    if (v === undefined || v === null) return undefined;
    const s = String(v).trim().toLowerCase();
    return s === "" ? undefined : s;
  },
  z.enum(["info", "debug"]).default("info"),
);

const bool = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined ? def : v.toLowerCase() === "true"));

const Schema = z
  .object({
    RUN_MODE: z.enum(["once", "schedule"]).default("schedule"),
    CRON_SCHEDULE: z.string().optional(),
    TZ: z.string().default("UTC"),
    LOG_LEVEL: logLevel,
    CLAIM_EPIC: bool(true),
    CLAIM_PRIME: bool(true),
    CLAIM_GOG: bool(true),
    CLAIM_ITCH: bool(false),
    CLAIM_UBISOFT: bool(false),
    CLAIM_XBOX: bool(false),
    APPRISE_URLS: z
      .string()
      .optional()
      .transform((v) =>
        v
          ? v
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : [],
      ),
    NOTIFY_ON: z
      .string()
      .optional()
      .transform((v, ctx) => {
        const raw = (v ?? "claimed,error,login_required")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        const out = new Set<z.infer<typeof NotifyEvent>>();
        for (const item of raw) {
          const parsed = NotifyEvent.safeParse(item);
          if (!parsed.success) {
            ctx.addIssue({ code: "custom", message: `invalid NOTIFY_ON value: ${item}` });
            return z.NEVER;
          }
          out.add(parsed.data);
        }
        return out;
      }),
  })
  .superRefine((v, ctx) => {
    if (v.RUN_MODE === "schedule" && !v.CRON_SCHEDULE) {
      ctx.addIssue({ code: "custom", path: ["CRON_SCHEDULE"], message: "CRON_SCHEDULE is required when RUN_MODE=schedule" });
    }
  });

export type Config = {
  runMode: "once" | "schedule";
  cronSchedule: string | undefined;
  tz: string;
  logLevel: "info" | "debug";
  sites: {
    epic: boolean;
    prime: boolean;
    gog: boolean;
    itch: boolean;
    ubisoft: boolean;
    xbox: boolean;
  };
  appriseUrls: string[];
  notifyOn: Set<"claimed" | "error" | "login_required" | "nothing">;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = Schema.safeParse(env);
  if (!parsed.success) {
    throw new ConfigError(parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; "));
  }
  const v = parsed.data;
  return {
    runMode: v.RUN_MODE,
    cronSchedule: v.CRON_SCHEDULE,
    tz: v.TZ,
    logLevel: v.LOG_LEVEL,
    sites: {
      epic: v.CLAIM_EPIC,
      prime: v.CLAIM_PRIME,
      gog: v.CLAIM_GOG,
      itch: v.CLAIM_ITCH,
      ubisoft: v.CLAIM_UBISOFT,
      xbox: v.CLAIM_XBOX,
    },
    appriseUrls: v.APPRISE_URLS,
    notifyOn: v.NOTIFY_ON,
  };
}
