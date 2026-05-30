import { describe, expect, it } from "vitest";
import { chosenSidePriceCents, classifySportsFill, classifySportsMarket, clvCents, priceBucketForCents } from "./sports-analytics";

describe("sports analytics helpers", () => {
  it("classifies sports markets from metadata and title heuristics", () => {
    const classification = classifySportsMarket(
      {
        ticker: "KXNBA-26MAY28-LALBOS",
        eventTicker: "KXNBA-26MAY28",
        title: "Will the Lakers beat the Celtics?",
        category: "Sports",
        rawJson: {
          category: "Sports",
          competition: "NBA",
          home_team: "Celtics",
          away_team: "Lakers",
        },
      },
      {
        ticker: "KXNBA-26MAY28",
        title: "Lakers vs Celtics",
        category: "Sports",
        rawJson: { category: "Sports" },
      },
    );

    expect(classification.isSports).toBe(true);
    expect(classification.sport).toBe("Basketball");
    expect(classification.league).toBe("NBA");
    expect(classification.marketType).toBe("Moneyline");
    expect(classification.teams).toEqual(["Celtics", "Lakers"]);
  });

  it("leaves non-sports markets unclassified", () => {
    const classification = classifySportsMarket({
      ticker: "KXFED-26JUN",
      title: "Will the Fed cut rates?",
      category: "Economics",
      rawJson: { category: "Economics" },
    });

    expect(classification.isSports).toBe(false);
    expect(classification.confidence).toBe(0);
  });

  it("classifies sports fills from ticker heuristics when market metadata is placeholder-only", () => {
    const classification = classifySportsFill({
      marketTicker: "KXNBA-26MAY28-LALBOS",
      eventTicker: "KXNBA-26MAY28",
      rawJson: { market_ticker: "KXNBA-26MAY28-LALBOS", event_ticker: "KXNBA-26MAY28" },
      market: {
        ticker: "KXNBA-26MAY28-LALBOS",
        eventTicker: "KXNBA-26MAY28",
        rawJson: { source: "kalshi-backfill-placeholder", ticker: "KXNBA-26MAY28-LALBOS" },
        event: {
          ticker: "KXNBA-26MAY28",
          rawJson: { source: "kalshi-backfill-placeholder", ticker: "KXNBA-26MAY28" },
        },
      },
    });

    expect(classification.isSports).toBe(true);
    expect(classification.league).toBe("NBA");
    expect(classification.sport).toBe("Basketball");
    expect(classification.classificationSource).toBe("ticker_heuristic");
  });

  it("classifies sports fills from raw fill sports metadata", () => {
    const classification = classifySportsFill({
      marketTicker: "KXGAME-26MAY28-HOMEAWAY",
      eventTicker: "KXGAME-26MAY28",
      rawJson: {
        category: "Sports",
        league: "MLB",
        home_team: "Mets",
        away_team: "Yankees",
      },
      market: {
        ticker: "KXGAME-26MAY28-HOMEAWAY",
        eventTicker: "KXGAME-26MAY28",
        rawJson: { source: "kalshi-backfill-placeholder", ticker: "KXGAME-26MAY28-HOMEAWAY" },
        event: null,
      },
    });

    expect(classification.isSports).toBe(true);
    expect(classification.league).toBe("MLB");
    expect(classification.sport).toBe("Baseball");
    expect(classification.teams).toEqual(["Mets", "Yankees"]);
    expect(classification.classificationSource).toBe("fill_raw");
  });

  it("classifies Kalshi MVESPORTS multi-game exotics from team-heavy titles", () => {
    const classification = classifySportsFill({
      marketTicker: "KXMVESPORTSMULTIGAMEEXTENDED-S20260F52F5A155F-AD993C2E8CA",
      eventTicker: "KXMVESPORTSMULTIGAMEEXTENDED-S20260F52F5A155F",
      rawJson: {
        market_ticker: "KXMVESPORTSMULTIGAMEEXTENDED-S20260F52F5A155F-AD993C2E8CA",
        event_ticker: "KXMVESPORTSMULTIGAMEEXTENDED-S20260F52F5A155F",
      },
      market: {
        ticker: "KXMVESPORTSMULTIGAMEEXTENDED-S20260F52F5A155F-AD993C2E8CA",
        eventTicker: "KXMVESPORTSMULTIGAMEEXTENDED-S20260F52F5A155F",
        title: "yes Philadelphia,yes Toronto,yes New York M,yes Milwaukee,yes Houston,yes New York Y,yes San Francisco,yes Los Angeles D",
        category: "Exotics",
        rawJson: { category: "Exotics" },
        event: {
          ticker: "KXMVESPORTSMULTIGAMEEXTENDED-S20260F52F5A155F",
          rawJson: { category: "Exotics" },
        },
      },
    });

    expect(classification.isSports).toBe(true);
    expect(classification.league).toBe("MLB");
    expect(classification.sport).toBe("Baseball");
    expect(classification.marketType).toBe("Multi-game exotic");
    expect(classification.teams).toEqual(expect.arrayContaining(["New York Mets", "New York Yankees", "Los Angeles Dodgers"]));
    expect(classification.classificationSource).toBe("ticker_heuristic");
  });

  it("classifies Kalshi MVECROSSCATEGORY exotics only when team evidence exists", () => {
    const sportsClassification = classifySportsFill({
      marketTicker: "KXMVECROSSCATEGORY-S202668DA68FE731-DA6648136AF",
      eventTicker: "KXMVECROSSCATEGORY-S202668DA68FE731",
      rawJson: { market_ticker: "KXMVECROSSCATEGORY-S202668DA68FE731-DA6648136AF" },
      market: {
        ticker: "KXMVECROSSCATEGORY-S202668DA68FE731-DA6648136AF",
        eventTicker: "KXMVECROSSCATEGORY-S202668DA68FE731",
        title: "yes Philadelphia,yes Toronto,yes New York M,yes Milwaukee",
        category: "Exotics",
        rawJson: { category: "Exotics" },
        event: null,
      },
    });
    const genericClassification = classifySportsFill({
      marketTicker: "KXMVECROSSCATEGORY-S202668DA68FE731-DA6648136AF",
      eventTicker: "KXMVECROSSCATEGORY-S202668DA68FE731",
      rawJson: { market_ticker: "KXMVECROSSCATEGORY-S202668DA68FE731-DA6648136AF" },
      market: {
        ticker: "KXMVECROSSCATEGORY-S202668DA68FE731-DA6648136AF",
        eventTicker: "KXMVECROSSCATEGORY-S202668DA68FE731",
        title: "yes inflation,yes interest rates,yes unemployment",
        category: "Exotics",
        rawJson: { category: "Exotics" },
        event: null,
      },
    });

    expect(sportsClassification.isSports).toBe(true);
    expect(sportsClassification.league).toBe("MLB");
    expect(sportsClassification.marketType).toBe("Multi-game exotic");
    expect(genericClassification.isSports).toBe(false);
  });

  it("buckets chosen-side entry prices", () => {
    expect(priceBucketForCents(12)).toBe("Longshot");
    expect(priceBucketForCents(32)).toBe("Underdog");
    expect(priceBucketForCents(50)).toBe("Coin flip");
    expect(priceBucketForCents(70)).toBe("Favorite");
    expect(priceBucketForCents(88)).toBe("Heavy favorite");
  });

  it("computes NO chosen-side CLV from inverted YES prices", () => {
    expect(chosenSidePriceCents("no", 37)).toBe(63);
    expect(clvCents("no", 60, 35)).toBe(5);
    expect(clvCents("yes", 40, 47)).toBe(7);
  });
});
