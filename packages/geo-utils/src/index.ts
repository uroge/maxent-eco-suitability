export function isValidLongitude(value: number): boolean {
  return value >= -180 && value <= 180;
}

const earthRadiusMetres = 6_371_008.8;

export function geodesicDistanceMetres(
  from: readonly [number, number],
  to: readonly [number, number]
): number {
  const radians = Math.PI / 180;
  const latitudeDelta = (to[1] - from[1]) * radians;
  const longitudeDelta = (to[0] - from[0]) * radians;
  const fromLatitude = from[1] * radians;
  const toLatitude = to[1] * radians;
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDelta / 2) ** 2;

  return 2 * earthRadiusMetres * Math.asin(Math.sqrt(haversine));
}
