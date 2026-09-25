import { Vector3 } from "three";

export const RADIUS = 5;

// Matches three's SphereGeometry UVs with an equirectangular texture (lng -180 at the left edge).
export function latLngToVector3(lat: number, lng: number, r = RADIUS) {
  const theta = ((90 - lat) * Math.PI) / 180;
  const phi = ((lng + 180) * Math.PI) / 180;
  return new Vector3(-r * Math.cos(phi) * Math.sin(theta), r * Math.cos(theta), r * Math.sin(phi) * Math.sin(theta));
}
