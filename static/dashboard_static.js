// Anti-copy
['contextmenu','selectstart','dragstart','copy','cut','paste'].forEach(e=>document.addEventListener(e,ev=>ev.preventDefault()));
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&(e.key==='c'||e.key==='s'||e.key==='p'))e.preventDefault();if(e.key==='F12')e.preventDefault();});

let charts = {};

function initTabs(){
    document.querySelectorAll('.nav-item').forEach(el=>{
        el.addEventListener('click',()=>{
            document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
            document.querySelectorAll('.section').forEach(s=>{s.classList.remove('active');s.dataset.loaded='';});
            el.classList.add('active');
            const sec = el.dataset.section;
            document.getElementById(sec).classList.add('active');
            loadSection(sec);
        });
    });
}

function getLast(arr, key='value'){
    if(!arr||!arr.length) return null;
    for(let i=arr.length-1;i>=0;i--) if(arr[i][key]!==null&&arr[i][key]!==undefined) return arr[i];
    return null;
}

function formatDelta(cur, prev){
    if(cur==null||prev==null) return '';
    const d=cur-prev, pct=prev!==0?(d/Math.abs(prev)*100).toFixed(2):'0.00';
    const color=d>=0?'var(--up)':'var(--down)', sign=d>=0?'+':'';
    return `<span style="color:${color};font-size:10px">${sign}${d.toFixed(2)} (${sign}${pct}%)</span>`;
}

function renderKPIs(container, items){
    const grid=document.createElement('div'); grid.className='kpi-grid';
    items.forEach(item=>{
        const last=getLast(item.data), prev=item.data&&item.data.length>1?getLast(item.data.slice(0,-1)):null;
        const val=last?last.value:'-';
        const displayVal=(val!=='-'&&val!==null)?(typeof val==='number'?(val%1===0?val.toFixed(1):parseFloat(val.toFixed(2))):val)+'%':val;
        const delta=last&&prev?formatDelta(last.value,prev.value):'';
        grid.innerHTML+=`<div class="kpi-card"><div class="kpi-label">${item.label}</div><div class="kpi-value">${displayVal}</div>${delta}</div>`;
    });
    container.appendChild(grid);
}

function renderChartCard(container, title, domId){
    const card=document.createElement('div'); card.className='chart-card';
    card.innerHTML=`<div class="chart-title">${title}</div><div class="chart" id="${domId}" style="width:100%;height:260px"></div>`;
    container.appendChild(card);
    if(charts[domId] && !charts[domId].isDisposed()) charts[domId].dispose();
    const chartEl=document.getElementById(domId);
    if(!chartEl){
        card.querySelector('.chart').innerHTML='<div style="text-align:center;color:var(--down);padding:40px">图表容器加载失败</div>';
        return null;
    }
    // Force DOM layout measurement before echarts init
    void chartEl.getBoundingClientRect();
    const chart=echarts.init(chartEl);
    charts[domId]=chart;
    return chart;
}

// 自动计算 yAxis 范围：数据最大最小值 ± 15% 填充（options.yAxisConfig 可覆盖）
function calcAxisRange(seriesMap, indices, padRatio){
    let min=Infinity,max=-Infinity;
    (indices||seriesMap.map((_,i)=>i)).forEach(i=>{
        (seriesMap[i].data||[]).forEach(d=>{
            const v=typeof d==='number'?d:d.value;
            if(v!=null&&isFinite(v)){if(v<min)min=v;if(v>max)max=v;}
        });
    });
    if(!isFinite(min)||!isFinite(max)) return {min:null,max:null};
    const pad=(max-min)*(padRatio||0.15);
    return {min:min-pad,max:max+pad};
}

function drawCompactMultiChart(chart, seriesMap, options){
    if(!chart) return;
    const hasDualY=options&&options.dualYAxis;
    const dates=seriesMap[0].data.map(d=>d.date);
    const yAxisConfig=(options&&options.yAxisConfig)||[];
    const leftNames=hasDualY?(hasDualY[0].names||hasDualY[0].seriesNames||[]):[];
    const rightNames=hasDualY?(hasDualY[1].names||hasDualY[1].seriesNames||[]):[];
    const leftIdx=[],rightIdx=[];
    seriesMap.forEach((s,i)=>{ (leftNames.includes(s.name)?leftIdx:rightIdx).push(i); });
    function buildAxis(idx, indices, name, showSplit){
        const cfg=yAxisConfig[idx]||{};
        const r=calcAxisRange(seriesMap,indices,0.15);
        return {
            type:'value', scale:true,
            min:cfg.min!=null?cfg.min:(r.min!=null?r.min:undefined),
            max:cfg.max!=null?cfg.max:(r.max!=null?r.max:undefined),
            splitLine:showSplit?{lineStyle:{color:'#2a3452'}}:{show:false},
            axisLabel:{color:'#8b9bb4',fontSize:9},
            position:idx===0?'left':'right',
            name:name
        };
    }
    let yAxis;
    if(hasDualY){
        yAxis=[buildAxis(0,leftIdx,leftNames.join('/'),true),buildAxis(1,rightIdx,rightNames.join('/'),false)];
    } else {
        yAxis=[buildAxis(0,seriesMap.map((_,i)=>i),'',true)];
    }
    const option={
        backgroundColor:'transparent',tooltip:{trigger:'axis'},
        legend:{data:seriesMap.map(s=>s.name),textStyle:{color:'#8b9bb4',fontSize:10},top:2,itemWidth:10,itemHeight:6},
        grid:{left:45,right:hasDualY?60:25,top:28,bottom:'18%'},
        xAxis:{type:'category',data:dates,axisLine:{lineStyle:{color:'#3a4566'}},axisLabel:{color:'#8b9bb4',fontSize:9,rotate:45}},
        yAxis:yAxis,
        series: seriesMap.map((s,i)=>({
            name:s.name, type:'line', data:s.data.map(d=>d.value), smooth:true, showSymbol:false,
            lineStyle:{width:1.2,color:s.color},
            areaStyle:{color:new echarts.graphic.LinearGradient(0,0,0,1,[{offset:0,color:s.color+'20'},{offset:1,color:s.color+'03'}])},
            yAxisIndex: hasDualY && rightNames.includes(s.name)?1:0
        }))
    };
    chart.clear();
    chart.setOption(option, true);
    chart.resize();
    if(window.__isWeixin) setTimeout(function(){if(chart&&!chart.isDisposed())chart.resize();},200);
}

function resizeCharts(){Object.values(charts).forEach(c=>c&&!c.isDisposed()&&c.resize());}

// ── Indicator Interpretations ──
const IND_INTERPRET = {
    'chart-rates-yield': '<span class="tip">💡 期限结构解读：</span>曲线向上倾斜=正常；平坦/倒挂=衰退预期；陡峭化=经济复苏。当前10Y在1.73%，处于历史低位。',
    'chart-rates-spread': '<span class="tip">💡 中美利差：</span>倒挂=资本外流压力，但也预示美联储进入降息周期。利差走阔=中美货币政策分化。',
    'chart-rates-funding': '<span class="tip">💡 资金利率：</span>FR007<DR007=资金宽松。1.49%偏低，流动性充裕。',
    'chart-rates-lpr': '<span class="tip">💡 LPR：</span>1Y LPR 3.0%/5Y LPR 3.55%。LPR下调=降息信号，降低房贷和企业贷款成本。',
    'chart-inflation-global': '中国2-3%温和通胀 | 美国2%目标 | 欧元区2%目标 | 英国2%目标 | 日本2%目标',
    'chart-fx': '<span class="tip">💡 USD/CNY：</span>人民币升值(数值下降)利好A股和外资流入，贬值增加出口竞争力。',
    'chart-dxy': '<span class="tip">💡 DXY：</span>DXY上升=美元走强，利空大宗商品和新兴市场。下降=美元走弱，利好风险资产。',
    'chart-nb': '<span class="tip">💡 北向资金：</span>连续净流入=外资看多A股，连续净流出可能预示调整。',
    'chart-fx-multi': '<span class="tip">💡 多币种对人民币矩阵：</span>各币种对人民币走势反映国内经济周期和跨境资本流动。EUR/GBP/CHF偏欧系，AUD/CAD/NZD属商品货币。',
    'chart-fx-matrix': '<span class="tip">💡 多币种对人民币矩阵：</span>左轴欧系+商品货币，右轴JPY/CNY(数值小)。趋势分化反映不同经济体对人民币的相对强弱。',
    'chart-fx-link': '<span class="tip">💡 DXY↔USD/CNY 联动：</span>理论负相关：DXY走强→美元对一篮子货币升值→USD/CNY通常上行。背离时需关注中间价逆周期因子。',
    'chart-fx-cross': '<span class="tip">💡 国际主要货币对：</span>反映G20经济体之间的相对强弱。EUR/USD涨=美元弱/欧元强；USD/JPY涨=套息交易活跃/风险偏好强。',
    'chart-fx-live': '<span class="tip">💡 国际货币对实时牌价：</span>基于银行间报价，反映当前全球汇市实时动向。',
'chart-fed-ladder': '<span class="tip">💡 美联储利率阶梯：</span>观察FOMC会议后的利率调整路径，阶梯下降=降息周期，平台=利率维持。市场交易点阵图预期的变化。',
    'chart-fed-prob': '<span class="tip">💡 降息概率：</span>基于CME FedWatch工具，反映市场对未来FOMC会议降息/加息/维持的概率预期。',
    'chart-global-cb-rates': '<span class="tip">💡 全球央行利率：</span>Fed/ECB/BOE/BOJ利率对比，利差走阔=货币分化，央行独立周期驱动跨境资金流动。',
    'chart-global-cpi': '<span class="tip">💡 全球CPI：</span>各国通胀对比，>2%目标=加息压力，<2%=降息空间。中美欧通胀分化=货币政策分化。',
    'chart-global-fed': '<span class="tip">💡 美联储利率决议：</span>当前利率水平+未来概率，决定全球流动性方向。降息周期=新兴市场受益。',
    'chart-global-pmi': '<span class="tip">💡 全球PMI：</span>中美欧日PMI同步>50=全球扩张；分化=结构性机会。PMI<50=需求收缩预警。',
    'chart-global-us-conf': '<span class="tip">💡 美国消费者信心：</span>领先指标，信心>100=消费强劲支撑GDP；跌破80=衰退预警信号。',
    'chart-global-us-gdp': '<span class="tip">💡 美国GDP：</span>>2%正常增长，<0%技术性衰退。环比折年率反映经济动能变化方向。',
    'chart-global-us-nfp': '<span class="tip">💡 美国非农就业：</span>每月首个重磅数据，超预期=美元+美债涨，低于预期=降息预期升温。',
    'chart-global-us-unemp': '<span class="tip">💡 美国失业率：</span>自然失业率~4.2%，>4.5%=Fed降息触发器；<3.5%=经济过热风险。',
    'chart-growth-pmi': '<span class="tip">💡 PMI 双线：</span>市场关注: 50荣枯线及趋势斜率。分析要点: 官方PMI侧重大型制造，财新覆盖中小企业。交易预期: PMI回升→利好周期股+人民币，双线背离需警惕结构性分化。',
    'chart-growth-ind-retail': '<span class="tip">💡 工业+消费双轴：</span>市场关注: 工业增加值增速是否企稳回升。分析要点: 工业领先消费，社零验证内需传导。交易预期: 工业+消费同步上行→周期+消费板块共振。',
    'chart-growth-fai': '<span class="tip">💡 固定资产投资：</span>基建+制造业投资驱动经济增长。固投下行→周期品承压，利好防守型板块。',
    'chart-growth-us-unemp': '<span class="tip">💡 美国失业率(增长Tab)：</span>同步跟踪美国就业健康度，失业率上行→消费走弱→全球需求放缓。',
    'chart-metals-precious': '<span class="tip">💡 贵金属：</span>市场关注: 黄金避险+白银工业双重属性。分析要点: 黄金>2000元/g为强势，金银比走阔→工业需求弱。交易预期: 黄金突破→避险情绪+降息预期升温。',
    'chart-metals-base': '<span class="tip">💡 有色金属主力合约：</span>市场关注: 铜铝锌供需平衡表及LME库存。分析要点: 铜是工业晴雨表，铝看产能天花板，锌看镀锌需求。交易预期: 有色普涨→全球需求改善信号。',
    'chart-metals-tech': '<span class="tip">💡 科技股指：</span>市场关注: 纳斯达克100和A股信息技术资金流向。分析要点: 美股科技领先全球风险偏好，韩KOSDAQ反映半导体周期。交易预期: 科技股资金回流→风险偏好回升→利好有色+成长。',
    'chart-metals-flow': '<span class="tip">💡 板块资金流向：</span>市场关注: 北向资金与国内板块资金的共振方向。分析要点: 连续净流入TOP板块为资金共识方向。交易预期: 资金持续流入有色/科技→趋势跟随信号。',
    'chart-inflation': '<span class="tip">💡 CPI/PPI：</span>市场关注: 核心CPI剥离食品项。分析要点: CPI<1%=通缩风险，PPI负值=工业链承压。交易预期: CPI超预期→债市承压+人民币走强。',
    'chart-inflation-us-pce': '<span class="tip">💡 美国核心PCE：</span>美联储首选通胀指标，>2.5%暗示不急降息；<2%=降息空间打开。',
    'chart-inflation-us-ppi': '<span class="tip">💡 美国PPI：</span>生产者价格指数，领先CPI 2-4个月。PPI上行→下游涨价→消费通胀传导。',
    'chart-policy-credit': '<span class="tip">💡 新增信贷：</span>月度信贷超预期=宽信用信号，利好股市和地产。信贷萎缩=经济内需不足。',
    'chart-policy-fiscal': '<span class="tip">💡 财政+地方债：</span>地方债放量=财政扩张信号，基建投资预期上行。财政收入增速放缓=紧缩压力。',
    'chart-policy-m1m2': '<span class="tip">💡 M1/M2剪刀差：</span>市场关注: M1-M2差值。分析要点: 剪刀差扩大=资金活化，收窄=存款定期化。交易预期: M1回升→股市流动性改善。',
    'chart-policy-sf': '<span class="tip">💡 社融规模：</span>社融>信贷=直接融资活跃。社融超预期→宽信用→周期股+银行受益。',
    'chart-risk-cn-us': '<span class="tip">💡 中美利差(风险)：</span>利差倒挂加深=人民币贬值压力，也预示Fed降息周期临近。关注资本流动方向。',
    'chart-risk-erp': '<span class="tip">💡 股权风险溢价：</span>ERP>4%=股票相对债券具吸引力；<2%=估值偏高，资金或流向债市。',
    'chart-risk-vix': '<span class="tip">💡 VIX恐慌指数：</span>市场关注: 20警戒线。分析要点: <20=平静，20-30=警惕，>30=恐慌。交易预期: VIX飙升→避险资产+现金为王。',
    'chart-spread-105': '<span class="tip">💡 10Y-5Y利差：</span>利差收窄=中长端预期走弱，预示经济增速放缓。倒挂=深度衰退信号。',
    'chart-spread-3010': '<span class="tip">💡 30Y-10Y利差：</span>超长端利差反映长期增长预期。利差走阔=经济长期向好；收窄=长期增长悲观。',
    'chart-spread-51': '<span class="tip">💡 5Y-1Y利差：</span>短中长期利差，反映货币政策传导效率。利差收窄=短端利率上升预期。',
};


