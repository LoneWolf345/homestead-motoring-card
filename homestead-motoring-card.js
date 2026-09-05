/* homestead-motoring-card — "The Motoring Desk" for a newsprint Home Assistant dashboard:
 * a woodcut plate of the garage front whose door and car match reality (closed / ajar /
 * open with the car / open and empty), a state-driven headline and drop-cap lede, a hatched
 * 14-day miles-per-day chart from recorder statistics, a five-cell strip and the service-desk
 * rows. Read-only: tap → more-info. Companion to almanac-weather-card / network-ledger-card /
 * homestead-classifieds-card / homestead-waterworks-card / homestead-pool-card. */
const HMC_VERSION = "2026.9.1";
const INK = "#3a2d1f", PAPER = "#f3e7d3", TAN = "#a3876a", BROWN = "#7a6248",
  TERRA = "#c65f38", BLUE = "#5f7e94", DOT = "#cfb894", GREEN = "#2f7f6f";
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY3 = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const bad = (s) => s == null || s === "" || s === "unknown" || s === "unavailable";
const num = (s) => { const v = parseFloat(s); return isNaN(v) ? null : v; };
const r0 = (v) => (v == null ? null : Math.round(v));
const fmt = (v, d = 0) => (v == null ? "—" : v.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d }));
const pad2 = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const clock = (d) => (d ? `${d.getHours() % 12 || 12}:${pad2(d.getMinutes())} ${d.getHours() >= 12 ? "PM" : "AM"}` : "—");

class HomesteadMotoringCard extends HTMLElement {
  static getStubConfig() { return { name: "Robbin", odometer_entity: "sensor.robbin_odometer", battery_entity: "sensor.robbin_battery_level" }; }

  setConfig(config) {
    if (!config || !config.odometer_entity) throw new Error("homestead-motoring-card: set odometer_entity (total_increasing miles)");
    const c = Object.assign({
      title: "THE MOTORING DESK", name: "Robbin", kicker: "", days: 14,
      battery_entity: "", range_entity: "", charging_entity: "", charger_power_entity: "", charge_limit_entity: "",
      charge_done_entity: "", cable_entity: "", location_entity: "", inside_temp_entity: "", outside_temp_entity: "",
      lock_entity: "", sentry_entity: "", doors: [], windows: [],
      door_position_entity: "", door_binary_entity: "",
      chores: [], plates: {}, plate_number: "III", plate_credit: "Engraving after a photograph", tag_position: "br",
      column_rule: false,
      footer: "Compiled from telemetry the car files voluntarily. Mileage figures are the odometer's own account.",
    }, config);
    const pl = {};
    for (const k of ["car", "empty", "half", "closed"]) { const p = (config.plates || {})[k]; if (p) pl[k] = typeof p === "string" ? { src: p, caption: "" } : { src: p.src || "", caption: p.caption || "" }; }
    c.plates = pl;
    this._cfg = c;
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    this._sig = null; this._stats = null; this._statsAt = 0; this._statsDay = "";
    if (this._fontsReady === undefined) {
      const fonts = typeof document !== "undefined" && document.fonts;
      this._fontsReady = !fonts;
      if (fonts) Promise.race([fonts.ready, new Promise((r) => setTimeout(r, 3000))]).then(() => { this._fontsReady = true; this._sig = null; this._render(); });
    }
    this._render();
  }
  set hass(hass) { this._hass = hass; this._maybeFetchStats(); this._render(); }
  getCardSize() { return 9; }
  connectedCallback() { this._tick = setInterval(() => this._render(), 60000); }
  disconnectedCallback() { clearInterval(this._tick); }

