const rememberedFloorLifetimeSeconds = 60 * 60 * 24 * 180;

function sortFloors(left: string, right: string) {
  const numericDifference = Number(left) - Number(right);
  return Number.isNaN(numericDifference) || numericDifference === 0 ? left.localeCompare(right) : numericDifference;
}

export function floorMemoryCookieName(userId: string, buildingId: string) {
  const user = encodeURIComponent(userId);
  const building = encodeURIComponent(buildingId);
  return `sweep-floor-${user.length}-${user}-${building.length}-${building}`;
}

export function resolveBuildingFloor(floors: readonly string[], requestedFloor?: string, rememberedFloor?: string) {
  const availableFloors = [...new Set(floors)].sort(sortFloors);
  return [requestedFloor, rememberedFloor].find((floor): floor is string => Boolean(floor && availableFloors.includes(floor))) ?? availableFloors[0] ?? "";
}

export function rememberBuildingFloor(cookieName: string | undefined, floor: string) {
  if (!cookieName || !floor || typeof document === "undefined") return;
  localStorage.setItem(cookieName, floor);
  document.cookie = `${cookieName}=${encodeURIComponent(floor)}; Max-Age=${rememberedFloorLifetimeSeconds}; Path=/; SameSite=Lax`;
}

export function readRememberedBuildingFloor(cookieName: string | undefined) {
  if (!cookieName || typeof window === "undefined") return undefined;
  return localStorage.getItem(cookieName) ?? undefined;
}