function addInterpretation(chartEl, chartId){
    const key = IND_INTERPRET[chartId];
    if(!key) return;
    const card = chartEl.closest('.chart-card');
    if(!card) return;
    const div = document.createElement('div');
    div.className = 'interpret-panel';
    div.innerHTML = key;
    card.appendChild(div);
}

// ── COVER DASHBOARD ──
const KPI_LABELS = {
    cn_pmi: '中国PMI', us_cpi: '美国CPI', fed_rate: '美联储利率',
    us10y: '美债10Y', dxy: 'DXY', usdcny: 'USD/CNY',
    gold: '黄金(元/g)', copper: '铜(主力)', vix: 'VIX', northbound: '北向资金(亿)'
};

function renderCover(data) {
    const el = document.getElementById('cover'); el.innerHTML = '';
    const kpis = data.kpis || {};
    const trends = data.trends || {};

    // KPI cards row
    const kpiGrid = document.createElement('div'); kpiGrid.className = 'kpi-grid'; el.appendChild(kpiGrid);
    for (const [key, label] of Object.entries(KPI_LABELS)) {
        const k = kpis[key]; if (!k || k.value == null) continue;
        const v = k.value;
        const fmt = key === 'usdcny' ? v.toFixed(4) : key.includes('rate') && v < 5 ? v.toFixed(3) : v < 10 ? v.toFixed(2) : v.toFixed(1);
        let delta = '';
        if (k.delta != null) {
            const sign = k.delta >= 0 ? '+' : '';
            const color = k.delta >= 0 ? 'var(--up)' : 'var(--down)';
            const dStr = key === 'usdcny' ? `${sign}${k.delta.toFixed(4)}` : `${sign}${k.delta.toFixed(2)}`;
            delta = `<div class="kpi-delta" style="color:${color}">${dStr}</div>`;
        }
        const dateStr = k.date ? `<div style="font-size:9px;color:var(--muted);margin-top:2px">${k.date}</div>` : '';
        kpiGrid.innerHTML += `<div class="kpi-card"><div class="kpi-label">${label}</div><div class="kpi-value">${fmt}</div>${delta}${dateStr}</div>`;
    }

    // Summary box
    const summary = document.createElement('div'); summary.className = 'summary-box';
    let parts = [];
    if (kpis.cn_pmi) parts.push(`中国PMI ${kpis.cn_pmi.value}%`);
    if (kpis.us_cpi) parts.push(`美国CPI ${kpis.us_cpi.value}%`);
    if (kpis.fed_rate) parts.push(`美联储 ${kpis.fed_rate.value}%`);
    if (kpis.vix) parts.push(`VIX ${kpis.vix.value}`);
    summary.innerHTML = `<span style="color:var(--accent)">📊 市场快照：</span>${parts.join(' · ')}；`;
    el.appendChild(summary);

    // Trend charts (2 columns)
    const g = document.createElement('div'); g.className = 'chart-grid'; el.appendChild(g);

    const trendPairs = [
        {id: 'chart-cover-pmi-cpi', title: 'PMI vs CPI 趋势', series: [
            {key: 'cn_pmi', name: '中国PMI', color: '#00d4ff'},
            {key: 'us_cpi', name: '美国CPI', color: '#ff4d4d'}
        ]},
        {id: 'chart-cover-dxy-fx', title: 'DXY vs USD/CNY', series: [
            {key: 'dxy', name: 'DXY', color: '#00d4ff'},
            {key: 'usdcny', name: 'USD/CNY', color: '#ff9f43'}
        ]},
        {id: 'chart-cover-gold-vix', title: '黄金 vs VIX', series: [
            {key: 'gold', name: '黄金', color: '#ffd700'},
            {key: 'vix', name: 'VIX', color: '#ff4d4d'}
        ]},
        {id: 'chart-cover-nb-copper', title: '北向资金 vs 铜价', series: [
            {key: 'northbound', name: '北向资金(亿)', color: '#00e676'},
            {key: 'copper', name: '铜价', color: '#e87d4a'}
        ]},
    ];

    for (const tp of trendPairs) {
        const sm = [];
        for (const s of tp.series) {
            if (trends[s.key] && trends[s.key].length) {
                sm.push({name: s.name, data: trends[s.key], color: s.color});
            }
        }
        if (sm.length) {
            const ch = renderChartCard(g, tp.title, tp.id);
            drawCompactMultiChart(ch, sm, {dualYAxis: sm.length >= 2 ? [
                {seriesNames: [sm[0].name]}, {seriesNames: sm.slice(1).map(x => x.name)}
            ] : null});
        }
    }
}

// ── GROWTH SECTION ──
function renderGrowth(data){
    const el=document.getElementById('growth'); el.innerHTML='';
    renderKPIs(el,[
        {label:'官方PMI', data:data.pmi_official},
        {label:'财新PMI', data:data.pmi_caixin},
        {label:'工业增加值同比', data:data.industrial_added_value},
        {label:'社零同比', data:data.retail_sales},
        {label:'固投同比', data:data.fixed_asset_investment},
    ]);
    const g=document.createElement('div'); g.className='chart-grid'; el.appendChild(g);

    const sm1=[];
    if(data.pmi_official?.length) sm1.push({name:'官方PMI',data:data.pmi_official,color:'#00d4ff'});
    if(data.pmi_caixin?.length) sm1.push({name:'财新PMI',data:data.pmi_caixin,color:'#ff9f43'});
    if(sm1.length){
        const ch=renderChartCard(g,'PMI 双线(扩张收缩线50)','chart-growth-pmi');
        drawCompactMultiChart(ch,sm1);
        const card=g.lastChild;
        addInterpretation(g.lastChild,'chart-growth-pmi');
    }
    const sm2=[];
    if(data.industrial_added_value?.length) sm2.push({name:'工业增加值同比',data:data.industrial_added_value,color:'#00e676'});
    if(data.retail_sales?.length) sm2.push({name:'社零同比',data:data.retail_sales,color:'#ff4d4d'});
    if(sm2.length){
        const ch=renderChartCard(g,'工业+消费 双轴','chart-growth-ind-retail');
        drawCompactMultiChart(ch,sm2,{dualYAxis:[{seriesNames:['工业增加值同比']},{seriesNames:['社零同比']}]});
        const card=g.lastChild;
        addInterpretation(g.lastChild,'chart-growth-ind-retail');
    }
    if(data.fixed_asset_investment?.length){
        const ch=renderChartCard(g,'固定资产投资同比','chart-growth-fai');
        drawCompactMultiChart(ch,[{name:'固投同比',data:data.fixed_asset_investment,color:'#bc8cff'}]);
        addInterpretation(g.lastChild,'chart-growth-fai');
    }
    if(data.global_us_unemployment?.length){
        const ch=renderChartCard(g,'美国失业率','chart-growth-us-unemp');
        drawCompactMultiChart(ch,[{name:'美国失业率%',data:data.global_us_unemployment,color:'#ff4d4d'}]);
        addInterpretation(g.lastChild,'chart-growth-us-unemp');
    }
}

// ── INFLATION SECTION ──
function renderInflation(data){
    const el=document.getElementById('inflation'); el.innerHTML='';
    renderKPIs(el,[
        {label:'CPI 同比', data:data.cpi_yoy},
        {label:'PPI 同比', data:data.ppi_yoy},
    ]);
    const g=document.createElement('div'); g.className='chart-grid'; el.appendChild(g);

    const sm1=[];
    if(data.cpi_yoy?.length) sm1.push({name:'CPI',data:data.cpi_yoy,color:'#00d4ff'});
    if(data.ppi_yoy?.length) sm1.push({name:'PPI',data:data.ppi_yoy,color:'#ff9f43'});
    if(sm1.length){
        const ch=renderChartCard(g,'CPI + PPI 双轴','chart-inflation');
        drawCompactMultiChart(ch,sm1,{dualYAxis:[{seriesNames:['CPI']},{seriesNames:['PPI']}]});
        const card=g.lastChild;
        addInterpretation(g.lastChild,'chart-inflation');
        }
    if(data.global_us_cpi_core?.length||data.global_euro_cpi?.length||data.global_uk_cpi?.length||data.global_jp_cpi?.length){
        const sm2=[];
        if(data.global_us_cpi_core?.length) sm2.push({name:'美国核心CPI',data:data.global_us_cpi_core,color:'#ff4d4d'});
        if(data.global_euro_cpi?.length) sm2.push({name:'欧元区CPI',data:data.global_euro_cpi,color:'#ff9f43'});
        if(data.global_uk_cpi?.length) sm2.push({name:'英国CPI',data:data.global_uk_cpi,color:'#00e676'});
        if(data.global_jp_cpi?.length) sm2.push({name:'日本CPI',data:data.global_jp_cpi,color:'#bc8cff'});
        if(sm2.length){
            const ch=renderChartCard(g,'全球通胀对比(目标~2%)','chart-inflation-global');
            drawCompactMultiChart(ch,sm2);
            const card=g.lastChild;
        addInterpretation(g.lastChild,'chart-inflation-global');
        }
    }
    if(data.global_us_pce?.length){
        const ch=renderChartCard(g,'美国核心PCE(美联储首选指标)','chart-inflation-us-pce');
        drawCompactMultiChart(ch,[{name:'核心PCE同比%',data:data.global_us_pce,color:'#ff4d4d'}]);
        const card=g.lastChild;
        addInterpretation(g.lastChild,'chart-inflation-us-pce');
    }
    if(data.global_us_ppi?.length){
        const ch=renderChartCard(g,'美国PPI','chart-inflation-us-ppi');
        drawCompactMultiChart(ch,[{name:'美国PPI同比%',data:data.global_us_ppi,color:'#ff9f43'}]);
        addInterpretation(g.lastChild,'chart-inflation-us-ppi');
    }
}

