/*
 * Test rápido del motor de matching. Correr con:  node test/matcher.test.js
 */
const M = require("../js/matcher.js");

// data.js está escrito para el navegador; lo cargamos simulando window
const fs = require("fs");
const path = require("path");
const w = {};
new Function("window", fs.readFileSync(path.join(__dirname, "../js/data.js"), "utf8"))(w);
const DB = w.PEDAL_DB;

let failures = 0;
function eq(actual, expected, label) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failures++;
    console.error(`✘ ${label}: esperaba ${JSON.stringify(expected)}, obtuve ${JSON.stringify(actual)}`);
  } else {
    console.log(`✔ ${label}`);
  }
}

// --- resistencias ---
eq(M.parseResistor("4k7"), 4700, "4k7 = 4700Ω");
eq(M.parseResistor("4.7k"), 4700, "4.7k = 4700Ω");
eq(M.parseResistor("4700"), 4700, "4700 = 4700Ω");
eq(M.parseResistor("220R"), 220, "220R = 220Ω");
eq(M.parseResistor("1M"), 1000000, "1M = 1MΩ");
eq(M.parseResistor("2M2"), 2200000, "2M2 = 2.2MΩ");
eq(M.parseResistor("470 ohm"), 470, "'470 ohm' = 470Ω");
eq(M.parseResistor("banana"), null, "basura -> null");

// --- capacitores ---
eq(M.parseCapacitor("47n"), 47000, "47n = 47000pF");
eq(M.parseCapacitor("47nF"), 47000, "47nF = 47000pF");
eq(Math.round(M.parseCapacitor("0.047uF")), 47000, "0.047uF = 47000pF");
eq(M.parseCapacitor("100p"), 100, "100p = 100pF");
eq(M.parseCapacitor("2.2u"), 2200000, "2.2u = 2.2µF");
eq(M.parseCapacitor("4n7"), 4700, "4n7 = 4700pF");

// --- matching numérico con tolerancia de redondeo ---
eq(M.componentMatches(
  { type: "capacitor", value: "47n" },
  { type: "capacitor", value: "0.047uF" }
), true, "47n ≈ 0.047uF");

// --- potenciómetros ---
eq(M.parsePot("100k log").ohms, 100000, "pot 100k log");
eq(M.parsePot("100k log").taper, "log", "taper log");
eq(M.parsePot("100k dual").dual, true, "pot dual");
eq(M.componentMatches(
  { type: "pot", value: "100k log" },
  { type: "pot", value: "100k lin" }
), true, "pots: curva distinta no bloquea el match");
eq(M.componentMatches(
  { type: "pot", value: "100k dual" },
  { type: "pot", value: "100k log" }
), false, "pot dual no matchea con simple");

// --- semiconductores y equivalencias ---
eq(M.partsMatch("1N914", "1N4148"), true, "1N914 ≈ 1N4148");
eq(M.partsMatch("2N5088", "2N5089"), true, "2N5088 ≈ 2N5089");
eq(M.partsMatch("JRC4558D", "4558"), true, "JRC4558D ≈ 4558");
eq(M.partsMatch("AC128", "NKT275"), true, "AC128 ≈ NKT275");
eq(M.partsMatch("2N3904", "AC128"), false, "2N3904 ≠ AC128");
eq(M.partsMatch("LM741", "TL072"), false, "LM741 (simple) ≠ TL072 (dual)");

// --- evaluación de un pedal completo ---
const bazz = DB.pedals.find(p => p.id === "bazz-fuss");
const fullInv = [
  { type: "transistor", value: "MPSA13", qty: 1 },
  { type: "diode", value: "1N914", qty: 2 },       // equivalente a 1N4148
  { type: "resistor", value: "10k", qty: 5 },
  { type: "resistor", value: "100k", qty: 1 },
  { type: "capacitor", value: "0.1u", qty: 2 },    // = 100n
  { type: "pot", value: "100kA", qty: 1 },
];
const rFull = M.evaluatePedal(bazz, fullInv, null);
eq(rFull.pct, 100, "Bazz Fuss completo = 100%");

const halfInv = [
  { type: "resistor", value: "10k", qty: 1 },
  { type: "resistor", value: "100k", qty: 1 },
  { type: "capacitor", value: "100n", qty: 1 },
];
const rHalf = M.evaluatePedal(bazz, halfInv, null);
eq(rHalf.totalNeeded, 7, "Bazz Fuss necesita 7 unidades");
eq(rHalf.totalCovered, 3, "inventario parcial cubre 3");
eq(rHalf.pct, 43, "parcial = 43%");

