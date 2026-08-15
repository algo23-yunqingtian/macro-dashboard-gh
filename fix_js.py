#!/usr/bin/env python3
"""Complete transformation from original dashboard.js"""
import re

with open('/home/ubuntu/macro_dashboard/static/dashboard.js') as f:
    content = f.read()

# === 1. loadSection ===
old_load = """async function loadSection(sec){
    if(sec===window._lastSection)return;
    window._lastSection=sec;
    const el=document.getElementById(sec);if(!el)return;
    el.innerHTML='<div class="loading">加载中...</div>';
    try{
        const am={rates_b:'yield_curve',fed:'fed_expectations'};
        const res=await fetch('/api/'+(am[sec]||sec));
        const data=await res.json();
        const rm={cover:renderCover,growth:renderGrowth,inflation:renderInflation,rates:renderRATES,fx:renderFX,global:renderGlobalTab,risk:renderRisk,policy:renderPolicy,analysis:renderAnalysis,news:renderNews,rates_b:renderRatesB,fed:renderFEDTab,metals:renderMetals,lithium:renderLithium};
        const fn=rm[sec];if(fn)fn(data);
    }catch(e){el.innerHTML='<div style="text-align:center;color:var(--down);padding:40px">加载失败: '+e.message+'</div>'}
}"""
new_load = """async function loadSection(sec){
    if(sec===window._lastSection)return;
    window._lastSection=sec;
    const el=document.getElementById(sec);if(!el)return;
    el.innerHTML='<div class="loading">加载中...</div>';
    try{
        const key=sec==='rates_b'?'yield_curve':sec==='fed'?'fed_expectations':sec;
        const data=window.macroData?window.macroData[key]:null;
        const rm={cover:renderCover,growth:renderGrowth,inflation:renderInflation,rates:renderRATES,fx:renderFX,global:renderGlobalTab,risk:renderRisk,policy:renderPolicy,analysis:renderAnalysis,news:renderNews,rates_b:renderRatesB,fed:renderFEDTab,metals:renderMetals,lithium:renderLithium};
        const fn=rm[sec];if(fn&&data)fn(data);
    }catch(e){el.innerHTML='<div style="text-align:center;color:var(--down);padding:40px">加载失败: '+e.message+'</div>'}
}"""
assert old_load in content, "loadSection not found"
content = content.replace(old_load, new_load)

# === 2. Yield curve fetch ===
old_yc = """    fetch('/api/us_yield_curve_history?start='+startDate+'&end='+maxDate+'&maturities=m2,y2,y10,y30')
        .then(r=>r.json())
        .then(hist=>{
            window._ycHist=hist;
            const latestUs=hist.latest_us_date||maxDate;
            const picker=document.getElementById('yc-date-picker');
            if(picker){ picker.max=latestUs; picker.value=latestUs; }
            initHistoryChart(hist);
            const hd=document.getElementById('yc-hover-date'); if(hd) hd.textContent='悬停: '+latestUs;
            updateYcSnapshot(latestUs,hist);
        })
        .catch(err=>{
            const t=document.getElementById('yc-snapshot-title');
            if(t) t.textContent='US Yield Curve — 加载失败: '+(err && err.stack ? err.stack : err.message);
        });
}"""
new_yc = """    var ycData=window.macroData?window.macroData['yield_curve']:null;
    if(!ycData){
        document.getElementById('yc-snapshot-title').textContent='US Yield Curve — 数据待更新';
        return;
    }
    var hist=ycData.history?ycData.history:ycData;
    window._ycHist=hist;
    var latestUs=hist.latest_us_date||maxDate;
    var picker=document.getElementById('yc-date-picker');
    if(picker){ picker.max=latestUs; picker.value=latestUs; }
    initHistoryChart(hist);
    var hd=document.getElementById('yc-hover-date'); if(hd) hd.textContent='悬停: '+latestUs;
    updateYcSnapshot(latestUs,hist);
}"""
assert old_yc in content, "yield curve fetch not found"
content = content.replace(old_yc, new_yc)

# === 3. _loadSnapshot ===
old_snap = """    fetch('/api/us_yield_curve_history?start='+dateStr+'&end='+dateStr+'&maturities=m2,y2,y10,y30')
        .then(r=>r.json())
        .then(d=>{
            _ycSnapCache[dateStr]=d;
            renderSnapshot(d,hist,dateStr);
        })
        .catch(function(){});
}"""
new_snap = """    var ycD=window.macroData?window.macroData['yield_curve']:null;
    if(!ycD) return;
    var d=ycD.history?ycD.history:ycD;
    _ycSnapCache[dateStr]=d;
    renderSnapshot(d,hist,dateStr);
}"""
assert old_snap in content, "_loadSnapshot not found"
content = content.replace(old_snap, new_snap)

