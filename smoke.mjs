// smoke.mjs — node harness for homestead-motoring-card
import fs from "node:fs"; import vm from "node:vm";
const src = fs.readFileSync(new URL("./homestead-motoring-card.js", import.meta.url), "utf8");
class HTMLElement { constructor() { this._sr = null; this.style = {}; this._h = 700; } attachShadow() { this._sr = { innerHTML: "", querySelectorAll: () => [], querySelector: () => null }; return this._sr; } get shadowRoot() { return this._sr; } dispatchEvent() {} getBoundingClientRect() { return { height: this._h }; } }
const defs = {}; const store = new Map();
const localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
const ctx = { HTMLElement, customElements: { define: (n, c) => (defs[n] = c) }, document: { getElementById: () => null, createElement: () => ({}), head: { appendChild() {} } }, console, CustomEvent: class { constructor(t, o) { this.type = t; this.detail = o && o.detail; } }, setInterval: () => 0, clearInterval() {}, setTimeout, Date, localStorage };
ctx.window = ctx; vm.createContext(ctx); vm.runInContext(src, ctx);
const Card = defs["homestead-motoring-card"];
let fails = 0;
const check = (name, cond) => { console.log((cond ? "ok  " : "FAIL") + " " + name); if (!cond) fails++; };
const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const day0 = new Date(); day0.setHours(0, 0, 0, 0);
const dayIso = (off) => new Date(day0.getTime() + off * 86400000).toISOString();
const mi = [91.0, 14.3, 23.8, 46.6, 82.6, 29.1, 30.2, 28.0, 19.1, 93.8, 41.5, 80.4, 29.4, 19.4];
const rows = mi.map((m, i) => ({ start: dayIso(i - 14), change: m })).concat([{ start: dayIso(0), change: 6.2 }]);
const stats = async (m) => (m.type === "recorder/statistics_during_period" ? { "sensor.robbin_odometer": rows } : {});
const done850 = new Date(day0.getTime() + (8 * 60 + 50) * 60000).toISOString();
const S = (v, extra) => ({ state: String(v), attributes: extra || {} });
const base = () => ({
  "sensor.robbin_odometer": S(40266.753), "sensor.robbin_battery_level": S(58.071), "sensor.robbin_battery_range": S(140.83),
  "sensor.robbin_charging": S("charging"), "sensor.robbin_charger_power": S(1.3), "number.robbin_charge_limit": S(80),
  "sensor.robbin_time_to_full_charge": S(done850), "binary_sensor.robbin_charge_cable": S("on"),
  "device_tracker.robbin_location": S("home"), "sensor.robbin_inside_temperature": S(95.72), "sensor.robbin_outside_temperature": S(98.6),
  "lock.robbin_lock": S("unlocked"), "sensor.robbin_sentry_mode": S("idle"),
  "binary_sensor.robbin_front_driver_door": S("off"), "binary_sensor.robbin_front_driver_window": S("off"),
  "sensor.garage_door_position": S(0), "binary_sensor.garage_overhead_door": S("off"),
  "sensor.robbin_tesla_tire_rotation": S("ok", { next_due: null, days_until_due: 10 }),
});
const cfg = () => ({ name: "Robbin", odometer_entity: "sensor.robbin_odometer", battery_entity: "sensor.robbin_battery_level", range_entity: "sensor.robbin_battery_range",
  charging_entity: "sensor.robbin_charging", charger_power_entity: "sensor.robbin_charger_power", charge_limit_entity: "number.robbin_charge_limit",
  charge_done_entity: "sensor.robbin_time_to_full_charge", cable_entity: "binary_sensor.robbin_charge_cable", location_entity: "device_tracker.robbin_location",
  inside_temp_entity: "sensor.robbin_inside_temperature", outside_temp_entity: "sensor.robbin_outside_temperature",
  lock_entity: "lock.robbin_lock", sentry_entity: "sensor.robbin_sentry_mode",
  doors: ["binary_sensor.robbin_front_driver_door"], windows: ["binary_sensor.robbin_front_driver_window"],
  door_position_entity: "sensor.garage_door_position", door_binary_entity: "binary_sensor.garage_overhead_door",
  chores: [{ name: "Tire rotation", entity: "sensor.robbin_tesla_tire_rotation" }],
  plates: { car: { src: "/local/motoring/plate-car.jpg", caption: "Robbin at home." }, empty: { src: "/local/motoring/plate-empty.jpg", caption: "The bay, unoccupied." },
            half: { src: "/local/motoring/plate-half.jpg", caption: "The door, in two minds." }, closed: { src: "/local/motoring/plate-closed.jpg", caption: "The garage, closed for comment." } } });
const make = async (states, c) => { const el = new Card(); el.setConfig(c || cfg()); el.hass = { states, callWS: stats }; await tick(); await tick(); return el; };

check("card registered", typeof Card === "function");
check("setConfig rejects missing odometer_entity", (() => { try { new Card().setConfig({}); return false; } catch (e) { return /odometer_entity/.test(e.message); } })());

