"use client";

import { useState, useRef } from "react";
import Image from "next/image";

interface Listing {
  title: string;
  price: number;
  currency: string;
  url: string;
  source: string;
}

interface SearchResult {
  listings: Listing[];
  average: number | null;
  currency: string;
  totalFound: number;
  message?: string;
  error?: string;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  GBP: "£",
  USD: "$",
  EUR: "€",
};

export default function Home() {
  const [reference, setReference] = useState("");
  const [year, setYear] = useState("");
  const [condition, setCondition] = useState<"new" | "used">("used");
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
        body: JSON.stringify({ reference: reference.trim(), year, condition }),
      });
      const data = await res.json();
      setResult(data);
    } catch {
      setResult({ listings: [], average: null, currency: "GBP", totalFound: 0, error: "Something went wrong. Please try again." });
    } finally {
      setLoading(false);
    }
  };

  const symbol = result?.currency ? CURRENCY_SYMBOLS[result.currency] || result.currency : "£";

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-2xl mx-auto px-4 py-10">

        {/* Header */}
        <div className="mb-10">
          <h1 className="text-2xl font-semibold tracking-tight">Watch Price Checker</h1>
          <p className="text-gray-400 text-sm mt-1">Enter a reference number to get live market prices</p>
        </div>

        {/* Form */}
        <div className="space-y-4">

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">Reference Number</label>
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="e.g. 126610LN, 5711A, 321.30.44.52.01.001"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-gray-500 text-sm"
            />
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
                  className={`flex-1 rounded-lg text-sm font-medium border transition-colors ${
                    condition === "used"
                      ? "bg-white text-gray-950 border-white"
                      : "bg-gray-900 text-gray-400 border-gray-700 hover:border-gray-500"
                  }`}
                >
                  Used
                </button>
                <button
                  onClick={() => setCondition("new")}
                  className={`flex-1 rounded-lg text-sm font-medium border transition-colors ${
                    condition === "new"
                      ? "bg-white text-gray-950 border-white"
                      : "bg-gray-900 text-gray-400 border-gray-700 hover:border-gray-500"
                  }`}
                >
                  New
                </button>
              </div>
            </div>
          </div>

          {/* Photo upload */}
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
                    <br />
                    <span className="text-xs">Click to change</span>
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
            className="w-full bg-white text-gray-950 rounded-lg py-3 font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-100 transition-colors mt-2"
          >
            {loading ? "Searching..." : "Search Prices"}
          </button>
        </div>

        {/* Loading */}
        {loading && (
          <div className="mt-10 space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-gray-900 rounded-lg h-16 animate-pulse" />
            ))}
          </div>
        )}

        {/* Results */}
        {result && !loading && (
          <div className="mt-10">
            {result.error && (
              <div className="bg-red-950 border border-red-800 rounded-lg px-4 py-3 text-red-300 text-sm">
                {result.error}
              </div>
            )}

            {result.message && !result.error && (
              <div className="bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-gray-400 text-sm">
                {result.message}
              </div>
            )}

            {result.average && (
              <>
                {/* Average price */}
                <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 mb-6">
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Average Market Price</p>
                  <p className="text-4xl font-bold tracking-tight">
                    {symbol}{result.average.toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-500 mt-2">
                    Based on {result.listings.length} listing{result.listings.length !== 1 ? "s" : ""} · {condition === "new" ? "New" : "Pre-owned"} · {year || "any year"}
                  </p>
                </div>

                {/* Individual listings */}
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">Listings Found</p>
                <div className="space-y-2">
                  {result.listings.map((listing, i) => (
                    <a
                      key={i}
                      href={listing.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 hover:border-gray-600 transition-colors group"
                    >
                      <div className="flex-1 min-w-0 mr-4">
                        <p className="text-sm text-white truncate group-hover:text-gray-200">{listing.title}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{listing.source}</p>
                      </div>
                      <p className="text-sm font-semibold text-white flex-shrink-0">
                        {symbol}{listing.price.toLocaleString()}
                      </p>
                    </a>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        <p className="text-xs text-gray-700 text-center mt-12">Prices exclude Chrono24 · Results are asking prices from indexed listings</p>
      </div>
    </main>
  );
}
