#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Generate expected values for app/lib/__tests__/energy-calc.test.ts by running
the ORIGINAL dashboard.py v10 formulas (copied verbatim below) on the real
fixture. Run once and commit the output:

    python3 scripts/gen_energy_expected.py

FORECAST_END is pinned (2026-06-27, same as the v10 script when the fixture
was captured) so results are deterministic; the TS test pins the same date.
"""
import json, datetime, math, os
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
FIXTURES = os.path.join(HERE, "..", "app", "lib", "__tests__", "fixtures")
HISTORY_FILE = os.path.join(FIXTURES, "tuya_history.json")
OUT_FILE = os.path.join(FIXTURES, "expected.json")

CODE = "forward_energy_total"
SCALE = 0.01
THAI_TZ = datetime.timezone(datetime.timedelta(hours=7))
MAX_GAP_MS = 2 * 3600 * 1000
FORECAST_END = datetime.date(2026, 6, 27)  # pinned

USE_MEA_BASELINE = True
MEA_MONTHLY_KWH = 1100.0
FLAT_RATE = 4.91
TOU_ON = 5.81
TOU_OFF = 2.99
TOU_FIXED = 40.90
BLUERING = 699.00
SOLAR_KWH_D = 8.0
WEEKDAYS_MO, WEEKENDS_MO = 22, 8
METER_COST = 3350.00


# ---- verbatim from dashboard.py v10 (dashboard_2.py) ----
def load_points():
    hist = json.load(open(HISTORY_FILE, encoding="utf-8"))
    return sorted(set((int(h["event_time"]), float(h["value"]))
                  for h in hist if h.get("code") == CODE and h.get("value") is not None))


def analyze(pts):
    a = {"night": 0.0, "daytime": 0.0, "evening": 0.0,
         "day0816": 0.0, "on": 0.0, "off": 0.0, "total": 0.0, "skipped": 0.0}
    hourly = defaultdict(float); hour_seen = defaultdict(set)
    wd_hourly = defaultdict(float); wd_hour_seen = defaultdict(set)
    daily = defaultdict(float); day_hours = defaultdict(set)
    daily_on = defaultdict(float); daily_off = defaultdict(float)
    dh = defaultdict(float)
    for i in range(1, len(pts)):
        d = (pts[i][1] - pts[i-1][1]) * SCALE
        if d <= 0: continue
        if pts[i][0] - pts[i-1][0] > MAX_GAP_MS:
            a["skipped"] += d; continue
        dt = datetime.datetime.fromtimestamp(pts[i][0] / 1000, THAI_TZ)
        h, wd, dte = dt.hour, dt.weekday(), dt.date()
        a["total"] += d
        hourly[h] += d; hour_seen[h].add(dte)
        daily[dte] += d; day_hours[dte].add(h)
        dh[(dte, h)] += d
        if wd < 5:
            wd_hourly[h] += d; wd_hour_seen[h].add(dte)
        if 9 <= h < 17:   a["daytime"] += d
        elif 17 <= h < 22: a["evening"] += d
        else:              a["night"] += d
        if 8 <= h < 16:   a["day0816"] += d
        if wd < 5 and 9 <= h < 22:
            a["on"] += d; daily_on[dte] += d
        else:
            a["off"] += d; daily_off[dte] += d
    span_days = (pts[-1][0] - pts[0][0]) / 86400000
    a.update(span_days=span_days, t0=pts[0][0], t1=pts[-1][0], n=len(pts),
             kwh_day=(pts[-1][1] - pts[0][1]) * SCALE / span_days,
             last_meter=pts[-1][1] * SCALE,
             daily=dict(daily), day_hours=day_hours,
             daily_on=dict(daily_on), daily_off=dict(daily_off))
    prof = {h: (hourly[h] / len(hour_seen[h]) if hour_seen[h] else 0.0) for h in range(24)}
    wd_prof = {h: (wd_hourly[h] / len(wd_hour_seen[h]) if wd_hour_seen[h]
                   else prof[h]) for h in range(24)}
    a["prof"], a["wd_prof"], a["dh"] = prof, wd_prof, dict(dh)
    a["daytime_kwh_d"] = sum(prof[h] for h in range(9, 17))
    mins = []
    for dte, hrs_set in day_hours.items():
        if len(hrs_set) >= 23:
            mins.append(min(dh[(dte, h)] for h in hrs_set))
    a["baseload_kw"] = (sum(mins) / len(mins)) if mins else min(
        v for v in prof.values() if v > 0)
    a["evening_kwh_d"] = sum(prof[h] for h in range(17, 22))
    return a


def finance(a):
    f = {}
    pct = lambda k: a[k] / a["total"] if a["total"] else 0.0
    f["on_pct"], f["off_pct"] = pct("on"), pct("off")
    f["night_pct"], f["daytime_pct"], f["evening_pct"] = pct("night"), pct("daytime"), pct("evening")
    f["day0816_pct"] = pct("day0816")
    f["measured_mo"] = a["kwh_day"] * 30
    f["monthly_kwh"] = MEA_MONTHLY_KWH if USE_MEA_BASELINE else f["measured_mo"]
    m = f["monthly_kwh"]
    f["on_kwh"], f["off_kwh"] = m * f["on_pct"], m * f["off_pct"]
    f["cost1"] = m * FLAT_RATE
    f["cost2"] = f["on_kwh"] * TOU_ON + f["off_kwh"] * TOU_OFF + TOU_FIXED
    scale_up = m / f["measured_mo"] if f["measured_mo"] else 1.0
    f["daytime_load_d"] = a["daytime_kwh_d"] * scale_up
    f["usable_d"] = min(SOLAR_KWH_D, f["daytime_load_d"])
    off_on  = min(f["usable_d"] * WEEKDAYS_MO, f["on_kwh"])
    off_off = min(f["usable_d"] * WEEKENDS_MO, f["off_kwh"])
    f["off_on"], f["off_off"] = off_on, off_off
    f["rem_on"], f["rem_off"] = f["on_kwh"] - off_on, f["off_kwh"] - off_off
    f["cost3"] = f["rem_on"] * TOU_ON + f["rem_off"] * TOU_OFF + TOU_FIXED + BLUERING
    f["save_tou"], f["save_solar"] = f["cost1"] - f["cost2"], f["cost2"] - f["cost3"]
    f["be_months"] = METER_COST / f["save_tou"] if f["save_tou"] > 0 else float("inf")
    f["tip_kwh_d"] = BLUERING / (WEEKDAYS_MO * TOU_ON + WEEKENDS_MO * TOU_OFF)
    f["viable"] = f["cost3"] <= f["cost2"]
    f["scale_up"] = scale_up
    return f


def forecast(a):
    daily, hrs = a["daily"], a["day_hours"]
    complete = {d: v for d, v in daily.items() if len(hrs[d]) >= 23}
    wd_days = [v for d, v in complete.items() if d.weekday() < 5]
    we_days = [v for d, v in complete.items() if d.weekday() >= 5]
    wd_avg = sum(wd_days) / len(wd_days) if wd_days else a["kwh_day"]
    we_avg = sum(we_days) / len(we_days) if we_days else wd_avg
    wd_on = sum(a["wd_prof"][h] for h in range(9, 22))

    last_dt = datetime.datetime.fromtimestamp(a["t1"]/1000, THAI_TZ)
    today, last_hour = last_dt.date(), last_dt.hour
    days, total_fc, cost_fc = [], 0.0, 0.0
    d = min(daily)
    while d <= FORECAST_END:
        wd = d.weekday()
        if d < today:
            kwh, kind = daily.get(d, 0.0), "actual"
            on, off = a["daily_on"].get(d, 0.0), a["daily_off"].get(d, 0.0)
            if len(hrs.get(d, set())) < 23: kind = "partial"
        elif d == today:
            rest = sum((a["wd_prof"] if wd < 5 else a["prof"])[h]
                       for h in range(last_hour + 1, 24))
            kwh, kind = daily.get(d, 0.0) + rest, "today"
            on = a["daily_on"].get(d, 0.0) + (sum(a["wd_prof"][h] for h in
                  range(max(last_hour+1, 9), 22)) if wd < 5 else 0.0)
            off = kwh - on
            total_fc += rest
        else:
            kwh, kind = (wd_avg, "fc") if wd < 5 else (we_avg, "fc")
            on = wd_on if wd < 5 else 0.0
            on = min(on, kwh); off = kwh - on
            total_fc += kwh
        cost_fc += on * TOU_ON + off * TOU_OFF
        days.append({"date": d, "kwh": kwh, "kind": kind, "weekend": wd >= 5,
                     "on": on, "off": off})
        d += datetime.timedelta(days=1)
    n_days = len(days)
    return {"days": days, "wd_avg": wd_avg, "we_avg": we_avg,
            "total_kwh": sum(x["kwh"] for x in days),
            "future_kwh": total_fc,
            "meter_end": a["last_meter"] + total_fc,
            "tou_cost": cost_fc + TOU_FIXED * (n_days / 30),
            "flat_cost": sum(x["kwh"] for x in days) * FLAT_RATE,
            "n_days": n_days}


def savings_track(f, fc):
    scale_up = f["monthly_kwh"] / f["measured_mo"] if f["measured_mo"] else 1.0
    cum, series = 0.0, []
    for x in fc["days"]:
        flat_d = x["kwh"] * FLAT_RATE
        tou_energy_d = x["on"] * TOU_ON + x["off"] * TOU_OFF
        save_d = max((flat_d - tou_energy_d) * scale_up - TOU_FIXED / 30, 0.0)
        cum += save_d
        series.append({"date": x["date"], "cum": cum, "kind": x["kind"]})
    avg_d = cum / len(series) if series else 0.0
    days_to_be = METER_COST / avg_d if avg_d > 0 else float("inf")
    be_date = (series[0]["date"] + datetime.timedelta(days=days_to_be)
               if avg_d > 0 else None)
    return {"series": series, "cum_end": cum, "avg_d": avg_d,
            "pct": min(cum / METER_COST * 100, 100.0), "be_date": be_date,
            "scale_up": scale_up}


def solar_curve():
    shape = [max(math.sin(math.pi * (h + 0.5 - 6.5) / 11.0), 0.0)
             if 6.5 <= h + 0.5 <= 17.5 else 0.0 for h in range(24)]
    s = sum(shape)
    return [x / s * SOLAR_KWH_D for x in shape]
# ---- end verbatim ----


def iso(d): return d.isoformat()


def main():
    pts = load_points()
    a = analyze(pts)
    f = finance(a)
    fc = forecast(a)
    sv = savings_track(f, fc)
    out = {
        "n_points": len(pts),
        "analysis": {
            "night": a["night"], "daytime": a["daytime"], "evening": a["evening"],
            "day0816": a["day0816"], "on": a["on"], "off": a["off"],
            "total": a["total"], "skipped": a["skipped"],
            "span_days": a["span_days"], "kwh_day": a["kwh_day"],
            "last_meter": a["last_meter"], "t0": a["t0"], "t1": a["t1"], "n": a["n"],
            "prof": [a["prof"][h] for h in range(24)],
            "wd_prof": [a["wd_prof"][h] for h in range(24)],
            "daytime_kwh_d": a["daytime_kwh_d"],
            "baseload_kw": a["baseload_kw"],
            "evening_kwh_d": a["evening_kwh_d"],
            "daily": {iso(d): v for d, v in a["daily"].items()},
            "daily_on": {iso(d): v for d, v in a["daily_on"].items()},
            "daily_off": {iso(d): v for d, v in a["daily_off"].items()},
            "day_hours": {iso(d): sorted(hs) for d, hs in a["day_hours"].items()},
            "dh": {f"{iso(d)}|{h}": v for (d, h), v in a["dh"].items()},
        },
        "finance": {k: (None if isinstance(v, float) and math.isinf(v) else v)
                    for k, v in f.items()},
        "forecast": {
            "wd_avg": fc["wd_avg"], "we_avg": fc["we_avg"],
            "total_kwh": fc["total_kwh"], "future_kwh": fc["future_kwh"],
            "meter_end": fc["meter_end"], "tou_cost": fc["tou_cost"],
            "flat_cost": fc["flat_cost"], "n_days": fc["n_days"],
            "forecast_end": iso(FORECAST_END),
            "days": [{"date": iso(x["date"]), "kwh": x["kwh"], "kind": x["kind"],
                      "weekend": x["weekend"], "on": x["on"], "off": x["off"]}
                     for x in fc["days"]],
        },
        "savings": {
            "cum_end": sv["cum_end"], "avg_d": sv["avg_d"], "pct": sv["pct"],
            "be_date": iso(sv["be_date"]) if sv["be_date"] else None,
            "scale_up": sv["scale_up"],
            "series": [{"date": iso(s["date"]), "cum": s["cum"], "kind": s["kind"]}
                       for s in sv["series"]],
        },
        "solar_curve": solar_curve(),
    }
    with open(OUT_FILE, "w", encoding="utf-8") as fp:
        json.dump(out, fp, ensure_ascii=False, indent=1)
    print(f"wrote {OUT_FILE}: {len(pts)} pts, viable={f['viable']}, "
          f"S1={f['cost1']:.2f} S2={f['cost2']:.2f} S3={f['cost3']:.2f}")


if __name__ == "__main__":
    main()