// ── RATES SECTION (Issue ① Fix: map to actual backend field names) ──
function renderRATES(data){
    const el=document.getElementById('rates'); el.innerHTML='';

    // KPI Cards
    const kpiItems=[];
    const fr007=data.fr007?.length?data.fr007[data.fr007.length-1]:null;
    const shibor=data.shibor_1w?.length?data.shibor_1w[data.shibor_1w.length-1]:null;
    const y10=data.yield_cn_10y?.length?data.yield_cn_10y[data.yield_cn_10y.length-1]:null;
    const yus=data.yield_us_10y?.length?data.yield_us_10y[data.yield_us_10y.length-1]:null;
    const lpr1=data.lpr_1y?.length?data.lpr_1y[data.lpr_1y.length-1]:null;
    if(fr007) kpiItems.push({label:'FR007(隔夜)', data:data.fr007});
    if(shibor) kpiItems.push({label:'SHIBOR 1W', data:data.shibor_1w});
    if(y10) kpiItems.push({label:'中债10Y', data:data.yield_cn_10y});
    if(yus) kpiItems.push({label:'美债10Y', data:data.yield_us_10y});
    if(lpr1) kpiItems.push({label:'LPR 1Y', data:data.lpr_1y});
    const kpiGrid=document.createElement('div'); kpiGrid.className='kpi-grid';
    kpiItems.forEach(item=>{
        const last=getLast(item.data), prev=item.data&&item.data.length>1?getLast(item.data.slice(0,-1)):null;
        const val=last?last.value:'-';
        const displayVal=(val!=='-'&&val!==null)?(typeof val==='number'?(val%1===0?val.toFixed(1):parseFloat(val.toFixed(2))):val)+'%':val;
        const delta=last&&prev?formatDelta(last.value,prev.value):'';
        kpiGrid.innerHTML+=`<div class="kpi-card"><div class="kpi-label">${item.label}</div><div class="kpi-value">${displayVal}</div>${delta}</div>`;
    });
    el.appendChild(kpiGrid);

    const g=document.createElement('div'); g.className='chart-grid'; el.appendChild(g);

    // 1. 中国国债收益率曲线(多期限)
    if(data.yield_cn_1y?.length||data.yield_cn_5y?.length||data.yield_cn_10y?.length){
        const sm=[];
        if(data.yield_cn_1y?.length) sm.push({name:'1Y',data:data.yield_cn_1y,color:'#bc8cff'});
        if(data.yield_cn_5y?.length) sm.push({name:'5Y',data:data.yield_cn_5y,color:'#00d4ff'});
        if(data.yield_cn_10y?.length) sm.push({name:'10Y',data:data.yield_cn_10y,color:'#ff4d4d'});
        if(data.yield_cn_30y?.length) sm.push({name:'30Y',data:data.yield_cn_30y,color:'#00e676'});
        if(sm.length){
            const ch=renderChartCard(g,'中国国债收益率曲线(多期限)','chart-rates-yield');
            drawCompactMultiChart(ch,sm);
            const card=g.lastChild;
        
addInterpretation(g.lastChild,'chart-rates-yield');
        }
    }

    // 2. 中美利差
    if(data.yield_cn_10y?.length && data.yield_us_10y?.length){
        const dates=data.yield_cn_10y.map(d=>d.date);
        const cnVals=data.yield_cn_10y.map(d=>d.value);
        const usVals=data.yield_us_10y.map(d=>d.value);
        const spread=dates.map((dt,i)=>{
            const cn=cnVals[i]??null, us=usVals[i]??null;
            return {date:dt, value: cn!=null&&us!=null?((cn-us)*100).toFixed(2):null};
        });
        const ch=renderChartCard(g,'中美10Y利差(bp)','chart-rates-spread');
        drawCompactMultiChart(ch,[{name:'中债10Y-美债10Y(bp)',data:spread,color:'#ff6b6b'}]);
        const card=g.lastChild;
        
addInterpretation(g.lastChild,'chart-rates-spread');
    }

    // 3. 资金利率 (FR007 + SHIBOR 1W)
    if(data.fr007?.length || data.shibor_1w?.length){
        const sm=[];
        if(data.fr007?.length) sm.push({name:'FR007',data:data.fr007,color:'#00d4ff'});
        if(data.shibor_1w?.length) sm.push({name:'SHIBOR 1W',data:data.shibor_1w,color:'#ff9f43'});
        if(sm.length){
            const ch=renderChartCard(g,'资金利率(隔夜+1周)','chart-rates-funding');
            drawCompactMultiChart(ch,sm);
            const card=g.lastChild;
        
addInterpretation(g.lastChild,'chart-rates-funding');
        }
    }

    // 4. LPR
    if(data.lpr_1y?.length||data.lpr_5y?.length){
        const sm=[];
        if(data.lpr_1y?.length) sm.push({name:'LPR 1Y',data:data.lpr_1y,color:'#00d4ff'});
        if(data.lpr_5y?.length) sm.push({name:'LPR 5Y',data:data.lpr_5y,color:'#ff9f43'});
        if(sm.length){
            const ch=renderChartCard(g,'LPR 趋势','chart-rates-lpr');
            drawCompactMultiChart(ch,sm);
            const card=g.lastChild;
        
addInterpretation(g.lastChild,'chart-rates-lpr');
        }
    }
}

// ── FX SECTION ──
const FX_CNY_COLORS = {
    usd_cny:'#00d4ff', eur_cny:'#ff9f43', gbp_cny:'#ff4d4d', jpy_cny:'#bc8cff',
    chf_cny:'#00e676', aud_cny:'#ffd93d', cad_cny:'#ff6b6b', nzd_cny:'#ff8fab', sgd_cny:'#4dd0e1'
};
const FX_CNY_LABELS = {
    usd_cny:'USD/CNY', eur_cny:'EUR/CNY', gbp_cny:'GBP/CNY', jpy_cny:'JPY/CNY',
    chf_cny:'CHF/CNY', aud_cny:'AUD/CNY', cad_cny:'CAD/CNY', nzd_cny:'NZD/CNY', sgd_cny:'SGD/CNY'
};
const FX_CROSS_ORDER = ['eur_usd','gbp_usd','aud_usd','nzd_usd','usd_jpy','usd_chf','usd_cad','usd_sgd'];
const FX_CROSS_LABELS = {
    eur_usd:'EUR/USD', gbp_usd:'GBP/USD', aud_usd:'AUD/USD', nzd_usd:'NZD/USD',
    usd_jpy:'USD/JPY', usd_chf:'USD/CHF', usd_cad:'USD/CAD', usd_sgd:'USD/SGD'
};
const FX_CROSS_COLORS = {
    eur_usd:'#ff9f43', gbp_usd:'#ff4d4d', aud_usd:'#ffd93d', nzd_usd:'#00e676',
    usd_jpy:'#bc8cff', usd_chf:'#4dd0e1', usd_cad:'#ff6b6b', usd_sgd:'#6bc5ff'
};
const FX_LIVE_MAJOR = ['EUR/USD','USD/JPY','GBP/USD','USD/CHF','AUD/USD','USD/CAD'];

function renderFX(data){
    const el=document.getElementById('fx'); el.innerHTML='';
    // ── KPI row 1: USD/CNY + DXY + live majors ──
    const kpiGrid=document.createElement('div'); kpiGrid.className='kpi-grid'; el.appendChild(kpiGrid);
    if(data.usd_cny?.length){
        const last=data.usd_cny[data.usd_cny.length-1];
        const prev=data.usd_cny.length>1?data.usd_cny[data.usd_cny.length-2]:last;
        const delta=(last.value-prev.value).toFixed(3);
        const pct=((last.value-prev.value)/Math.abs(prev.value)*100).toFixed(2);
        const sign=last.value>=prev.value?'+':'';
        const color=last.value>=prev.value?'var(--up)':'var(--down)';
        kpiGrid.innerHTML+=`<div class="kpi-card"><div class="kpi-label">USD/CNY 中间价</div><div class="kpi-value">${last.value}</div><span style="color:${color}">${sign}${delta} (${sign}${pct}%)</span></div>`;
    }
    if(data.dxy?.length){
        const last=data.dxy[data.dxy.length-1];
        const prev=data.dxy.length>1?data.dxy[data.dxy.length-2]:last;
        const delta=(last.value-prev.value).toFixed(2);
        const sign=last.value>=prev.value?'+':'';
        const color=last.value>=prev.value?'var(--up)':'var(--down)';
        kpiGrid.innerHTML+=`<div class="kpi-card"><div class="kpi-label">DXY 美元指数</div><div class="kpi-value">${last.value}</div><span style="color:${color}">${sign}${delta}</span></div>`;
    }
    const liveMap={};
    (data.live_quotes||[]).forEach(q=>{liveMap[q.pair]=q;});
    FX_LIVE_MAJOR.forEach(pair=>{
        const q=liveMap[pair]; if(!q) return;
        const spread=((q.ask-q.bid)/q.bid*10000).toFixed(1);
        kpiGrid.innerHTML+=`<div class="kpi-card"><div class="kpi-label">${pair} 实时</div><div class="kpi-value" style="font-size:18px">${q.bid}</div><span style="color:#8b9bb4">ask ${q.ask} · 点差${spread}bp</span></div>`;
    });

    const g=document.createElement('div'); g.className='chart-grid'; el.appendChild(g);

    // ── Chart: DXY ↔ USD/CNY linkage ──
    if(data.dxy?.length && data.usd_cny?.length){
        const ch=renderChartCard(g,'DXY ↔ USD/CNY 联动','chart-fx-link');
        drawCompactMultiChart(ch,[
            {name:'DXY',data:data.dxy,color:'#ff6b6b'},
            {name:'USD/CNY',data:data.usd_cny,color:'#00d4ff'}
        ],{dualYAxis:[{seriesNames:['DXY']},{seriesNames:['USD/CNY']}]});
        addInterpretation(g.lastChild,'chart-fx-link');
    }
    if(data.usd_cny?.length){
        const ch=renderChartCard(g,'USD/CNY 中间价','chart-fx');
        drawCompactMultiChart(ch,[{name:'USD/CNY',data:data.usd_cny,color:'#00d4ff'}]);
        addInterpretation(g.lastChild,'chart-fx');
    }
    if(data.dxy?.length){
        const ch=renderChartCard(g,'DXY 美元指数','chart-dxy');
        drawCompactMultiChart(ch,[{name:'DXY',data:data.dxy,color:'#ff6b6b'}]);
        addInterpretation(g.lastChild,'chart-dxy');
    }

    // ── Chart: 9-currency CNY matrix (non-USD majors + JPY on right axis) ──
    const matrixKeys=['eur_cny','gbp_cny','chf_cny','aud_cny','cad_cny','nzd_cny','sgd_cny'];
    const leftSm=[], rightSm=[];
    matrixKeys.forEach(k=>{
        if(data[k]?.length) leftSm.push({name:FX_CNY_LABELS[k],data:data[k],color:FX_CNY_COLORS[k]});
    });
    if(data.jpy_cny?.length) rightSm.push({name:'JPY/CNY',data:data.jpy_cny,color:FX_CNY_COLORS.jpy_cny});
    if(leftSm.length||rightSm.length){
        const all=leftSm.concat(rightSm);
        const ch=renderChartCard(g,'多币种对人民币矩阵 (9币种)','chart-fx-matrix');
        drawCompactMultiChart(ch,all,{dualYAxis:[
            {seriesNames:leftSm.map(s=>s.name)},
            {seriesNames:rightSm.map(s=>s.name)}
        ]});
        addInterpretation(g.lastChild,'chart-fx-matrix');
    }

    // ── Chart: international cross rates ──
    const crossLeft=[], crossRight=[];
    FX_CROSS_ORDER.forEach(k=>{
        if(!data[k]?.length) return;
        const item={name:FX_CROSS_LABELS[k],data:data[k],color:FX_CROSS_COLORS[k]};
        (k==='usd_jpy'?crossRight:crossLeft).push(item);
    });
    if(crossLeft.length||crossRight.length){
        const ch=renderChartCard(g,'国际主要货币对 交叉汇率','chart-fx-cross');
        drawCompactMultiChart(ch,crossLeft.concat(crossRight),{dualYAxis:[
            {seriesNames:crossLeft.map(s=>s.name)},
            {seriesNames:crossRight.map(s=>s.name)}
        ]});
        addInterpretation(g.lastChild,'chart-fx-cross');
    }

    // ── Live quotes table (all pairs) ──
    if(data.live_quotes?.length){
        const card=document.createElement('div'); card.className='chart-card';
        card.innerHTML=`<div class="chart-title">国际货币对 实时牌价 (全部)</div>`;
        const tbl=document.createElement('div'); tbl.className='fx-live-table';
        tbl.innerHTML='<div class="fx-live-row fx-live-head"><span>货币对</span><span>买价</span><span>卖价</span><span>点差bp</span></div>';
        data.live_quotes.forEach(q=>{
            const spread=((q.ask-q.bid)/q.bid*10000).toFixed(1);
            tbl.innerHTML+=`<div class="fx-live-row"><span>${q.pair}</span><span>${q.bid}</span><span>${q.ask}</span><span>${spread}</span></div>`;
        });
        card.appendChild(tbl);
        g.appendChild(card);
        addInterpretation(card,'chart-fx-live');
    }

    // ── Rule-based analysis panel ──
    if(data.fx_analysis?.length){
        const card=document.createElement('div'); card.className='chart-card';
        card.innerHTML='<div class="chart-title">📊 汇率变动 原因解析 (近5日)</div>';
        const panel=document.createElement('div'); panel.className='interpret-panel';
        panel.style.padding='10px 14px';
        panel.innerHTML=data.fx_analysis.map(s=>`<div style="margin:4px 0;line-height:1.6">• ${s}</div>`).join('');
        card.appendChild(panel);
        g.appendChild(card);
    }

    // ── Northbound (kept) ──
    if(data.northbound?.length){
        const ch=renderChartCard(g,'北向资金 净流入(亿元)','chart-nb');
        drawCompactMultiChart(ch,[{name:'北向资金净流入',data:data.northbound,color:'#00e676'}]);
        addInterpretation(g.lastChild,'chart-nb');
    }
}

