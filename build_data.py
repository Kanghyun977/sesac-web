"""
build_data.py — CSV(seoul-apt-latest.csv) -> data/dashboard.json

Python standard library only (csv, json, statistics, collections, pathlib).
Aggregates Seoul apartment 매매(sale) transactions at build time so the
static frontend only needs to fetch a small pre-aggregated JSON file.

See PRD.md sections 2, 2.2, 5.3 for the rules this script implements.
"""

import csv
import json
import statistics
from collections import defaultdict
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
CSV_PATH = BASE_DIR / "seoul-apt-latest.csv"
OUT_PATH = BASE_DIR / "data" / "dashboard.json"
OUT_JS_PATH = BASE_DIR / "data" / "dashboard.js"

TARGET_GU = "강북구"

# H1 / H2 window as defined by the PRD (2025-07~2025-12 vs 2026-01~2026-06)
H1_MONTHS = {f"2025-{m:02d}" for m in range(7, 13)}
H2_MONTHS = {f"2026-{m:02d}" for m in range(1, 7)}


def area_band(area_m2: float) -> str:
    """Bucket area_m2 into 소형/중형/대형 per PRD §5.3 boundaries."""
    if area_m2 < 60:
        return "소형"
    elif area_m2 < 85:
        return "중형"
    else:
        return "대형"


AREA_BAND_LABELS = {
    "소형": "소형(~60㎡)",
    "중형": "중형(60~85㎡)",
    "대형": "대형(85~㎡)",
}


