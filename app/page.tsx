"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";

const CURRENCY_SYMBOLS: Record<string, string> = {
  GBP: "£", USD: "$", EUR: "€", AED: "AED ",
};

const CURRENCIES = ["GBP", "AED", "USD"] as const;
type Currency = typeof CURRENCIES[number];

interface Listing {
  title: string;
  price: number;
  currency: string;
  url: string;
  source: string;
  soldDate?: string;
}

interface PriceGroup {
  listings: Listing[];
  currency: string;
}

interface SearchResult {
  asking: PriceGroup;
  sold: PriceGroup;
  watchImage?: string | null;
  error?: string;
}

interface HistoryEntry {
  id: string;
  timestamp: number;
  make: string;
  model: string;
  reference: string;
  year: string;
  condition: "new" | "used";
  material: string;
  dialColour: string;
  bracelet: string;
  photo: string | null;
  watchImage: string | null;
  lowestAsking: number | null;
  highestSold: number | null;
  lowestSold: number | null;
  currency: string;
}

function StatCard({ label, price, fromCurrency, displayCurrency, convertPrice, url, source }: {
  label: string;
  price: number | null;
  fromCurrency: string;
  displayCurrency: string;
  convertPrice: (p: number, from: string) => number;
  url?: string;
  source?: string;
}) {
  const symbol = CURRENCY_SYMBOLS[displayCurrency] || displayCurrency + " ";
  const converted = price ? convertPrice(price, fromCurrency) : null;
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-5">
      <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">{label}</p>
      {converted ? (
        <>
          <p className="text-3xl font-bold tracking-tight">{symbol}{converted.toLocaleString()}</p>
          {url && source && (
            <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-gray-500 mt-1.5 block hover:text-gray-300 truncate">
              {source}
            </a>
          )}
        </>
      ) : (
        <p className="text-gray-500 text-sm mt-1">No data found</p>
      )}
    </div>
  );
}

function ListingsBlock({ group, label, displayCurrency, convertPrice }: {
  group: PriceGroup;
  label: string;
  displayCurrency: string;
  convertPrice: (p: number, from: string) => number;
}) {
  const symbol = CURRENCY_SYMBOLS[displayCurrency] || displayCurrency + " ";
  if (group.listings.length === 0) return null;
  return (
    <div className="mb-6">
      <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">{label}</p>
      <div className="space-y-2">
        {group.listings.map((listing, i) => (
          <a key={i} href={listing.url} target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-between bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 hover:border-gray-600 transition-colors">
            <div className="flex-1 min-w-0 mr-4">
              <p className="text-sm text-white truncate">{listing.title}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {listing.source}
                {listing.soldDate && <span className="ml-2 text-gray-600">· {listing.soldDate}</span>}
              </p>
            </div>
            <p className="text-sm font-semibold text-white flex-shrink-0">
              {symbol}{convertPrice(listing.price, listing.currency).toLocaleString()}
            </p>
          </a>
        ))}
      </div>
    </div>
  );
}

function HistoryCard({ entry, onRestore, onDelete }: {
  entry: HistoryEntry;
  onRestore: (e: HistoryEntry) => void;
  onDelete: (id: string) => void;
}) {
  const symbol = CURRENCY_SYMBOLS[entry.currency] || entry.currency + " ";
  const image = entry.photo || entry.watchImage;
  const date = new Date(entry.timestamp);
  const dateStr = date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const timeStr = date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <button onClick={() => onRestore(entry)} className="w-full text-left">
        <div className="flex gap-4 p-4">
          {image ? (
            <div className="relative w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-gray-800">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image} alt="Watch" className="w-full h-full object-cover" />
            </div>
          ) : (
            <div className="w-16 h-16 rounded-lg bg-gray-800 flex-shrink-0 flex items-center justify-center">
              <span className="text-gray-600 text-xs">No photo</span>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-white font-medium text-sm truncate">
              {[entry.make, entry.model, entry.reference].filter(Boolean).join(" ")}
            </p>
            <p className="text-gray-500 text-xs mt-0.5">
              {[entry.year, entry.condition, entry.material !== "any" ? entry.material : "", entry.dialColour !== "any" ? entry.dialColour : "", entry.bracelet !== "any" ? entry.bracelet : ""].filter(Boolean).join(" · ")}
            </p>
            <div className="flex gap-3 mt-2">
              {entry.lowestAsking && (
                <span className="text-xs text-gray-400">Ask: <span className="text-white">{symbol}{entry.lowestAsking.toLocaleString()}</span></span>
              )}
              {entry.lowestSold && (
                <span className="text-xs text-gray-400">Sold: <span className="text-white">{symbol}{entry.lowestSold.toLocaleString()}{entry.highestSold && entry.highestSold !== entry.lowestSold ? `–${entry.highestSold.toLocaleString()}` : ""}</span></span>
              )}
            </div>
          </div>
        </div>
        <div className="px-4 pb-2 flex items-center justify-between">
          <p className="text-xs text-gray-600">{dateStr} at {timeStr}</p>
          <p className="text-xs text-gray-600">Tap to re-run</p>
        </div>
      </button>
      <div className="border-t border-gray-800 px-4 py-2 flex justify-end">
        <button onClick={(e) => { e.stopPropagation(); onDelete(entry.id); }} className="text-xs text-gray-600 hover:text-red-400 transition-colors">
          Delete
        </button>
      </div>
    </div>
  );
}