// ── GLOBAL / OVERSEAS MACRO ──
function renderGlobalTab(data){
    const el=document.getElementById('global'); el.innerHTML='';
    const kpiGrid=document.createElement('div'); kpiGrid.className='kpi-grid';
    // Fed rate
    if(data.fed_rate?.length){
        const last=data.fed_rate[data.fed_rate.length-1];
        kpiGrid.innerHTML+=`<div class="kpi-card"><div class="kpi-label">美联储利率</div><div class="kpi-value">${last.value}%</div></div>`;
    }
    if(data.fed_rate_probability?.level){
        const fp=data.fed_rate_probability;
        kpiGrid.innerHTML+=`<div class="kpi-card"><div class="kpi-label">Fed 降息概率</div><div class="kpi-value" style="font-size:14px">${fp.probability}% — ${fp.level}</div></div>`;
    }
    // US data
    if(data.usa_pmi?.length){
        const last=data.usa_pmi[data.usa_pmi.length-1];
        kpiGrid.innerHTML+=`<div class="kpi-card"><div class="kpi-label">美国 PMI</div><div class="kpi-value">${last.value}</div><div class="kpi-delta">${last.date}</div></div>`;
    }
    if(data.usa_unemployment?.length){
        const last=data.usa_unemployment[data.usa_unemployment.length-1];
        kpiGrid.innerHTML+=`<div class="kpi-card"><div class="kpi-label">美国失业率</div><div class="kpi-value">${last.value}%</div></div>`;
    }
    if(data.usa_pce?.length){
        const last=data.usa_pce[data.usa_pce.length-1];
        kpiGrid.innerHTML+=`<div class="kpi-card"><div class="kpi-label">美国核心PCE</div><div class="kpi-value">${last.value}%</div></div>`;
    }
    if(data.euro_pmi_manuf?.length){
        const last=data.euro_pmi_manuf[data.euro_pmi_manuf.length-1];
        kpiGrid.innerHTML+=`<div class="kpi-card"><div class="kpi-label">欧元区制造PMI</div><div class="kpi-value">${last.value}</div></div>`;
    }
    if(data.jp_pmi_manuf?.length){
        const last=data.jp_pmi_manuf[data.jp_pmi_manuf.length-1];
        kpiGrid.innerHTML+=`<div class="kpi-card"><div class="kpi-label">日本制造PMI</div><div class="kpi-value">${last.value}</div></div>`;
    }
    el.appendChild(kpiGrid);

    const g=document.createElement('div'); g.className='chart-grid'; el.appendChild(g);

    if(data.fed_rate?.length){
        const ch=renderChartCard(g,'美联储利率决议','chart-global-fed');
        drawCompactMultiChart(ch,[{name:'联邦基金利率%',data:data.fed_rate,color:'#ff4d4d'}]);
        const card=g.lastChild;
        addInterpretation(g.lastChild,'chart-global-fed');
    }
    if(data.fed_rate_probability){
        const fp=data.fed_rate_probability;
        const card=document.createElement('div'); card.className='chart-card';
        card.innerHTML='<div class="chart-title">Fed 降息概率仪表盘</div>';
        const dom=document.createElement('div'); dom.className='chart'; dom.id='chart-global-fed-prob';
        card.appendChild(dom); g.appendChild(card);
        if(charts['chart-global-fed-prob']) charts['chart-global-fed-prob'].dispose();
        const chart=echarts.init(dom);
        charts['chart-global-fed-prob']=chart;
        chart.setOption({
            backgroundColor:'transparent',series:[{
                type:'gauge',startAngle:220,endAngle:-40,min:0,max:100,
                pointer:{show:false},
                progress:{show:true,width:18,roundCap:true,itemStyle:{color:fp.probability>60?'#00e676':fp.probability>40?'#ffc107':'#ff4d4d'}},
                axisLine:{lineStyle:{width:18,color:[[1,'#2a3452']]}},
                axisTick:{show:false},splitLine:{show:false},axisLabel:{show:false},
                detail:{valueAnimation:true,fontSize:20,fontWeight:'bold',offsetCenter:[0,'0%'],formatter:'{value}%',color:fp.probability>60?'#00e676':fp.probability>40?'#ffc107':'#ff4d4d'},
                data:[{value:fp.probability, name:'降息概率'}]
            }]
        }, true);
    }
    if(data.fed_rate_probability?.reasons?.length){
        const card=document.createElement('div'); card.className='chart-card';
        card.innerHTML='<div class="chart-title">Fed 概率计算因子</div><div style="font-size:11px;line-height:1.8;color:var(--text);padding:6px 0">'+
            data.fed_rate_probability.reasons.map(r=>`<div style="padding:3px 0;border-bottom:1px solid var(--border)">• ${r}</div>`).join('')+
            (data.fed_rate_probability.reasons.length===0?'<div style="color:var(--muted)">数据不足</div>':'')+'</div>';
        g.appendChild(card);
    }
    // Global PMI
    if(data.usa_pmi?.length||data.euro_pmi_manuf?.length||data.jp_pmi_manuf?.length){
        const sm=[];
        if(data.usa_pmi?.length) sm.push({name:'美国PMI',data:data.usa_pmi,color:'#ff4d4d'});
        if(data.euro_pmi_manuf?.length) sm.push({name:'欧元区制造PMI',data:data.euro_pmi_manuf,color:'#ff9f43'});
        if(data.jp_pmi_manuf?.length) sm.push({name:'日本制造PMI',data:data.jp_pmi_manuf,color:'#bc8cff'});
        if(sm.length){
            const ch=renderChartCard(g,'全球制造PMI对比(50=扩张线)','chart-global-pmi');
            drawCompactMultiChart(ch,sm);
            const card=g.lastChild;
        addInterpretation(g.lastChild,'chart-global-pmi');
        }
    }
    // Global CPI
    if(data.usa_cpi_core?.length||data.euro_cpi?.length||data.uk_cpi?.length||data.jp_cpi?.length){
        const sm=[];
        if(data.usa_cpi_core?.length) sm.push({name:'美国核心CPI',data:data.usa_cpi_core,color:'#ff4d4d'});
        if(data.euro_cpi?.length) sm.push({name:'欧元区CPI',data:data.euro_cpi,color:'#ff9f43'});
        if(data.uk_cpi?.length) sm.push({name:'英国CPI',data:data.uk_cpi,color:'#00e676'});
        if(data.jp_cpi?.length) sm.push({name:'日本CPI',data:data.jp_cpi,color:'#bc8cff'});
        if(sm.length){
            const ch=renderChartCard(g,'全球通胀对比(目标~2%)','chart-global-cpi');
            drawCompactMultiChart(ch,sm);
            addInterpretation(g.lastChild,'chart-global-cpi');
        }
    }
    if(data.usa_gdp?.length){
        const ch=renderChartCard(g,'美国GDP环比折年率%','chart-global-us-gdp');
        drawCompactMultiChart(ch,[{name:'美国GDP环比%',data:data.usa_gdp,color:'#00d4ff'}]);
        const card=g.lastChild;
        addInterpretation(g.lastChild,'chart-global-us-gdp');
    }
    if(data.usa_unemployment?.length){
        const ch=renderChartCard(g,'美国失业率%','chart-global-us-unemp');
        drawCompactMultiChart(ch,[{name:'失业率%',data:data.usa_unemployment,color:'#ff4d4d'}]);
        addInterpretation(g.lastChild,'chart-global-us-unemp');
    }
    if(data.usa_nonfarm?.length){
        const ch=renderChartCard(g,'美国非农就业(千人)','chart-global-us-nfp');
        drawCompactMultiChart(ch,[{name:'非农新增(千人)',data:data.usa_nonfarm,color:'#00e676'}]);
        addInterpretation(g.lastChild,'chart-global-us-nfp');
    }
    // Central bank rates
    if(data.fed_rate?.length||data.ecb_rate?.length||data.boj_rate?.length||data.boe_rate?.length){
        const sm=[];
        if(data.fed_rate?.length) sm.push({name:'美联储',data:data.fed_rate,color:'#ff4d4d'});
        if(data.ecb_rate?.length) sm.push({name:'ECB',data:data.ecb_rate,color:'#00d4ff'});
        if(data.boj_rate?.length) sm.push({name:'BOJ',data:data.boj_rate,color:'#ff9f43'});
        if(data.boe_rate?.length) sm.push({name:'BoE',data:data.boe_rate,color:'#00e676'});
        if(sm.length){
            const ch=renderChartCard(g,'主要央行利率对比','chart-global-cb-rates');
            drawCompactMultiChart(ch,sm);
            addInterpretation(g.lastChild,'chart-global-cb-rates');
        }
    }
    if(data.usa_consumer_confidence?.length){
        const ch=renderChartCard(g,'美国消费者信心指数','chart-global-us-conf');
        drawCompactMultiChart(ch,[{name:'消费者信心指数',data:data.usa_consumer_confidence,color:'#ff9f43'}]);
        addInterpretation(g.lastChild,'chart-global-us-conf');
    }
}

// ── RATES B: YIELD CURVE HISTORY EXPLORER ──
const YC_LABELS={m1:'1M',m2:'2M',m3:'3M',m6:'6M',y1:'1Y',y2:'2Y',y3:'3Y',y5:'5Y',y7:'7Y',y10:'10Y',y20:'20Y',y30:'30Y'};
const YC_KEYS=['m1','m2','m3','m6','y1','y2','y3','y5','y7','y10','y20','y30'];
let _ycHoverTimer=null, _ycSnapCache={};

function renderRatesB(data){
    const el=document.getElementById('rates_b'); el.innerHTML='';
    // —— 保留原 /api/yield_curve 快照数据：KPI + 形态 + 利差 ——
    if(data.levels){
        const lv=data.levels;
        const kpiGrid=document.createElement('div'); kpiGrid.className='kpi-grid';
        [{k:'yield_cn_1y',n:'1Y'},{k:'yield_cn_5y',n:'5Y'},{k:'yield_cn_10y',n:'10Y'},{k:'yield_cn_30y',n:'30Y'}].forEach(item=>{
            const v=lv[item.k];
            kpiGrid.innerHTML+=`<div class="kpi-card"><div class="kpi-label">${item.n}收益率</div><div class="kpi-value">${v!=null?v.toFixed(3):'-'}%</div></div>`;
        });
        el.appendChild(kpiGrid);
    }
    if(data.shape){
        const shObj=data.shape||{};
        const shapeName=shObj.shape||'-';
        const shapeSignal=shObj.signal||'';
        const card=document.createElement('div'); card.className='signal-card';
        const cls=shapeName==='倒挂'?'level-收缩':shapeName==='平坦'?'level-偏高':'level-扩张';
        card.innerHTML=`<div class="signal-row"><span class="sig-desc">收益率曲线形态</span><span class="signal-level ${cls}">${shapeName}</span></div>
            <div style="font-size:10px;color:var(--muted);margin-top:4px">${shapeSignal}</div>`;
        el.appendChild(card);
    }
    if(data.spreads){
        const sp=data.spreads;
        const sg=document.createElement('div'); sg.className='chart-grid'; el.appendChild(sg);
        if(sp.sp51?.length){
            const ch=renderChartCard(sg,'5Y-1Y 利差','chart-spread-51');
            drawCompactMultiChart(ch,[{name:'5Y-1Y bp',data:sp.sp51,color:'#ff4d4d'}]);
            addInterpretation(sg.lastChild,'chart-spread-51');
        }
        if(sp.sp105?.length){
            const ch=renderChartCard(sg,'10Y-5Y 利差','chart-spread-105');
            drawCompactMultiChart(ch,[{name:'10Y-5Y bp',data:sp.sp105,color:'#00d4ff'}]);
            addInterpretation(sg.lastChild,'chart-spread-105');
        }
        if(sp.sp3010?.length){
            const ch=renderChartCard(sg,'30Y-10Y 利差','chart-spread-3010');
            drawCompactMultiChart(ch,[{name:'30Y-10Y bp',data:sp.sp3010,color:'#00e676'}]);
            addInterpretation(sg.lastChild,'chart-spread-3010');
        }
    }

    // —— 新增：历史收益率曲线探索器 ——
    const today=new Date().toISOString().substring(0,10);
    window._ycMaxDate=today;
    const histCard=document.createElement('div'); histCard.className='chart-card';
    histCard.style.gridColumn='1 / -1';
    histCard.innerHTML='<div class="chart-title">美债收益率历史走势 2M/2Y/10Y/30Y + 2Y-10Y Spread</div>'+
        '<div id="chart-rates-b-history" style="position:relative;width:100%;height:320px;margin-top:8px"></div>';
    el.appendChild(histCard);

    const pickRow=document.createElement('div');
    pickRow.style.cssText='display:flex;align-items:center;gap:12px;margin:10px 0 8px;flex-wrap:wrap';
    pickRow.innerHTML='<span style="font-size:11px;color:var(--muted)">📅 选择日期:</span>'+
        '<input type="date" id="yc-date-picker" min="2015-01-01" max="'+today+'" value="'+today+'" style="background:var(--panel);border:1px solid var(--border);color:var(--text);border-radius:4px;padding:4px 8px;font-size:11px">'+
        '<span id="yc-hover-date" style="font-size:11px;color:var(--accent)">悬停: --</span>'+
        '<span style="font-size:10px;color:var(--muted)">↑ 悬停上图或选择日期，下方联动快照</span>';
    el.appendChild(pickRow);

    const snapCard=document.createElement('div'); snapCard.className='chart-card';
    snapCard.style.gridColumn='1 / -1';
    snapCard.innerHTML='<div class="chart-title" id="yc-snapshot-title">US Yield Curve — --</div>'+
        '<div id="chart-rates-b-snapshot" style="position:relative;width:100%;height:280px;margin-top:8px"></div>';
    el.appendChild(snapCard);

    const maxDate=window._ycMaxDate;
    const startDate='2015-01-01';
    var ycData=window.macroData?window.macroData['yield_curve']:null;
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
}

