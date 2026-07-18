# 🎸 Pedal Builder

Aplicación web para aficionados a la electrónica DIY de pedales de guitarra.
Cargás los componentes que tenés (resistencias, capacitores, transistores, ICs,
diodos, potenciómetros…) y la app te dice **qué pedales clásicos podés armar y
cuán cerca estás de cada uno**, con el detalle de lo que te falta.

> _"Con esto estás al 71% de armar un Tube Screamer: te faltan 2× 510k, 1× JRC4558D…"_

## Cómo usarla

No necesita instalación ni servidor: es HTML + JavaScript puro.

- **Opción 1:** abrí `index.html` con doble click en cualquier navegador.
- **Opción 2 (recomendada):** activá GitHub Pages en el repo
  (Settings → Pages → Deploy from branch) y accedé desde cualquier dispositivo.

Tu inventario se guarda automáticamente en el navegador (localStorage) y podés
**exportarlo/importarlo como JSON** para hacer backup o pasarlo a otra máquina.

## Qué sabe hacer

- **Normaliza valores**: entiende que `4k7` = `4.7k` = `4700 Ω`, que
  `47n` = `0.047uF` = `47000 pF`, y que `2M2` son 2.2 MΩ.
- **Conoce equivalencias de semiconductores**: si la BOM pide `1N914` y vos
  tenés `1N4148`, cuenta. Lo mismo con `2N5088`/`2N5089`, `JRC4558D`/`RC4558`/`TL072`,
  `AC128`/`NKT275`, etc. (ver `EQUIV_GROUPS` en `js/matcher.js`).
- **Calcula el porcentaje** de cada pedal como unidades cubiertas / unidades
  necesarias, y lista exactamente qué te falta.
- **Hardware opcional**: caja, jacks, footswitch y LED se pueden incluir o no
  en el cálculo con un checkbox.
- En los potenciómetros, la curva (log/lin) se muestra pero no bloquea el
  match, porque en la práctica se sustituyen sin problema.

## Pedales incluidos

| Pedal | Tipo | Dificultad |
|---|---|---|
| Bazz Fuss | fuzz | ●○○○○ |
| Electra Distortion | distorsión | ●○○○○ |
| LPB-1 (Electro-Harmonix) | boost | ●○○○○ |
| Rangemaster (Dallas) | boost | ●●○○○ |
| Fuzz Face (Dallas Arbiter) | fuzz | ●●○○○ |
| Distortion+ (MXR) | distorsión | ●●○○○ |
| Tube Screamer TS808 (Ibanez) | overdrive | ●●●○○ |
| RAT (ProCo) | distorsión | ●●●○○ |
| Big Muff Pi (Electro-Harmonix) | fuzz | ●●●○○ |
| Phase 90 (MXR) | modulación | ●●●●○ |
| Klon Centaur | overdrive | ●●●●● |

## ¿De dónde salen las BOM?

Los circuitos de estos pedales clásicos son públicos y están documentados hace
décadas en sitios como [Electrosmash](https://www.electrosmash.com),
[General Guitar Gadgets](https://generalguitargadgets.com),
[Tagboard Effects](https://tagboardeffects.blogspot.com) y
[Fuzz Central](http://fuzzcentral.ssguitar.com). Las listas incluidas acá son
**de referencia**: distintas eras/versiones de un mismo pedal varían en algunos
valores, así que antes de armar conviene verificar contra el esquemático de la
versión elegida.

## Agregar o editar pedales

Todo vive en `js/data.js`. Cada pedal es un objeto con su BOM:

```js
{
  id: "mi-pedal",
  name: "Mi Pedal",
  brand: "Marca",
  kind: "fuzz",
  difficulty: 2,            // 1 a 5
  description: "…",
  circuit: [
    { type: "resistor",   value: "10k",      qty: 3 },
    { type: "capacitor",  value: "47n",      qty: 2 },
    { type: "transistor", value: "2N3904",   qty: 1, note: "cualquier NPN sirve" },
    { type: "pot",        value: "100k log", qty: 1, note: "volumen" },
  ],
}
```

Tipos válidos: `resistor`, `capacitor`, `pot`, `transistor`, `ic`, `diode`,
`led`, `hardware`.

## Estructura del proyecto

```
pedal-builder/
├── index.html          # la app (abrila con el navegador)
├── css/style.css
├── js/
│   ├── matcher.js      # normalización de valores + motor de matching
│   ├── data.js         # base de datos de pedales (BOM)
│   └── app.js          # UI, inventario, localStorage
└── test/
    └── matcher.test.js # tests del motor (node test/matcher.test.js)
```

## Tests

```bash
node test/matcher.test.js
```

## Ideas a futuro

- Modo "flexible" que acepte valores cercanos de la serie E12 (±20%).
- Lista de compras consolidada: qué comprar para completar N pedales.
- Enlaces a esquemático/layout de cada pedal.
- Más pedales: Boss DS-1, Small Clone, Orange Squeezer, tremolos…
