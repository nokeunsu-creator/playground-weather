import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";

export interface Loc {
  lat: number;
  lng: number;
  /** gps | home | manual */
  source: "gps" | "home" | "manual";
  at: string;
}

/** 현재 위치. 권한 거부·시간 초과면 undefined */
export async function getCurrentLocation(timeoutMs = 8000): Promise<Loc | undefined> {
  try {
    if (Capacitor.isNativePlatform()) {
      const perm = await Geolocation.checkPermissions();
      if (perm.location !== "granted" && perm.coarseLocation !== "granted") {
        const req = await Geolocation.requestPermissions();
        if (req.location !== "granted" && req.coarseLocation !== "granted") return undefined;
      }
    }
    const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 5 * 60 * 1000 });
    return { lat: pos.coords.latitude, lng: pos.coords.longitude, source: "gps", at: new Date().toISOString() };
  } catch {
    return undefined;
  }
}
