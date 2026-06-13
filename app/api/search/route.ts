import { NextRequest, NextResponse } from "next/server";

const SERPER_API_KEY = process.env.SERPER_API_KEY;

const EXCLUDED_DOMAINS = ["chrono24.com", "chrono24.co.uk"];

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

async function searchSerper(query: string) {
  const response = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "X-API-KEY": SERPER_API_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ q: query, num: 20 }),
  });

  if (!response.ok) throw new Error(`Serper API error: ${response.status}`);
  return response.json();
}

export async function POST(req: NextRequest) {
  if (!SERPER_API_KEY) {
    return NextResponse.json({ error: "Search API key not configured" }, { status: 500 });
  }

  const { reference, year, condition } = await req.json();

  if (!reference) {
    return NextResponse.json({ error: "Reference number is required" }, { status: 400 });
  }

  const conditionTerm = condition === "new" ? "new unworn" : "pre-owned";
  const yearTerm = year ? `${year}` : "";
  const query = `${reference} ${yearTerm} ${conditionTerm} watch for sale price`.trim();

  try {
    const data = await searchSerper(query);
    const results = data.organic || [];

    const listings: { title: string; price: number; currency: string; url: string; source: string }[] = [];

    for (const result of results) {
      try {
        const domain = new URL(result.link).hostname.replace("www.", "");
        if (EXCLUDED_DOMAINS.some((d) => domain.includes(d))) continue;

        const fullText = `${result.title} ${result.snippet || ""}`;
        const price = extractPrice(fullText);

        if (price) {
          const currency = detectCurrency(fullText);
          listings.push({
            title: result.title,
            price,
            currency,
            url: result.link,
            source: domain,
          });
        }
      } catch {
        continue;
      }
    }

    // If fewer than 3 results, do a broader search
    if (listings.length < 3) {
      const broadData = await searchSerper(`${reference} watch buy price`);
      const broadResults = broadData.organic || [];

      for (const result of broadResults) {
        try {
          const domain = new URL(result.link).hostname.replace("www.", "");
          if (EXCLUDED_DOMAINS.some((d) => domain.includes(d))) continue;
          if (listings.some((l) => l.url === result.link)) continue;

          const fullText = `${result.title} ${result.snippet || ""}`;
          const price = extractPrice(fullText);

          if (price) {
            const currency = detectCurrency(fullText);
            listings.push({ title: result.title, price, currency, url: result.link, source: domain });
          }
        } catch {
          continue;
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

    // Find dominant currency
    const currencyCount: Record<string, number> = {};
    listings.forEach((l) => {
      currencyCount[l.currency] = (currencyCount[l.currency] || 0) + 1;
    });
    const dominantCurrency = Object.entries(currencyCount).sort((a, b) => b[1] - a[1])[0][0];
    const sameCurrencyListings = listings.filter((l) => l.currency === dominantCurrency);

    // Remove outliers
    const sorted = [...sameCurrencyListings].sort((a, b) => a.price - b.price);
    const median = sorted[Math.floor(sorted.length / 2)].price;
    const filtered = sameCurrencyListings.filter(
      (l) => l.price >= median * 0.4 && l.price <= median * 2.5
    );

    const average = Math.round(
      filtered.reduce((a, b) => a + b.price, 0) / filtered.length
    );

    return NextResponse.json({
      listings: filtered.sort((a, b) => a.price - b.price),
      average,
      currency: dominantCurrency,
      totalFound: listings.length,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Search failed. Please try again." }, { status: 500 });
  }
}
