/**
 * Fictional company universe used by the demo provider.
 *
 * Every company here is invented. Names, symbols, ISINs (prefixed "ZZDEMO",
 * which is not a valid issuing country) and BSE codes (prefixed "9") are
 * deliberately not those of real listed companies. Any resemblance to a real
 * entity is coincidental.
 */
export interface DemoCompany {
  symbol: string;
  name: string;
  sector: string;
  industry: string;
  /** Target closing price on the demo anchor date (INR). */
  price: number;
  /** Approximate market capitalisation on the anchor date (INR crore). */
  marketCapCr: number;
  /** Also listed on BSE in demo mode. */
  bse: boolean;
  /** Pays dividends in demo mode. */
  dividend: boolean;
}

type Row = [string, string, string, string, number, number, boolean, boolean];

const ROWS: Row[] = [
  // Banking
  ["KVRBANK", "Kaveri Bank Ltd", "Banking", "Private Bank", 1640, 1180000, true, true],
  ["SAHYBNK", "Sahyadri Bank Ltd", "Banking", "Private Bank", 1185, 820000, true, true],
  ["DECCANFIN", "Deccan Finance Bank Ltd", "Banking", "Private Bank", 945, 410000, true, true],
  ["NBHARAT", "Navbharat State Bank", "Banking", "Public Sector Bank", 812, 725000, true, true],
  ["SINDHUBK", "Sindhu Co-operative Bank Ltd", "Banking", "Private Bank", 268, 64000, false, true],
  ["PURVABK", "Purva Bank Ltd", "Banking", "Public Sector Bank", 132, 98000, true, true],
  ["MALWABK", "Malwa Bank Ltd", "Banking", "Private Bank", 1520, 152000, true, true],
  ["TAPTIBK", "Tapti Small Finance Bank Ltd", "Banking", "Small Finance Bank", 58, 12500, false, false],
  // IT Services
  ["NIRMTECH", "Nirmaan Technologies Ltd", "IT Services", "IT Consulting", 3920, 1420000, true, true],
  ["INFOVYA", "Infovya Systems Ltd", "IT Services", "IT Consulting", 1610, 668000, true, true],
  ["CODEKSH", "Codekshetra Software Ltd", "IT Services", "Software Products", 4880, 142000, true, true],
  ["GANITDATA", "Ganit Data Labs Ltd", "IT Services", "Data & Analytics", 712, 41000, false, false],
  ["SETULINK", "Setu Digital Services Ltd", "IT Services", "IT Consulting", 1385, 386000, true, true],
  ["VYOMCLD", "Vyom Cloud Infra Ltd", "IT Services", "Cloud Services", 2210, 88000, false, true],
  // Energy
  ["URJAOIL", "Urja Oil & Gas Ltd", "Energy", "Integrated Oil & Gas", 2890, 1950000, true, true],
  ["PRAKASH", "Prakash Power Corporation Ltd", "Energy", "Power Generation", 352, 341000, true, true],
  ["SURYAGRN", "Suryagrid Renewables Ltd", "Energy", "Renewable Energy", 1215, 192000, true, false],
  ["DHRUVGAS", "Dhruv Gas Distribution Ltd", "Energy", "Gas Distribution", 486, 61000, false, true],
  ["KOYLAMIN", "Koyla Minerals Ltd", "Energy", "Coal", 418, 258000, true, true],
  // FMCG
  ["ANNAPRN", "Annapurna Consumer Ltd", "FMCG", "Packaged Foods", 2480, 583000, true, true],
  ["SUGANDH", "Sugandh Home Care Ltd", "FMCG", "Personal Care", 6150, 236000, true, true],
  ["KISANAGRO", "Kisan Agro Foods Ltd", "FMCG", "Packaged Foods", 975, 74000, false, true],
  ["MADHUBEV", "Madhu Beverages Ltd", "FMCG", "Beverages", 1340, 118000, true, true],
  ["CHAIPATI", "Chaipatti Tea Estates Ltd", "FMCG", "Tea & Coffee", 1085, 99000, true, true],
  ["NIRMALHM", "Nirmal Hygiene Ltd", "FMCG", "Household Products", 530, 33000, false, true],
  // Pharma
  ["AROGYAPH", "Arogya Pharmaceuticals Ltd", "Pharma", "Generics", 1780, 427000, true, true],
  ["DHANVANT", "Dhanvantari Life Sciences Ltd", "Pharma", "Specialty Pharma", 5320, 194000, true, true],
  ["SANJIVNI", "Sanjivani Healthcare Ltd", "Pharma", "Hospitals", 6890, 99000, true, false],
  ["AUSHADH", "Aushadh Biotech Ltd", "Pharma", "Biotechnology", 315, 37800, false, false],
  ["VAIDYALB", "Vaidya Diagnostics Ltd", "Pharma", "Diagnostics", 1960, 21500, false, true],
  ["NEERAJRX", "Neeraj Formulations Ltd", "Pharma", "Generics", 1240, 103000, true, true],
  // Auto
  ["RATHMOTR", "Rath Motors Ltd", "Auto", "Passenger Vehicles", 12400, 389000, true, true],
  ["CHAKRAAU", "Chakra Auto Ltd", "Auto", "Two Wheelers", 4560, 263000, true, true],
  ["VAAHANCV", "Vaahan Commercial Vehicles Ltd", "Auto", "Commercial Vehicles", 940, 312000, true, true],
  ["GATIEV", "Gati Electric Mobility Ltd", "Auto", "Electric Vehicles", 186, 41200, false, false],
  ["DHURIAUT", "Dhuri Auto Components Ltd", "Auto", "Auto Components", 2675, 52300, false, true],
  ["SAARTHI", "Saarthi Tyres Ltd", "Auto", "Tyres", 3180, 39500, true, true],
  // Metals
  ["LOHSTEEL", "Lohagarh Steel Ltd", "Metals", "Steel", 164, 201000, true, true],
  ["TAMRAMET", "Tamra Metals Ltd", "Metals", "Copper", 256, 77000, true, true],
  ["ARVALSTL", "Aravalli Alloys Ltd", "Metals", "Steel", 942, 229000, true, true],
  ["CHANDIAL", "Chandi Aluminium Ltd", "Metals", "Aluminium", 618, 139000, true, true],
  ["KHANIJ", "Khanij Mining Ltd", "Metals", "Mining", 412, 162000, false, true],
  // Telecom
  ["SANCHAR", "Sanchar Telecom Ltd", "Telecom", "Telecom Services", 1720, 1010000, true, true],
  ["TARANGNT", "Tarang Networks Ltd", "Telecom", "Telecom Infrastructure", 389, 103000, true, true],
  ["DOORDRSH", "Doordrishti Media Ltd", "Telecom", "Media", 212, 19800, false, false],
  // Infrastructure
  ["NIRMANCN", "Nirman Constructions Ltd", "Infrastructure", "Construction & Engineering", 3540, 487000, true, true],
  ["PATHPORT", "Pathik Ports & Logistics Ltd", "Infrastructure", "Ports", 1395, 301000, true, true],
  ["SADAKINF", "Sadak Infra Developers Ltd", "Infrastructure", "Roads", 488, 28700, false, false],
  ["VIMANAIR", "Vimana Airports Ltd", "Infrastructure", "Airports", 92, 42100, false, false],
  ["GRIHAREA", "Griha Realty Ltd", "Infrastructure", "Real Estate", 1645, 163000, true, true],
  // Financial Services
  ["SURAKSHA", "Suraksha Life Insurance Ltd", "Financial Services", "Insurance", 684, 147000, true, true],
  ["NIVESHFN", "Nivesh Finance Ltd", "Financial Services", "NBFC", 7140, 441000, true, true],
  ["BACHATHF", "Bachat Housing Finance Ltd", "Financial Services", "Housing Finance", 1118, 89000, false, true],
  ["SHAKTIAMC", "Shakti Asset Management Ltd", "Financial Services", "Asset Management", 4020, 85500, true, true],
  ["KOSHXCHG", "Kosh Exchange Services Ltd", "Financial Services", "Capital Markets", 2360, 63500, false, true],
  // Cement
  ["SHILACEM", "Shila Cements Ltd", "Cement", "Cement", 11200, 323000, true, true],
  ["VINDHYCM", "Vindhya Cement Ltd", "Cement", "Cement", 2480, 63800, true, true],
  ["PRITHVCM", "Prithvi Building Materials Ltd", "Cement", "Building Materials", 845, 26500, false, true],
  // Consumer Durables / Retail
  ["ROSHNIEL", "Roshni Electricals Ltd", "Consumer Durables", "Electricals", 1495, 94000, true, true],
  ["BAZAARRT", "Bazaar Retail Ltd", "Consumer Durables", "Retail", 4380, 285000, true, false],
];

