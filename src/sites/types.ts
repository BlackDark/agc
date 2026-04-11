// src/sites/types.ts
import type { Page } from "playwright-core";

/** Per-offer outcome for logging and notifications (links included when known). */
export type PerItemClaimResult = {
  title: string;
  url: string;
  outcome: "claimed" | "already_owned" | "failed";
  detail?: string;
};

export type ClaimResult =
  | { status: "claimed"; items: string[]; perItem?: PerItemClaimResult[] }
  | { status: "nothing"; perItem?: PerItemClaimResult[] }
  | { status: "login_required"; perItem?: PerItemClaimResult[] }
  | { status: "error"; error: string; perItem?: PerItemClaimResult[] };

export type SiteName = "epic" | "prime" | "gog" | "itch" | "ubisoft" | "xbox" | "aliexpress";

export interface SiteClaimer {
  name: SiteName;
  homeUrl: string;
  isLoggedIn(page: Page): Promise<boolean>;
  claim(page: Page): Promise<ClaimResult>;
}
