import { NextRequest, NextResponse } from "next/server";

const SERPER_API_KEY = process.env.SERPER_API_KEY;

const DUBAI_SITES = [
  "luxurysouq.com",
  "chrono-group.ae",
  "chrono-hub.com",
  "watchmaestro.com",
  "timepiece360.com",
  "timesecret.ae",
  "thestore.ae",
  "theluxuryaddress.ae",
  "timezonedubai.com",
  "topwatches.ae",
];

const UK_SITES = [
  "thekettlekids.com",
  "gmgwatches.co.uk",
  "prestigiousjewellers.com",
  "trottersjewellers.com",
  "watchfinder.co.uk",
  "watchbox.com",
  "bobswatches.com",
  "crownandcaliber.com",
  "watchcollectors.co.uk",
];

const ALL_DEALER_SITES = [...DUBAI_SITES, ...UK_SITES];

function extractPrice(text: string): number | null {
  const patterns = [
    /£([\d,]+(?:\.\d{2})?)/,
    /\$([\d,]+(?:\.\d{2})?)/,
    /€([\d,]+(?:\.\d{2})?)/,
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
      if (value > 500 && value < 5000000) {
        return value;
      }
    }
  }
  return null;
}

function detectCurrency(text: string): string {
  if (text.includes("£") || /\bGBP\b/i.test(text)) return "GBP";
  if (/\bAED\b/i.test(text) || text.includes("د.إ")) return "AED";
  if (text.includes("€") || /\bEUR\b/i.test(text)) return "EUR";
  return "USD";
}

async function serperSearch(query: string, num = 10) {
  const response = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "X-API-KEY": SERPER_API_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ q: query, num }),
  });
  if (!response.ok) throw new Error(`Serper error: ${response.status}`);
  return response.json();
}

async function serperImageSearch(query: string): Promise<string | null> {
  const response = await fetch("https://google.serper.dev/images", {
    method: "POST",
    headers: {
      "X-API-KEY": SERPER_API_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ q: query, num: 5 }),
  });
  if (!response.ok) return null;
  const data = await response.json();
  const images = data.images || [];
  // Pick first image that looks like a watch photo (not a logo/icon)
  for (const img of images) {
    if (img.imageUrl && img.imageWidth > 200 && img.imageHeight > 200) {
      return img.imageUrl;
    }
  }
  return images[0]?.imageUrl || null;
}

function parseResults(
  results: { title: string; snippet?: string; link: string }[],
  excludeDomains: string[] = [],
  allowDomains: string[] = []
) {
  const listings: {
    title: string;
    price: number;
    currency: string;
    url: string;
    source: string;
  }[] = [];

  for (const result of results) {
    try {
      const domain = new URL(result.link).hostname.replace("www.", "");
      if (excludeDomains.some((d) => domain.includes(d))) continue;
      if (allowDomains.length > 0 && !allowDomains.some((d) => domain.includes(d))) continue;

      const fullText = `${result.title} ${result.snippet || ""}`;
      const price = extractPrice(fullText);
      if (!price) continue;

      const currency = detectCurrency(fullText);
      listings.push({ title: result.title, price, currency, url: result.link, source: domain });
    } catch {
      continue;
    }
  }
  return listings;
}

function calcAverage(listings: { price: number }[]) {
  if (listings.length === 0) return null;
  const sorted = [...listings].sort((a, b) => a.price - b.price);
  const median = sorted[Math.floor(sorted.length / 2)].price;
  const filtered = listings.filter(
    (l) => l.price >= median * 0.4 && l.price <= median * 2.5
  );
  if (filtered.length === 0) return null;
  return Math.round(filtered.reduce((a, b) => a + b.price, 0) / filtered.length);
}

function dominantCurrency(listings: { currency: string }[]) {
  const counts: Record<string, number> = {};
  listings.forEach((l) => { counts[l.currency] = (counts[l.currency] || 0) + 1; });
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || "GBP";
}

export async function POST(req: NextRequest) {
  if (!SERPER_API_KEY) {
    return NextResponse.json({ error: "Search API key not configured" }, { status: 500 });
  }

  const { reference, year, condition, material, dialColour } = await req.json();

  if (!reference) {
    return NextResponse.json({ error: "Reference number is required" }, { status: 400 });
  }

  const conditionTerm = condition === "new" ? "new unworn" : "pre-owned";
  const variantTerms = [
    material && material !== "any" ? material : "",
    dialColour && dialColour !== "any" ? `${dialColour} dial` : "",
  ].filter(Boolean).join(" ");

  const baseQuery = `${reference} ${year || ""} ${variantTerms} ${conditionTerm} watch`.trim();
  const dealerSiteStr = ALL_DEALER_SITES.map((s) => `site:${s}`).join(" OR ");

  try {
    const imageQuery = `${reference} ${variantTerms} watch`.trim();

    const [dealerData, ebayData, soldData, chrono24SoldData, watchImage] = await Promise.all([
      // Search specific dealer sites
      serperSearch(`${baseQuery} for sale price (${dealerSiteStr})`, 10),
      // eBay sold/completed listings
      serperSearch(`${baseQuery} sold completed listing site:ebay.co.uk OR site:ebay.com`, 10),
      // General sold prices
      serperSearch(`${baseQuery} sold price`, 10),
      // Chrono24 sold prices only
      serperSearch(`${reference} ${variantTerms} sold price site:chrono24.com OR site:chrono24.co.uk`, 10),
      // Watch image
      serperImageSearch(imageQuery),
    ]);

    // Asking prices — from dealers (exclude Chrono24)
    const askingListings = parseResults(
      [...(dealerData.organic || [])],
      ["chrono24.com", "chrono24.co.uk"]
    );

    // Sold prices — eBay + general sold + Chrono24 sold
    const soldListings = parseResults([
      ...(ebayData.organic || []),
      ...(soldData.organic || []),
      ...(chrono24SoldData.organic || []),
    ], []);

    // Deduplicate sold listings by URL
    const seenUrls = new Set<string>();
    const dedupedSold = soldListings.filter((l) => {
      if (seenUrls.has(l.url)) return false;
      seenUrls.add(l.url);
      return true;
    });

    const askingCurrency = dominantCurrency(askingListings);
    const soldCurrency = dominantCurrency(dedupedSold.length > 0 ? dedupedSold : askingListings);

    const filteredAsking = askingListings.filter((l) => l.currency === askingCurrency);
    const filteredSold = dedupedSold.filter((l) => l.currency === soldCurrency);

    return NextResponse.json({
      watchImage,
      asking: {
        listings: filteredAsking.sort((a, b) => a.price - b.price),
        average: calcAverage(filteredAsking),
        currency: askingCurrency,
      },
      sold: {
        listings: filteredSold.sort((a, b) => a.price - b.price),
        average: calcAverage(filteredSold),
        currency: soldCurrency,
      },
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Search failed. Please try again." }, { status: 500 });
  }
}
