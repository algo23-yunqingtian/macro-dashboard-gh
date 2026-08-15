#!/usr/bin/env python3
"""
Generate macro_data.json for static GitHub Pages dashboard.
Fetches all data from local Flask API (port 8767), assembles into single JSON.

Usage: /home/ubuntu/unified_venv/bin/python3 generate_data.py
Output: macro_data.json (in same directory)
"""
import json, sys, os, time, urllib.request, urllib.error
from datetime import datetime

BASE = "http://127.0.0.1:8767"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "macro_data.json")

def fetch(path, timeout=60):
    """Fetch JSON from local Flask API."""
    url = f"{BASE}{path}"
    try:
        with urllib.request.urlopen(url, timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8"))
    except Exception as e:
        print(f"  [warn] {path}: {e}")
        return None

def main():
    t0 = time.time()
    print(f"[{datetime.now().strftime('%H:%M:%S')}] Generating macro_data.json...")

    # ── Core sections (each maps to /api/<section>) ──
    data = {"meta": {"update_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"), "source": "static cron"}}
    sections = [
        "cover", "growth", "inflation", "rates", "fx", "risk",
        "policy", "news", "global", "metals",
        "yield_curve", "fed_expectations", "analysis",
        "fx_quotes", "fx_multi", "omo", "mlf", "local_bonds",
        "inflation_expectation",
    ]
    for sec in sections:
        d = fetch(f"/api/{sec}", timeout=90)
        data[sec] = d if d is not None else ({} if sec not in ("news",) else [])
        print(f"  {sec}: {type(d).__name__}" if d is not None else f"  {sec}: FAILED")

    # ── US yield curve full history (needed for rates_b history chart) ──
    yc_hist = fetch("/api/us_yield_curve_history?start=2015-01-01&end=2026-12-31&maturities=m2,y2,y10,y30", timeout=120)
    data["us_yield_curve_history"] = yc_hist or {}
    print(f"  us_yield_curve_history: {'OK' if yc_hist else 'FAILED'}")

    # ── Lithium: companies (list) + chain summary (list) ──
    lithium_companies = fetch("/api/lithium_companies")
    data["lithium_companies"] = lithium_companies if lithium_companies is not None else []
    print(f"  lithium_companies: {len(data['lithium_companies'])} companies")

    lithium_chain = fetch("/api/lithium_chain_summary")
    data["lithium_chain_summary"] = lithium_chain if lithium_chain is not None else []
    print(f"  lithium_chain_summary: {len(data['lithium_chain_summary'])} chains")

    # ── Lithium inventory per ticker ──
    inv = {}
    tickers = [c["ticker"] for c in data["lithium_companies"]]
    for t in tickers:
        d = fetch(f"/api/lithium_inventory/{t}", timeout=30)
        if d is not None:
            inv[t] = d
        time.sleep(0.1)  # be gentle
    data["lithium_inventory"] = inv
    print(f"  lithium_inventory: {len(inv)}/{len(tickers)} tickers")

    # ── Write ──
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)
    size = os.path.getsize(OUT)
    elapsed = time.time() - t0
    print(f"  Written: {OUT} ({size/1024:.1f} KB) in {elapsed:.1f}s")
    print(f"  Sections: {list(data.keys())}")

if __name__ == "__main__":
    main()