// --- ranking ---
const ranked = M.rankPedals(DB.pedals, fullInv, null);
eq(ranked[0].pedal.id, "bazz-fuss", "ranking: Bazz Fuss primero con su inventario");

// --- sanity check de toda la DB: valores parseables ---
DB.pedals.forEach(p => {
  p.circuit.forEach(line => {
    if (!M.isValid(line.type, line.value)) {
      failures++;
      console.error(`✘ DB inválida: ${p.id} -> ${line.type} "${line.value}" no parsea`);
    }
  });
});
console.log("✔ todas las líneas de la DB parsean");

// --- displayValue ---
eq(M.displayValue("resistor", "4k7"), "4.7kΩ", "display 4k7");
eq(M.displayValue("capacitor", "0.047u"), "47nF", "display 0.047u");


// ===== tests agregados: sustitutos aproximados y asignación de stock =====

// Equivalencias nuevas
eq(M.partsMatch("TL082", "TL072"), true, "TL082 ≈ TL072");
eq(M.partsMatch("BS170", "2N7000"), true, "BS170 ≈ 2N7000");
eq(M.partsMatch("A1015", "BC557"), true, "A1015 ≈ BC557 (PNP silicio)");
eq(M.partsMatch("C945", "2N3904"), true, "C945 ≈ 2N3904 (NPN general)");
eq(M.partsMatch("LM1458", "JRC4558D"), true, "LM1458 ≈ 4558");
eq(M.partsMatch("1N4007", "1N4001"), true, "1N4007 ≈ 1N4001 (rectificador)");

// Sustitutos: 120k cubre un faltante de 100k solo en modo experimental
const subPedal = { id: "t", name: "t", circuit: [{ type: "resistor", value: "100k", qty: 2 }] };
const subInv = [
  { type: "resistor", value: "100k", qty: 1 },
  { type: "resistor", value: "120k", qty: 5 },
];
const rNoSub = M.evaluatePedal(subPedal, subInv, null);
eq(rNoSub.totalCovered, 1, "sin modo experimental: solo el exacto");
const rSub = M.evaluatePedal(subPedal, subInv, null, { substitutes: true });
eq(rSub.totalCovered, 2, "con sustitutos: 120k cubre el faltante");
eq(rSub.totalApprox, 1, "1 unidad marcada como aproximada");
eq(rSub.lines[0].subs[0].value, "120k", "registra qué sustituto usó");

// Fuera de tolerancia: 220k NO sustituye a 100k
const rFar = M.evaluatePedal(subPedal, [{ type: "resistor", value: "220k", qty: 5 }], null, { substitutes: true });
eq(rFar.totalCovered, 0, "220k no sustituye a 100k (fuera de ±25%)");

// El sustituto más cercano se usa primero
const rNear = M.evaluatePedal(
  { id: "t2", name: "t2", circuit: [{ type: "capacitor", value: "100n", qty: 1 }] },
  [{ type: "capacitor", value: "82n", qty: 1 }, { type: "capacitor", value: "120n", qty: 1 }],
  null, { substitutes: true }
);
eq(rNear.lines[0].subs[0].value, "120n", "elige el valor más cercano (120n antes que 82n)");

// Asignación de stock: un solo pot 100k log no puede cubrir dos líneas
const twoLines = { id: "t3", name: "t3", circuit: [
  { type: "pot", value: "100k log", qty: 1 },
  { type: "pot", value: "100k log", qty: 1 },
] };
const rAlloc = M.evaluatePedal(twoLines, [{ type: "pot", value: "100k log", qty: 1 }], null);
eq(rAlloc.totalCovered, 1, "el stock se asigna, no se cuenta dos veces");

// Sustitutos no roban stock ya asignado a un match exacto
const mixed = { id: "t4", name: "t4", circuit: [
  { type: "resistor", value: "100k", qty: 1 },
  { type: "resistor", value: "82k", qty: 1 },
] };
const rMixed = M.evaluatePedal(mixed, [{ type: "resistor", value: "100k", qty: 1 }], null, { substitutes: true });
eq(rMixed.lines[0].exact, 1, "el 100k va a la línea exacta");
eq(rMixed.lines[1].approx, 0, "no queda stock para sustituir el 82k");

if (failures) {
  console.error(`\n${failures} test(s) fallaron`);
  process.exit(1);
}
console.log("\nTodos los tests pasaron ✔");
