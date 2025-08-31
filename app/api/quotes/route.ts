
import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

interface StockData {
  name: string;
  code: string;
  purchasePrice: number;
  quantity: number;
  investment: number;
  portfolioPercent: string;
  cmp: number;
  presentValue: number;
  gainLoss: number;
  gainLossPercent: string;
  marketCap: string;
  peRatio: string;
  currentPrice?: number;
  priceStatus?: "updated" | "unavailable";
  updatedPresentValue?: number;
  updatedGainLoss?: number;
  updatedGainLossPercent?: string;
  sector?: string;
}

interface YahooFinanceResponse {
  chart?: {
    result?: Array<{
      meta?: { regularMarketPrice?: number };
    }>;
  };
}

// ✅ safer than any
function parseNumber(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "number") return value;

  const cleaned = String(value)
    .replace(/₹|Rs\.?|INR/gi, "")
    .replace(/,/g, "");

  const parsed = parseFloat(cleaned.replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

// ✅ use unknown instead of any
function toInt(value: unknown): number {
  return Math.round(parseNumber(value));
}

function isValidPrice(p: number | null | undefined): p is number {
  return typeof p === "number" && p > 0 && p < 100000;
}

function detectSector(code: string, name: string): string {
  const c = code.toUpperCase();
  const n = name.toUpperCase();

  if (/(INFY|TCS|WIPRO|TECHM|HCLTECH)/.test(c) || /TECH|INFOSYS/.test(n)) return "IT";
  if (/(HDFCBANK|ICICIBANK|SBIN|KOTAKBANK|AXISBANK)/.test(c) || /BANK/.test(n)) return "Banking";
  if (/(RELIANCE|ONGC|IOC|BPCL|HPCL|GAIL)/.test(c) || /(OIL|PETRO|GAS)/.test(n)) return "Energy";
  if (/(SUNPHARMA|CIPLA|DRREDDY|DIVISLAB|AUROPHARMA)/.test(c) || /PHARMA|HEALTH/.test(n)) return "Pharma";
  if (/(HINDUNILVR|ITC|NESTLE|BRITANNIA|COLPAL|DABUR)/.test(c) || /(FMCG|FOODS|CONSUMER)/.test(n)) return "FMCG";
  if (/(TATASTEEL|JSWSTEEL|SAIL|HINDALCO|VEDL)/.test(c) || /(STEEL|METAL|ALUMINIUM)/.test(n)) return "Metals";
  if (/(MARUTI|M&M|TATAMOTORS|EICHERMOT|ASHOKLEY)/.test(c) || /(AUTO|MOTOR|CARS)/.test(n)) return "Automobile";
  if (/(LT|ADANIENT|ADANIPORTS|IRCTC)/.test(c) || /(INFRA|PORT|CONSTRUCTION)/.test(n)) return "Infrastructure";

  return "Others";
}

async function fetchStockPrice(symbol: string): Promise<number | null> {
  if (!symbol) return null;

  async function tryYahoo(s: string): Promise<number | null> {
    try {
      const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${s}`, {
        headers: { "User-Agent": "Mozilla/5.0" },
      });
      if (!res.ok) return null;

      const data: YahooFinanceResponse = await res.json();
      return data?.chart?.result?.[0]?.meta?.regularMarketPrice ?? null;
    } catch {
      return null;
    }
  }

  if (/^\d+$/.test(symbol)) {
    const nse = await tryYahoo(`${symbol}.NS`);
    if (isValidPrice(nse)) return nse;

    const bse = await tryYahoo(`${symbol}.BO`);
    if (isValidPrice(bse)) return bse;
  } else {
    const nse = await tryYahoo(`${symbol}.NS`);
    if (isValidPrice(nse)) return nse;
  }

  return null;
}

function parseExcelData(buffer: Buffer): StockData[] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as (string | number | null | undefined)[][];

  const headerRow = rows.findIndex((r) => r && r[1] && r[1]?.toString().trim() === "Particulars");
  if (headerRow === -1) throw new Error('Header row with "Particulars" not found');

  const stocks: StockData[] = [];

  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 7) continue;

    const name = row[1]?.toString().trim() || "";
    const codeMatch = row[6]?.toString().match(/\b\d{4,6}\b|[A-Z\.]{3,}/);
    const code = codeMatch ? codeMatch[0] : "";

    if (!name || !code) continue;

    const purchasePrice = parseNumber(row[2]);
    const quantity = toInt(row[3]);
    if (!purchasePrice || !quantity) continue;

    stocks.push({
      name,
      code,
      purchasePrice,
      quantity,
      investment: parseNumber(row[4]),
      portfolioPercent: row[5]?.toString() || "",
      cmp: parseNumber(row[7]),
      presentValue: parseNumber(row[8]),
      gainLoss: parseNumber(row[9]),
      gainLossPercent: row[10]?.toString() || "",
      marketCap: row[11]?.toString() || "",
      peRatio: row[12]?.toString() || "",
      sector: detectSector(code, name),
    });
  }

  return stocks;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ success: false, error: "No file uploaded" }, { status: 400 });
    }

    if (!/\.(xlsx|xls)$/i.test(file.name)) {
      return NextResponse.json({ success: false, error: "Invalid file type" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const stocks = parseExcelData(buffer);

    if (!stocks.length) {
      return NextResponse.json({ success: false, error: "No valid stock rows found" }, { status: 400 });
    }

    const updated = await Promise.all(
      stocks.map(async (s) => {
        const livePrice = await fetchStockPrice(s.code);
        const price = isValidPrice(livePrice) ? livePrice : isValidPrice(s.cmp) ? s.cmp : 0;

        const status: "updated" | "unavailable" = isValidPrice(livePrice) ? "updated" : "unavailable";
        const updatedPresentValue = price * s.quantity;
        const updatedGainLoss = updatedPresentValue - s.investment;

        return {
          ...s,
          currentPrice: price,
          priceStatus: status,
          updatedPresentValue,
          updatedGainLoss,
          updatedGainLossPercent: s.investment
            ? ((updatedGainLoss / s.investment) * 100).toFixed(2) + "%"
            : "—",
          sector: s.sector ?? detectSector(s.code, s.name),
        };
      })
    );

    const valid = updated.filter((s) => isValidPrice(s.currentPrice));

    return NextResponse.json({
      success: true,
      totalStocks: stocks.length,
      validStocks: valid.length,
      data: updated,
    });
  } catch (err) {
    console.error("Error processing Excel:", err);
    return NextResponse.json(
      { success: false, error: "Failed to process file. Check format & content." },
      { status: 500 }
    );
  }
}
