import { BN, BorshCoder, EventParser, type Idl } from "@coral-xyz/anchor";
import idl from "@/lib/idl/solperp_anchor.json";
import { MARKET_SYMBOLS, PROGRAM_ID, type MarketSymbol } from "@/lib/constants";
import { getMarketPda } from "@/lib/pda";

export interface LiveTrade {
  id: string;
  marketSymbol: MarketSymbol;
  action: "Opened" | "Closed" | "Liquidated";
  isLong: boolean;
  price: number;
  size: number | null;
  ts: number;
}

const eventParser = new EventParser(PROGRAM_ID, new BorshCoder(idl as Idl));

const symbolByMarketAddress = new Map(
  MARKET_SYMBOLS.map((symbol) => [getMarketPda(symbol).toString(), symbol]),
);

function toPlainNumber(value: unknown): number {
  if (BN.isBN(value)) return (value as BN).toNumber();
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return 0;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function isLongSide(side: unknown): boolean {
  const sideObject = asObject(side);
  return "long" in sideObject || "Long" in sideObject;
}

export function parseTradeEventsFromLogs(
  logs: string[],
  signature: string,
): LiveTrade[] {
  const trades: LiveTrade[] = [];
  let eventIndex = 0;

  for (const event of eventParser.parseLogs(logs)) {
    const eventName = event.name.toLowerCase();

    if (
      eventName !== "positionopened" &&
      eventName !== "positionclosed" &&
      eventName !== "positionliquidated"
    ) {
      continue;
    }

    const data = asObject(event.data);
    const symbol = symbolByMarketAddress.get(String(data.market));
    if (!symbol) continue;

    const isOpen = eventName === "positionopened";
    const isClose = eventName === "positionclosed";

    trades.push({
      id: `${signature}-${eventIndex++}`,
      marketSymbol: symbol,
      action: isOpen ? "Opened" : isClose ? "Closed" : "Liquidated",
      isLong: isLongSide(data.side),
      price: toPlainNumber(data.entryPrice ?? data.exitPrice ?? data.currentPrice) / 1_000_000,
      size: isOpen ? toPlainNumber(data.positionSize) / 1_000_000 : null,
      ts: Date.now(),
    });
  }

  return trades;
}
