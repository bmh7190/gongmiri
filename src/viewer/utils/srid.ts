import type { SridCode, SridOption } from "../types";

const SRID_UNSORTED: SridOption[] = [
  {
    code: 4326,
    name: "EPSG:4326",
    description: "WGS 84 (경위도)",
    proj4: "+proj=longlat +datum=WGS84 +no_defs +type=crs",
  },
  {
    code: 3857,
    name: "EPSG:3857",
    description: "WGS 84 / Pseudo-Mercator",
    proj4: "+proj=merc +lon_0=0 +k=1 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs +type=crs",
  },
  {
    code: 5174,
    name: "EPSG:5174",
    description: "Korea 2000 / West Belt",
    proj4: "+proj=tmerc +lat_0=38 +lon_0=125 +k=1 +x_0=200000 +y_0=500000 +ellps=GRS80 +units=m +no_defs +type=crs",
  },
  {
    code: 5175,
    name: "EPSG:5175",
    description: "Korea 2000 / Central Belt",
    proj4: "+proj=tmerc +lat_0=38 +lon_0=127 +k=1 +x_0=200000 +y_0=500000 +ellps=GRS80 +units=m +no_defs +type=crs",
  },
  {
    code: 2098,
    name: "EPSG:2098",
    description: "Korean 1985 / Modified Korea Central Belt",
    proj4:
      "+proj=tmerc +lat_0=38 +lon_0=127.0028902777778 +k=1 +x_0=200000 +y_0=500000 +a=6377397.155 +b=6356078.963342249 +units=m +no_defs +type=crs",
  },
  {
    code: 5179,
    name: "EPSG:5179",
    description: "Korea 2000 / Unified CS",
    proj4: "+proj=tmerc +lat_0=38 +lon_0=127 +k=1 +x_0=200000 +y_0=600000 +ellps=GRS80 +units=m +no_defs +type=crs",
  },
  {
    code: 5181,
    name: "EPSG:5181",
    description: "Korea 2000 / West Belt 2010",
    proj4: "+proj=tmerc +lat_0=38 +lon_0=125 +k=1 +x_0=200000 +y_0=600000 +ellps=GRS80 +units=m +no_defs +type=crs",
  },
  {
    code: 5186,
    name: "EPSG:5186",
    description: "Korea 2000 / Central Belt 2010",
    proj4: "+proj=tmerc +lat_0=38 +lon_0=127 +k=1 +x_0=200000 +y_0=500000 +ellps=GRS80 +units=m +no_defs +type=crs",
  },
  {
    code: 5183,
    name: "EPSG:5183",
    description: "Korea 2000 / East Belt 2010",
    proj4: "+proj=tmerc +lat_0=38 +lon_0=129 +k=1 +x_0=200000 +y_0=600000 +ellps=GRS80 +units=m +no_defs +type=crs",
  },
  {
    code: 5176,
    name: "EPSG:5176",
    description: "Korea 2000 / East Belt",
    proj4: "+proj=tmerc +lat_0=38 +lon_0=129 +k=1 +x_0=200000 +y_0=700000 +ellps=GRS80 +units=m +no_defs +type=crs",
  },
];

export const SRID_OPTIONS: SridOption[] = SRID_UNSORTED.slice().sort(
  (a, b) => a.code - b.code,
);

const SRID_BY_CODE = new Map(SRID_OPTIONS.map((opt) => [opt.code, opt]));

const SRID_PATTERNS: Record<SridCode, RegExp[]> = {
  4326: [/4326/, /wgs[_\s]?84/i, /gcs_wgs/i],
  3857: [/3857/, /pseudo[_\s]?mercator/i, /mercator_auxiliary_sphere/i],
  5174: [/5174/, /west[_\s]?belt/i],
  5175: [/5175/, /central[_\s]?belt(?![_\s]?2010)/i],
  2098: [/2098/, /1985/i, /korean[_\s]?1985/i, /modified[_\s]?korea[_\s]?central/i],
  5179: [/5179/, /korea[_\s]?2000.*central[_\s]?belt/i, /tm_mid/i],
  5181: [/5181/, /west[_\s]?belt[_\s]?2010/i],
  5186: [/5186/, /central[_\s]?belt[_\s]?2010/i, /korea[_\s]?east[_\s]?sea/i],
  5183: [/5183/, /east[_\s]?belt[_\s]?2010/i],
  5176: [/5176/, /east[_\s]?belt/i],
};

export const detectSridFromPrj = (prjText: string): SridCode | undefined => {
  const normalized = prjText.toLowerCase();

  const epsgMatch = prjText.match(/epsg["']?\s*,\s*["']?(\d{4})["']?/i);
  if (epsgMatch) {
    const code = Number(epsgMatch[1]) as SridCode;
    if (SRID_BY_CODE.has(code)) return code;
  }

  for (const [code, patterns] of Object.entries(SRID_PATTERNS) as [string, RegExp[]][]) {
    if (patterns.some((pattern) => pattern.test(normalized))) {
      return Number(code) as SridCode;
    }
  }

  if (normalized.includes("transverse_mercator") && normalized.includes("korea")) {
    return 5179;
  }

  return undefined;
};

export const getSridOption = (code: SridCode): SridOption | undefined =>
  SRID_BY_CODE.get(code);
