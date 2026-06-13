"use client";

import { useState, useRef } from "react";
import Image from "next/image";


const CURRENCY_SYMBOLS: Record<string, string> = {
  GBP: "£", USD: "$", EUR: "€", AED: "AED ",
};

interface Listing {
  title: string;
  price: number;
  currency: string;
  url: string;
  source: string;
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


function StatCard({ label, price, currency, url, source }: {
  label: string;
  price: number | null;
  currency: string;
  url?: string;
  source?: string;
}) {
  const symbol = CURRENCY_SYMBOLS[currency] || currency + " ";
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-5">
      <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">{label}</p>
      {price ? (
        <>
          <p className="text-3xl font-bold tracking-tight">{symbol}{price.toLocaleString()}</p>
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

function ListingsBlock({ group, label }: { group: PriceGroup; label: string }) {
  const symbol = CURRENCY_SYMBOLS[group.currency] || group.currency + " ";
  if (group.listings.length === 0) return null;

  return (
    <div className="mb-6">
      <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">{label}</p>
      <div className="space-y-2">
        {group.listings.map((listing, i) => (
          <a
            key={i}
            href={listing.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 hover:border-gray-600 transition-colors group"
          >
            <div className="flex-1 min-w-0 mr-4">
              <p className="text-sm text-white truncate">{listing.title}</p>
              <p className="text-xs text-gray-500 mt-0.5">{listing.source}</p>
            </div>
            <p className="text-sm font-semibold text-white flex-shrink-0">
              {symbol}{listing.price.toLocaleString()}
            </p>
          </a>
        ))}
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
  const [photo, setPhoto] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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
        body: JSON.stringify({ reference: reference.trim(), make: make.trim(), model: model.trim(), year, condition, material, dialColour }),
      });
      const data = await res.json();
      setResult(data);
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

        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">Watch Price Checker</h1>
          <p className="text-gray-400 text-sm mt-1">Secondary market prices — UK, Dubai & worldwide</p>
        </div>

        <div className="space-y-4">

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">Make</label>
              <input
                type="text"
                value={make}
                onChange={(e) => setMake(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="e.g. Rolex"
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-gray-500 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">Model</label>
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="e.g. Submariner"
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-gray-500 text-sm"
              />
            </div>
            <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">Reference Number</label>
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="e.g. 126610LN"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-gray-500 text-sm"
            />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">Year</label>
              <input
                type="text"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                placeholder="e.g. 2021"
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-gray-500 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">Condition</label>
              <div className="flex gap-2 h-[46px]">
                <button
                  onClick={() => setCondition("used")}
                  className={`flex-1 rounded-lg text-sm font-medium border transition-colors ${condition === "used" ? "bg-white text-gray-950 border-white" : "bg-gray-900 text-gray-400 border-gray-700 hover:border-gray-500"}`}
                >
                  Used
                </button>
                <button
                  onClick={() => setCondition("new")}
                  className={`flex-1 rounded-lg text-sm font-medium border transition-colors ${condition === "new" ? "bg-white text-gray-950 border-white" : "bg-gray-900 text-gray-400 border-gray-700 hover:border-gray-500"}`}
                >
                  New
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">Case Material</label>
              <input
                type="text"
                value={material === "any" ? "" : material}
                onChange={(e) => setMaterial(e.target.value || "any")}
                placeholder="e.g. bimetal, full gold"
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-gray-500 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">Dial Colour</label>
              <input
                type="text"
                value={dialColour === "any" ? "" : dialColour}
                onChange={(e) => setDialColour(e.target.value || "any")}
                placeholder="e.g. black, blue"
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-gray-500 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">Photo (optional)</label>
            <div
              onClick={() => fileRef.current?.click()}
              className="border border-dashed border-gray-700 rounded-lg p-4 cursor-pointer hover:border-gray-500 transition-colors flex items-center gap-4"
            >
              {photo ? (
                <>
                  <div className="relative w-16 h-16 rounded-md overflow-hidden flex-shrink-0">
                    <Image src={photo} alt="Watch" fill className="object-cover" />
                  </div>
                  <div className="text-sm text-gray-400">
                    <span className="text-white">Photo added</span>
                    <br /><span className="text-xs">Tap to change</span>
                  </div>
                </>
              ) : (
                <div className="text-sm text-gray-500 w-full text-center py-2">
                  Tap to add a photo of the watch
                </div>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
          </div>

          <button
            onClick={handleSearch}
            disabled={!reference.trim() || loading}
            className="w-full bg-white text-gray-950 rounded-lg py-3 font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-100 transition-colors"
          >
            {loading ? "Searching..." : "Search Prices"}
          </button>
        </div>

        {loading && (
          <div className="mt-10 space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-gray-900 rounded-lg h-16 animate-pulse" />
            ))}
          </div>
        )}

        {result && !loading && (
          <div className="mt-10">
            {result.error && (
              <div className="bg-red-950 border border-red-800 rounded-lg px-4 py-3 text-red-300 text-sm mb-6">
                {result.error}
              </div>
            )}

            {result.watchImage && (
              <div className="mb-6">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Watch Reference</p>
                <div className="relative w-full h-56 rounded-xl overflow-hidden bg-gray-900 border border-gray-800">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={result.watchImage}
                    alt="Watch reference"
                    className="w-full h-full object-contain"
                  />
                </div>
                <p className="text-xs text-gray-600 mt-1.5">Confirm this matches the watch you are pricing</p>
              </div>
            )}

            {!result.error && result.asking.listings.length === 0 && result.sold.listings.length === 0 && (
              <div className="bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-gray-400 text-sm">
                No priced listings found. Try adjusting the reference number or removing the year.
              </div>
            )}

            {(result.asking.listings.length > 0 || result.sold.listings.length > 0) && (
              <>
                <div className="grid grid-cols-1 gap-3 mb-8">
                  <StatCard
                    label="Highest Asking Price"
                    price={result.asking.listings.length > 0 ? result.asking.listings[result.asking.listings.length - 1].price : null}
                    currency={result.asking.currency}
                    url={result.asking.listings.length > 0 ? result.asking.listings[result.asking.listings.length - 1].url : undefined}
                    source={result.asking.listings.length > 0 ? result.asking.listings[result.asking.listings.length - 1].source : undefined}
                  />
                  <StatCard
                    label="Lowest Asking Price"
                    price={result.asking.listings.length > 0 ? result.asking.listings[0].price : null}
                    currency={result.asking.currency}
                    url={result.asking.listings.length > 0 ? result.asking.listings[0].url : undefined}
                    source={result.asking.listings.length > 0 ? result.asking.listings[0].source : undefined}
                  />
                  <StatCard
                    label="Lowest Sold Price"
                    price={result.sold.listings.length > 0 ? result.sold.listings[0].price : null}
                    currency={result.sold.currency}
                    url={result.sold.listings.length > 0 ? result.sold.listings[0].url : undefined}
                    source={result.sold.listings.length > 0 ? result.sold.listings[0].source : undefined}
                  />
                </div>

                <ListingsBlock group={result.asking} label="All Asking Prices" />
                <ListingsBlock group={result.sold} label="All Sold Prices" />
              </>
            )}
          </div>
        )}

        <p className="text-xs text-gray-700 text-center mt-12">
          Searches UK & Dubai secondary market dealers · Chrono24 sold prices only · Excludes authorised dealers
        </p>
      </div>
    </main>
  );
}