# === 4. Lithium companies/chain fetch ===
old_lith = """        const [cosRes, chainsRes] = await Promise.all([
            fetch('/api/lithium_companies'),
            fetch('/api/lithium_chain_summary')
        ]);
        const cos = await cosRes.json();
        const chains = await chainsRes.json();"""
new_lith = """        var cosData = window.macroData ? (window.macroData['lithium_companies'] || {companies:[], companies_list:[], summary:{}}) : {companies:[], companies_list:[], summary:{}};
        var chainsData = window.macroData ? (window.macroData['lithium_chain_summary'] || {chains:[], summary:{}, supply:{}, demand:{}}) : {chains:[], summary:{}, supply:{}, demand:{}};
        var cos = cosData.companies || cosData.companies_list || [];
        var chains = chainsData.chains || chainsData.summary || [];"""
assert old_lith in content, "lithium fetch not found"
content = content.replace(old_lith, new_lith)

# === 5. Lithium inventory fetch ===
old_inv = """            const promises = tickers.map(t => fetch(`/api/lithium_inventory/${t}`).then(r => r.json()).then(data => ({ ticker: t, name: cos.find(c => c.ticker === t)?.name || t, data })));"""
new_inv = """            var lithiumAll = window.macroData ? (window.macroData['lithium_inventory'] || {}) : {};
            var results = tickers.map(function(t){ var inv = lithiumAll[t]||lithiumAll['all']||[]; var name = cos.find(function(c){return c.ticker===t})?.name||t; return {ticker:t,name:name,data:inv}; });"""
assert old_inv in content, "lithium inventory not found"
content = content.replace(old_inv, new_inv)

# === 6. Promise.all for inventory ===
old_res = """            const results = await Promise.all(promises);"""
new_res = """            // results already populated above"""
content = content.replace(old_res, new_res)

# === 7. Init block (full original with diagnostic) ===
old_init_start = """document.addEventListener('DOMContentLoaded', function() {
    // Write diagnostic to DOM element for visibility
    const diag = document.getElementById('diagnostic');
    if(diag) {
        const checks = {
            echarts: typeof echarts !== 'undefined',
            initTabs: typeof initTabs === 'function',
            loadSection: typeof loadSection === 'function',
            body_children: document.body.children.length,
            section_growth: document.getElementById('growth') ? 'FOUND' : 'MISSING',
        };
        diag.innerHTML = 'DIAG: ' + JSON.stringify(checks) + '<br>DOM children: ' + document.body.children.length;
        diag.style.background = 'yellow';
        diag.style.color = 'black';
        diag.style.display = 'block';
    }
    initTabs();
    loadSection('cover');
    window.addEventListener('resize', resizeCharts);"""
new_init_start = """function _bootstrap() {
    initTabs();
    loadSection('cover');showUpdateTime();
    window.addEventListener('resize', resizeCharts);
}
window._initDash = _bootstrap;

document.addEventListener('DOMContentLoaded', function() {
    if(window.macroData) {
        _bootstrap();
    } else {
        setTimeout(_bootstrap, 2000);
    }"""
assert old_init_start in content, "DOMContentLoaded init not found"
content = content.replace(old_init_start, new_init_start)

# === 8. Auto-refresh setInterval at the end ===
old_end = """    // Auto-refresh every 30 minutes (silent, no alert)
    setInterval(function(){
        var sec=window._lastSection;
        if(sec){
            window._lastSection='';
            loadSection(sec);
            updateTimestamp();
        }
    }, 30*60*1000);
});"""
new_end = """    // Static: show last update time from macro_data.json
    if(window.macroData && window.macroData.meta){
        var el=document.getElementById('lastRefresh');
        if(el) el.textContent='数据更新时间: '+(window.macroData.meta.update_time||'未知');
    }
});"""
assert old_end in content, "auto-refresh not found"
content = content.replace(old_end, new_end)

# Write
with open('/home/ubuntu/macro_gh_static/static/dashboard_static.js', 'w') as f:
    f.write(content)

# Verify
remaining = len(re.findall(r"fetch\('/api/", content))
brace_bal = content.count('{') - content.count('}')
lines = len(content.split('\n'))
print(f"Written: {len(content)} bytes, {lines} lines")
print(f"API fetches remaining: {remaining}")
print(f"Brace balance: {brace_bal}")
print(f"Has _bootstrap: {'_bootstrap' in content}")
print(f"Has _initDash: {'window._initDash' in content}")
print(f"Has window.macroData: {'window.macroData' in content}")
print("DONE")