{ const el = await make(base()); const h = el.shadowRoot.innerHTML;
  check("kicker default from name", h.includes("THE MOTORING DESK") && h.includes("ROBBIN, HOUSEHOLD MOTOR"));
  check("headline: charging bound for 80 by 8:50", h.includes("Robbin takes on charge: 58 percent, bound for 80 by 8:50 AM"));
  check("dek", h.includes("Battery 58% · range 141 mi · odometer 40,266 mi · cabin 96° · door closed"));
  check("plate: closed while door 0", h.includes('src="/local/motoring/plate-closed.jpg"') && h.includes("The garage, closed for comment."));
  check("tag charging", h.includes('<div class="tv">58%</div>') && h.includes(">CHARGING<"));
  check("lede: charge + cabin + unlocked + sentry", h.includes("It takes on charge at 1.3 kW, bound for 80 percent by 8:50 AM.") && h.includes("The cabin stands at 96, 3 degrees under the yard.") && h.includes("The doors, it must be said, are unlocked.") && h.includes("Sentry is off duty."));
  check("lede: miles vs habit", h.includes("Robbin reported 6 miles by press time, against a fourteen-day habit of 45."));
  check("chart: 14 bars + today, AVG", (h.match(/fill="url\(#hb\)"/g) || []).length === 14 && (h.match(/fill="url\(#ht\)"/g) || []).length === 1 && h.includes("AVG 45") && h.includes("14 days on the road"));
  check("charging row ok + buttoned due", h.includes('class="v ok">1.3 kW toward 80% · done 8:50 AM') && h.includes('class="v due">Unlocked'));
  check("service row: tire rotation not due", h.includes("Tire rotation · due in 10 days") && !/class="v due">Tire/.test(h));
  check("height remembered", store.get("hmc-h:sensor.robbin_odometer") === "700"); }

{ const st = base(); st["sensor.garage_door_position"] = S(100);
  const el = await make(st); const h = el.shadowRoot.innerHTML;
  check("door open + home → car plate, OPEN cell", h.includes('src="/local/motoring/plate-car.jpg"') && h.includes('<div class="cv">OPEN</div>'));
  st["device_tracker.robbin_location"] = S("not_home");
  const el2 = await make(st); const h2 = el2.shadowRoot.innerHTML;
  check("door open + away → empty plate + abroad headline", h2.includes('src="/local/motoring/plate-empty.jpg"') && h2.includes("Robbin is abroad: 6 miles on the day so far, the garage standing open") && h2.includes("OUT ON BUSINESS"));
  check("away lede", h2.includes("The car is out; the house declines to speculate on its business.")); }

{ const st = base(); st["sensor.garage_door_position"] = S(17);
  const el = await make(st); const h = el.shadowRoot.innerHTML;
  check("door 17% → half plate + tag suffix + ajar", h.includes('src="/local/motoring/plate-half.jpg"') && h.includes("CHARGING · DOOR 17%") && h.includes("door ajar") && h.includes('<div class="cv">17%</div>')); }

{ const st = base(); st["sensor.robbin_charging"] = S("disconnected"); st["binary_sensor.robbin_charge_cable"] = S("off");
  const rows0 = rows[rows.length - 1]; const save = rows0.change; rows0.change = 0.3;
  const el = await make(st); const h = el.shadowRoot.innerHTML;
  check("idle, no miles: headline + unplugged row", h.includes("Not a mile turned today: Robbin idles at 58 percent") && h.includes(">Unplugged<"));
  rows0.change = save; }

{ const st = base(); st["sensor.robbin_charging"] = S("complete"); st["sensor.robbin_battery_level"] = S(80.0);
  const el = await make(st); const h = el.shadowRoot.innerHTML;
  check("rests at limit, cable attached", h.includes("Robbin rests at 80 percent, cable still attached") && h.includes("Plugged in · not charging") && h.includes(">PLUGGED IN<")); }

{ const st = base(); st["lock.robbin_lock"] = S("locked"); st["binary_sensor.robbin_front_driver_window"] = S("on");
  const el = await make(st); const h = el.shadowRoot.innerHTML;
  check("window down flagged", h.includes('class="v due">A window down') && h.includes("The doors, it must be said, are a window down."));
  st["binary_sensor.robbin_front_driver_window"] = S("off");
  const el2 = await make(st); const h2 = el2.shadowRoot.innerHTML;
  check("buttoned up ok", h2.includes('class="v ok">Locked, all shut')); }

{ const st = base(); st["sensor.robbin_tesla_tire_rotation"] = S("overdue", { days_until_due: -3 });
  const el = await make(st); const h = el.shadowRoot.innerHTML;
  check("overdue service row + lede", h.includes('class="v due">Tire rotation · overdue 3 days') && h.includes("The tire rotation is owed already.")); }

{ store.delete("hmc-h:sensor.robbin_odometer"); const el = new Card(); el.setConfig(cfg()); el.hass = { states: base(), callWS: () => new Promise(() => {}) };
  check("stats pending: pinned at current height", el.style.minHeight === "700px"); await tick();
  check("stats pending, no memory: no reservation after tick", el.style.minHeight === "");
  store.set("hmc-h:sensor.robbin_odometer", "812");
  const el2 = new Card(); el2.setConfig(cfg()); el2.hass = { states: base(), callWS: () => new Promise(() => {}) }; await tick();
  check("stats pending: reserves remembered height", el2.style.minHeight === "812px"); }

console.log(fails ? `\n${fails} FAILED` : "\nall passed"); process.exit(fails ? 1 : 0);
