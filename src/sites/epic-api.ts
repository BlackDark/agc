/**
 * Epic weekly free listings via the same static API the store uses
 * (see epicstore_api.get_free_games).
 */

export type WeeklyFreeOffer = {
  title: string;
  namespace: string;
  offerId: string;
  storeUrl: string;
};

const DEFAULT_BASE = "https://store.epicgames.com/en-US";

type RawElement = {
  title?: string;
  id?: string;
  namespace?: string;
  offerType?: string;
  urlSlug?: string;
  catalogNs?: { mappings?: Array<{ pageSlug?: string }> };
  price?: { totalPrice?: { discountPrice?: number } };
  promotions?: {
    promotionalOffers?: Array<{ promotionalOffers?: Array<{ startDate?: string; endDate?: string }> }>;
  };
};

function cleanGraphql1004(body: Record<string, unknown>): void {
  const errs = body.errors;
  if (!Array.isArray(errs)) return;
  const filtered = errs.filter((e: { serviceResponse?: string }) => {
    const s = e?.serviceResponse;
    if (typeof s !== "string") return true;
    try {
      const j = JSON.parse(s) as { numericErrorCode?: number };
      return j.numericErrorCode !== 1004;
    } catch {
      return true;
    }
  });
  if (filtered.length === 0) delete body.errors;
  else body.errors = filtered;
}

function storePathFromElement(e: RawElement): string | null {
  const slug = e.catalogNs?.mappings?.[0]?.pageSlug ?? e.urlSlug;
  if (!slug) return null;
  const seg = e.offerType === "BUNDLE" ? "bundles" : "p";
  return `/${seg}/${slug}`;
}

function isActiveFreeNow(e: RawElement, now: Date): boolean {
  const tp = e.price?.totalPrice;
  if (!tp || tp.discountPrice !== 0) return false;
  const prom = e.promotions?.promotionalOffers;
  if (!prom?.length) return false;
  for (const group of prom) {
    const offers = group.promotionalOffers;
    if (!offers?.length) continue;
    for (const o of offers) {
      const start = o.startDate ? Date.parse(o.startDate) : NaN;
      const end = o.endDate ? Date.parse(o.endDate) : NaN;
      if (Number.isNaN(start) || Number.isNaN(end)) continue;
      if (now.getTime() >= start && now.getTime() <= end) return true;
    }
  }
  return false;
}

export function parseFreeGamesPromotionsPayload(
  raw: unknown,
  opts?: { now?: Date; localePrefix?: string },
): WeeklyFreeOffer[] {
  const now = opts?.now ?? new Date();
  const prefix = opts?.localePrefix ?? `${DEFAULT_BASE}`;
  const body = raw as {
    data?: { Catalog?: { searchStore?: { elements?: RawElement[] } } };
  };
  const elements = body.data?.Catalog?.searchStore?.elements;
  if (!Array.isArray(elements)) return [];

  const out: WeeklyFreeOffer[] = [];
  for (const e of elements) {
    if (!isActiveFreeNow(e, now)) continue;
    const title = e.title;
    const offerId = e.id;
    const ns = e.namespace;
    if (!title || !offerId || !ns) continue;
    const path = storePathFromElement(e);
    if (!path) continue;
    out.push({
      title,
      namespace: ns,
      offerId,
      storeUrl: `${prefix}${path}`,
    });
  }
  return out;
}

export async function fetchWeeklyFreeOffers(options?: {
  locale?: string;
  country?: string;
  allowCountries?: string;
  now?: Date;
  fetchFn?: typeof fetch;
}): Promise<WeeklyFreeOffer[]> {
  const locale = options?.locale ?? "en-US";
  const country = options?.country ?? "US";
  const allow = options?.allowCountries ?? country;
  const fetchFn = options?.fetchFn ?? fetch;
  const url =
    `https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions` +
    `?locale=${encodeURIComponent(locale)}` +
    `&country=${encodeURIComponent(country)}` +
    `&allowCountries=${encodeURIComponent(allow)}`;

  const res = await fetchFn(url, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Epic free games API HTTP ${res.status}`);
  }
  const json = (await res.json()) as Record<string, unknown>;
  cleanGraphql1004(json);
  return parseFreeGamesPromotionsPayload(json, {
    now: options?.now,
    localePrefix: `https://store.epicgames.com/${locale}`,
  });
}
