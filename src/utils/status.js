function computeStatus(launch, totalPurchased) {
  if (totalPurchased >= launch.totalSupply) return 'SOLD_OUT';
  const now = new Date();
  if (now < new Date(launch.startsAt)) return 'UPCOMING';
  if (now > new Date(launch.endsAt)) return 'ENDED';
  return 'ACTIVE';
}

module.exports = { computeStatus };
