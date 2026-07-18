/*
 * app.js — UI: inventario (localStorage), evaluación de pedales y render.
 */
(function () {
  "use strict";

  var M = window.Matcher;
  var DB = window.PEDAL_DB;
  var STORAGE_KEY = "pedal-builder-inventory-v1";

  var TYPE_LABELS = {
    resistor: "Resistencia",
    capacitor: "Capacitor",
    pot: "Potenciómetro",
    transistor: "Transistor",
    ic: "IC",
    diode: "Diodo",
    led: "LED",
    hardware: "Hardware",
  };

  var HINTS = {
    resistor: "Ej: <code>4k7</code>, <code>4.7k</code>, <code>470</code>, <code>1M</code>",
    capacitor: "Ej: <code>47n</code>, <code>0.047u</code>, <code>100p</code>, <code>2.2u</code>",
    pot: "Ej: <code>100k log</code>, <code>10k lin</code>, <code>500k rev</code>, <code>100k dual</code>",
    transistor: "Ej: <code>2N3904</code>, <code>2N5088</code>, <code>AC128</code>, <code>MPSA13</code>",
    ic: "Ej: <code>JRC4558D</code>, <code>TL072</code>, <code>LM741</code>, <code>LM308N</code>",
    diode: "Ej: <code>1N4148</code>, <code>1N34A</code>, <code>1N5817</code>",
    led: "Ej: <code>LED 5mm</code>",
    hardware: "Ej: <code>caja 1590B</code>, <code>footswitch 3PDT</code>, <code>jack 6.35mm</code>",
  };

  var EXAMPLE_INVENTORY = [
    { type: "resistor", value: "10k", qty: 10 },
    { type: "resistor", value: "100k", qty: 6 },
    { type: "resistor", value: "1M", qty: 3 },
    { type: "resistor", value: "4.7k", qty: 4 },
    { type: "resistor", value: "1k", qty: 5 },
    { type: "resistor", value: "470k", qty: 2 },
    { type: "capacitor", value: "100n", qty: 8 },
    { type: "capacitor", value: "47n", qty: 4 },
    { type: "capacitor", value: "1u", qty: 4 },
    { type: "capacitor", value: "10u", qty: 2 },
    { type: "transistor", value: "2N3904", qty: 3 },
    { type: "transistor", value: "2N5088", qty: 2 },
    { type: "diode", value: "1N4148", qty: 8 },
    { type: "ic", value: "TL072", qty: 1 },
    { type: "pot", value: "100k log", qty: 2 },
  ];

  // ---------------- estado ----------------

  var inventory = load();

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      var data = raw ? JSON.parse(raw) : [];
      return Array.isArray(data) ? data.filter(validItem) : [];
    } catch (e) {
      return [];
    }
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(inventory));
  }

  function validItem(it) {
    return it && TYPE_LABELS[it.type] && typeof it.value === "string" && Number(it.qty) > 0;
  }

  /** Suma qty si ya existe un ítem equivalente del mismo tipo. */
  function addItem(type, value, qty) {
    var existing = inventory.find(function (it) {
      return it.type === type && M.componentMatches({ type: type, value: value }, it) &&
        M.componentMatches(it, { type: type, value: value });
    });
    if (existing) {
      existing.qty = Number(existing.qty) + qty;
    } else {
      inventory.push({ type: type, value: value, qty: qty });
    }
    save();
    render();
  }

  // ---------------- render inventario ----------------

  var $ = function (id) { return document.getElementById(id); };

  function renderInventory() {
    var box = $("inventory-list");
    $("inv-count").textContent = inventory.length
      ? inventory.length + " ítems / " + inventory.reduce(function (a, i) { return a + Number(i.qty); }, 0) + " unidades"
      : "";

    if (!inventory.length) {
      box.innerHTML = '<p class="empty-msg">Todavía no cargaste componentes.<br>Agregá algunos o probá con «Cargar ejemplo».</p>';
      return;
    }

    var order = ["resistor", "capacitor", "pot", "transistor", "ic", "diode", "led", "hardware"];
    var sorted = inventory.slice().sort(function (a, b) {
      var t = order.indexOf(a.type) - order.indexOf(b.type);
      if (t) return t;
      // dentro del tipo, ordenar por valor normalizado si es numérico
      var na = M.parseResistor(a.value) || M.parseCapacitor(a.value) || 0;
      var nb = M.parseResistor(b.value) || M.parseCapacitor(b.value) || 0;
      return na - nb || String(a.value).localeCompare(String(b.value));
    });

    var html = '<table><thead><tr><th>Tipo</th><th>Valor</th><th>Cant.</th><th></th></tr></thead><tbody>';
    sorted.forEach(function (it) {
      var idx = inventory.indexOf(it);
      var norm = M.displayValue(it.type, it.value);
      var showNorm = norm && norm.toLowerCase() !== String(it.value).toLowerCase();
      html += "<tr>" +
        "<td>" + TYPE_LABELS[it.type] + "</td>" +
        "<td>" + esc(it.value) + (showNorm ? ' <span class="norm">(' + esc(norm) + ")</span>" : "") + "</td>" +
        '<td><button class="qty-btn" data-act="dec" data-idx="' + idx + '">−</button> ' +
        it.qty +
        ' <button class="qty-btn" data-act="inc" data-idx="' + idx + '">＋</button></td>' +
        '<td><button class="del" data-act="del" data-idx="' + idx + '" title="Eliminar">✕</button></td>' +
        "</tr>";
    });
    html += "</tbody></table>";
    box.innerHTML = html;
  }

  // ---------------- render pedales ----------------

  var expanded = {};

  function renderPedals() {
    var includeHw = $("include-hardware").checked;
    var hardware = includeHw ? DB.hardware : null;
    var opts = { substitutes: $("allow-subs").checked };
    var ranked = M.rankPedals(DB.pedals, inventory, hardware, opts);
    var box = $("pedal-list");

    box.innerHTML = ranked.map(function (entry) {
      var p = entry.pedal;
      var r = entry.result;
      var cls = r.pct >= 100 ? "pct-high" : r.pct >= 50 ? "pct-mid" : "pct-low";
      var diff = "●".repeat(p.difficulty) + "○".repeat(5 - p.difficulty);
      var isOpen = !!expanded[p.id];

      var html = '<div class="pedal-card" data-id="' + p.id + '">' +
        '<div class="pedal-head" data-id="' + p.id + '">' +
        '<div class="pedal-title">' + esc(p.name) + ' <span class="brand">· ' + esc(p.brand) + "</span></div>" +
        '<div class="pedal-pct ' + cls + '">' + (r.totalApprox ? "≈" : "") + r.pct + "%</div>" +
        '<div class="pedal-meta">' + esc(p.kind) + " · dificultad " + diff +
        " · " + r.totalCovered + "/" + r.totalNeeded + " componentes" +
        (r.totalApprox ? " (" + r.totalApprox + " aprox.)" : "") + "</div>" +
        "</div>" +
        '<div class="progress"><div style="width:' + r.pct + '%"></div></div>';

      if (isOpen) {
        html += '<div class="pedal-detail">' +
          '<p class="desc">' + esc(p.description) + "</p>" +
          r.lines.map(function (l) {
            var label = TYPE_LABELS[l.type] + " " + l.value +
              (l.note ? ' <span class="note">— ' + esc(l.note) + "</span>" : "");
            if (l.subs && l.subs.length) {
              label += ' <span class="subs">⚠ sustituto: ' +
                l.subs.map(function (s) { return s.used + "× " + esc(s.value); }).join(", ") +
                "</span>";
            }
            var cls2 = l.ok ? (l.approx ? "ok approx" : "ok") : "miss";
            var mark = l.ok ? (l.approx ? "≈" : "✔") : "✘";
            return '<div class="bom-line ' + cls2 + '">' +
              '<span class="status">' + mark + "</span>" +
              "<span>" + label + "</span>" +
              '<span class="have">' + l.covered + "/" + l.need + "</span>" +
              "</div>";
          }).join("");

        var missing = r.lines.filter(function (l) { return !l.ok; });
        if (missing.length) {
          html += '<div class="missing-summary"><strong>Te falta:</strong> ' +
            missing.map(function (l) {
              return l.missing + "× " + l.value;
            }).join(", ") + "</div>";
        } else if (r.totalApprox) {
          html += '<div class="missing-summary">🧪 ¡Lo podés armar usando sustitutos aproximados! El resultado puede variar — experimentá.</div>';
        } else {
          html += '<div class="missing-summary">🎉 ¡Tenés todo para armarlo!</div>';
        }
        html += "</div>";
      }

      html += "</div>";
      return html;
    }).join("");
  }

  function render() {
    renderInventory();
    renderPedals();
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // ---------------- eventos ----------------

  $("add-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var type = $("comp-type").value;
    var value = $("comp-value").value.trim();
    var qty = parseInt($("comp-qty").value, 10) || 1;
    var err = $("add-error");

    if (!M.isValid(type, value)) {
      err.textContent = "No pude interpretar «" + value + "» como " +
        TYPE_LABELS[type].toLowerCase() + ". " +
        $("value-hint").textContent.trim();
      err.classList.remove("hidden");
      return;
    }
    err.classList.add("hidden");
    addItem(type, value, qty);
    $("comp-value").value = "";
    $("comp-qty").value = "1";
    $("comp-value").focus();
  });

  $("comp-type").addEventListener("change", function () {
    $("value-hint").innerHTML = HINTS[this.value];
    $("add-error").classList.add("hidden");
  });

  $("inventory-list").addEventListener("click", function (e) {
    var btn = e.target.closest("button[data-act]");
    if (!btn) return;
    var idx = Number(btn.dataset.idx);
    var it = inventory[idx];
    if (!it) return;
    if (btn.dataset.act === "del") inventory.splice(idx, 1);
    else if (btn.dataset.act === "inc") it.qty = Number(it.qty) + 1;
    else if (btn.dataset.act === "dec") {
      it.qty = Number(it.qty) - 1;
      if (it.qty <= 0) inventory.splice(idx, 1);
    }
    save();
    render();
  });

  $("pedal-list").addEventListener("click", function (e) {
    var head = e.target.closest(".pedal-head");
    if (!head) return;
    var id = head.dataset.id;
    expanded[id] = !expanded[id];
    renderPedals();
  });

  $("include-hardware").addEventListener("change", renderPedals);
  $("allow-subs").addEventListener("change", renderPedals);

  $("btn-clear").addEventListener("click", function () {
    if (inventory.length && confirm("¿Vaciar todo el inventario?")) {
      inventory = [];
      save();
      render();
    }
  });

  $("btn-example").addEventListener("click", function () {
    if (inventory.length && !confirm("Esto reemplaza tu inventario actual por uno de ejemplo. ¿Continuar?")) return;
    inventory = EXAMPLE_INVENTORY.map(function (it) { return Object.assign({}, it); });
    save();
    render();
  });

  $("btn-export").addEventListener("click", function () {
    var blob = new Blob([JSON.stringify(inventory, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "inventario-componentes.json";
    a.click();
    URL.revokeObjectURL(a.href);
  });

  $("btn-import").addEventListener("click", function () {
    $("import-file").click();
  });

  $("import-file").addEventListener("change", function () {
    var file = this.files[0];
    this.value = "";
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        if (!Array.isArray(data)) throw new Error("formato");
        var items = data.filter(validItem);
        if (!items.length) throw new Error("vacío");
        inventory = items;
        save();
        render();
      } catch (e) {
        alert("No pude leer el archivo. Debe ser un JSON con el mismo formato que genera «Exportar».");
      }
    };
    reader.readAsText(file);
  });

  // ---------------- init ----------------
  render();
})();