export const DEMO_COMPANIES: DemoCompany[] = ROWS.map(
  ([symbol, name, sector, industry, price, marketCapCr, bse, dividend]) => ({
    symbol,
    name,
    sector,
    industry,
    price,
    marketCapCr,
    bse,
    dividend,
  }),
);

export interface DemoIndexDef {
  symbol: string;
  name: string;
  family: string;
  startLevel: number;
  /** Which listings are eligible and how many to take by market cap. */
  exchange: "NSE" | "BSE";
  sector?: string;
  count: number;
}

export const DEMO_INDICES: DemoIndexDef[] = [
  { symbol: "NIFTY50", name: "NIFTY 50 (demo series)", family: "NIFTY", startLevel: 18000, exchange: "NSE", count: 50 },
  { symbol: "NIFTYBANK", name: "NIFTY Bank (demo series)", family: "NIFTY", startLevel: 42000, exchange: "NSE", sector: "Banking", count: 12 },
  { symbol: "SENSEX", name: "BSE SENSEX (demo series)", family: "BSE", startLevel: 60000, exchange: "BSE", count: 30 },
  { symbol: "NIFTYIT", name: "NIFTY IT (demo series)", family: "NIFTY", startLevel: 29000, exchange: "NSE", sector: "IT Services", count: 10 },
  { symbol: "NIFTYPHARMA", name: "NIFTY Pharma (demo series)", family: "NIFTY", startLevel: 13500, exchange: "NSE", sector: "Pharma", count: 10 },
  { symbol: "NIFTYAUTO", name: "NIFTY Auto (demo series)", family: "NIFTY", startLevel: 13000, exchange: "NSE", sector: "Auto", count: 10 },
];

/** Fixed anchor so demo data is identical on every machine and every run. */
export const DEMO_ANCHOR_DATE = "2026-09-30";
export const DEMO_HISTORY_YEARS = 3;
export const DEMO_SEED = 20260930;
