/*
 * matcher.js — Normalización de valores de componentes y cálculo de
 * compatibilidad entre el inventario del usuario y las BOM de los pedales.
 *
 * Funciona tanto en el navegador (window.Matcher) como en Node (module.exports)
 * para poder testearlo por consola.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.Matcher = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ---------------------------------------------------------------
  // Normalización de resistencias
  // Acepta: "4k7", "4.7k", "4700", "220R", "220", "1M", "2M2", "0.33"
  // Devuelve el valor en ohms (número) o null si no se puede interpretar.
  // ---------------------------------------------------------------
  var R_MULT = { r: 1, k: 1e3, m: 1e6, g: 1e9 };

  function parseResistor(raw) {
    if (raw == null) return null;
    var s = String(raw).trim().toLowerCase()
      .replace(/(ohms?|Ω|ω)/g, "")
      .replace(/\s+/g, "");
    if (!s) return null;

    // Notación europea con la letra como separador decimal: 4k7, 2m2, 0r33
    var m = s.match(/^(\d+)([rkmg])(\d+)$/);
    if (m) {
      return (parseFloat(m[1] + "." + m[3])) * R_MULT[m[2]];
    }
    // Sufijo al final: 4.7k, 220r, 1m
    m = s.match(/^(\d*\.?\d+)([rkmg])?$/);
    if (m) {
      var mult = m[2] ? R_MULT[m[2]] : 1;
      return parseFloat(m[1]) * mult;
    }
    return null;
  }

  // ---------------------------------------------------------------
  // Normalización de capacitores
  // Acepta: "47n", "47nF", "0.047u", "0.047uF", "100p", "2.2u", "10uF", "1F"
  // Devuelve el valor en picofarads (número) o null.
  // ---------------------------------------------------------------
  var C_MULT = { p: 1, n: 1e3, u: 1e6, µ: 1e6, m: 1e9, f: 1e12 };

  function parseCapacitor(raw) {
    if (raw == null) return null;
    var s = String(raw).trim().toLowerCase()
      .replace(/farads?/g, "f")
      .replace(/\s+/g, "")
      .replace(/µ/g, "u")
      .replace(/mf$/, "uf"); // "mf" casi siempre significa microfarad en BOMs viejas

    // Quitar la "f" final si viene con prefijo: 47nf -> 47n
    var m = s.match(/^(\d+)([pnum])(\d+)f?$/); // notación 4n7
    if (m) {
      return parseFloat(m[1] + "." + m[3]) * C_MULT[m[2]];
    }
    m = s.match(/^(\d*\.?\d+)([pnum])?f?$/);
    if (m) {
      var mult = m[2] ? C_MULT[m[2]] : C_MULT.f; // sin prefijo => farads
      return parseFloat(m[1]) * mult;
    }
    return null;
  }

  // ---------------------------------------------------------------
  // Normalización de potenciómetros
  // Acepta: "100k", "100kA", "100k log", "500k lin", "10k B", "100k dual"
  // Devuelve { ohms, taper, dual } — el matching se hace por ohms.
  // ---------------------------------------------------------------
  function parsePot(raw) {
    if (raw == null) return null;
    var s = String(raw).trim().toLowerCase();
    var dual = /dual|doble|stereo|tandem/.test(s);
    var taper = null;
    if (/(log|logar[ií]tmico|\ba\b)/.test(s)) taper = "log";
    else if (/(lin|lineal|\bb\b)/.test(s)) taper = "lin";
    else if (/(rev|antilog|\bc\b|\bw\b)/.test(s)) taper = "rev";
    var vm = s.match(/(\d+[rkm]\d+|\d*\.?\d+\s*[rkm]?)/);
    var ohms = vm ? parseResistor(vm[1]) : null;
    if (ohms == null) return null;
    return { ohms: ohms, taper: taper, dual: dual };
  }

  // ---------------------------------------------------------------
  // Semiconductores / ICs: se comparan por número de parte normalizado
  // más grupos de equivalencias funcionales conocidas.
  // ---------------------------------------------------------------
  function normalizePart(raw) {
    return String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  }

  // Cada grupo lista partes intercambiables en la práctica para estos
  // circuitos. Es deliberadamente conservador: se puede ampliar.
  var EQUIV_GROUPS = [
    // Diodos de señal silicio
    ["1N914", "1N4148", "1N914B"],
    // Diodos de germanio
    ["1N34A", "1N34", "1N60", "OA90", "D9E", "1N270", "1N695"],
    // Rectificadores (protección de polaridad / fuente)
    ["1N4001", "1N4002", "1N4003", "1N4004", "1N4005", "1N4006", "1N4007",
     "1N5400", "1N5402", "1N5404", "1N5406", "1N5408"],
    // NPN alta ganancia (fuzz/muff)
    ["2N5088", "2N5089", "MPSA18", "BC549", "BC549C", "BC550"],
    // NPN uso general (buffers, boosters)
    ["2N3904", "2SC1815", "C1815", "BC547", "BC548", "2N2222", "PN2222", "C945", "2SC828", "S9014"],
    // PNP silicio uso general
    ["2N3906", "BC556", "BC557", "BC558", "A1015", "2SA1015", "S8550", "S9012", "S9015"],
    // MOSFET pequeña señal
    ["BS170", "2N7000"],
    // Darlington NPN (Bazz Fuss)
    ["MPSA13", "MPSA14", "BC517"],
    // PNP germanio (Fuzz Face, Rangemaster)
    ["AC128", "NKT275", "AC125", "OC44", "OC71", "OC75", "2N404"],
    // JFET canal N uso general
    ["2N5457", "2N5458", "MPF102", "J201", "2N5952"],
    // Opamp dual estándar
    ["JRC4558D", "JRC4558", "RC4558", "RC4558P", "4558", "4558D", "TL072", "TL072CP",
     "NE5532", "LM1458", "MC1458", "JRC4559", "RC4559", "4559", "TL082"],
    // Opamp simple estándar
    ["LM741", "UA741", "TL071", "TL061", "LM308N", "LM308", "OP07"],
    // Charge pump
    ["TC1044SCPA", "TC1044", "ICL7660S", "LT1054", "MAX1044"],
  ];

  var EQUIV_INDEX = {};
  EQUIV_GROUPS.forEach(function (group, i) {
    group.forEach(function (p) {
      EQUIV_INDEX[normalizePart(p)] = i;
    });
  });

  function partsMatch(a, b) {
    var na = normalizePart(a);
    var nb = normalizePart(b);
    if (!na || !nb) return false;
    if (na === nb) return true;
    // Uno contiene al otro (JRC4558D vs 4558) con largo razonable
    if (na.length >= 4 && nb.length >= 4 && (na.indexOf(nb) !== -1 || nb.indexOf(na) !== -1)) return true;
    var ga = EQUIV_INDEX[na];
    var gb = EQUIV_INDEX[nb];
    return ga !== undefined && ga === gb;
  }

  // ---------------------------------------------------------------
  // Clave de matching por tipo de componente
  // ---------------------------------------------------------------
  var NUMERIC_TOLERANCE = 0.02; // 2% para absorber redondeos (4.7k vs 4700)

  function numbersMatch(a, b) {
    if (a == null || b == null) return false;
    if (a === b) return true;
    var big = Math.max(Math.abs(a), Math.abs(b));
    return big > 0 && Math.abs(a - b) / big <= NUMERIC_TOLERANCE;
  }

  /**
   * ¿El componente del inventario `inv` sirve para la línea de BOM `line`?
   * Ambos tienen forma { type, value }.
   */
  function componentMatches(line, inv) {
    if (line.type !== inv.type) return false;
    switch (line.type) {
      case "resistor":
        return numbersMatch(parseResistor(line.value), parseResistor(inv.value));
      case "capacitor":
        return numbersMatch(parseCapacitor(line.value), parseCapacitor(inv.value));
      case "pot": {
        var a = parsePot(line.value);
        var b = parsePot(inv.value);
        // El matching es por resistencia; la curva (log/lin) se muestra
        // como dato pero no bloquea, porque en la práctica se sustituyen.
        return !!(a && b) && numbersMatch(a.ohms, b.ohms) && a.dual === b.dual;
      }
      case "transistor":
      case "ic":
      case "diode":
        return partsMatch(line.value, inv.value);
      default:
        // led, hardware, otros: comparación de texto laxa
        return normalizePart(line.value) === normalizePart(inv.value);
    }
  }

  /** Valor numérico normalizado para tipos donde tiene sentido "cercano". */
  function numericValue(type, value) {
    switch (type) {
      case "resistor": return parseResistor(value);
      case "capacitor": return parseCapacitor(value);
      case "pot": {
        var p = parsePot(value);
        return p ? p.ohms : null;
      }
      default: return null;
    }
  }

  var DEFAULT_SUB_TOLERANCE = 0.25; // ±25% ≈ un paso de la serie E12

  /**
   * Evalúa un pedal contra el inventario, asignando stock real (un mismo
   * componente no puede cubrir dos líneas a la vez).
   *
   * @param pedal  { id, name, circuit: [{type, value, qty, note?}] }
   * @param inventory  [{ type, value, qty }]
   * @param hardware  líneas extra (jacks, caja...) o null para excluirlas
   * @param opts  { substitutes: bool, tolerance: number } — con substitutes
   *              activado, resistencias/capacitores/pots de valor cercano
   *              (dentro de tolerance) cubren faltantes como "aproximados".
   * @returns { pct, pctExact, totalNeeded, totalCovered, totalApprox, lines }
   */
  function evaluatePedal(pedal, inventory, hardware, opts) {
    opts = opts || {};
    var tolerance = opts.tolerance || DEFAULT_SUB_TOLERANCE;
    var bom = pedal.circuit.slice();
    if (hardware && hardware.length) bom = bom.concat(hardware);

    // Pool de stock con cantidades restantes
    var pool = inventory.map(function (it) {
      var qty = Number(it.qty) || 0;
      return { type: it.type, value: it.value, total: qty, left: qty };
    });

    // Pase 1: matches exactos / equivalentes
    var lines = bom.map(function (line) {
      var need = Number(line.qty) || 0;
      var have = 0;
      var exact = 0;
      pool.forEach(function (p) {
        if (componentMatches(line, { type: p.type, value: p.value })) {
          have += p.total;
          var take = Math.min(need - exact, p.left);
          if (take > 0) {
            p.left -= take;
            exact += take;
          }
        }
      });
      return {
        type: line.type,
        value: line.value,
        note: line.note || null,
        need: need,
        have: have,
        exact: exact,
        approx: 0,
        subs: [],
      };
    });

    // Pase 2: sustitutos de valor cercano (solo R, C y pots), experimental
    if (opts.substitutes) {
      lines.forEach(function (l) {
        if (l.exact + l.approx >= l.need) return;
        var target = numericValue(l.type, l.value);
        if (target == null) return;
        var wantDual = l.type === "pot" ? !!parsePot(l.value).dual : null;

        pool
          .map(function (p) {
            if (p.type !== l.type || p.left <= 0) return null;
            var v = numericValue(p.type, p.value);
            if (v == null) return null;
            if (l.type === "pot" && !!parsePot(p.value).dual !== wantDual) return null;
            var diff = Math.abs(v - target) / Math.max(v, target);
            // los que pasan NUMERIC_TOLERANCE ya se asignaron en el pase 1
            if (diff <= NUMERIC_TOLERANCE || diff > tolerance) return null;
            return { p: p, diff: diff };
          })
          .filter(Boolean)
          .sort(function (a, b) { return a.diff - b.diff; })
          .forEach(function (c) {
            var missing = l.need - l.exact - l.approx;
            if (missing <= 0) return;
            var take = Math.min(missing, c.p.left);
            if (take > 0) {
              c.p.left -= take;
              l.approx += take;
              l.subs.push({ value: c.p.value, used: take });
            }
          });
      });
    }

    // Totales
    var totalNeeded = 0;
    var totalExact = 0;
    var totalApprox = 0;
    lines.forEach(function (l) {
      totalNeeded += l.need;
      totalExact += l.exact;
      totalApprox += l.approx;
      l.covered = l.exact + l.approx;
      l.missing = l.need - l.covered;
      l.ok = l.missing === 0;
    });
    var totalCovered = totalExact + totalApprox;

    return {
      pct: totalNeeded ? Math.round((totalCovered / totalNeeded) * 100) : 0,
      pctExact: totalNeeded ? Math.round((totalExact / totalNeeded) * 100) : 0,
      totalNeeded: totalNeeded,
      totalCovered: totalCovered,
      totalApprox: totalApprox,
      lines: lines,
    };
  }

  /** Evalúa todos los pedales y los devuelve ordenados por % descendente. */
  function rankPedals(pedals, inventory, hardware, opts) {
    return pedals
      .map(function (p) {
        var r = evaluatePedal(p, inventory, hardware, opts);
        return { pedal: p, result: r };
      })
      .sort(function (a, b) {
        return b.result.pct - a.result.pct || a.pedal.name.localeCompare(b.pedal.name);
      });
  }

  // ---------------------------------------------------------------
  // Formateo para mostrar valores normalizados
  // ---------------------------------------------------------------
  function formatOhms(ohms) {
    if (ohms == null) return "?";
    if (ohms >= 1e6) return trimNum(ohms / 1e6) + "MΩ";
    if (ohms >= 1e3) return trimNum(ohms / 1e3) + "kΩ";
    return trimNum(ohms) + "Ω";
  }

  function formatPF(pf) {
    if (pf == null) return "?";
    if (pf >= 1e6) return trimNum(pf / 1e6) + "µF";
    if (pf >= 1e3) return trimNum(pf / 1e3) + "nF";
    return trimNum(pf) + "pF";
  }

  function trimNum(n) {
    return String(Math.round(n * 100) / 100);
  }

  /** Texto normalizado para mostrar junto al valor crudo que cargó el usuario. */
  function displayValue(type, value) {
    switch (type) {
      case "resistor":
        return formatOhms(parseResistor(value));
      case "capacitor":
        return formatPF(parseCapacitor(value));
      case "pot": {
        var p = parsePot(value);
        if (!p) return "?";
        var t = p.taper ? " " + p.taper : "";
        return formatOhms(p.ohms) + t + (p.dual ? " dual" : "");
      }
      default:
        return String(value || "").toUpperCase();
    }
  }

  /** ¿El valor es interpretable para su tipo? (para validar el alta) */
  function isValid(type, value) {
    switch (type) {
      case "resistor": return parseResistor(value) != null;
      case "capacitor": return parseCapacitor(value) != null;
      case "pot": return parsePot(value) != null;
      default: return normalizePart(value).length > 0;
    }
  }

  return {
    parseResistor: parseResistor,
    parseCapacitor: parseCapacitor,
    parsePot: parsePot,
    normalizePart: normalizePart,
    partsMatch: partsMatch,
    componentMatches: componentMatches,
    evaluatePedal: evaluatePedal,
    rankPedals: rankPedals,
    displayValue: displayValue,
    isValid: isValid,
  };
});