def read_rows():
    """Read CSV and yield only 매매 (sale) rows with parsed numeric fields."""
    with open(CSV_PATH, encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row.get("deal_type") != "매매":
                continue
            # Defensive guards: price / price_per_pyeong should never be
            # empty for 매매 rows, but guard anyway per task instructions.
            price_raw = row.get("price")
            ppp_raw = row.get("price_per_pyeong")
            area_raw = row.get("area_m2")
            if not price_raw or not ppp_raw or not area_raw:
                continue
            try:
                price = int(price_raw)
                ppp = int(ppp_raw)
                area = float(area_raw)
            except ValueError:
                continue
            yield {
                "ym": row.get("contract_ym"),
                "gu": row.get("gu"),
                "dong": row.get("dong"),
                "complex": row.get("complex"),
                "area_m2": area,
                "price": price,
                "ppp": ppp,
            }


def median(values):
    return statistics.median(values)


def pct_change(old, new):
    if old == 0:
        return None
    return round((new - old) / old * 100, 2)


def main():
    rows = list(read_rows())

    gb_rows = [r for r in rows if r["gu"] == TARGET_GU]

    # ---------- guRanking: median ppp per gu, all 25 gu ----------
    ppp_by_gu = defaultdict(list)
    for r in rows:
        ppp_by_gu[r["gu"]].append(r["ppp"])

    gu_ranking = [
        {"gu": gu, "medianPpp": round(median(vals)), "n": len(vals)}
        for gu, vals in ppp_by_gu.items()
    ]
    gu_ranking.sort(key=lambda x: x["medianPpp"], reverse=True)

    pp_total = len(gu_ranking)
    gb_median_ppp = next(g["medianPpp"] for g in gu_ranking if g["gu"] == TARGET_GU)
    pp_rank = next(i + 1 for i, g in enumerate(gu_ranking) if g["gu"] == TARGET_GU)

    # ---------- changePct / changeRank: H1 -> H2 median ppp change per gu ----------
    h1_ppp_by_gu = defaultdict(list)
    h2_ppp_by_gu = defaultdict(list)
    for r in rows:
        if r["ym"] in H1_MONTHS:
            h1_ppp_by_gu[r["gu"]].append(r["ppp"])
        elif r["ym"] in H2_MONTHS:
            h2_ppp_by_gu[r["gu"]].append(r["ppp"])

    change_by_gu = {}
    for gu in ppp_by_gu:
        h1_vals = h1_ppp_by_gu.get(gu, [])
        h2_vals = h2_ppp_by_gu.get(gu, [])
        if not h1_vals or not h2_vals:
            continue
        h1_med = median(h1_vals)
        h2_med = median(h2_vals)
        change_by_gu[gu] = pct_change(h1_med, h2_med)

    change_ranking = sorted(change_by_gu.items(), key=lambda kv: kv[1], reverse=True)
    change_pct_gb = change_by_gu[TARGET_GU]
    change_rank_gb = next(
        i + 1 for i, (gu, _) in enumerate(change_ranking) if gu == TARGET_GU
    )

    # ---------- deals / dealsChangePct ----------
    deals_total = len(gb_rows)
    gb_h1_deals = sum(1 for r in gb_rows if r["ym"] in H1_MONTHS)
    gb_h2_deals = sum(1 for r in gb_rows if r["ym"] in H2_MONTHS)
    deals_change_pct = pct_change(gb_h1_deals, gb_h2_deals)

    # ---------- dongs ----------
    ppp_by_dong = defaultdict(list)
    for r in gb_rows:
        ppp_by_dong[r["dong"]].append(r["ppp"])

    dongs = [
        {
            "dong": dong,
            "medianPpp": round(median(vals)),
            "n": len(vals),
            "lowSample": len(vals) < 30,
        }
        for dong, vals in ppp_by_dong.items()
    ]
    dongs.sort(key=lambda x: x["medianPpp"], reverse=True)

    dong_gap_ratio = round(dongs[0]["medianPpp"] / dongs[-1]["medianPpp"], 2)

    # ---------- monthly ----------
    by_month = defaultdict(list)
    for r in gb_rows:
        by_month[r["ym"]].append(r["ppp"])

    months_sorted = sorted(by_month.keys())
    monthly = []
    for ym in months_sorted:
        vals = by_month[ym]
        monthly.append(
            {
                "ym": ym,
                "deals": len(vals),
                "medianPpp": round(median(vals)),
            }
        )

    # ma3: trailing 3-month moving average of the monthly medianPpp values.
    # First 2 entries (insufficient history) get null. This is a trailing
    # (not centered) moving average, as stated per task instructions.
    for i, entry in enumerate(monthly):
        if i < 2:
            entry["ma3"] = None
        else:
            window = [monthly[i - 2]["medianPpp"], monthly[i - 1]["medianPpp"], monthly[i]["medianPpp"]]
            entry["ma3"] = round(sum(window) / 3, 2)

    # ---------- complexes (n >= 10) ----------
    complex_rows = defaultdict(list)
    for r in gb_rows:
        complex_rows[(r["complex"], r["dong"])].append(r)

    complexes = []
    for (cx, dong), crows in complex_rows.items():
        n = len(crows)
        if n < 10:
            continue
        ppp_vals = [r["ppp"] for r in crows]
        price_vals = [r["price"] for r in crows]

        by_area = {}
        band_rows = defaultdict(list)
        for r in crows:
            band_rows[area_band(r["area_m2"])].append(r)
        for band_key, band_list in band_rows.items():
            if len(band_list) < 1:
                continue
            by_area[band_key] = {
                "medianPpp": round(median([r["ppp"] for r in band_list])),
                "n": len(band_list),
                "medianPrice": round(median([r["price"] for r in band_list])),
            }

        complexes.append(
            {
                "complex": cx,
                "dong": dong,
                "medianPpp": round(median(ppp_vals)),
                "n": n,
                "medianPrice": round(median(price_vals)),
                "byArea": by_area,
            }
        )

    complexes.sort(key=lambda x: x["medianPpp"], reverse=True)

    # ---------- areaBands (강북구 only) ----------
    band_ppp = defaultdict(list)
    for r in gb_rows:
        band_ppp[area_band(r["area_m2"])].append(r["ppp"])

    area_bands = []
    for band_key in ("소형", "중형", "대형"):
        vals = band_ppp.get(band_key, [])
        area_bands.append(
            {
                "band": AREA_BAND_LABELS[band_key],
                "medianPpp": round(median(vals)) if vals else None,
                "n": len(vals),
            }
        )

    # ---------- dongAreaBands (exact per-dong area-band medians) ----------
    dong_band_ppp = defaultdict(lambda: defaultdict(list))
    for r in gb_rows:
        dong_band_ppp[r["dong"]][area_band(r["area_m2"])].append(r["ppp"])

    dong_area_bands = {}
    for dong, band_map in dong_band_ppp.items():
        entries = []
        for band_key in ("소형", "중형", "대형"):
            vals = band_map.get(band_key, [])
            if not vals:
                continue
            entries.append(
                {
                    "band": AREA_BAND_LABELS[band_key],
                    "medianPpp": round(median(vals)),
                    "n": len(vals),
                }
            )
        dong_area_bands[dong] = entries

    # ---------- assemble output ----------
    data = {
        "meta": {
            "gu": TARGET_GU,
            "period": "2025-07~2026-06",
            "total": deals_total,
            "generatedFrom": "seoul-apt-latest.csv",
        },
        "kpi": {
            "medianPpp": gb_median_ppp,
            "pppRank": pp_rank,
            "pppTotal": pp_total,
            "changePct": change_pct_gb,
            "changeRank": change_rank_gb,
            "deals": deals_total,
            "dealsChangePct": deals_change_pct,
            "dongGapRatio": dong_gap_ratio,
        },
        "guRanking": gu_ranking,
        "monthly": monthly,
        "dongs": dongs,
        "complexes": complexes,
        "areaBands": area_bands,
        "dongAreaBands": dong_area_bands,
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    # Also emit a plain-JS version so the page works under file:// (fetch()
    # is blocked there) as well as on GitHub Pages, via a <script src> tag.
    with open(OUT_JS_PATH, "w", encoding="utf-8") as f:
        f.write("window.DASHBOARD_DATA = ")
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write(";\n")

    # ---------- summary ----------
    size_kb = OUT_PATH.stat().st_size / 1024
    print("=" * 60)
    print(f"강북구 대시보드 데이터 생성 완료 -> {OUT_PATH}")
    print("=" * 60)
    print(f"[meta] total deals = {deals_total}")
    print(f"[kpi] medianPpp = {gb_median_ppp} (rank {pp_rank}/{pp_total})")
    print(f"[kpi] changePct = {change_pct_gb}% (rank {change_rank_gb}/{pp_total})")
    print(f"[kpi] deals = {deals_total}, dealsChangePct = {deals_change_pct}%")
    print(f"[kpi] dongGapRatio = {dong_gap_ratio}")
    print(f"[dongs] {[(d['dong'], d['medianPpp'], d['n'], d['lowSample']) for d in dongs]}")
    print(f"[complexes] count (n>=10) = {len(complexes)}")
    print(f"[areaBands] {[(b['band'], b['medianPpp'], b['n']) for b in area_bands]}")
    for dong, entries in dong_area_bands.items():
        print(f"[dongAreaBands] {dong}: {[(e['band'], e['medianPpp'], e['n']) for e in entries]}")
    print(f"[monthly] months = {len(monthly)}")
    print(f"JSON file size = {size_kb:.1f} KB")


if __name__ == "__main__":
    main()
