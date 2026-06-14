import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";

const SERPER_API_KEY = process.env.SERPER_API_KEY;
const EBAY_APP_ID = process.env.EBAY_APP_ID;

const UAE_DOMAINS = [
  "luxurysouq.com", "chrono-group.ae", "chrono-hub.com", "watchmaestro.com",
  "timesecret.ae", "thestore.ae", "theluxuryaddress.ae", "timezonedubai.com", "topwatches.ae",
];

const UK_DEALERS = [
  "thekettlekids.com",
  "gmgwatches.co.uk",
  "trottersjewellers.com",
  "prestigiousjewellers.com",
  "watchfinder.co.uk",
  "watchbox.com",
  "watchcollectors.co.uk",
];

const DUBAI_DEALERS = [
  "luxurysouq.com",
  "chrono-group.ae",
  "chrono-hub.com",
  "watchmaestro.com",
  "timesecret.ae",
  "thestore.ae",
  "theluxuryaddress.ae",
  "timezonedubai.com",
  "topwatches.ae",
];

const EXCLUDED_DOMAINS = [
  "chrono24.com", "chrono24.co.uk",
  "instagram.com", "hodinkee.com", "watchcharts.com", "bobswatches.com", "timepiece360.com",
  "rolex.com", "tudorwatch.com", "patekphilippe.com", "audemarspiguet.com",
  "iwc.com", "breitling.com", "tagheuer.com", "omega.com", "cartier.com",
  "richardmille.com", "hublot.com", "jaegerlecoultre.com", "vacheron-constantin.com",
  "a-lange-soehne.com", "panerai.com", "zenith-watches.com", "chopard.com",
  "girard-perregaux.com", "ulysse-nardin.com", "blancpain.com", "breguet.com",
  "watches-of-switzerland.co.uk", "goldsmiths.co.uk", "ernestjones.co.uk",
  "mappin-webb.co.uk", "fraserhart.co.uk", "bucherer.com", "tourneau.com",
  "harrods.com", "selfridges.com",
  "fratellowatches.com", "monochrome-watches.com", "ablogtowatch.com",
  "watchtime.com", "watchpro.com", "revolutionwatch.com", "timeandtidewatches.com",
  "johnhardy.com", "dunhill.com",
];

type Listing = { title: string; price: number; currency: string; url: string; source: string };

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
      if (value > 500 && value < 5_000_000) return value;
    }
  }
  return null;
}

function detectCurrency(text: string, defaultCurrency = "GBP"): string {
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
async function searchEbaySold(query: string): Promise<Listing[]> {
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
      .filter((item: Record<string, unknown[]>) =>
        (item.sellingStatus?.[0] as Record<string, unknown[]>)?.sellingState?.[0] === "EndedWithSales"
      )
      .map((item: Record<string, unknown[]>) => {
        const priceObj = item.sellingStatus?.[0] as Record<string, unknown[]>;
        const priceStr = (priceObj?.convertedCurrentPrice?.[0] as Record<string, string>)?.__value__ || "";
        const currencyId = (priceObj?.convertedCurrentPrice?.[0] as Record<string, string>)?.["@currencyId"] || "GBP";
        const price = parseFloat(priceStr);
        if (!price || price < 500) return null;
        const currencyMap: Record<string, string> = { GBP: "GBP", USD: "USD", EUR: "EUR" };
        return {
          title: (item.title?.[0] as string) || "",
          price,
          currency: currencyMap[currencyId] || "GBP",
          url: (item.viewItemURL?.[0] as string) || "",
          source: "ebay.co.uk",
        };
      })
      .filter(Boolean) as Listing[];
  } catch {
    return [];
  }
}

// ── Scrape a product page for its price via JSON-LD → meta tags → CSS ────────
async function scrapeProductPage(
  url: string,
  domain: string,
  defaultCurrency: string
): Promise<{ price: number; currency: string } | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(7000),
      next: { revalidate: 0 },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const $ = cheerio.load(html);

    // 1. JSON-LD structured data (most reliable — standard for ecommerce)
    let found: { price: number; currency: string } | null = null;
    $("script[type='application/ld+json']").each((_, el) => {
      if (found) return;
      try {
        const raw = $(el).html() || "{}";
        const json = JSON.parse(raw);
        const nodes: unknown[] = Array.isArray(json) ? json : [json];
        for (const node of nodes) {
          const n = node as Record<string, unknown>;
          if (n["@type"] !== "Product") continue;
          const offers = n.offers || n.offer;
          if (!offers) continue;
          const offer = (Array.isArray(offers) ? offers[0] : offers) as Record<string, unknown>;
          const price = parseFloat(String(offer.price ?? ""));
          if (price > 500 && price < 5_000_000) {
            found = { price, currency: (offer.priceCurrency as string) || defaultCurrency };
            return false;
          }
        }
      } catch { /* malformed JSON-LD */ }
    });
    if (found) return found;

    // 2. Open Graph / product meta tags
    const metaPrice =
      $("meta[property='product:price:amount']").attr("content") ||
      $("meta[property='og:price:amount']").attr("content");
    const metaCurrency =
      $("meta[property='product:price:currency']").attr("content") ||
      $("meta[property='og:price:currency']").attr("content") ||
      defaultCurrency;
    if (metaPrice) {
      const price = parseFloat(metaPrice.replace(/,/g, ""));
      if (price > 500 && price < 5_000_000) return { price, currency: metaCurrency };
    }

    // 3. CSS selectors — broad net of common ecommerce patterns
    const selectors = [
      ".price__current", ".price-item--sale", ".price-item--regular",
      ".woocommerce-Price-amount", "[data-product-price]",
      ".price .amount", ".product__price", ".product-price__amount",
      ".ProductMeta__Price", ".price", ".money",
    ];
    for (const sel of selectors) {
      const text = $(sel).first().text().trim();
      const price = extractPrice(text);
      if (price) return { price, currency: detectCurrency(text, defaultCurrency) };
    }

    return null;
  } catch {
    return null;
  }
}

