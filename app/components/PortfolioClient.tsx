"use client";
import React, { useState, useMemo, useRef } from "react";
import {
  Upload,
  FileSpreadsheet,
  TrendingUp,
  TrendingDown,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface StockData {
  name: string;
  code: string;
  purchasePrice: number;
  quantity: number;
  investment: number;
  currentPrice: number;
  updatedPresentValue: number;
  updatedGainLoss: number;
  updatedGainLossPercent: number;
  priceStatus: "updated" | "unavailable";
  sector: string;
}

interface ApiResponse {
  success: boolean;
  totalStocks: number;
  validStocks: number;
  data: StockData[];
  error?: string;
}

const PortfolioClient: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<StockData[]>([]);
  const [error, setError] = useState("");
  const [stats, setStats] = useState<{ total: number; valid: number } | null>(null);
  const [sector, setSector] = useState("All");

  const cache = useRef<Map<string, ApiResponse>>(new Map());
  const lastUpload = useRef(0);
  const UPLOAD_DELAY = 3000; 


  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      setError("");
    }
  };

  const uploadFile = async () => {
    if (!file) {
      setError("Please select an Excel file");
      return;
    }

    const now = Date.now();
    if (now - lastUpload.current < UPLOAD_DELAY) {
      setError("Please wait before uploading again.");
      return;
    }
    lastUpload.current = now;

    const cacheKey = `${file.name}_${file.size}`;
    if (cache.current.has(cacheKey)) {
      const cached = cache.current.get(cacheKey)!;
      setData(cached.data);
      setStats({ total: cached.totalStocks, valid: cached.validStocks });
      return;
    }

    setLoading(true);
    setError("");

    try {
      const form = new FormData();
      form.append("file", file);

      const res = await fetch("/api/quotes/", { method: "POST", body: form });
      const result: ApiResponse = await res.json();

      if (result.success) {
        setData(result.data);
        setStats({ total: result.totalStocks, valid: result.validStocks });
        cache.current.set(cacheKey, result);
      } else {
        setError(result.error || "Failed to process the file");
      }
    } catch (err) {
      console.error("Upload error:", err);
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };


  const formatCurrency = (v: number) =>
    Number.isFinite(v)
      ? new Intl.NumberFormat("en-IN", {
          style: "currency",
          currency: "INR",
          minimumFractionDigits: 2,
        }).format(v)
      : "—";

  const formatNumber = (v: number) =>
    Number.isFinite(v) ? new Intl.NumberFormat("en-IN").format(v) : "—";

  const formatPercent = (v: number) =>
    Number.isFinite(v) ? v.toFixed(2) + "%" : "—";

  const plausiblePrice = (p: number) => p > 0 && p < 1_000_000;


  const filtered = useMemo(
    () => (sector === "All" ? data : data.filter((s) => s.sector === sector)),
    [data, sector]
  );

  const totals = useMemo(() => {
    const invested = filtered.reduce((sum, s) => sum + s.investment, 0);
    const current = filtered.reduce((sum, s) => sum + s.updatedPresentValue, 0);
    const gainLoss = filtered.reduce((sum, s) => sum + s.updatedGainLoss, 0);
    const percent = invested ? ((gainLoss / invested) * 100).toFixed(2) + "%" : "0%";

    return { invested, current, gainLoss, percent };
  }, [filtered]);

  const chart = useMemo(
    () =>
      filtered.map((s) => ({
        name: s.name,
        Investment: s.investment,
        CurrentValue: s.updatedPresentValue,
        GainLoss: s.updatedGainLoss,
      })),
    [filtered]
  );

  const sectors = useMemo(() => Array.from(new Set(data.map((s) => s.sector))), [data]);


  return (
    <div className="min-h-screen p-6">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h1 className="text-3xl font-bold text-gray-800 mb-6 flex items-center gap-2">
            <FileSpreadsheet className="text-blue-600" />
            Portfolio Analyzer
          </h1>

          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center mb-6">
            <input
              id="file-upload"
              type="file"
              accept=".xlsx,.xls"
              onChange={onFileChange}
              className="hidden"
            />
            <label
              htmlFor="file-upload"
              className="cursor-pointer flex flex-col items-center gap-4"
            >
              <Upload className="w-12 h-12 text-gray-400" />
              <p className="text-lg font-medium text-gray-700">
                {file ? file.name : "Upload Excel File"}
              </p>
            </label>
          </div>

          <div className="flex gap-4 justify-center">
            <button onClick={uploadFile} disabled={!file || loading}>
              {loading ? (
                <div className="flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Processing...
                </div>
              ) : (
                <Button variant="secondary">Analyze Portfolio</Button>
              )}
            </button>
          </div>

          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-700">{error}</p>
            </div>
          )}

          {stats && (
            <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-blue-700">
                Processed {stats.valid} out of {stats.total} stocks
              </p>
            </div>
          )}
        </div>

        {data.length > 0 && (
          <div className="mb-6 flex justify-end">
            <select
              value={sector}
              onChange={(e) => setSector(e.target.value)}
              className="border rounded-lg px-4 py-2 shadow-sm"
            >
              <option value="All">All Sectors</option>
              {sectors.map((s, i) => (
                <option key={i} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        )}

        {filtered.length > 0 && (
          <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">
              {sector === "All" ? "Portfolio Summary" : `${sector} Sector Summary`}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-blue-50 p-4 rounded-lg">
                <h3 className="text-sm font-medium text-blue-600">Total Investment</h3>
                <p className="text-2xl font-bold text-blue-800">
                  {formatCurrency(totals.invested)}
                </p>
              </div>
              <div className="bg-green-50 p-4 rounded-lg">
                <h3 className="text-sm font-medium text-green-600">Current Value</h3>
                <p className="text-2xl font-bold text-green-800">
                  {formatCurrency(totals.current)}
                </p>
              </div>
              <div
                className={`p-4 rounded-lg ${
                  totals.gainLoss >= 0 ? "bg-green-50" : "bg-red-50"
                }`}
              >
                <h3
                  className={`text-sm font-medium ${
                    totals.gainLoss >= 0 ? "text-green-600" : "text-red-600"
                  }`}
                >
                  Total Gain/Loss
                </h3>
                <p
                  className={`text-2xl font-bold ${
                    totals.gainLoss >= 0 ? "text-green-800" : "text-red-800"
                  }`}
                >
                  {formatCurrency(totals.gainLoss)}
                </p>
              </div>
              <div
                className={`p-4 rounded-lg ${
                  totals.gainLoss >= 0 ? "bg-green-50" : "bg-red-50"
                }`}
              >
                <h3
                  className={`text-sm font-medium ${
                    totals.gainLoss >= 0 ? "text-green-600" : "text-red-600"
                  }`}
                >
                  Overall Return
                </h3>
                <p
                  className={`text-2xl font-bold ${
                    totals.gainLoss >= 0 ? "text-green-800" : "text-red-800"
                  }`}
                >
                  {totals.percent}
                </p>
              </div>
            </div>
          </div>
        )}

        {chart.length > 0 && (
          <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">Portfolio Chart</h2>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={chart}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="Investment" fill="#8884d8" />
                <Bar dataKey="CurrentValue" fill="#82ca9d" />
                <Bar dataKey="GainLoss" fill="#ff6961" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {filtered.length > 0 && (
          <div className="bg-white rounded-lg shadow-lg overflow-hidden">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-2xl font-bold text-gray-800">Stock Details</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    {[
                      "Stock",
                      "Code",
                      "Sector",
                      "Purchase Price",
                      "Quantity",
                      "Investment",
                      "Current Price",
                      "Current Value",
                      "Gain/Loss",
                      "Return %",
                      "Status",
                    ].map((h, i) => (
                      <th
                        key={i}
                        className={`px-4 py-3 text-sm font-medium text-gray-500 uppercase tracking-wider ${
                          i > 2 ? "text-right" : "text-left"
                        }`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filtered.map((s, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-4 text-sm font-medium text-gray-900">{s.name}</td>
                      <td className="px-4 py-4 text-sm text-gray-500">{s.code}</td>
                      <td className="px-4 py-4 text-sm text-gray-500">{s.sector}</td>
                      <td className="px-4 py-4 text-sm text-gray-900 text-right">
                        ₹{formatNumber(s.purchasePrice)}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-900 text-right">
                        {formatNumber(s.quantity)}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-900 text-right">
                        {formatCurrency(s.investment)}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-900 text-right">
                        {plausiblePrice(s.currentPrice)
                          ? "₹" + formatNumber(s.currentPrice)
                          : "—"}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-900 text-right">
                        {formatCurrency(s.updatedPresentValue)}
                      </td>
                      <td
                        className={`px-4 py-4 text-sm text-right font-medium ${
                          s.updatedGainLoss >= 0 ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        <div className="flex items-center justify-end gap-1">
                          {s.updatedGainLoss >= 0 ? (
                            <TrendingUp className="w-4 h-4" />
                          ) : (
                            <TrendingDown className="w-4 h-4" />
                          )}
                          {formatCurrency(Math.abs(s.updatedGainLoss))}
                        </div>
                      </td>
                      <td
                        className={`px-4 py-4 text-sm text-right font-medium ${
                          s.updatedGainLoss >= 0 ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        {formatPercent(s.updatedGainLossPercent)}
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span
                          className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                            s.priceStatus === "updated"
                              ? "bg-green-100 text-green-800"
                              : "bg-yellow-100 text-yellow-800"
                          }`}
                        >
                          {s.priceStatus === "updated" ? "Live" : "Cached"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PortfolioClient;
