import { NextRequest, NextResponse } from "next/server";

const BRAVE_API_KEY = process.env.BRAVE_API_KEY;

const EXCLUDED_DOMAINS = ["chrono24.com", "chrono24.co.uk"];

const WATCH_SITES = [
  "watchbox.com",
  "bobswatches.com",
  "watchfinder.com",
  "watchfinder.co.uk",
  "crownandcaliber.com",
  "thewatchcompany.com",
  "watchesofmayfair.com",
  "jomashop.com",
  "hodinkee.com/shop",
  "farfetch.com",
  "ebay.com",
  "ebay.co.uk",
  "grailzee.com",
  "watchcollectors.co.uk",
];

function extractPrice(text: string): number | null {
  const patterns = [
    /£([\d,]+(?:\.\d{2})?)/,
    /\$([\d,]+(?:\.\d{2})?)/,
    /€([\d,]+(?:\.\d{2})?)/,
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
  if (text.includes("£") || text.toLowerCase().includes("gbp")) return "GBP";
  if (text.includes("€") || text.toLowerCase().includes("eur")) return "EUR";
  return "USD";
}

export async function POST(req: NextRequest) {
  if (!BRAVE_API_KEY) {
    return NextResponse.json({ error: "Search API key not configured" }, { status: 500 });
  }

  const { reference, year, condition } = await req.json();

  if (!reference) {
    return NextResponse.json({ error: "Reference number is required" }, { status: 400 });
  }

  const conditionTerm = condition === "new" ? "new unworn" : "pre-owned used";
  const yearTerm = year ? `${year}` : "";
  const query = `${reference} ${yearTerm} ${conditionTerm} watch price for sale`.trim();

  try {
    const url = new URL("https://api.search.brave.com/res/v1/web/search");
    url.searchParams.set("q", query);
    url.searchParams.set("count", "20");
    url.searchParams.set("safesearch", "off");

    const response = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": BRAVE_API_KEY,
      },
    });

    if (!response.ok) {
      throw new Error(`Search API error: ${response.status}`);
    }

    const data = await response.json();
    const results = data.web?.results || [];

    const listings: { title: string; price: number; currency: string; url: string; source: string }[] = [];

    for (const result of results) {
      const domain = new URL(result.url).hostname.replace("www.", "");

      if (EXCLUDED_DOMAINS.some((d) => domain.includes(d))) continue;

      const fullText = `${result.title} ${result.description || ""}`;
      const price = extractPrice(fullText);

      if (price) {
        const currency = detectCurrency(fullText);
        listings.push({
          title: result.title,
          price,
          currency,
          url: result.url,
          source: domain,
        });
      }
    }

    // If fewer than 3 results, do a second broader search
    if (listings.length < 3) {
      const broadQuery = `${reference} watch buy price`;
      const broadUrl = new URL("https://api.search.brave.com/res/v1/web/search");
      broadUrl.searchParams.set("q", broadQuery);
      broadUrl.searchParams.set("count", "20");
      broadUrl.searchParams.set("safesearch", "off");

      const broadResponse = await fetch(broadUrl.toString(), {
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip",
          "X-Subscription-Token": BRAVE_API_KEY,
        },
      });

      if (broadResponse.ok) {
        const broadData = await broadResponse.json();
        const broadResults = broadData.web?.results || [];

        for (const result of broadResults) {
          const domain = new URL(result.url).hostname.replace("www.", "");
          if (EXCLUDED_DOMAINS.some((d) => domain.includes(d))) continue;
          if (listings.some((l) => l.url === result.url)) continue;

          const fullText = `${result.title} ${result.description || ""}`;
          const price = extractPrice(fullText);

          if (price) {
            const currency = detectCurrency(fullText);
            listings.push({
              title: result.title,
              price,
              currency,
              url: result.url,
              source: domain,
            });
          }
        }
      }
    }

    if (listings.length === 0) {
      return NextResponse.json({
        listings: [],
        average: null,
        message: "No priced listings found. Try adjusting the reference number.",
      });
    }

    // Group by currency and find the dominant one
    const currencyCount: Record<string, number> = {};
    listings.forEach((l) => {
      currencyCount[l.currency] = (currencyCount[l.currency] || 0) + 1;
    });
    const dominantCurrency = Object.entries(currencyCount).sort((a, b) => b[1] - a[1])[0][0];

    const sameCurrencyListings = listings.filter((l) => l.currency === dominantCurrency);
    const prices = sameCurrencyListings.map((l) => l.price);
    const average = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);

    // Remove outliers (prices more than 2x or less than 0.5x the median)
    const sorted = [...prices].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const filtered = sameCurrencyListings.filter(
      (l) => l.price >= median * 0.4 && l.price <= median * 2.5
    );
    const filteredAverage =
      filtered.length > 0
        ? Math.round(filtered.reduce((a, b) => a + b.price, 0) / filtered.length)
        : average;

    return NextResponse.json({
      listings: filtered.sort((a, b) => a.price - b.price),
      average: filteredAverage,
      currency: dominantCurrency,
      totalFound: listings.length,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Search failed. Please try again." }, { status: 500 });
  }
}
