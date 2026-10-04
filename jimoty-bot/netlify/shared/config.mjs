// ====== EDITA AQUÍ ======

// maxPrice en yenes (null = sin límite). moto: true = marca si falta llave/papeles
export const QUERIES = [
  // Motos
  { keyword: "バイク 無料", maxPrice: 30000, moto: true },
  { keyword: "原付", maxPrice: 30000, moto: true },
  { keyword: "不動車", maxPrice: 20000, moto: true },
  // Maquinaria
  { keyword: "トラクター", maxPrice: 100000 },
  { keyword: "ユンボ", maxPrice: 150000 },
  { keyword: "ミニショベル", maxPrice: 150000 },
  { keyword: "耕運機", maxPrice: 20000 },
  { keyword: "フォークリフト", maxPrice: 100000 },
  { keyword: "発電機", maxPrice: 10000 },
  { keyword: "草刈機", maxPrice: 10000 },
  { keyword: "農機具 無料", maxPrice: null },
  { keyword: "工具 無料", maxPrice: null },
];

// Si el título tiene alguna de estas palabras, se descarta
export const EXCLUDE = [
  "鍵なし", "鍵無し", "鍵紛失", "キーなし",
  "書類なし", "書類無し", "書類紛失", "車検証なし", "標識なし",
  "部品取り", "パーツ取り", "ジャンク",
];

// Palabras que indican que SÍ hay llave/papeles
export const GOOD_WORDS = ["鍵あり", "鍵付", "キーあり", "書類あり", "車検証あり", "標識あり"];