// ── Serper search targeting specific dealer sites ─────────────────────────────
// Groups sites in 3s to keep queries targeted while limiting API calls.
async function serperDealerSearch(
  query: string,
  sites: string[],
  isUAE = false
): Promise<Listing[]> {
  if (!SERPER_API_KEY || sites.length === 0) return [];

  const groups: string[][] = [];
  for (let i = 0; i < sites.length; i += 3) groups.push(sites.slice(i, i + 3));

  const serperResults = await Promise.all(
    groups.map(async (group) => {
      const siteStr = group.map((s) => `site:${s}`).join(" OR ");
      try {
        const res = await fetch("https://google.serper.dev/search", {
          method: "POST",
          headers: { "X-API-KEY": SERPER_API_KEY!, "Content-Type": "application/json" },
          body: JSON.stringify({ q: `${query} ${siteStr}`, num: 10 }),
        });
        if (!res.ok) return [];
        const data = await res.json();
        return (data.organic || []) as { title: string; snippet?: string; link: string }[];
      } catch { return []; }
    })
  );

  const listings: Listing[] = [];
  const pagePromises: Promise<void>[] = [];

  for (const r of serperResults.flat()) {
    let domain: string;
    try { domain = new URL(r.link).hostname.replace("www.", ""); }
    catch { continue; }
    if (EXCLUDED_DOMAINS.some((d) => domain.includes(d))) continue;

    const defaultCurrency = isUAE || UAE_DOMAINS.some((d) => domain.includes(d)) ? "AED" : "GBP";
    const fullText = `${r.title} ${r.snippet || ""}`;
    const snippetPrice = extractPrice(fullText);

    if (snippetPrice) {
      listings.push({
        title: r.title,
        price: snippetPrice,
        currency: detectCurrency(fullText, defaultCurrency),
        url: r.link,
        source: domain,
      });
    } else {
      // Price not in snippet — scrape the actual product page
      const url = r.link;
      const title = r.title;
      pagePromises.push(
        scrapeProductPage(url, domain, defaultCurrency).then((priceData) => {
          if (priceData) {
            listings.push({ title, price: priceData.price, currency: priceData.currency, url, source: domain });
          }
        })
      );
    }
  }

  await Promise.all(pagePromises);
  return listings;
}

// ── Serper for Chrono24 sold prices ──────────────────────────────────────────
async function serperChrono24Sold(query: string): Promise<Listing[]> {
  if (!SERPER_API_KEY) return [];
  try {
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "X-API-KEY": SERPER_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        q: `${query} sold price site:chrono24.com OR site:chrono24.co.uk`,
        num: 10,
      }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.organic || [])
      .map((r: { title: string; snippet?: string; link: string }) => {
        const fullText = `${r.title} ${r.snippet || ""}`;
        const price = extractPrice(fullText);
        if (!price) return null;
        return { title: r.title, price, currency: detectCurrency(fullText, "GBP"), url: r.link, source: "chrono24.com" };
      })
      .filter(Boolean) as Listing[];
  } catch { return []; }
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
  } catch { return null; }
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

  const [ukResults, dubaiResults, ebayResults, chrono24Results, watchImage] = await Promise.all([
    serperDealerSearch(baseQuery, UK_DEALERS, false),
    serperDealerSearch(baseQuery, DUBAI_DEALERS, true),
    searchEbaySold(baseQuery),
    serperChrono24Sold(baseQuery),
    getWatchImage(imageQuery),
  ]);

  const askingListings = [...ukResults, ...dubaiResults].filter(
    (l) => !EXCLUDED_DOMAINS.some((d) => l.source.includes(d))
  );

  const soldListings = [...ebayResults, ...chrono24Results].filter(
    (l) => !EXCLUDED_DOMAINS.filter((d) => !d.includes("chrono24")).some((d) => l.source.includes(d))
  );

  const dedup = (arr: Listing[]) => {
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
