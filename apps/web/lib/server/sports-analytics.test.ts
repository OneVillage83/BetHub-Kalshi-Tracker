import { describe, expect, it } from "vitest";
import { chosenSidePriceCents, classifySportsMarket, clvCents, priceBucketForCents } from "./sports-analytics";

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