  // ---------- data ----------
  _st(id) { const s = id && this._hass && this._hass.states[id]; return s && !bad(s.state) ? s : null; }
  _val(id) { const s = this._st(id); return s ? num(s.state) : null; }
  async _maybeFetchStats() {
    const day = ymd(new Date());
    if (this._fetching || !this._hass || !this._hass.callWS || (Date.now() - this._statsAt < 30 * 60000 && this._statsDay === day)) return;
    this._fetching = true;
    try {
      const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - this._cfg.days);
      const r = await this._hass.callWS({ type: "recorder/statistics_during_period", start_time: start.toISOString(), statistic_ids: [this._cfg.odometer_entity], period: "day", types: ["change"] });
      const rows = (r && r[this._cfg.odometer_entity]) || [];
      this._stats = rows.map((x) => ({ day: ymd(new Date(x.start)), mi: x.change == null ? null : Math.max(0, x.change) })).filter((x) => x.mi != null);
      this._statsAt = Date.now(); this._statsDay = day; this._sig = null; this._render();
    } catch (e) { /* keep the last rows */ }
    finally { this._fetching = false; }
  }
  _series() {
    const today = ymd(new Date());
    const past = (this._stats || []).filter((x) => x.day !== today).slice(-this._cfg.days);
    const cur = (this._stats || []).find((x) => x.day === today) || null;
    const avg = past.length ? past.reduce((a, x) => a + x.mi, 0) / past.length : null;
    return { past, avg, today: cur ? cur.mi : this._stats ? 0 : null };
  }
  _situation() {
    const c = this._cfg;
    const loc = this._st(c.location_entity);
    const home = !loc || loc.state === "home";
    const charging = !!this._st(c.charging_entity) && this._st(c.charging_entity).state === "charging";
    const cable = !!this._st(c.cable_entity) && this._st(c.cable_entity).state === "on";
    const doneS = this._st(c.charge_done_entity);
    const done = charging && doneS ? new Date(doneS.state) : null;
    return { home, charging, cable, done: done && !isNaN(done) ? done : null };
  }
  _door() {
    const p = this._val(this._cfg.door_position_entity);
    if (p != null) return { p: Math.round(p), word: p <= 0 ? "closed" : p >= 95 ? "open" : p < 25 ? "ajar" : `${Math.round(p)}% open`, cell: p <= 0 ? "CLOSED" : p >= 95 ? "OPEN" : Math.round(p) + "%" };
    const b = this._st(this._cfg.door_binary_entity);
    if (b) return b.state === "on" ? { p: 100, word: "open", cell: "OPEN" } : { p: 0, word: "closed", cell: "CLOSED" };
    return { p: null, word: "", cell: "—" };
  }
  _buttoned() {
    const c = this._cfg, issues = [];
    const lock = this._st(c.lock_entity);
    if (lock && lock.state !== "locked") issues.push("unlocked");
    const doorsOpen = (c.doors || []).filter((id) => { const s = this._st(id); return s && s.state === "on"; }).length;
    if (doorsOpen) issues.push(doorsOpen === 1 ? "a door open" : `${doorsOpen} doors open`);
    const winOpen = (c.windows || []).filter((id) => { const s = this._st(id); return s && s.state === "on"; }).length;
    if (winOpen) issues.push(winOpen === 1 ? "a window down" : `${winOpen} windows down`);
    const known = !!lock || (c.doors || []).length > 0;
    return { issues, known, row: issues.length ? issues.map((s) => s[0].toUpperCase() + s.slice(1)).join(" · ") : known ? "Locked, all shut" : "—" };
  }
  _upkeep(now) {
    let best = null;
    for (const ch of this._cfg.chores || []) {
      const s = this._st(ch.entity); if (!s) continue;
      const a = s.attributes || {};
      let days = num(a.days_until_due);
      if (days == null && a.next_due) { const d = new Date(a.next_due + "T00:00:00"); days = Math.round((d - new Date(ymd(now) + "T00:00:00")) / 86400000); }
      if (days == null) continue;
      const item = { name: ch.name || ch.entity, entity: ch.entity, days, due: s.state === "due_soon" || s.state === "overdue" || days <= 0, next: a.next_due };
      if (!best || item.days < best.days) best = item;
    }
    if (!best) return null;
    const d = best.days, dow = best.next ? new Date(best.next + "T00:00:00").getDay() : null;
    const when = d < 0 ? `overdue ${-d} day${-d === 1 ? "" : "s"}` : d === 0 ? "due today" : d === 1 ? "due tomorrow" : `due ${dow != null ? DAY3[dow] : "in " + d + " days"}${dow != null ? ` (${d} days)` : ""}`;
    return Object.assign(best, { row: `${best.name} · ${when}`, lede: best.due ? `The ${best.name.toLowerCase()} is owed${d < 0 ? " already" : d === 0 ? " today" : dow != null ? " by " + DAYS[dow] : ""}. ` : "" });
  }
  _plateMode(sit, door) {
    const p = door.p == null ? 0 : door.p;
    const mode = p >= 60 ? (sit.home ? "car" : "empty") : p > 0 ? "half" : "closed";
    const pl = this._cfg.plates[mode] || this._cfg.plates.closed || this._cfg.plates.car || null;
    return { mode, plate: pl };
  }

  // ---------- render ----------
  _render() {
    if (!this._cfg || !this._hass) return;
    const loaded = !!this._fontsReady && this._stats !== null;
    const reserve = loaded ? 0 : this._reserve();
    this.style.minHeight = reserve ? reserve + "px" : "";
    let out;
    try { out = this._article(); }
    catch (e) { out = { sig: "err:" + e.message, html: `<div style="padding:12px;color:#b00;font-family:sans-serif">${esc(e.message)}</div>` }; }
    if (out.sig === this._sig) return;
    this._sig = out.sig;
    this._pin();
    this.shadowRoot.innerHTML = out.html;
    this.shadowRoot.querySelectorAll("[data-entity]").forEach((el) => el.addEventListener("click", (ev) => { ev.stopPropagation(); this._more(el.dataset.entity); }));
    this._unpin(reserve);
    if (loaded) setTimeout(() => this._remember(), 60);
  }
  _more(id) { if (id) this.dispatchEvent(new CustomEvent("hass-more-info", { bubbles: true, composed: true, detail: { entityId: id } })); }

  _article() {
    const c = this._cfg, now = new Date(), name = c.name;
    const s = this._series();
    const bat = this._val(c.battery_entity), range = this._val(c.range_entity), odo = this._val(c.odometer_entity);
    const limit = this._val(c.charge_limit_entity), power = this._val(c.charger_power_entity);
    const cabin = this._val(c.inside_temp_entity), yard = this._val(c.outside_temp_entity);
    const sit = this._situation(), door = this._door(), btn = this._buttoned(), up = this._upkeep(now);
    const sentry = this._st(c.sentry_entity);
    const sentryOn = !!sentry && !["idle", "off"].includes(sentry.state);
    const pm = this._plateMode(sit, door);
    const batTxt = bat == null ? "—" : r0(bat);
    const miToday = s.today;

    // headline
    let head;
    if (!sit.home) head = `${name} is abroad: ${miToday == null ? "the odometer will testify later" : fmt(miToday) + " miles on the day so far"}, the garage ${door.p == null ? "silent" : door.p > 0 ? "standing open" : "shut behind it"}`;
    else if (sit.charging) head = `${name} takes on charge: ${batTxt} percent${limit != null ? `, bound for ${r0(limit)}` : ""}${sit.done ? ` by ${clock(sit.done)}` : ""}`;
    else if (sit.cable && limit != null && bat != null && bat >= limit - 1) head = `${name} rests at ${batTxt} percent, cable still attached`;
    else if (miToday != null && miToday < 1) head = `Not a mile turned today: ${name} idles at ${batTxt} percent`;
    else head = `All quiet in the garage: ${name} at ${batTxt} percent after ${fmt(miToday)} miles`;

    const dek = `Battery ${bat == null ? "—" : r0(bat) + "%"} · range ${range == null ? "—" : fmt(r0(range))} mi · odometer ${odo == null ? "—" : fmt(Math.floor(odo))} mi · cabin ${cabin == null ? "—" : r0(cabin) + "°"} · door ${door.word || "—"}`;

    // lede
    let lede = `${name} reported ${miToday == null ? "no mileage" : miToday < 1 ? "no miles" : fmt(miToday) + " mile" + (r0(miToday) === 1 ? "" : "s")} by press time${s.avg != null ? `, against a fourteen-day habit of ${fmt(s.avg)}` : ""}. `;
    if (!sit.home) lede += "The car is out; the house declines to speculate on its business. ";
    else if (sit.charging) lede += `It takes on charge at ${power == null ? "the wall's pleasure" : fmt(power, 1) + " kW"}${limit != null ? `, bound for ${r0(limit)} percent` : ""}${sit.done ? ` by ${clock(sit.done)}` : ""}. `;
    else if (sit.cable) lede += "The cable is attached, mostly out of habit. ";
    if (cabin != null && yard != null) { const d = r0(cabin - yard); lede += `The cabin stands at ${r0(cabin)}, ${d === 0 ? "level with the yard" : Math.abs(d) + " degree" + (Math.abs(d) === 1 ? "" : "s") + (d > 0 ? " over" : " under") + " the yard"}. `; }
    if (btn.issues.length) lede += `The doors, it must be said, are ${btn.issues.join(" and ")}. `;
    if (up && up.lede) lede += up.lede;
    lede += sentryOn ? "Sentry watches the driveway." : "Sentry is off duty.";

    // plate
    let plate = "";
    if (pm.plate && pm.plate.src) {
      const pos = ["br", "bl", "tr", "tl"].includes(c.tag_position) ? c.tag_position : "br";
      let tl = !sit.home ? "OUT ON BUSINESS" : sit.charging ? "CHARGING" : sit.cable ? "PLUGGED IN" : "PARKED";
      if (pm.mode === "half") tl += ` · DOOR ${door.p}%`;
      plate = `<div class="fig" data-entity="${esc(c.battery_entity || c.odometer_entity)}"><img src="${esc(pm.plate.src)}" alt=""><div class="tag ${pos}"><div class="tv">${bat == null ? "—" : r0(bat) + "%"}</div><div class="tl">${esc(tl)}</div></div></div>
      <div class="plate"><span><b>PLATE ${esc(c.plate_number)}.</b> <i>${esc(pm.plate.caption || "")}</i></span><span class="r"><i>${esc(c.plate_credit)}</i></span></div>`;
    }

    // chart — miles per day
    const bars = s.past.map((x) => ({ label: String(parseInt(x.day.slice(8), 10)), mi: x.mi, today: false }));
    if (miToday != null) bars.push({ label: "TODAY", mi: miToday, today: true });
    let chart = "";
    if (bars.length > 1) {
      const W = 456, H = 112, base = 92.5, top = 4, n = bars.length, slot = (W - 8) / n, bw = Math.min(22, slot - 8);
      const max = Math.max(...bars.map((b) => b.mi), s.avg || 0, 1);
      const y = (g) => base - (g / max) * (base - top);
      const rects = bars.map((b, i) => { const x = 4 + i * slot + (slot - bw) / 2; const yy = y(b.mi); return `<rect x="${x.toFixed(1)}" y="${yy.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1.5, base - yy).toFixed(1)}" fill="url(#${b.today ? "ht" : "hb"})" stroke="${b.today ? TERRA : INK}" stroke-width="1"/>`; }).join("");
      const labels = bars.map((b, i) => `<text x="${(4 + i * slot + slot / 2).toFixed(1)}" y="104" text-anchor="middle" font-family="Archivo, sans-serif" font-size="7.5" font-weight="700" fill="${b.today ? TERRA : BROWN}">${b.label}</text>`).join("");
      const avgLine = s.avg != null ? `<line x1="4" y1="${y(s.avg).toFixed(1)}" x2="${W - 4}" y2="${y(s.avg).toFixed(1)}" stroke="${BROWN}" stroke-width="1" stroke-dasharray="3 3"/><text x="${W - 4}" y="${(y(s.avg) - 3).toFixed(1)}" text-anchor="end" font-family="Archivo, sans-serif" font-size="7.5" font-weight="700" fill="${BROWN}" letter-spacing="1">AVG</text>` : "";
      chart = `<div class="sub"><span class="subn">${s.past.length} days on the road</span><span class="subr">MILES PER DAY${s.avg != null ? " · AVG " + fmt(s.avg) : ""}</span></div>
      <svg class="chart" viewBox="0 0 ${W} ${H}" data-entity="${esc(c.odometer_entity)}">
        <defs><pattern id="hb" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="4" stroke="${INK}" stroke-width="1.5"/></pattern>
        <pattern id="ht" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="4" stroke="${TERRA}" stroke-width="2.2"/></pattern></defs>
        ${rects}${avgLine}<line x1="4" y1="${base}" x2="${W - 4}" y2="${base}" stroke="${INK}" stroke-width="1"/>${labels}</svg>`;
    }

    // strip
    const strip = `<div class="strip">
      <div class="cell" data-entity="${esc(c.battery_entity)}"><div class="cv">${bat == null ? "—" : r0(bat) + "%"}</div><div class="cl">BATTERY</div></div>
      <div class="cell" data-entity="${esc(c.range_entity)}"><div class="cv">${range == null ? "—" : fmt(r0(range))}</div><div class="cl">RANGE · MI</div></div>
      <div class="cell" data-entity="${esc(c.odometer_entity)}"><div class="cv">${miToday == null ? "—" : fmt(miToday)}</div><div class="cl">TODAY · MI</div></div>
      <div class="cell" data-entity="${esc(c.inside_temp_entity)}"><div class="cv">${cabin == null ? "—" : r0(cabin) + "°"}</div><div class="cl">CABIN</div></div>
      <div class="cell" data-entity="${esc(c.door_position_entity || c.door_binary_entity)}"><div class="cv">${door.cell}</div><div class="cl">GARAGE DOOR</div></div></div>`;

    // service desk
    const lateOpen = door.p > 0 && (now.getHours() >= 22 || now.getHours() < 6);
    const chargeRow = sit.charging ? `${power == null ? "Charging" : fmt(power, 1) + " kW"}${limit != null ? ` toward ${r0(limit)}%` : ""}${sit.done ? ` · done ${clock(sit.done)}` : ""}`
      : sit.cable ? "Plugged in · not charging" : "Unplugged";
    const rows = [
      { k: "Charging", v: chargeRow, cls: sit.charging ? "ok" : "", e: c.charging_entity || c.cable_entity },
      { k: "Garage door", v: door.p == null ? "—" : door.word[0].toUpperCase() + door.word.slice(1), cls: lateOpen ? "due" : "", e: c.door_position_entity || c.door_binary_entity },
      { k: "Buttoned up", v: btn.row, cls: btn.issues.length ? "due" : btn.known ? "ok" : "", e: c.lock_entity },
      c.sentry_entity ? { k: "Sentry", v: sentryOn ? "On watch" : "Off duty", cls: sentryOn ? "ok" : "", e: c.sentry_entity } : null,
      up ? { k: "Service", v: up.row, cls: up.due ? "due" : "", e: up.entity } : null,
    ].filter(Boolean);
    const desk = `<div class="sub"><span class="subn">From the service desk</span><span class="subr">NO APPOINTMENT NECESSARY, NONE OFFERED</span></div>
      ${rows.map((r) => `<div class="row" data-entity="${esc(r.e || "")}"><span class="k">${esc(r.k)}</span><span class="v${r.cls ? " " + r.cls : ""}">${esc(r.v)}</span></div>`).join("")}`;

    const body = `<div class="sect"><span>${esc(c.title)}</span><span class="sectr">${esc(c.kicker || name.toUpperCase() + ", HOUSEHOLD MOTOR")}</span></div>
      <h2 class="hed" data-entity="${esc(c.battery_entity || c.odometer_entity)}">${esc(head)}</h2>
      <div class="dek">${esc(dek)}</div>
      ${plate}
      <p class="lede">${esc(lede)}</p>
      ${chart}${strip}${desk}
      ${c.footer ? `<div class="foot">${esc(c.footer)}</div>` : ""}`;
    return { sig: body, html: `<style>${this._css()}</style><div class="wrap"><div class="card">${body}</div></div>` };
  }

  // ---------- scroll-jump guards (see homestead-classifieds-card) ----------
  _pin() { try { const h = Math.round(this.getBoundingClientRect().height); if (h > 0) this.style.minHeight = Math.max(h, parseFloat(this.style.minHeight) || 0) + "px"; } catch (e) { /* not in a document */ } }
  _unpin(reserve) { setTimeout(() => { this.style.minHeight = reserve ? reserve + "px" : ""; }, 0); }
  _hkey() { return "hmc-h:" + this._cfg.odometer_entity; }
  _reserve() { try { const v = parseInt(localStorage.getItem(this._hkey()), 10); return v > 40 ? v : 0; } catch (e) { return 0; } }
  _remember() { try { const h = Math.round(this.getBoundingClientRect().height); if (h > 40) localStorage.setItem(this._hkey(), String(h)); } catch (e) { /* storage unavailable */ } }

  _css() {
    const c = this._cfg;
    return `
  :host { display: block; }
  * { box-sizing: border-box; }
  .wrap { container-type: inline-size; position: relative; }
  .wrap::before { content: ""; position: absolute; top: 0; bottom: 0; left: calc(-1 * var(--almanac-gutter, 16px)); width: 1px; background: ${c.column_rule ? "var(--almanac-column-rule, #2b2118)" : "transparent"}; }
  .card { --px: max(0.5px, 0.1923cqw); background: var(--almanac-paper, ${PAPER}); color: ${INK}; border-radius: var(--ha-card-border-radius, 14px); box-shadow: var(--ha-card-box-shadow, 0 4px 16px rgba(0,0,0,.18)); overflow: hidden; font-family: Archivo, 'Segoe UI', sans-serif; padding: calc(22*var(--px)) calc(32*var(--px)) calc(20*var(--px)); }
  .sect { display: flex; justify-content: space-between; align-items: baseline; font-size: max(8px, calc(10*var(--px))); font-weight: 700; letter-spacing: calc(3*var(--px)); color: ${TAN}; border-bottom: 1.5px solid ${INK}; padding-bottom: calc(5*var(--px)); }
  .sectr { letter-spacing: calc(1*var(--px)); }
  .hed { font-family: Fraunces, Georgia, serif; font-size: max(15px, calc(21*var(--px))); font-weight: 700; line-height: 1.15; margin: calc(12*var(--px)) 0 calc(4*var(--px)); text-wrap: balance; cursor: pointer; }
  .dek { font-family: Fraunces, Georgia, serif; font-style: italic; font-size: max(10px, calc(12.5*var(--px))); color: ${BROWN}; margin-bottom: calc(10*var(--px)); }
  .fig { position: relative; width: 100%; aspect-ratio: 456 / 194; overflow: hidden; cursor: pointer; }
  .fig img { display: block; width: 100%; height: 100%; object-fit: cover; mix-blend-mode: multiply; }
  .tag { position: absolute; background: #f6efdc; border: 1.5px solid ${INK}; box-shadow: 0 0 0 3px #f6efdc; padding: calc(4*var(--px)) calc(9*var(--px)) calc(5*var(--px)); text-align: center; transform: rotate(-1.5deg); }
  .tag.br { right: calc(12*var(--px)); bottom: calc(12*var(--px)); } .tag.bl { left: calc(12*var(--px)); bottom: calc(12*var(--px)); } .tag.tr { right: calc(12*var(--px)); top: calc(12*var(--px)); } .tag.tl { left: calc(12*var(--px)); top: calc(12*var(--px)); }
  .tv { font-family: Fraunces, Georgia, serif; font-weight: 900; font-size: max(12px, calc(16*var(--px))); line-height: 1; }
  .tl { font-size: max(6px, calc(6.5*var(--px))); font-weight: 700; letter-spacing: calc(1.2*var(--px)); color: ${BROWN}; margin-top: 3px; border-top: 1px solid ${DOT}; padding-top: 3px; white-space: nowrap; }
  .plate { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; margin-top: calc(6*var(--px)); font-family: Fraunces, Georgia, serif; font-size: max(8px, calc(10*var(--px))); color: ${BROWN}; }
  .plate b { font-weight: 700; letter-spacing: 1.5px; font-family: Archivo, sans-serif; font-size: max(7px, calc(8*var(--px))); color: ${TAN}; }
  .plate i { font-style: italic; } .plate .r { white-space: nowrap; }
  .lede { font-family: Fraunces, Georgia, serif; font-size: max(10px, calc(12.5*var(--px))); line-height: 1.45; margin: calc(10*var(--px)) 0 0; }
  .lede::first-letter { font-size: 2.7em; font-weight: 900; float: left; line-height: .82; padding: 4px 6px 0 0; }
  .sub { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; column-gap: calc(12*var(--px)); row-gap: 2px; margin-top: calc(14*var(--px)); padding-bottom: 3px; border-bottom: 1px solid ${INK}; }
  .subn { font-family: Fraunces, Georgia, serif; font-size: max(10px, calc(12.5*var(--px))); font-weight: 700; letter-spacing: 1px; text-transform: uppercase; }
  .subr { font-size: max(7px, calc(9*var(--px))); font-weight: 700; letter-spacing: 1.5px; color: ${TAN}; }
  .chart { display: block; width: 100%; margin-top: calc(8*var(--px)); cursor: pointer; }
  .strip { margin-top: calc(12*var(--px)); border-top: 1.5px solid ${INK}; border-bottom: 1.5px solid ${INK}; display: grid; grid-template-columns: repeat(5, 1fr); text-align: center; padding: calc(8*var(--px)) 0; }
  .cell { cursor: pointer; } .cell + .cell { border-left: 1px dotted ${DOT}; }
  .cv { font-family: Fraunces, Georgia, serif; font-size: max(11px, calc(16*var(--px))); font-weight: 700; white-space: nowrap; }
  .cl { font-size: max(7px, calc(8.5*var(--px))); font-weight: 700; letter-spacing: calc(1.5*var(--px)); color: ${TAN}; margin-top: 2px; white-space: nowrap; }
  .row { display: flex; justify-content: space-between; align-items: baseline; gap: calc(10*var(--px)); padding: calc(6*var(--px)) 0; border-bottom: 1px dotted ${DOT}; cursor: pointer; }
  .row:last-child { border-bottom: none; }
  .k { font-size: max(9px, calc(11.5*var(--px))); color: ${BROWN}; white-space: nowrap; }
  .v { font-family: Fraunces, Georgia, serif; font-size: max(10px, calc(13*var(--px))); font-weight: 600; text-align: right; } .v.due { color: ${TERRA}; } .v.ok { color: ${GREEN}; }
  .foot { font-size: max(7px, calc(9*var(--px))); letter-spacing: .3px; color: ${TAN}; margin-top: calc(12*var(--px)); line-height: 1.5; }`;
  }
}

if (!document.getElementById("hwc-font") && !document.getElementById("hpc-font") && !document.getElementById("hmc-font")) {
  const l = document.createElement("link");
  l.id = "hmc-font"; l.rel = "stylesheet";
  l.href = "https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;0,9..144,700;0,9..144,900;1,9..144,400&family=Archivo:wght@400;600;700&display=swap";
  document.head.appendChild(l);
}
customElements.define("homestead-motoring-card", HomesteadMotoringCard);
console.info(`%c HOMESTEAD-MOTORING-CARD %c ${HMC_VERSION} `, "background:#3a2d1f;color:#f3e7d3;font-weight:700", "background:#c65f38;color:#fff;font-weight:700");
window.customCards = window.customCards || [];
window.customCards.push({ type: "homestead-motoring-card", name: "Homestead Motoring Card", description: "A newsprint motoring article: woodcut garage plate that mirrors the door and the car, state-driven headline, hatched miles-per-day chart and the service desk.", preview: true, documentationURL: "https://github.com/LoneWolf345/homestead-motoring-card" });
