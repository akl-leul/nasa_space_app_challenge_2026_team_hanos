export interface ConstellationStar {
  name: string;
  mag: number;
  ra: number;
  dec: number;
}

export interface ConstellationInfo {
  id: string; // 3-letter IAU abbreviation (e.g. "UMi")
  name: string; // IAU Latin name (e.g. "Ursa Minor")
  gen: string; // Genitive name (e.g. "Ursae Minoris")
  center: [number, number]; // [RA deg, Dec deg]
  brightestStars?: ConstellationStar[];
  area?: number; // Area in square degrees
}

export interface StarRecord {
  hip: number;
  ra: number;
  dec: number;
  mag: number;
  bv: number;
  label: string;
  con: string;
}

export type SkySelection =
  | {
      kind: "star";
      id: string | number; // HIP number or designation
      name?: string; // Common name or Greek letter if available
      ra: number;
      dec: number;
      mag: number;
      bv?: number;
      constellation?: ConstellationInfo | null;
    }
  | {
      kind: "region";
      abbr: string; // 3-letter IAU code (e.g. "Ori")
      name: string; // Full IAU name (e.g. "Orion")
      ra: number;
      dec: number;
      areaSqDeg?: number;
      constellation: ConstellationInfo;
    };

export interface SkySelectionData {
  ra: number;
  dec: number;
  fov: number;
  selection?: SkySelection | null;
  constellation?: ConstellationInfo | null;
}

export type SkySelectionCallback = (data: SkySelectionData) => void;

export interface PlayRegionParams {
  kind: "region";
  abbr: string;
  name: string;
  ra: number;
  dec: number;
  fov: number;
}

export type PlayRegionCallback = (params: PlayRegionParams) => void;

export type CoordinateFrame = "equatorial" | "horizontal";
