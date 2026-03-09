interface LaunchLike {
  totalSupply: number;
  startsAt: Date;
  endsAt: Date;
}

export function computeStatus(launch: LaunchLike, totalPurchased: number): string {
  if (totalPurchased >= launch.totalSupply) return 'SOLD_OUT';
  const now = new Date();
  if (now < new Date(launch.startsAt)) return 'UPCOMING';
  if (now > new Date(launch.endsAt)) return 'ENDED';
  return 'ACTIVE';
}