export default function Home() {
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [reference, setReference] = useState("");
  const [year, setYear] = useState("");
  const [condition, setCondition] = useState<"new" | "used">("used");
  const [material, setMaterial] = useState("any");
  const [dialColour, setDialColour] = useState("any");
  const [bracelet, setBracelet] = useState("any");
  const [photo, setPhoto] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [displayCurrency, setDisplayCurrency] = useState<Currency>("GBP");
  const [rates, setRates] = useState<Record<string, number>>({ GBP: 1, AED: 4.73, USD: 1.27 });
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("watchHistory");
      if (saved) setHistory(JSON.parse(saved));
    } catch {}

    // Fetch live exchange rates (base GBP)
    fetch("https://api.frankfurter.app/latest?base=GBP&symbols=AED,USD")
      .then((r) => r.json())
      .then((data) => {
        if (data.rates) setRates({ GBP: 1, AED: data.rates.AED, USD: data.rates.USD });
      })
      .catch(() => {});
  }, []);

  const convertPrice = (price: number, fromCurrency: string): number => {
    const from = rates[fromCurrency] ?? 1;
    const to = rates[displayCurrency] ?? 1;
    return Math.round((price / from) * to);
  };

  const saveToHistory = (data: SearchResult) => {
    const entry: HistoryEntry = {
      id: Date.now().toString(),
      timestamp: Date.now(),
      make, model, reference, year, condition,
      material, dialColour, bracelet,
      photo,
      watchImage: data.watchImage || null,
      lowestAsking: data.asking.listings.length > 0 ? data.asking.listings[0].price : null,
      highestSold: data.sold.listings.length > 0 ? data.sold.listings[data.sold.listings.length - 1].price : null,
      lowestSold: data.sold.listings.length > 0 ? data.sold.listings[0].price : null,
      currency: data.sold.currency || "GBP",
    };
    const updated = [entry, ...history].slice(0, 50);
    setHistory(updated);
    try { localStorage.setItem("watchHistory", JSON.stringify(updated)); } catch {}
  };

  const deleteHistory = (id: string) => {
    const updated = history.filter((h) => h.id !== id);
    setHistory(updated);
    try { localStorage.setItem("watchHistory", JSON.stringify(updated)); } catch {}
  };

  const restoreFromHistory = (entry: HistoryEntry) => {
    setMake(entry.make);
    setModel(entry.model);
    setReference(entry.reference);
    setYear(entry.year);
    setCondition(entry.condition);
    setMaterial(entry.material);
    setDialColour(entry.dialColour);
    setBracelet(entry.bracelet);
    setPhoto(entry.photo);
    setResult(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setPhoto(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleSearch = async () => {
    if (!reference.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference: reference.trim(), make: make.trim(), model: model.trim(), year, condition, material, dialColour, bracelet }),
      });
      const data = await res.json();
      setResult(data);
      if (!data.error) saveToHistory(data);
    } catch {
      setResult({
        asking: { listings: [], currency: "GBP" },
        sold: { listings: [], currency: "GBP" },
        error: "Something went wrong. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-2xl mx-auto px-4 py-10">

        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Watch Price Checker</h1>
            <p className="text-gray-400 text-sm mt-1">Secondary market prices — UK, Dubai & worldwide</p>
          </div>
          <div className="flex gap-1 bg-gray-900 border border-gray-700 rounded-lg p-1 flex-shrink-0">
            {CURRENCIES.map((c) => (
              <button key={c} onClick={() => setDisplayCurrency(c)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${displayCurrency === c ? "bg-white text-gray-950" : "text-gray-400 hover:text-white"}`}>
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">Make</label>
              <input type="text" value={make} onChange={(e) => setMake(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="e.g. Rolex" className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-gray-500 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">Model</label>
              <input type="text" value={model} onChange={(e) => setModel(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="e.g. Submariner" className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-gray-500 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">Reference</label>
              <input type="text" value={reference} onChange={(e) => setReference(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="e.g. 126610LN" className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-gray-500 text-sm" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">Year</label>
              <input type="text" value={year} onChange={(e) => setYear(e.target.value)} placeholder="e.g. 2021"
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-gray-500 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">Condition</label>
              <div className="flex gap-2 h-[46px]">
                <button onClick={() => setCondition("used")}
                  className={`flex-1 rounded-lg text-sm font-medium border transition-colors ${condition === "used" ? "bg-white text-gray-950 border-white" : "bg-gray-900 text-gray-400 border-gray-700 hover:border-gray-500"}`}>
                  Used
                </button>
                <button onClick={() => setCondition("new")}
                  className={`flex-1 rounded-lg text-sm font-medium border transition-colors ${condition === "new" ? "bg-white text-gray-950 border-white" : "bg-gray-900 text-gray-400 border-gray-700 hover:border-gray-500"}`}>
                  New
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">Case Material</label>
              <input type="text" value={material === "any" ? "" : material} onChange={(e) => setMaterial(e.target.value || "any")}
                placeholder="e.g. bimetal" className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-gray-500 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">Dial Colour</label>
              <input type="text" value={dialColour === "any" ? "" : dialColour} onChange={(e) => setDialColour(e.target.value || "any")}
                placeholder="e.g. black" className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-gray-500 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">Bracelet</label>
              <input type="text" value={bracelet === "any" ? "" : bracelet} onChange={(e) => setBracelet(e.target.value || "any")}
                placeholder="e.g. Oysterflex" className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-gray-500 text-sm" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">Photo (optional)</label>
            <div onClick={() => fileRef.current?.click()}
              className="border border-dashed border-gray-700 rounded-lg p-4 cursor-pointer hover:border-gray-500 transition-colors flex items-center gap-4">
              {photo ? (
                <>
                  <div className="relative w-16 h-16 rounded-md overflow-hidden flex-shrink-0">
                    <Image src={photo} alt="Watch" fill className="object-cover" />
                  </div>
                  <div className="text-sm text-gray-400">
                    <span className="text-white">Photo added</span><br />
                    <span className="text-xs">Tap to change</span>
                  </div>
                </>
              ) : (
                <div className="text-sm text-gray-500 w-full text-center py-2">Tap to add a photo of the watch</div>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
          </div>

          <button onClick={handleSearch} disabled={!reference.trim() || loading}
            className="w-full bg-white text-gray-950 rounded-lg py-3 font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-100 transition-colors">
            {loading ? "Searching..." : "Search Prices"}
          </button>
        </div>

        {loading && (
          <div className="mt-10 space-y-3">
            {[...Array(4)].map((_, i) => <div key={i} className="bg-gray-900 rounded-lg h-16 animate-pulse" />)}
          </div>
        )}

        {result && !loading && (
          <div className="mt-10">
            {result.error && (
              <div className="bg-red-950 border border-red-800 rounded-lg px-4 py-3 text-red-300 text-sm mb-6">{result.error}</div>
            )}

            {result.watchImage && (
              <div className="mb-6">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Watch Reference</p>
                <div className="relative w-full h-56 rounded-xl overflow-hidden bg-gray-900 border border-gray-800">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={result.watchImage} alt="Watch reference" className="w-full h-full object-contain" />
                </div>
                <p className="text-xs text-gray-600 mt-1.5">Confirm this matches the watch you are pricing</p>
              </div>
            )}

            {!result.error && result.asking.listings.length === 0 && result.sold.listings.length === 0 && (
              <div className="bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-gray-400 text-sm">
                No listings found. Try adjusting the reference number or removing the year.
              </div>
            )}

            {result.asking.listings.length > 0 && (
              <>
                <div className="grid grid-cols-1 gap-3 mb-8">
                  <StatCard label="Lowest Asking Price"
                    price={result.asking.listings[0].price}
                    fromCurrency={result.asking.currency} displayCurrency={displayCurrency} convertPrice={convertPrice}
                    url={result.asking.listings[0].url}
                    source={result.asking.listings[0].source} />
                </div>
                <ListingsBlock group={result.asking} label="All Asking Prices" displayCurrency={displayCurrency} convertPrice={convertPrice} />
              </>
            )}

            {result.sold.listings.length > 0 && (
              <>
                <div className="grid grid-cols-1 gap-3 mb-8">
                  <StatCard label="Highest Sold Price"
                    price={result.sold.listings[result.sold.listings.length - 1].price}
                    fromCurrency={result.sold.currency} displayCurrency={displayCurrency} convertPrice={convertPrice}
                    url={result.sold.listings[result.sold.listings.length - 1].url}
                    source={result.sold.listings[result.sold.listings.length - 1].source} />
                  <StatCard label="Lowest Sold Price"
                    price={result.sold.listings[0].price}
                    fromCurrency={result.sold.currency} displayCurrency={displayCurrency} convertPrice={convertPrice}
                    url={result.sold.listings[0].url}
                    source={result.sold.listings[0].source} />
                </div>
                <ListingsBlock group={result.sold} label="All Sold Prices" displayCurrency={displayCurrency} convertPrice={convertPrice} />
              </>
            )}
          </div>
        )}

        {history.length > 0 && (
          <div className="mt-14">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Search History</h2>
              <button onClick={() => { setHistory([]); localStorage.removeItem("watchHistory"); }}
                className="text-xs text-gray-600 hover:text-red-400 transition-colors">
                Clear all
              </button>
            </div>
            <div className="space-y-3">
              {history.map((entry) => (
                <HistoryCard key={entry.id} entry={entry} onRestore={restoreFromHistory} onDelete={deleteHistory} />
              ))}
            </div>
          </div>
        )}

        <p className="text-xs text-gray-700 text-center mt-12">
          Searches UK & Dubai secondary market dealers · Chrono24 sold prices only · Excludes authorised dealers
        </p>
      </div>
    </main>
  );
}
