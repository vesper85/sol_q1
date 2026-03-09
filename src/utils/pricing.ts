interface Tier {
  minAmount: number;
  maxAmount: number;
  pricePerToken: number;
}

export function computeTotalCost(amount: number, pricePerToken: number, tiers: Tier[]): number {
  if (!tiers || tiers.length === 0) {
    return amount * pricePerToken;
  }

  const sortedTiers = [...tiers].sort((a, b) => a.minAmount - b.minAmount);
  let remaining = amount;
  let totalCost = 0;

  for (const tier of sortedTiers) {
    if (remaining <= 0) break;
    const capacity = tier.maxAmount - tier.minAmount;
    const tokensFromTier = Math.min(remaining, capacity);
    totalCost += tokensFromTier * tier.pricePerToken;
    remaining -= tokensFromTier;
  }

  if (remaining > 0) {
    totalCost += remaining * pricePerToken;
  }

  return totalCost;
}