function initHistoryChart(hist){
    try{
    const us=hist.us||[]; if(!us.length) return;
    const dates=us.map(r=>r.dt);
    const s2m=us.map(r=>r.m2!=null?r.m2:null);
    const s2=us.map(r=>r.y2!=null?r.y2:null);
    const s10=us.map(r=>r.y10!=null?r.y10:null);
    const s30=us.map(r=>r.y30!=null?r.y30:null);
    const spread=us.map(r=>(r.y2!=null&&r.y10!=null)?(r.y10-r.y2)*100:null);
    const spreadVals=spread.filter(v=>v!=null);
    const spreadMin=spreadVals.length?Math.min(...spreadVals):0;
    const spreadMax=spreadVals.length?Math.max(...spreadVals):0;
    const spreadPad=Math.max((spreadMax-spreadMin)*0.1, 10);
    const spreadAxisMin=(spreadMin-spreadPad).toFixed(2);
    const spreadAxisMax=(spreadMax+spreadPad).toFixed(2);
    const dom=document.getElementById('chart-rates-b-history');
    if(charts['chart-rates-b-history']&&!charts['chart-rates-b-history'].isDisposed()) charts['chart-rates-b-history'].dispose();
    const chart=echarts.init(dom,null,{renderer:"canvas"});
    charts['chart-rates-b-history']=chart;
    chart.setOption({
        backgroundColor:'transparent',
        tooltip:{trigger:'axis',backgroundColor:'rgba(20,30,50,.92)',textStyle:{color:'#e0e6f1',fontSize:11}},
        legend:{data:['2M','2Y','10Y','30Y','2Y-10Y Spread'],textStyle:{color:'#8b9bb4',fontSize:10},top:2,itemWidth:12,itemHeight:6},
        grid:{left:50,right:60,top:34,bottom:44},
        xAxis:{type:'category',data:dates,axisLine:{lineStyle:{color:'#3a4566'}},axisLabel:{color:'#8b9bb4',fontSize:9,rotate:45,formatter:function(v){return String(v).substring(2);}}},
        yAxis:[
            {type:'value',name:'收益率%',nameTextStyle:{color:'#8b9bb4',fontSize:9},scale:true,splitLine:{lineStyle:{color:'#2a3452'}},axisLabel:{color:'#8b9bb4',fontSize:9}},
            {type:'value',name:'Spread(bp)',min:spreadAxisMin,max:spreadAxisMax,nameTextStyle:{color:'#8b9bb4',fontSize:9},scale:true,splitLine:{show:false},axisLabel:{color:'#8b9bb4',fontSize:9},position:'right'}
        ],
        dataZoom:[
            {type:'inside'},
            {type:'slider',bottom:6,height:16,textStyle:{color:'#8b9bb4'},borderColor:'#2a3452',backgroundColor:'rgba(30,38,66,.6)',fillerColor:'rgba(0,212,255,.15)'}
        ],
        // visualMap disabled due to ECharts coord error with null spread values
        // visualMap:{show:false,seriesIndex:4,dimension:1,pieces:[{gt:0,color:'#00e676'},{lte:0,color:'#ff4d4d'}]},
        series:[
            {name:'2M',type:'line',data:s2m,smooth:false,showSymbol:false,lineStyle:{width:1.2,color:'#ffc107'}},
            {name:'2Y',type:'line',data:s2,smooth:false,showSymbol:false,lineStyle:{width:1.2,color:'#bc8cff'}},
            {name:'10Y',type:'line',data:s10,smooth:false,showSymbol:false,lineStyle:{width:1.6,color:'#ff4d4d'}},
            {name:'30Y',type:'line',data:s30,smooth:false,showSymbol:false,lineStyle:{width:1.2,color:'#00e676'}},
            {name:'2Y-10Y Spread',type:'line',data:spread,yAxisIndex:1,smooth:false,showSymbol:false,lineStyle:{width:1.6,color:'#00d4ff'},markLine:{silent:true,symbol:'none',data:[{yAxis:0,lineStyle:{color:'#8b9bb4',type:'dashed',width:1},label:{show:false}}]}}
        ]
    });
    // 动态 markLine：悬停日期竖线
    chart.on('updateAxisPointer',function(params){
        if(!params || !params.axesInfo || !params.axesInfo.length) return;
        const ax=params.axesInfo[0];
        let val=ax.value;
        if(val==null) return;
        let idx=null, dateStr=null;
        if(typeof val==='number'){
            idx=Math.floor(val);
            if(idx>=0 && idx<dates.length) dateStr=String(dates[idx]).substring(0,10);
        } else {
            dateStr=String(val).substring(0,10);
            idx=dates.findIndex(d=>String(d).substring(0,10)===dateStr);
        }
        if(idx==null || idx<0 || idx>=dates.length || !dateStr) return;
        const hd=document.getElementById('yc-hover-date'); if(hd) hd.textContent='悬停: '+dateStr;
        chart.setOption({series:[{name:'2Y',markLine:{silent:true,symbol:'none',lineStyle:{color:'#8b9bb4',type:'dashed',width:1},label:{show:false},data:[{xAxis:dateStr}]}}]});
        const pk=document.getElementById('yc-date-picker');
        if(pk && pk.value!==dateStr) pk.value=dateStr;
        updateYcSnapshot(dateStr,window._ycHist);
    });
    chart.on('datazoom',function(){
        const opt=chart.getOption();
        if(!opt || !opt.dataZoom || !opt.dataZoom[0] || !opt.xAxis || !opt.xAxis[0] || !opt.xAxis[0].data) return;
        const rawIdx=opt.dataZoom[0].startValue;
        if(rawIdx==null) return;
        let idx=-1;
        const xs=opt.xAxis[0].data;
        if(typeof rawIdx==='number'){
            idx=Math.max(0, Math.min(Math.floor(rawIdx), xs.length-1));
        } else if(typeof rawIdx==='string'){
            const s=rawIdx.substring(0,10);
            idx=xs.findIndex(d=>String(d).substring(0,10)===s);
        }
        if(idx<0 || idx>=xs.length) return;
        const dateStr=String(xs[idx]).substring(0,10);
        if(dateStr) updateYcSnapshot(dateStr,window._ycHist);
    });
    setTimeout(function(){if(charts['chart-rates-b-history']&&!charts['chart-rates-b-history'].isDisposed())charts['chart-rates-b-history'].resize();},0);
    if(window.__isWeixin) setTimeout(function(){if(charts['chart-rates-b-history']&&!charts['chart-rates-b-history'].isDisposed())charts['chart-rates-b-history'].resize();},200);
    }catch(e){ console.error('initHistoryChart error', e); throw e; }
}

function updateYcSnapshot(dateStr,hist){
    if(!dateStr) return;
    if(_ycHoverTimer) clearTimeout(_ycHoverTimer);
    _ycHoverTimer=setTimeout(function(){_loadSnapshot(dateStr,hist);},220);
}

function _loadSnapshot(dateStr,hist){
    if(_ycSnapCache[dateStr]){ renderSnapshot(_ycSnapCache[dateStr],hist,dateStr); return; }
    var ycD=window.macroData?window.macroData['yield_curve']:null;
    if(!ycD) return;
    var d=ycD.history?ycD.history:ycD;
    _ycSnapCache[dateStr]=d;
    renderSnapshot(d,hist,dateStr);
}

