// src/sites/registry.ts
import type { Config } from "../config.ts";
import type { SiteClaimer } from "./types.ts";
import { epic } from "./epic.ts";
import { prime } from "./prime.ts";
import { gog } from "./gog.ts";
import { itch } from "./itch.ts";
import { ubisoft } from "./ubisoft.ts";
import { xbox } from "./xbox.ts";

export function enabledSites(config: Config): SiteClaimer[] {
  const out: SiteClaimer[] = [];
  if (config.sites.epic) out.push(epic);
  if (config.sites.prime) out.push(prime);
  if (config.sites.gog) out.push(gog);
  if (config.sites.itch) out.push(itch);
  if (config.sites.ubisoft) out.push(ubisoft);
  if (config.sites.xbox) out.push(xbox);
  return out;
}
