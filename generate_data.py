#!/usr/bin/env python3
"""
Generate macro_data.json for static GitHub Pages dashboard.
Runs in no_agent cron mode — no LLM needed.

Usage: /home/ubuntu/unified_venv/bin/python3 generate_data.py
Output: macro_data.json (in same directory)
"""
import json
import sys
import os
from datetime import datetime

sys.path.insert(0, "/home/ubuntu/macro_dashboard")

# Import data fetchers from existing code
from app import (
    fetch_growth, fetch_inflation, fetch_rates, fetch_fx,
    fetch_risk, fetch_policy, fetch_news, fetch_global_macro,
    fetch_metals,
)
from app import api_yield_curve, api_fed_expectations, api_analysis
from app import api_us_yield_curve_history, api_inflation_expectation
from app import api_fx_quotes, api_fx_multi, api_omo, api_mlf, api_local_bonds
from trend_analysis import compute_all_trends

# Mock Flask request for functions that need it
class MockRequest:
    query_string = b""

class MockResponse:
    headers = {}

import app
app.request = MockRequest()

def safe(fn, label=""):
    try:
        return fn()
    except Exception as e:
        print(f"  [warn] {label}: {e}")
        return {}

def main():
    print(f"[{datetime.now().strftime('%H:%M:%S')}] Generating macro_data.json...")
    
    data = {
        "meta": {
            "update_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "source": "macro_dashboard generate_data.py",
        },
        "growth": safe(fetch_growth, "growth"),
        "inflation": safe(fetch_inflation, "inflation"),
        "rates": safe(fetch_rates, "rates"),
        "fx": safe(fetch_fx, "fx"),
        "risk": safe(fetch_risk, "risk"),
        "policy": safe(fetch_policy, "policy"),
        "news": safe(fetch_news, "news"),
        "global": safe(fetch_global_macro, "global"),
        "metals": safe(fetch_metals, "metals"),
        # Additional sections
        "yield_curve": safe(lambda: api_yield_curve()._get_data()[0], "yield_curve"),
        "fed_expectations": safe(lambda: api_fed_expectations()._get_data()[0], "fed"),
        "analysis": safe(lambda: api_analysis()._get_data()[0], "analysis"),
        "fx_quotes": safe(lambda: api_fx_quotes()._get_data()[0], "fx_quotes"),
        "fx_multi": safe(lambda: api_fx_multi()._get_data()[0], "fx_multi"),
        "omo": safe(lambda: api_omo()._get_data()[0], "omo"),
        "mlf": safe(lambda: api_mlf()._get_data()[0], "mlf"),
        "local_bonds": safe(lambda: api_local_bonds()._get_data()[0], "local_bonds"),
        # Lithium placeholder
        "lithium": {
            "companies": [],
            "chain_summary": {},
        },
    }
    
    # Add trends
    try:
        rates_data = data.get("rates", {})
        trends = compute_all_trends(rates_data)
        data["trends"] = trends
    except Exception as e:
        print(f"  [warn] trends: {e}")
        data["trends"] = {}
    
    # Add inflation expectation
    try:
        ie = api_inflation_expectation()._get_data()[0]
        data["inflation_expectation"] = ie
    except Exception as e:
        print(f"  [warn] inflation_expectation: {e}")
        data["inflation_expectation"] = {}
    
    # Add US yield curve history
    try:
        us_yc = api_us_yield_curve_history()._get_data()[0]
        data["us_yield_curve_history"] = us_yc
    except Exception as e:
        print(f"  [warn] us_yield_curve_history: {e}")
        data["us_yield_curve_history"] = {}
    
    out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "macro_data.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)
    
    size = os.path.getsize(out_path)
    print(f"  Written: {out_path} ({size/1024:.1f} KB)")
    print(f"  Sections: {list(data.keys())}")

if __name__ == "__main__":
    main()