function renderSnapshot(d,hist,dateStr){
    try{
    const dom=document.getElementById('chart-rates-b-snapshot'); if(!dom) return;
    const title=document.getElementById('yc-snapshot-title');
    if(title) title.textContent='US Yield Curve — '+dateStr;
    if(charts['chart-rates-b-snapshot']&&!charts['chart-rates-b-snapshot'].isDisposed()) charts['chart-rates-b-snapshot'].dispose();
    const usRow=(d.us||[])[0]||{};
    const cnRow=(d.cn||[])[0]||{};
    const keys=(d.maturities||YC_KEYS).filter(k=>YC_LABELS[k]);
    const xLabels=keys.map(k=>YC_LABELS[k]);
    const usVals=keys.map(k=>usRow[k]!=null?usRow[k]:null);
    if(usVals.every(v=>v==null)){
        dom.innerHTML='<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--muted);font-size:12px">该日期无美债收益率数据</div>';
        return;
    }
    const chart=echarts.init(dom,null,{renderer:"canvas"});
    charts['chart-rates-b-snapshot']=chart;
    let refVals=keys.map(()=>null);
    if(hist&&hist.us&&hist.us.length){
        const lastUs=hist.us[hist.us.length-1]||{};
        refVals=keys.map(k=>lastUs[k]!=null?lastUs[k]:null);
    }
    const cnKeys=['y2','y5','y10','y30'];
    const hasCn=keys.some(k=>cnKeys.includes(k)&&cnRow[k]!=null);
    const series=[
        {name:'参考(最新)',type:'line',data:refVals,connectNulls:true,showSymbol:false,lineStyle:{width:1.2,type:'dashed',color:'#8b9bb4'}},
        {name:'美债',type:'line',data:usVals,connectNulls:true,showSymbol:true,symbol:'circle',symbolSize:7,itemStyle:{color:'#00d4ff'},lineStyle:{width:1.6,type:'dashed',color:'#5a6a8a'}}
    ];
    if(hasCn){
        series.push({name:'中债',type:'line',data:keys.map(k=>cnRow[k]!=null?cnRow[k]:null),yAxisIndex:1,connectNulls:true,showSymbol:true,symbol:'circle',symbolSize:6,itemStyle:{color:'#bc8cff'},lineStyle:{width:1.4,color:'#bc8cff'}});
    }
    chart.setOption({
        backgroundColor:'transparent',
        tooltip:{trigger:'axis',backgroundColor:'rgba(20,30,50,.92)',textStyle:{color:'#e0e6f1',fontSize:11},
            formatter:function(ps){
                let h='<div style="font-weight:600;margin-bottom:4px">'+dateStr+'</div>';
                ps.forEach(p=>{ if(p.value==null) return; h+='<div>'+p.marker+' '+p.seriesName+': <b>'+p.value.toFixed(3)+'%</b></div>'; });
                return h;
            }},
        legend:{data:series.map(s=>s.name),textStyle:{color:'#8b9bb4',fontSize:10},top:2,itemWidth:12,itemHeight:6},
        grid:{left:50,right:hasCn?60:30,top:32,bottom:30},
        xAxis:{type:'category',data:xLabels,axisLine:{lineStyle:{color:'#3a4566'}},axisLabel:{color:'#8b9bb4',fontSize:9}},
        yAxis:[
            {type:'value',name:'收益率%',nameTextStyle:{color:'#8b9bb4',fontSize:9},scale:true,splitLine:{lineStyle:{color:'#2a3452'}},axisLabel:{color:'#8b9bb4',fontSize:9}},
            ...(hasCn?[{type:'value',name:'中债%',nameTextStyle:{color:'#bc8cff',fontSize:9},scale:true,splitLine:{show:false},axisLabel:{color:'#bc8cff',fontSize:9},position:'right'}]:[])
        ],
        series:series
    });
    setTimeout(function(){if(charts['chart-rates-b-snapshot']&&!charts['chart-rates-b-snapshot'].isDisposed())charts['chart-rates-b-snapshot'].resize();},0);
    if(window.__isWeixin) setTimeout(function(){if(charts['chart-rates-b-snapshot']&&!charts['chart-rates-b-snapshot'].isDisposed())charts['chart-rates-b-snapshot'].resize();},200);
    }catch(e){ console.error('renderSnapshot error', e); throw e; }
 }

 // ── FED WATCH TAB ──
 const FED_ACTION_TEXT={cut:'降息',hold:'持平',hike:'加息'};
 const FED_ACTION_COLOR={cut:'#00e676',hold:'#8b9bb4',hike:'#ff4d4d'};

 function renderFEDTab(data){
 // 清空前释放旧 FED 图表实例，避免 DOM 移除后 dispose 崩溃
 ['chart-fed-ladder','chart-fed-prob','chart-fed-dot'].forEach(id=>{
     try{ const c=charts[id]; if(c && !c.isDisposed()) c.dispose(); }catch(e){}
     delete charts[id];
 });
 const el=document.getElementById('fed');
 el.innerHTML='';
 const today=new Date().toISOString().substring(0,10);
 const meetings=(data.latest_meetings||[]).slice().sort((a,b)=>a.meeting_date<b.meeting_date?-1:1);
 const calendar=data.calendar||[];
 const dot=data.dot_plot||[];

 // KPI 区
 const kpiGrid=document.createElement('div'); kpiGrid.className='kpi-grid'; el.appendChild(kpiGrid);
 const currentRate=data.current_rate!=null?data.current_rate:'-';
 // 最近变动方向
 let lastChangeTxt=data.last_change_date||'-', lastChangeSub='';
 const lcMeeting=meetings.filter(m=>m.decision&&m.meeting_date===data.last_change_date)[0];
 if(lcMeeting&&lcMeeting.decision){ lastChangeTxt+=' '+ (FED_ACTION_TEXT[lcMeeting.decision.action]||lcMeeting.decision.action); }
 else {
     const anyAct=meetings.filter(m=>m.decision&&m.decision.action&&m.decision.action!=='hold');
     if(anyAct.length){ const lm=anyAct[anyAct.length-1]; lastChangeTxt=lm.meeting_date+' '+ (FED_ACTION_TEXT[lm.decision.action]||lm.decision.action); }
 }
 // 下次会议 + 降息概率
 const futureMtg=calendar.filter(c=>c.meeting_date>today);
 const nextMeeting=futureMtg.length?futureMtg[0].meeting_date:'-';
 let cutProb='-';
 const nextInMeetings=meetings.filter(m=>m.meeting_date>=today);
 const probSrc=nextInMeetings.length?nextInMeetings[0]:meetings[meetings.length-1];
 if(probSrc&&probSrc.prob_history&&probSrc.prob_history.length){
     const ph=probSrc.prob_history[probSrc.prob_history.length-1];
     if(ph.prob_cut_25!=null) cutProb=ph.prob_cut_25.toFixed(1)+'%';
 }
 kpiGrid.innerHTML+=`<div class="kpi-card"><div class="kpi-label">美联储利率</div><div class="kpi-value">${currentRate}%</div></div>
     <div class="kpi-card"><div class="kpi-label">最近变动</div><div class="kpi-value" style="font-size:14px">${lastChangeTxt}</div><div class="kpi-delta" style="color:var(--muted)">${lastChangeSub}</div></div>
     <div class="kpi-card"><div class="kpi-label">下次会议</div><div class="kpi-value" style="font-size:14px">${nextMeeting}</div></div>
     <div class="kpi-card"><div class="kpi-label">下次会议降息概率</div><div class="kpi-value">${cutProb}</div><div class="kpi-delta" style="color:var(--muted)">基于 ${probSrc?probSrc.meeting_date:'--'} 预期</div></div>`;

 // 图1：Fed 利率阶梯图
 const g1=document.createElement('div'); g1.className='chart-grid'; el.appendChild(g1);
 const ch1=renderChartCard(g1,'联邦基金利率阶梯 + FOMC 会议','chart-fed-ladder');
 const stepDates=meetings.map(m=>m.meeting_date);
 const stepRates=meetings.map(m=>m.decision&&m.decision.rate_after!=null?m.decision.rate_after:null);
 const fomcLines=futureMtg.slice(0,8).map(c=>({xAxis:c.meeting_date}));
 ch1.setOption({
     backgroundColor:'transparent',tooltip:{trigger:'axis',backgroundColor:'rgba(20,30,50,.92)',textStyle:{color:'#e0e6f1',fontSize:11}},
     legend:{data:['联邦基金利率'],textStyle:{color:'#8b9bb4',fontSize:10},top:2},
     grid:{left:50,right:25,top:34,bottom:44},
     xAxis:{type:'category',data:stepDates,axisLine:{lineStyle:{color:'#3a4566'}},axisLabel:{color:'#8b9bb4',fontSize:9,rotate:45}},
     yAxis:{type:'value',name:'%',nameTextStyle:{color:'#8b9bb4',fontSize:9},scale:true,splitLine:{lineStyle:{color:'#2a3452'}},axisLabel:{color:'#8b9bb4',fontSize:9}},
     dataZoom:[{type:'inside'},{type:'slider',bottom:6,height:16,textStyle:{color:'#8b9bb4'},borderColor:'#2a3452',backgroundColor:'rgba(30,38,66,.6)',fillerColor:'rgba(0,212,255,.15)'}],
     series:[{
         name:'联邦基金利率',type:'line',data:stepRates,step:'end',smooth:false,showSymbol:true,symbolSize:6,
         lineStyle:{width:2,color:'#ff4d4d'},itemStyle:{color:'#ff4d4d'},
         markLine:{silent:true,symbol:'none',data:fomcLines.map(x=>({...x,lineStyle:{color:'rgba(139,155,180,.4)',type:'dashed'},label:{show:false}}))}
     }]
 },true);
 addInterpretation(g1.lastChild,'chart-fed-ladder');

 // 图2：降息概率时间线（核心图）
 const ch2=renderChartCard(g1,'FOMC 会议降息/持平/加息概率 (最近预期)','chart-fed-prob');
 const probDates=meetings.map(m=>m.meeting_date);
 const cutD=meetings.map(m=>{const ph=m.prob_history&&m.prob_history.length?m.prob_history[m.prob_history.length-1]:null;return ph&&ph.prob_cut_25!=null?ph.prob_cut_25:null;});
 const holdD=meetings.map(m=>{const ph=m.prob_history&&m.prob_history.length?m.prob_history[m.prob_history.length-1]:null;return ph&&ph.prob_hold!=null?ph.prob_hold:null;});
 const hikeD=meetings.map(m=>{const ph=m.prob_history&&m.prob_history.length?m.prob_history[m.prob_history.length-1]:null;return ph&&ph.prob_hike_25!=null?ph.prob_hike_25:null;});
 // 实际决策标记（已完成会议）
 const actualMarks=[];
 meetings.forEach((m,i)=>{
     if(m.decision&&m.decision.action){
         actualMarks.push({
             coord:[i,m.decision.action==='hold'?0:100],
             value:(FED_ACTION_TEXT[m.decision.action]||m.decision.action),
             itemStyle:{color:FED_ACTION_COLOR[m.decision.action]||'#8b9bb4'}
         });
     }
 });
 // 已完成的会议背景区域：绿=实际降息 红=实际加息 灰=持平
 const pastAreas=[];
 meetings.forEach(m=>{
     if(m.decision&&m.decision.action&&m.meeting_date<=today){
         const color=m.decision.action==='cut'?'rgba(0,230,118,.12)':m.decision.action==='hike'?'rgba(255,77,77,.12)':'rgba(139,155,180,.10)';
         pastAreas.push([{xAxis:m.meeting_date,itemStyle:{color:color}},{xAxis:m.meeting_date,itemStyle:{color:color}}]);
     }
 });
 ch2.setOption({
     backgroundColor:'transparent',tooltip:{trigger:'axis',backgroundColor:'rgba(20,30,50,.92)',textStyle:{color:'#e0e6f1',fontSize:11}},
     legend:{data:['降25bp','持平','加25bp'],textStyle:{color:'#8b9bb4',fontSize:10},top:2},
     grid:{left:50,right:25,top:34,bottom:44},
     xAxis:{type:'category',data:probDates,axisLine:{lineStyle:{color:'#3a4566'}},axisLabel:{color:'#8b9bb4',fontSize:9,rotate:45}},
     yAxis:{type:'value',name:'%',min:0,max:100,nameTextStyle:{color:'#8b9bb4',fontSize:9},scale:false,splitLine:{lineStyle:{color:'#2a3452'}},axisLabel:{color:'#8b9bb4',fontSize:9}},
     dataZoom:[{type:'inside'},{type:'slider',bottom:6,height:16,textStyle:{color:'#8b9bb4'},borderColor:'#2a3452',backgroundColor:'rgba(30,38,66,.6)',fillerColor:'rgba(0,212,255,.15)'}],
     series:[
         {name:'降25bp',type:'bar',data:cutD,itemStyle:{color:'#00e676'},markArea:{silent:true,data:pastAreas}},
         {name:'持平',type:'bar',data:holdD,itemStyle:{color:'#8b9bb4'}},
         {name:'加25bp',type:'bar',data:hikeD,itemStyle:{color:'#ff4d4d'}},
         {name:'实际决策',type:'scatter',data:[],itemStyle:{color:'#fff',borderWidth:2},markPoint:{data:actualMarks,symbolSize:10,label:{show:true,formatter:function(p){return p.data.value||'';},color:'#fff',fontSize:9,position:'top'},tooltip:{formatter:function(p){return '实际决议: '+p.data.value;}},z:10}}
     ]
 },true);
 addInterpretation(g1.lastChild,'chart-fed-prob');

 // 图3：点阵图散点
 const ch3=renderChartCard(g1,'最新点阵图 SEP — '+(dot.length?dot[dot.length-1].meeting_date:'--'),'chart-fed-dot');
 const latestDotDate=dot.length?dot[dot.length-1].meeting_date:null;
 const dotRows=latestDotDate?dot.filter(d=>d.meeting_date===latestDotDate):[];
 const dotYears=dotRows.map(d=>String(d.year_target));
 const dotUpper=dotRows.map(d=>d.upper!=null?d.upper:null);
 const dotMedian=dotRows.map(d=>d.median!=null?d.median:null);
 const dotLower=dotRows.map(d=>d.lower!=null?d.lower:null);
 ch3.setOption({
     backgroundColor:'transparent',tooltip:{trigger:'item',backgroundColor:'rgba(20,30,50,.92)',textStyle:{color:'#e0e6f1',fontSize:11}},
     legend:{data:['上限(75%)','中位数','下限(25%)'],textStyle:{color:'#8b9bb4',fontSize:10},top:2},
     grid:{left:50,right:25,top:34,bottom:30},
     xAxis:{type:'category',data:dotYears,axisLine:{lineStyle:{color:'#3a4566'}},axisLabel:{color:'#8b9bb4',fontSize:9}},
     yAxis:{type:'value',name:'联邦基金利率%',nameTextStyle:{color:'#8b9bb4',fontSize:9},scale:true,splitLine:{lineStyle:{color:'#2a3452'}},axisLabel:{color:'#8b9bb4',fontSize:9}},
     series:[
         {name:'中位数连线',type:'line',data:dotMedian,smooth:false,showSymbol:false,lineStyle:{width:1.6,type:'dashed',color:'#ff4d4d'},z:2},
         {name:'上限(75%)',type:'scatter',data:dotUpper,symbolSize:9,itemStyle:{color:'#bc8cff'},z:3},
         {name:'中位数',type:'scatter',data:dotMedian,symbolSize:11,itemStyle:{color:'#ff4d4d'},z:4,label:{show:true,formatter:function(p){return p.value!=null?p.value.toFixed(1):'';},color:'#e0e6f1',fontSize:9,position:'top'}},
         {name:'下限(25%)',type:'scatter',data:dotLower,symbolSize:9,itemStyle:{color:'#00d4ff'},z:3}
     ]
 },true);

 // 信息面板：FOMC 日历表格
 const panel=document.createElement('div'); panel.className='chart-card';
 panel.style.gridColumn='1 / -1';
 panel.innerHTML='<div class="chart-title">FOMC 会议日历（过去+未来，实际决策）</div>';
 el.appendChild(panel);
 const decMap={};
 meetings.forEach(m=>{ if(m.decision) decMap[m.meeting_date]=m.decision; });
 let th='<table style="width:100%;border-collapse:collapse;font-size:11px"><thead><tr style="color:var(--muted);text-align:left"><th style="padding:4px 8px;border-bottom:1px solid var(--border)">会议日期</th><th style="padding:4px 8px;border-bottom:1px solid var(--border)">状态</th><th style="padding:4px 8px;border-bottom:1px solid var(--border)">实际决策</th><th style="padding:4px 8px;border-bottom:1px solid var(--border)">会前降息概率(最新)</th></tr></thead><tbody>';
 calendar.forEach(c=>{
     const dec=decMap[c.meeting_date];
     const isPast=c.meeting_date<today;
     const isNext=c.meeting_date===nextMeeting;
     const phRow=meetings.filter(m=>m.meeting_date===c.meeting_date)[0];
     const ph=phRow&&phRow.prob_history&&phRow.prob_history.length?phRow.prob_history[phRow.prob_history.length-1]:null;
     const decTxt=dec?(FED_ACTION_TEXT[dec.action]||dec.action)+(dec.rate_after!=null?' → '+dec.rate_after+'%':''):(isPast?'—':'未召开');
     const decColor=dec?FED_ACTION_COLOR[dec.action]||'var(--text)':'var(--muted)';
     const cutTxt=ph&&ph.prob_cut_25!=null?ph.prob_cut_25.toFixed(1)+'%':'—';
     th+=`<tr style="border-bottom:1px solid var(--border)"><td style="padding:4px 8px">${c.meeting_date}${isNext?' <span style="color:var(--accent)">→ 下次</span>':''}</td>
         <td style="padding:4px 8px;color:${isPast?'var(--muted)':'var(--accent)'}">${isPast?'已结束':'未来'}</td>
         <td style="padding:4px 8px;color:${decColor};font-weight:600">${decTxt}</td>
         <td style="padding:4px 8px">${cutTxt}</td></tr>`;
 });
 th+='</tbody></table>';
 panel.innerHTML+=th;
 if(window.__isWeixin) setTimeout(function(){Object.values(charts).forEach(c=>c&&!c.isDisposed()&&c.resize());},200);
 }



