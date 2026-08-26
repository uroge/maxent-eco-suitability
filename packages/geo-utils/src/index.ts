export function isValidLongitude(value: number): boolean {
  return value >= -180 && value <= 180;
}
