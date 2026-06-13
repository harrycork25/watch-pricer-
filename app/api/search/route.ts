import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";

const SERPER_API_KEY = process.env.SERPER_API_KEY;
const EBAY_APP_ID = process.env.EBAY_APP_ID;

// Shopify-based dealer sites (support /search.json)
const SHOPIFY_SITES = [
  "thekettlekids.com",
  "theluxuryaddress.ae",
  "topwatches.ae",
  "timesecret.ae",
  "thestore.ae",
  "watchcollectors.co.uk",
];

// Non-Shopify dealer sites (direct HTML scraping)
const SCRAPE_SITES: { url: string; searchPath: string; priceSelector: string; titleSelector: string; linkSelector: string }[] = [
  {
    url: "https://www.gmgwatches.co.uk",
    searchPath: "/?s=",
    priceSelector: ".price",
    titleSelector: ".woocommerce-loop-product__title",
    linkSelector: "a.woocommerce-LoopProduct-link",
  },
  {
    url: "https://www.trottersjewellers.com",
    searchPath: "/search?q=",
    priceSelector: ".price",
    titleSelector: ".product-title",
    linkSelector: "a.product-link",
  },
  {
    url: "https://watchfinder.co.uk",
    searchPath: "/search?q=",
    priceSelector: "[data-price]",
    titleSelector: ".watch-title",
    linkSelector: "a",
  },
];

const EXCLUDED_DOMAINS = [
  "chrono24.com",
  "chrono24.co.uk",
  "instagram.com",
  "hodinkee.com",
  "watchcharts.com",
  "bobswatches.com",
  "timepiece360.com",
];

function extractPrice(text: string): number | null {
  const patterns = [
    /(?:sold\s+for\s+)?£([\d,]+(?:\.\d{2})?)/i,
    /(?:sold\s+for\s+)?\$([\d,]+(?:\.\d{2})?)/i,
    /(?:sold\s+for\s+)?€([\d,]+(?:\.\d{2})?)/i,
    /AED\s*([\d,]+(?:\.\d{2})?)/i,
    /([\d,]+(?:\.\d{2})?)\s*AED/i,
    /GBP\s*([\d,]+(?:\.\d{2})?)/i,
    /USD\s*([\d,]+(?:\.\d{2})?)/i,
    /([\d,]+(?:\.\d{2})?)\s*(?:GBP|USD|EUR)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const value = parseFloat(match[1].replace(/,/g, ""));
      if (value > 500 && value < 5000000) return value;
    }
  }
  return null;
}

function detectCurrency(text: string, defaultCurrency = "USD"): string {
  if (text.includes("£") || /\bGBP\b/i.test(text)) return "GBP";
  if (/\bAED\b/i.test(text) || text.includes("د.إ")) return "AED";
  if (text.includes("€") || /\bEUR\b/i.test(text)) return "EUR";
  if (text.includes("$") || /\bUSD\b/i.test(text)) return "USD";
  return defaultCurrency;
}

function dominantCurrency(listings: { currency: string }[]) {
  const counts: Record<string, number> = {};
  listings.forEach((l) => { counts[l.currency] = (counts[l.currency] || 0) + 1; });
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || "GBP";
}