function renderRisk(data){
    const el=document.getElementById('risk');el.innerHTML='';
    const g=document.createElement('div');g.className='chart-grid';el.appendChild(g);
    if(data.vix?.length){const ch=renderChartCard(g,'VIX 恐慌指数','chart-risk-vix');drawCompactMultiChart(ch,[{name:'VIX',data:data.vix,color:'#ff4d4d'}]);const c=g.lastChild;const p=document.createElement('div');p.className='interpret-panel';p.innerHTML='<span class="tip">💡 VIX：</span>低于20=平静，20-30=警惕，高于30=恐慌。';c.appendChild(p)}
        addInterpretation(g.lastChild,'chart-risk-vix');
    if(data.cn_us_spread?.length){const ch=renderChartCard(g,'中美利差(bp)','chart-risk-cn-us');drawCompactMultiChart(ch,[{name:'CN-US利差',data:data.cn_us_spread,color:'#ff9f43'}]);addInterpretation(g.lastChild,'chart-risk-cn-us')}
}


function renderNews(data){
    const el=document.getElementById('news');el.innerHTML='';
    const fd=document.createElement('div');fd.style.cssText='margin-bottom:8px;display:flex;gap:6px;flex-wrap:wrap';
    fd.innerHTML=`<button onclick="window.filterNews('all')" style="padding:3px 10px;border:1px solid var(--border);background:var(--card);color:var(--text);border-radius:3px;cursor:pointer;font-size:10px">全部</button>
        <button onclick="window.filterNews('A')" style="padding:3px 10px;border:1px solid var(--down);background:rgba(255,77,77,.1);color:var(--down);border-radius:3px;cursor:pointer;font-size:10px">A级-重大</button>
        <button onclick="window.filterNews('B')" style="padding:3px 10px;border:1px solid var(--gold);background:rgba(255,193,7,.1);color:var(--gold);border-radius:3px;cursor:pointer;font-size:10px">B级-重要</button>
        <button onclick="window.filterNews('C')" style="padding:3px 10px;border:1px solid var(--border);background:var(--card);color:var(--muted);border-radius:3px;cursor:pointer;font-size:10px">C级-参考</button>`;
    el.appendChild(fd);
    const list=document.createElement('div');list.id='news-list';list.style.cssText='display:flex;flex-direction:column;gap:4px';el.appendChild(list);
    window._allNews=data||[];window._newsFilter='all';renderNewsFiltered();
}
window.filterNews=function(l){window._newsFilter=l;renderNewsFiltered()};
function renderNewsFiltered(){
    const list=document.getElementById('news-list');if(!list)return;
    const nw=window._allNews||[],fl=window._newsFilter==='all'?nw:nw.filter(n=>n.tier===window._newsFilter);
    list.innerHTML=fl.length?fl.map(n=>{const lc=n.tier==='A'?'level-收缩':n.tier==='B'?'level-偏高':'';return`<div style="background:var(--card);border-left:3px solid ${n.tier==='A'?'var(--down)':n.tier==='B'?'var(--gold)':'var(--border)'};padding:6px 8px;border-radius:0 4px 4px 0;cursor:pointer" onclick="window.open('${n.raw||n.title||'#'}','_blank')"><div style="display:flex;justify-content:space-between;font-size:10px;margin-bottom:2px"><span style="color:var(--muted)">${(n.time||n.date||'').split(' ')[0]}</span><span class="signal-level ${lc}" style="font-size:9px">${n.tier||'C'}</span></div><div style="font-size:11px;color:var(--text);line-height:1.4">${(n.title||n.raw||'').substring(0,120)}</div></div>`}).join(''):'<div style="text-align:center;color:var(--muted);padding:20px">无匹配新闻</div>';
}


function renderPolicy(data){
    const el=document.getElementById('policy');el.innerHTML='';
    const g=document.createElement('div');g.className='chart-grid';el.appendChild(g);
    if(data.m2_yoy?.length){const last=data.m2_yoy[data.m2_yoy.length-1],prev=data.m2_yoy.length>1?data.m2_yoy[data.m2_yoy.length-2]:last;el.innerHTML+=`<div class="kpi-grid"><div class="kpi-card"><div class="kpi-label">M2 同比</div><div class="kpi-value">${last.value}%</div><span style="font-size:10px">上一期:${prev.value}%</span></div></div>`}
    if(data.m1_yoy?.length){const last=data.m1_yoy[data.m1_yoy.length-1],prev=data.m1_yoy.length>1?data.m1_yoy[data.m1_yoy.length-2]:last;el.innerHTML+=`<div class="kpi-grid"><div class="kpi-card"><div class="kpi-label">M1 同比</div><div class="kpi-value">${last.value}%</div><span style="font-size:10px">上一期:${prev.value}%</span></div></div>`}
    if(data.new_credit?.length){const last=data.new_credit[data.new_credit.length-1];el.innerHTML+=`<div class="kpi-grid"><div class="kpi-card"><div class="kpi-label">新增信贷(亿元)</div><div class="kpi-value">${last.value}</div></div></div>`}
    if(data.social_financing?.length){const last=data.social_financing[data.social_financing.length-1];el.innerHTML+=`<div class="kpi-grid"><div class="kpi-card"><div class="kpi-label">社融规模(亿元)</div><div class="kpi-value">${last.value}</div></div></div>`}
    if(data.m1_yoy?.length||data.m2_yoy?.length){const sm=[];if(data.m1_yoy?.length)sm.push({name:'M1同比%',data:data.m1_yoy,color:'#00d4ff'});if(data.m2_yoy?.length)sm.push({name:'M2同比%',data:data.m2_yoy,color:'#ff9f43'});if(sm.length){const ch=renderChartCard(g,'M1/M2 剪刀差','chart-policy-m1m2');drawCompactMultiChart(ch,sm);addInterpretation(g.lastChild,'chart-policy-m1m2')}}
    if(data.new_credit?.length){const ch=renderChartCard(g,'新增信贷(亿元)','chart-policy-credit');drawCompactMultiChart(ch,[{name:'新增信贷',data:data.new_credit,color:'#00e676'}]);addInterpretation(g.lastChild,'chart-policy-credit')}
    if(data.social_financing?.length){const ch=renderChartCard(g,'社融规模(亿元)','chart-policy-sf');drawCompactMultiChart(ch,[{name:'社融',data:data.social_financing,color:'#ff4d4d'}]);addInterpretation(g.lastChild,'chart-policy-sf')}
    if(data.fiscal_revenue?.length||data.local_gov_bonds?.length){const sm=[];if(data.fiscal_revenue?.length)sm.push({name:'财政收入',data:data.fiscal_revenue,color:'#ff9f43'});if(data.local_gov_bonds?.length)sm.push({name:'地方债',data:data.local_gov_bonds,color:'#00d4ff'});if(sm.length){const ch=renderChartCard(g,'财政+地方债','chart-policy-fiscal');drawCompactMultiChart(ch,sm);addInterpretation(g.lastChild,'chart-policy-fiscal')}}
    if(data.m1_yoy?.length&&data.m2_yoy?.length){const l1=data.m1_yoy[data.m1_yoy.length-1],l2=data.m2_yoy[data.m2_yoy.length-1],s=(l1.value-l2.value).toFixed(1);const c=document.createElement('div');c.className='signal-card';c.innerHTML=`<div class="signal-row"><span class="sig-desc">M1-M2 剪刀差</span><span class="signal-level ${s>0?'level-扩张':s<-2?'level-收缩':'level-偏高'}">${s}%</span></div><div style="font-size:10px;color:var(--muted)">M1=${l1.value}% M2=${l2.value}%。剪刀差< -2%警惕资金定期化</div>`;el.appendChild(c)}
}


function renderAnalysis(data){
    const el=document.getElementById('analysis');el.innerHTML='';
    const g=document.createElement('div');g.className='chart-grid';el.appendChild(g);
    if(data.signals?.length){
        data.signals.forEach(s=>{try{const rj=s.raw_json?JSON.parse(s.raw_json):{};const card=document.createElement('div');card.className='chart-card';let h=`<div class="chart-title">${s.signal_date||s.created_at||'分析'} (${s.dimension||'整体'})</div>`;for(const[k,v] of Object.entries(rj)){const lc=v.level==='扩张'||v.level==='流入'||v.level==='稳定'?'level-扩张':v.level==='收缩'||v.level==='流出'||v.level==='紧张'?'level-收缩':'level-偏高';h+=`<div style="padding:6px 8px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center"><span style="font-size:11px">${k}: ${v.value} ${v.desc||''}</span><span class="signal-level ${lc}" style="font-size:9px">${v.level||'-'}</span></div>`}card.innerHTML=h;g.appendChild(card)}catch(e){}});
    }
    if(data.summary?.summary_text){try{const sj=data.summary.summary_text?JSON.parse(data.summary.summary_text):{};const card=document.createElement('div');card.className='chart-card';card.innerHTML='<div class="chart-title">综合宏观摘要</div>';let h='<div style="padding:8px;font-size:11px;line-height:1.8">';for(const[dim,items] of Object.entries(sj)){h+=`<div style="margin-bottom:6px"><b>${dim}</b>:`;for(const[k,v] of Object.entries(items)){const lc=v.level==='扩张'||v.level==='温和'||v.level==='稳定'?'level-扩张':v.level==='收缩'||v.level==='紧张'?'level-收缩':'level-偏高';h+=`<span style="display:inline-block;margin:2px 4px;padding:2px 6px;background:var(--card);border:1px solid var(--border);border-radius:3px;font-size:10px">${k}: ${v.value} <span class="signal-level ${lc}" style="font-size:9px">${v.level}</span></span> `}h+='</div>'}h+='</div>';card.innerHTML+=h;g.appendChild(card)}catch(e){}}
    if(!data.signals?.length&&!data.summary?.summary_text)el.innerHTML='<div style="text-align:center;color:var(--muted);padding:40px">暂无分析数据</div>';
}


// ── METALS SECTION (Non-ferrous + Precious + Tech Indices + Fund Flows) ──
function renderMetals(data){
    const el=document.getElementById('metals'); el.innerHTML='';
    const g=document.createElement('div'); g.className='chart-grid'; el.appendChild(g);

    // 1. Precious metals: gold + silver
    const p=data.precious||{};
    if(p.gold?.length || p.silver?.length){
        const sm=[];
        if(p.gold?.length) sm.push({name:'黄金(元/g)',data:p.gold,color:'#ffd700'});
        if(p.silver?.length) sm.push({name:'白银(元/g)',data:p.silver,color:'#c0c0c0'});
        if(sm.length){
            const ch=renderChartCard(g,'贵金属价格走势','chart-metals-precious');
            drawCompactMultiChart(ch,sm,{dualYAxis:[{seriesNames:['黄金(元/g)']},{seriesNames:['白银(元/g)']}]});
            addInterpretation(g.lastChild,'chart-metals-precious');
        }
    }

    // 2. Base metals: copper, aluminum, zinc, lead, nickel, tin
    const bm=data.base_metals||{};
    const baseColors={'copper':'#e87d4a','aluminum':'#b0bec5','zinc':'#4fc3f7','lead':'#78909c','nickel':'#8bc34a','tin':'#ab47bc'};
    const baseNames={'copper':'铜','aluminum':'铝','zinc':'锌','lead':'铅','nickel':'镍','tin':'锡'};
    const sm2=[];
    for(const[key,name] of Object.entries(baseNames)){
        if(bm[key]?.length) sm2.push({name:name,data:bm[key],color:baseColors[key]});
    }
    if(sm2.length){
        const ch=renderChartCard(g,'有色金属期货价格(主力合约)','chart-metals-base');
        drawCompactMultiChart(ch,sm2);
        addInterpretation(g.lastChild,'chart-metals-base');
    }

    // 3. Tech indices: NASDAQ100, S&P500 Info, KOSDAQ, CSI300 Info
    const ti=data.tech_indices||{};
    const tiNames={'nasdaq100':'纳斯达克100','sp500_info':'标普500信息','kosdaq':'KOSDAQ','csi300_info':'沪深300信息'};
    const tiColors={'nasdaq100':'#00e676','sp500_info':'#00d4ff','kosdaq':'#ff9f43','csi300_info':'#ff4d4d'};
    const sm3=[];
    for(const[key,name] of Object.entries(tiNames)){
        if(ti[key]?.length) sm3.push({name:name,data:ti[key],color:tiColors[key]});
    }
    if(sm3.length){
        const ch=renderChartCard(g,'科技股指表现','chart-metals-tech');
        drawCompactMultiChart(ch,sm3);
        addInterpretation(g.lastChild,'chart-metals-tech');
    }

    // 4. Fund flows heatmap (bar chart of TOP10 sector net inflow)
    const ff=data.fund_flows||[];
    if(ff.length){
        const ch=renderChartCard(g,'板块资金净流入 TOP10(亿)','chart-metals-flow');
        ch.clear();
        ch.setOption({
            backgroundColor:'transparent',
            tooltip:{trigger:'axis',axisPointer:{type:'shadow'}},
            grid:{left:80,right:40,top:10,bottom:30},
            xAxis:{type:'value',axisLabel:{color:'#8b9bb4',fontSize:9},splitLine:{lineStyle:{color:'#2a3452'}}},
            yAxis:{type:'category',data:ff.map(f=>f.sector),axisLabel:{color:'#8b9bb4',fontSize:10},axisLine:{lineStyle:{color:'#3a4566'}}},
            series:[{
                type:'bar',
                data:ff.map((f,i)=>({
                    value:f.flow,
                    itemStyle:{color:new echarts.graphic.LinearGradient(0,0,1,0,[
                        {offset:0,color:'#00d4ff'},
                        {offset:1,color:`rgba(0,212,255,${0.3+0.7*(1-i/ff.length)})`}
                    ])}
                })),
                barWidth:16,
                label:{show:true,position:'right',color:'#8b9bb4',fontSize:9,formatter:p=>(p.value>0?` ${p.value}亿`:'')}
            }]
        },true);
        addInterpretation(g.lastChild,'chart-metals-flow');
    }

    // 5. KPI: Northbound + latest metal prices
    const kpiGrid=document.createElement('div'); kpiGrid.className='kpi-grid'; kpiGrid.style.marginTop='14px';
    // Northbound latest
    const nb=data.northbound||[];
    if(nb?.length){
        const ln=nb[nb.length-1], pn=nb.length>1?nb[nb.length-2]:null;
        const sign=ln.value>=0?'+':'';
        const col=ln.value>=0?'var(--up)':'var(--down)';
        kpiGrid.innerHTML+=`<div class="kpi-card"><div class="kpi-label">北向资金净流入(亿)</div><div class="kpi-value" style="color:${col}">${sign}${(ln.value/100).toFixed(2)}</div><div class="kpi-delta">${pn?((ln.value-pn.value)>=0?'🟢':'🔴')+' 近期趋势':''}</div></div>`;
    }
    // Latest base metal prices as KPIs
    const bmKpi=data.base_metals||{};
    const baseNamesKpi={'copper':'铜','aluminum':'铝','zinc':'锌','lead':'铅','nickel':'镍','tin':'锡'};
    const baseColors2={'copper':'#e87d4a','aluminum':'#b0bec5','zinc':'#4fc3f7','lead':'#78909c','nickel':'#8bc34a','tin':'#ab47bc'};
    for(const[key,name] of Object.entries(baseNamesKpi)){
        if(bmKpi[key]?.length){
            const latest=bmKpi[key][bmKpi.length-1];
            kpiGrid.innerHTML+=`<div class="kpi-card"><div class="kpi-label">${name}(主力)</div><div class="kpi-value" style="color:${baseColors2[key]}">${latest.value}</div></div>`;
        }
    }
    // Latest precious prices
    const pKpi=data.precious||{};
    if(pKpi.gold?.length){
        const lg=pKpi.gold[pKpi.gold.length-1];
        kpiGrid.innerHTML+=`<div class="kpi-card"><div class="kpi-label">黄金(元/g)</div><div class="kpi-value" style="color:#ffd700">${lg.value}</div></div>`;
    }
    if(pKpi.silver?.length){
        const ls=pKpi.silver[pKpi.silver.length-1];
        kpiGrid.innerHTML+=`<div class="kpi-card"><div class="kpi-label">白银(元/g)</div><div class="kpi-value" style="color:#c0c0c0">${ls.value}</div></div>`;
    }
    el.appendChild(kpiGrid);
}

// ── LITHIUM INVENTORY SECTION ──
async function renderLithium() {
    const el = document.getElementById('lithium');
    el.innerHTML = '<div class="loading">加载中...</div>';
    try {
        var cosData = window.macroData ? (window.macroData['lithium_companies'] || []) : [];
        var chainsData = window.macroData ? (window.macroData['lithium_chain_summary'] || []) : [];
        var cos = Array.isArray(cosData) ? cosData : (cosData.companies || []);
        var chains = Array.isArray(chainsData) ? chainsData : (chainsData.chains || []);

        // KPI summary
        const totalInv = chains.reduce((s, c) => s + (c.total_inv_billion || 0), 0);
        const kpiGrid = document.createElement('div');
        kpiGrid.className = 'kpi-grid';
        kpiGrid.innerHTML = `
            <div class="kpi-card"><div class="kpi-label">覆盖企业数</div><div class="kpi-value">${cos.length}</div></div>
            <div class="kpi-card"><div class="kpi-label">存货总计(亿元)</div><div class="kpi-value" style="color:#6366f1">${totalInv.toFixed(1)}</div></div>
            ${chains.map(c => `<div class="kpi-card"><div class="kpi-label">${c.chain}</div><div class="kpi-value">${(c.total_inv_billion||0).toFixed(1)} 亿</div><div class="kpi-delta" style="color:var(--muted)">${c.companies} 家企业</div></div>`).join('')}
        `;
        el.innerHTML = '';
        el.appendChild(kpiGrid);

        // Charts grid
        const g = document.createElement('div');
        g.className = 'chart-grid';
        el.appendChild(g);

        // 1. Chain bar chart
        const card1 = document.createElement('div');
        card1.className = 'chart-card';
        card1.innerHTML = '<div class="chart-title">各环节存货汇总 (亿元)</div><div id="liChainChart" class="chart"></div>';
        g.appendChild(card1);
        const cc = echarts.init(document.getElementById('liChainChart'));
        cc.setOption({
            tooltip: { trigger: 'axis' },
            grid: { left: 80, right: 20, top: 20, bottom: 30 },
            xAxis: { type: 'value', axisLabel: { color: '#888' }, splitLine: { lineStyle: { color: '#222' } } },
            yAxis: { type: 'category', data: chains.map(c => c.chain), axisLabel: { color: '#ccc' } },
            series: [{ type: 'bar', data: chains.map(c => +(c.total_inv_billion || 0).toFixed(1)), itemStyle: { color: '#6366f1' }, label: { show: true, position: 'right', color: '#ccc', formatter: '{c} 亿' } }]
        });

        // 2. Top 10 bar chart
        const top10 = cos.filter(c => c.latest_inv_billion).sort((a, b) => b.latest_inv_billion - a.latest_inv_billion).slice(0, 10);
        const card2 = document.createElement('div');
        card2.className = 'chart-card';
        card2.innerHTML = '<div class="chart-title">存货 Top 10 (亿元)</div><div id="liTopChart" class="chart"></div>';
        g.appendChild(card2);
        const tc = echarts.init(document.getElementById('liTopChart'));
        const colors = ['#a78bfa', '#60a5fa', '#34d399', '#fb923c', '#f472b6'];
        tc.setOption({
            tooltip: { trigger: 'axis' },
            grid: { left: 80, right: 20, top: 20, bottom: 30 },
            xAxis: { type: 'value', axisLabel: { color: '#888' }, splitLine: { lineStyle: { color: '#222' } } },
            yAxis: { type: 'category', data: top10.map(c => c.name), axisLabel: { color: '#ccc' } },
            series: [{ type: 'bar', data: top10.map((c, i) => ({ value: +c.latest_inv_billion.toFixed(1), itemStyle: { color: colors[i % colors.length] } })), label: { show: true, position: 'right', color: '#ccc', formatter: '{c} 亿' } }]
        });

        // 3. Time series with selector
        const sectorMap = {};
        cos.forEach(c => {
            const key = c.industry_chain;
            if (!sectorMap[key]) sectorMap[key] = [];
            sectorMap[key].push(c);
        });
        const card3 = document.createElement('div');
        card3.className = 'chart-card';
        card3.style.gridColumn = '1 / -1';
        const selectors = Object.entries(sectorMap).map(([sec, cs]) =>
            `<span style="color:${sec==='上游'?'#a78bfa':sec==='中游'?'#60a5fa':sec==='下游-正极'?'#34d399':'#fb923c'};font-size:11px;font-weight:600">${sec}</span>` +
            `<select style="background:#0f3460;color:#e0e0e0;border:1px solid #0f3460;padding:3px 6px;border-radius:4px;font-size:12px" data-sector="${sec}">${cs.map(c => `<option value="${c.ticker}">${c.name}(${c.ticker})</option>`).join('')}</select>`
        ).join(' ');
        card3.innerHTML = `
            <div class="chart-title">企业存货时序 <span style="font-weight:normal;margin-left:12px">${selectors}</span></div>
            <div id="liTimeChart" class="chart" style="height:360px"></div>
        `;
        g.appendChild(card3);
        const timc = echarts.init(document.getElementById('liTimeChart'));

        async function drawTimeChart() {
            const selects = card3.querySelectorAll('select');
            const tickers = Array.from(selects).map(s => s.value);
            var lithiumAll = window.macroData ? (window.macroData['lithium_inventory'] || {}) : {};
            var results = tickers.map(function(t){ var inv = lithiumAll[t]||lithiumAll['all']||[]; var name = cos.find(function(c){return c.ticker===t})?.name||t; return {ticker:t,name:name,data:inv}; });
            // results already populated above
            const series = results.map((r, i) => ({
                name: r.name,
                type: 'line',
                smooth: true,
                data: r.data.map(d => ({ name: d.date, value: d.inventory_billion })),
                itemStyle: { color: colors[i % colors.length] },
                symbol: 'none',
                lineStyle: { width: 2 }
            }));
            const allDates = [...new Set(results.flatMap(r => r.data.map(d => d.date)))].sort();
            timc.setOption({
                tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
                legend: { data: results.map(r => r.name), textStyle: { color: '#888' }, top: 0 },
                grid: { left: 60, right: 20, top: 35, bottom: 30 },
                xAxis: { type: 'category', data: allDates, axisLabel: { color: '#888', rotate: 30 }, axisLine: { lineStyle: { color: '#333' } } },
                yAxis: { type: 'value', name: '亿元', axisLabel: { color: '#888' }, splitLine: { lineStyle: { color: '#222' } } },
                series
            });
        }
        card3.querySelectorAll('select').forEach(s => s.addEventListener('change', drawTimeChart));
        await drawTimeChart();

        // 4. Full data table
        const card4 = document.createElement('div');
        card4.className = 'chart-card';
        card4.style.gridColumn = '1 / -1';
        const secLabel = { '上游': '上游', '中游': '中游', '下游-正极': '正极', '下游-电池': '电池' };
        const secClass = { '上游': 's-up', '中游': 's-mid', '下游-正极': 's-cat', '下游-电池': 's-bat' };
        const rows = cos.map(c => `<tr>
            <td style="color:#60a5fa">${c.ticker}</td>
            <td>${c.name}</td>
            <td><span class="sector-tag ${secClass[c.industry_chain]||'s-mid'}">${secLabel[c.industry_chain]||c.industry_chain}</span></td>
            <td style="color:#888">${c.latest_date||'--'}</td>
            <td>${c.latest_inv_billion!=null?c.latest_inv_billion.toFixed(1)+' 亿':'--'}</td>
        </tr>`).join('');
        card4.innerHTML = `
            <div class="chart-title">全部企业数据 (${cos.length} 家)</div>
            <div style="max-height:400px;overflow-y:auto">
                <table style="width:100%;border-collapse:collapse;font-size:12px">
                    <thead><tr style="position:sticky;top:0">
                        <th style="background:#0f3460;color:#00d4ff;padding:6px 8px;text-align:left">代码</th>
                        <th style="background:#0f3460;color:#00d4ff;padding:6px 8px;text-align:left">名称</th>
                        <th style="background:#0f3460;color:#00d4ff;padding:6px 8px;text-align:left">环节</th>
                        <th style="background:#0f3460;color:#00d4ff;padding:6px 8px;text-align:left">最新日期</th>
                        <th style="background:#0f3460;color:#00d4ff;padding:6px 8px;text-align:left">存货(亿)</th>
                    </tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        `;
        el.appendChild(card4);

        // Resize handler
        window.addEventListener('resize', () => { cc.resize(); tc.resize(); timc.resize(); });

    } catch(e) {
        el.innerHTML = `<div class="error">加载失败: ${e.message}</div>`;
    }
}

async function loadSection(sec){
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
}


function drawLineChart(chart,title,seriesData,color){
    chart.clear();
    chart.setOption({
        backgroundColor:'transparent',tooltip:{trigger:'axis'},
        grid:{left:45,right:25,top:26,bottom:32},
        xAxis:{type:'category',data:seriesData.map(d=>d.date),axisLine:{lineStyle:{color:'#3a4566'}},axisLabel:{color:'#8b9bb4',fontSize:9,rotate:45}},
        yAxis:{type:'value',scale:true,splitLine:{lineStyle:{color:'#2a3452'}},axisLabel:{color:'#8b9bb4'}},
        series:[{name:title,type:'line',data:seriesData.map(d=>d.value),smooth:true,showSymbol:false,lineStyle:{width:1.5,color:color},areaStyle:{color:new echarts.graphic.LinearGradient(0,0,0,1,[{offset:0,color:color+'30'},{offset:1,color:color+'00'}])}}]
    }, true);
}


// ── Page initialization ──
function _bootstrap() {
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
    }

    // ── Auto refresh & timestamp ──
    function updateTimestamp(){
        var el=document.getElementById('lastRefresh');
        if(el){
            var now=new Date();
            el.textContent='最后刷新: '+now.toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
        }
    }
    updateTimestamp();

    window.refreshAll=async function(){
        // Reload current section + clear _lastSection so loadSection re-fetches
        var sec=window._lastSection;
        if(sec){
            window._lastSection='';
            loadSection(sec);
        }
        updateTimestamp();
    };

    // Static: show last update time from macro_data.json
    if(window.macroData && window.macroData.meta){
        var el=document.getElementById('lastRefresh');
        if(el) el.textContent='数据更新时间: '+(window.macroData.meta.update_time||'未知');
    }
});