// ── eBay completed/sold listings ──────────────────────────────────────────────
async function searchEbaySold(query: string) {
  if (!EBAY_APP_ID) return [];
  try {
    const params = new URLSearchParams({
      "OPERATION-NAME": "findCompletedItems",
      "SERVICE-VERSION": "1.0.0",
      "SECURITY-APPNAME": EBAY_APP_ID,
      "RESPONSE-DATA-FORMAT": "JSON",
      "keywords": query,
      "itemFilter(0).name": "SoldItemsOnly",
      "itemFilter(0).value": "true",
      "sortOrder": "EndTimeSoonest",
      "paginationInput.entriesPerPage": "20",
    });

    const res = await fetch(
      `https://svcs.ebay.com/services/search/FindingService/v1?${params}`,
      { next: { revalidate: 0 } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    const items = data?.findCompletedItemsResponse?.[0]?.searchResult?.[0]?.item || [];

    return items
      .filter((item: Record<string, unknown[]>) => (item.sellingStatus?.[0] as Record<string, unknown[]>)?.sellingState?.[0] === "EndedWithSales")
      .map((item: Record<string, unknown[]>) => {
        const priceObj = item.sellingStatus?.[0] as Record<string, unknown[]>;
        const priceStr = (priceObj?.convertedCurrentPrice?.[0] as Record<string, string>)?.__value__ || "";
        const currencyId = (priceObj?.convertedCurrentPrice?.[0] as Record<string, string>)?.["@currencyId"] || "USD";
        const price = parseFloat(priceStr);
        if (!price || price < 500) return null;

        const currencyMap: Record<string, string> = { GBP: "GBP", USD: "USD", EUR: "EUR" };
        return {
          title: (item.title?.[0] as string) || "",
          price,
          currency: currencyMap[currencyId] || "USD",
          url: (item.viewItemURL?.[0] as string) || "",
          source: "ebay.co.uk",
        };
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

const UAE_DOMAINS = ["luxurysouq.com", "chrono-group.ae", "chrono-hub.com", "watchmaestro.com",
  "timesecret.ae", "thestore.ae", "theluxuryaddress.ae", "timezonedubai.com", "topwatches.ae"];

// ── Shopify JSON search ───────────────────────────────────────────────────────
async function searchShopifySite(domain: string, query: string) {
  const defaultCurrency = UAE_DOMAINS.some((d) => domain.includes(d)) ? "AED" : "GBP";
  try {
    const res = await fetch(
      `https://${domain}/search?type=product&q=${encodeURIComponent(query)}`,
      { headers: { Accept: "text/html" }, next: { revalidate: 0 } }
    );
    if (!res.ok) return [];
    const html = await res.text();
    const $ = cheerio.load(html);
    const listings: { title: string; price: number; currency: string; url: string; source: string }[] = [];

    $("[data-price], .price, .product-price, .money").each((_, el) => {
      const priceText = $(el).text().trim();
      const price = extractPrice(priceText);
      if (!price) return;

      const productEl = $(el).closest("a, [href]").first();
      const href = productEl.attr("href") || "";
      const title = productEl.attr("title") || productEl.find("h2,h3,.title,.product-title").first().text().trim() || priceText;

      if (price) {
        listings.push({
          title,
          price,
          currency: detectCurrency(priceText, defaultCurrency),
          url: href.startsWith("http") ? href : `https://${domain}${href}`,
          source: domain,
        });
      }
    });

    return listings.slice(0, 5);
  } catch {
    return [];
  }
}

// ── Serper fallback for sites that block scraping ─────────────────────────────
async function serperSiteSearch(query: string, sites: string[]) {
  if (!SERPER_API_KEY || sites.length === 0) return [];
  try {
    const siteStr = sites.map((s) => `site:${s}`).join(" OR ");
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "X-API-KEY": SERPER_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ q: `${query} for sale price (${siteStr})`, num: 10 }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.organic || []).map((r: { title: string; snippet?: string; link: string }) => {
      try {
        const domain = new URL(r.link).hostname.replace("www.", "");
        if (EXCLUDED_DOMAINS.some((d) => domain.includes(d))) return null;
        const fullText = `${r.title} ${r.snippet || ""}`;
        const price = extractPrice(fullText);
        if (!price) return null;
        const defaultCurrency = UAE_DOMAINS.some((d) => domain.includes(d)) ? "AED" : "GBP";
        return { title: r.title, price, currency: detectCurrency(fullText, defaultCurrency), url: r.link, source: domain };
      } catch { return null; }
    }).filter(Boolean);
  } catch {
    return [];
  }
}

// ── Serper for Chrono24 sold prices ──────────────────────────────────────────
async function serperChrono24Sold(query: string) {
  if (!SERPER_API_KEY) return [];
  try {
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "X-API-KEY": SERPER_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ q: `${query} sold price site:chrono24.com OR site:chrono24.co.uk`, num: 10 }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.organic || []).map((r: { title: string; snippet?: string; link: string }) => {
      const fullText = `${r.title} ${r.snippet || ""}`;
      const price = extractPrice(fullText);
      if (!price) return null;
      return { title: r.title, price, currency: detectCurrency(fullText), url: r.link, source: "chrono24.com" };
    }).filter(Boolean);
  } catch {
    return [];
  }
}

// ── Image search ──────────────────────────────────────────────────────────────
async function getWatchImage(query: string): Promise<string | null> {
  if (!SERPER_API_KEY) return null;
  try {
    const res = await fetch("https://google.serper.dev/images", {
      method: "POST",
      headers: { "X-API-KEY": SERPER_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ q: query, num: 5 }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const images = data.images || [];
    for (const img of images) {
      if (img.imageUrl && img.imageWidth > 200 && img.imageHeight > 200) return img.imageUrl;
    }
    return images[0]?.imageUrl || null;
  } catch {
    return null;
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const { reference, make, model, year, condition, material, dialColour } = await req.json();

  if (!reference) {
    return NextResponse.json({ error: "Reference number is required" }, { status: 400 });
  }

  const conditionTerm = condition === "new" ? "new unworn" : "pre-owned";
  const variantTerms = [
    material && material !== "any" ? material : "",
    dialColour && dialColour !== "any" ? `${dialColour} dial` : "",
  ].filter(Boolean).join(" ");

  const baseQuery = `${make || ""} ${model || ""} ${reference} ${year || ""} ${variantTerms} ${conditionTerm} watch`
    .trim().replace(/\s+/g, " ");

  const imageQuery = `${make || ""} ${model || ""} ${reference} ${variantTerms} watch`.trim().replace(/\s+/g, " ");

  // Dubai sites — use Serper since they're harder to scrape
  const DUBAI_SITES = [
    "luxurysouq.com", "chrono-group.ae", "chrono-hub.com", "watchmaestro.com",
    "timepiece360.com", "timesecret.ae", "thestore.ae", "theluxuryaddress.ae",
    "timezonedubai.com", "topwatches.ae",
  ];

  // Non-Shopify UK sites — use Serper as fallback
  const UK_SERPER_SITES = [
    "prestigiousjewellers.com", "watchfinder.co.uk", "watchbox.com", "crownandcaliber.com",
  ];

  const [
    ebayResults,
    chrono24Results,
    shopifyResults,
    dubaiResults,
    ukSerperResults,
    watchImage,
  ] = await Promise.all([
    searchEbaySold(baseQuery),
    serperChrono24Sold(baseQuery),
    Promise.all(SHOPIFY_SITES.map((site) => searchShopifySite(site, `${make || ""} ${model || ""} ${reference}`.trim()))).then((r) => r.flat()),
    serperSiteSearch(baseQuery, DUBAI_SITES),
    serperSiteSearch(baseQuery, UK_SERPER_SITES),
    getWatchImage(imageQuery),
  ]);

  // Also scrape the non-Shopify UK sites directly
  const directScrapeResults = await Promise.all(
    SCRAPE_SITES.map(async (site) => {
      try {
        const res = await fetch(`${site.url}${site.searchPath}${encodeURIComponent(`${reference}`)}`, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; WatchPricer/1.0)" },
          next: { revalidate: 0 },
        });
        if (!res.ok) return [];
        const html = await res.text();
        const $ = cheerio.load(html);
        const listings: { title: string; price: number; currency: string; url: string; source: string }[] = [];
        $(site.priceSelector).each((_, el) => {
          const priceText = $(el).text().trim();
          const price = extractPrice(priceText);
          if (!price) return;
          const parent = $(el).closest("li, article, .product, [class*='product']");
          const title = parent.find(site.titleSelector).text().trim() || reference;
          const href = parent.find(site.linkSelector).attr("href") || "";
          listings.push({
            title, price,
            currency: detectCurrency(priceText),
            url: href.startsWith("http") ? href : `${site.url}${href}`,
            source: new URL(site.url).hostname.replace("www.", ""),
          });
        });
        return listings.slice(0, 5);
      } catch { return []; }
    })
  ).then((r) => r.flat());

  // Combine asking prices
  const askingListings = [
    ...shopifyResults,
    ...dubaiResults,
    ...ukSerperResults,
    ...directScrapeResults,
  ].filter((l) => !EXCLUDED_DOMAINS.some((d) => l.source.includes(d)));

  // Combine sold prices
  const soldListings = [
    ...ebayResults,
    ...chrono24Results,
  ].filter((l) => !EXCLUDED_DOMAINS.filter(d => !d.includes("chrono24")).some((d) => l.source.includes(d)));

  // Deduplicate by URL
  const dedup = (arr: typeof askingListings) => {
    const seen = new Set<string>();
    return arr.filter((l) => { if (seen.has(l.url)) return false; seen.add(l.url); return true; });
  };

  const dedupedAsking = dedup(askingListings);
  const dedupedSold = dedup(soldListings);

  const askingCurrency = dominantCurrency(dedupedAsking.length > 0 ? dedupedAsking : [{ currency: "GBP" }]);
  const soldCurrency = dominantCurrency(dedupedSold.length > 0 ? dedupedSold : [{ currency: "GBP" }]);

  return NextResponse.json({
    watchImage,
    asking: {
      listings: dedupedAsking.filter((l) => l.currency === askingCurrency).sort((a, b) => a.price - b.price),
      currency: askingCurrency,
    },
    sold: {
      listings: dedupedSold.filter((l) => l.currency === soldCurrency).sort((a, b) => a.price - b.price),
      currency: soldCurrency,
    },
  });
}
