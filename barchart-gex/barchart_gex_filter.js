// ==UserScript==
// @name         Barchart GEX Filter
// @version      2026-01-04
// @description  Barchart GEX Filter
// @author       You
// @match        https://www.barchart.com/*/quotes/*/gamma-exposure
// @icon         https://www.google.com/s2/favicons?sz=64&domain=barchart.com
// @grant        none
// ==/UserScript==


/**
 * Barchart GEX Filter Script v2.0
 *
 * 功能：
 * 1. 使用 API 获取精确的期权数据
 * 2. 选择 Expiration Date 组合
 * 3. 计算准确的 Gamma Flip, Call Wall, Put Wall
 * 4. Hover 显示每个 strike 的 Call/Put OI
 * 5. 支持自定义 strike 数量
 *
 * 使用方法：在 Barchart Gamma Exposure 页面的控制台粘贴运行
 */

(function () {
    'use strict';

    // ========== 等待页面完全加载 ==========
    function waitForPageReady(callback, maxWait = 15000) {
        const startTime = Date.now();

        function check() {
            // 检查关键元素是否存在
            const hasChart = window.Highcharts &&
                Highcharts.charts &&
                Highcharts.charts[0] &&
                Highcharts.charts[0].series[0]?.data?.length > 0;
            const hasDropdown = document.querySelectorAll('.bc-dropdown-list li').length > 0;
            const hasXsrfToken = document.cookie.includes('XSRF-TOKEN');

            if (hasChart && hasDropdown && hasXsrfToken) {
                console.log('✅ 页面加载完成，启动 GEX Filter...');
                callback();
            } else if (Date.now() - startTime > maxWait) {
                console.error('❌ 页面加载超时，请刷新后重试');
                alert('页面加载超时，请刷新页面后重新运行脚本');
            } else {
                console.log('⏳ 等待页面加载...', { hasChart, hasDropdown, hasXsrfToken });
                setTimeout(check, 500);
            }
        }

        check();
    }

    // 等待页面就绪后执行主逻辑
    waitForPageReady(function () {

        // ========== 1. 获取页面信息 ==========

        // 获取股票代码
        const symbolMatch = window.location.pathname.match(/quotes\/([^\/]+)/);
        const symbol = symbolMatch ? decodeURIComponent(symbolMatch[1]) : null;

        if (!symbol) {
            alert('无法识别股票代码，请在 Barchart Gamma Exposure 页面运行');
            return;
        }

        // 获取 XSRF Token
        const xsrfToken = document.cookie.match(/XSRF-TOKEN=([^;]+)/)?.[1];
        if (!xsrfToken) {
            alert('无法获取 XSRF Token，请刷新页面后重试');
            return;
        }

        // ========== 2. 从页面 dropdown 获取到期日列表 ==========
        const dropdownItems = document.querySelectorAll('.bc-dropdown-list li');
        const expirationList = [];

        dropdownItems.forEach(li => {
            const checkbox = li.querySelector('input[type="checkbox"]');
            const label = li.textContent.trim();

            if (label === 'ALL' || !label.includes('-')) return;

            // 解析日期: "2026-01-05 (w)" -> "2026-01-05"
            const match = label.match(/(\d{4}-\d{2}-\d{2})/);
            if (match) {
                expirationList.push({
                    label: label,
                    isoDate: match[1],
                    checked: checkbox?.checked || false
                });
            }
        });

        // 获取当前股价
        let currentPrice = 0;
        const priceSelectors = ['[data-ng-bind*="lastPrice"]', '.last-change', '.quote-price'];
        for (const selector of priceSelectors) {
            const el = document.querySelector(selector);
            if (el) {
                const text = el.textContent.replace(/[$,]/g, '').trim();
                const parsed = parseFloat(text);
                if (!isNaN(parsed) && parsed > 0) {
                    currentPrice = parsed;
                    break;
                }
            }
        }

        // 回退：从图表推断
        if (currentPrice === 0 && Highcharts.charts[0]?.series[0]?.data?.length > 0) {
            const data = Highcharts.charts[0].series[0].data;
            currentPrice = data[Math.floor(data.length / 2)]?.x || 100;
        }

        console.log('📊 Barchart GEX Filter 已加载');
        console.log('   股票代码:', symbol);
        console.log('   当前股价:', currentPrice);
        console.log('   可用到期日:', expirationList.length);

        // ========== 3. 创建控制面板 UI ==========
        const panel = document.createElement('div');
        panel.id = 'gex-filter-panel';
        panel.innerHTML = `
        <style>
            #gex-filter-panel {
                position: fixed;
                top: 10px;
                right: 10px;
                background: linear-gradient(135deg, #1e3a5f 0%, #0d1b2a 100%);
                color: white;
                padding: 15px;
                border-radius: 10px;
                z-index: 99999;
                font-family: Arial, sans-serif;
                font-size: 13px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.5);
                min-width: 320px;
                max-height: 85vh;
                overflow-y: auto;
            }
            #gex-filter-panel h3 {
                margin: 0 0 10px 0;
                font-size: 16px;
                border-bottom: 1px solid #4a90d9;
                padding-bottom: 8px;
            }
            #gex-filter-panel label {
                display: block;
                margin: 8px 0 4px 0;
                font-weight: bold;
                color: #4a90d9;
            }
            #gex-filter-panel .exp-list {
                max-height: 200px;
                overflow-y: auto;
                background: rgba(255,255,255,0.1);
                padding: 8px;
                border-radius: 5px;
                margin-bottom: 10px;
            }
            #gex-filter-panel .exp-item {
                display: flex;
                align-items: center;
                padding: 3px 0;
                font-family: monospace;
                font-size: 12px;
            }
            #gex-filter-panel .exp-item:hover {
                background: rgba(74, 144, 217, 0.3);
            }
            #gex-filter-panel .tag-w { color: #ffc107; font-weight: bold; }
            #gex-filter-panel .tag-m { color: #4caf50; font-weight: bold; }
            #gex-filter-panel .btn-group {
                display: flex;
                gap: 5px;
                margin-bottom: 10px;
            }
            #gex-filter-panel button {
                flex: 1;
                padding: 8px 12px;
                border: none;
                border-radius: 5px;
                cursor: pointer;
                font-weight: bold;
                transition: all 0.2s;
            }
            #gex-filter-panel .btn-primary { background: #4a90d9; color: white; }
            #gex-filter-panel .btn-primary:hover { background: #3a7fc9; }
            #gex-filter-panel .btn-secondary { background: #666; color: white; }
            #gex-filter-panel .btn-secondary:hover { background: #555; }
            #gex-filter-panel .btn-danger { background: #d9534f; color: white; }
            #gex-filter-panel .strike-options {
                display: flex;
                gap: 10px;
                margin-bottom: 15px;
            }
            #gex-filter-panel .strike-options label {
                display: inline-flex;
                align-items: center;
                font-weight: normal;
                color: white;
                cursor: pointer;
            }
            #gex-filter-panel .status {
                font-size: 11px;
                color: #8bc34a;
                margin-top: 10px;
                padding: 8px;
                background: rgba(0,0,0,0.3);
                border-radius: 3px;
                line-height: 1.5;
            }

        </style>

        <h3>🎛️ GEX Filter v2.0 - ${symbol}</h3>

        <label>📅 Expiration Dates:</label>
        <div class="btn-group">
            <button type="button" class="btn-secondary" id="gex-select-all">全选</button>
            <button type="button" class="btn-secondary" id="gex-select-none">清空</button>
            <button type="button" class="btn-secondary" id="gex-sync-page">同步</button>
        </div>
        <div class="exp-list" id="gex-exp-list">
            ${expirationList.map(exp => {
            let displayLabel = exp.label
                .replace('(w)', '<span class="tag-w">(w)</span>')
                .replace('(m)', '<span class="tag-m">(m)</span>');
            return `
                <div class="exp-item">
                    <input type="checkbox" class="gex-exp-checkbox"
                           value="${exp.isoDate}"
                           data-label="${exp.label}"
                           ${exp.checked ? 'checked' : ''}>
                    <span>${displayLabel}</span>
                </div>
            `}).join('')}
        </div>

        <label>📊 Strikes 显示数量:</label>
        <div class="strike-options">
            <label><input type="radio" name="gex-strike-count" value="all"> All</label>
            <label><input type="radio" name="gex-strike-count" value="50"> 50</label>
            <label><input type="radio" name="gex-strike-count" value="40" checked> 40</label>
            <label><input type="radio" name="gex-strike-count" value="20"> 20</label>
        </div>

        <button type="button" class="btn-primary" id="gex-apply" style="width:100%; padding:12px; font-size:14px;">
            🔄 Fetch API & Re-render
        </button>

        <button type="button" class="btn-secondary" id="gex-toggle" style="width:100%; margin-top:8px;">
            ➖ 折叠
        </button>

        <div class="status" id="gex-status">就绪。价格: $${currentPrice.toLocaleString()}</div>
    </div>
    
    <button type="button" id="gex-expand" style="display:none; background:#4a90d9; color:white; border:none; padding:10px 18px; border-radius:5px; cursor:pointer; font-weight:bold; font-size:14px;">
        🎛️ GEX
    </button>
    `;

        document.body.appendChild(panel);

        // ========== 4. 事件绑定 ==========
        document.getElementById('gex-select-all').onclick = () => {
            document.querySelectorAll('.gex-exp-checkbox').forEach(cb => cb.checked = true);
        };

        document.getElementById('gex-select-none').onclick = () => {
            document.querySelectorAll('.gex-exp-checkbox').forEach(cb => cb.checked = false);
        };

        document.getElementById('gex-sync-page').onclick = () => {
            const pageCheckboxes = document.querySelectorAll('.bc-dropdown-list li input[type="checkbox"]');
            const pageCheckedLabels = new Set();
            pageCheckboxes.forEach(cb => {
                if (cb.checked) {
                    const label = cb.closest('li')?.textContent?.trim();
                    if (label) pageCheckedLabels.add(label);
                }
            });
            document.querySelectorAll('.gex-exp-checkbox').forEach(cb => {
                cb.checked = pageCheckedLabels.has(cb.dataset.label);
            });
            document.getElementById('gex-status').textContent = `🔄 已同步 ${pageCheckedLabels.size} 个选中项`;
        };

        // 折叠/展开面板 - 使用显示/隐藏方式，不替换 innerHTML
        const contentDiv = panel.querySelector('div'); // 获取内容容器
        const expandBtn = document.getElementById('gex-expand');

        document.getElementById('gex-toggle').onclick = () => {
            // 隐藏面板内容，只显示展开按钮
            panel.querySelector('h3').style.display = 'none';
            panel.querySelectorAll('label, .btn-group, .exp-list, .strike-options, #gex-apply, #gex-toggle, .status').forEach(el => {
                el.style.display = 'none';
            });
            panel.style.minWidth = 'auto';
            panel.style.padding = '8px';
            expandBtn.style.display = 'block';
        };

        expandBtn.onclick = () => {
            // 恢复显示所有内容
            panel.querySelector('h3').style.display = '';
            panel.querySelectorAll('label, .btn-group, .exp-list, .strike-options, #gex-apply, #gex-toggle, .status').forEach(el => {
                el.style.display = '';
            });
            panel.style.minWidth = '320px';
            panel.style.padding = '15px';
            expandBtn.style.display = 'none';
        };


        // ========== 5. 核心：API 获取数据并渲染 ==========
        async function applyFilter() {
            const statusEl = document.getElementById('gex-status');
            statusEl.textContent = '⏳ 正在从 API 获取数据...';

            try {
                // 获取选中的到期日
                const selectedExps = Array.from(document.querySelectorAll('.gex-exp-checkbox:checked'))
                    .map(cb => cb.value);

                if (selectedExps.length === 0) {
                    statusEl.textContent = '❌ 请至少选择一个到期日！';
                    return;
                }

                const strikeCountOption = document.querySelector('input[name="gex-strike-count"]:checked').value;
                const nearestToLast = strikeCountOption === 'all' ? 100 : parseInt(strikeCountOption);

                // 构建 API URL
                const apiUrl = `https://www.barchart.com/proxies/core-api/v1/options/get?` +
                    `symbols=${encodeURIComponent(symbol)}` +
                    `&raw=1` +
                    `&fields=symbol,strikePrice,optionType,baseLastPrice,gamma,openInterest,expirationDate` +
                    `&expirations=${encodeURIComponent(selectedExps.join(','))}` +
                    `&groupBy=strikePrice` +
                    `&le(nearestToLast,${nearestToLast})`;

                statusEl.textContent = '⏳ 请求 API 中...';

                const response = await fetch(apiUrl, {
                    headers: {
                        'Accept': 'application/json',
                        'X-XSRF-TOKEN': decodeURIComponent(xsrfToken)
                    }
                });

                if (!response.ok) {
                    throw new Error(`API 错误: ${response.status}`);
                }

                const apiData = await response.json();

                if (!apiData.data || Object.keys(apiData.data).length === 0) {
                    statusEl.textContent = '❌ API 返回空数据，请检查到期日选择';
                    return;
                }

                statusEl.textContent = '⏳ 计算 GEX...';

                // 解析 API 数据并计算 Net GEX + 存储详细 OI 数据
                const gexByStrike = {};
                const strikeDetails = {}; // 存储每个 strike 的 Call/Put OI 详情用于 tooltip

                Object.entries(apiData.data).forEach(([strikeKey, options]) => {
                    const strikePrice = parseFloat(strikeKey.replace(/,/g, ''));
                    let netGex = 0;
                    let callOI = 0;
                    let putOI = 0;
                    let callGex = 0;
                    let putGex = 0;

                    options.forEach(opt => {
                        const gamma = opt.raw?.gamma || 0;
                        const oi = opt.raw?.openInterest || 0;
                        const isCall = opt.optionType === 'Call';
                        const gexContribution = gamma * oi * currentPrice * currentPrice * (isCall ? 1 : -1);
                        netGex += gexContribution;

                        if (isCall) {
                            callOI += oi;
                            callGex += gexContribution;
                        } else {
                            putOI += oi;
                            putGex += gexContribution;
                        }
                    });

                    if (netGex !== 0) {
                        gexByStrike[strikePrice] = netGex;
                    }

                    // 存储详情用于 tooltip
                    strikeDetails[strikePrice] = {
                        callOI,
                        putOI,
                        callGex,
                        putGex,
                        netGex
                    };
                });

                // 排序 strikes
                const strikes = Object.keys(gexByStrike).map(Number).sort((a, b) => a - b);

                if (strikes.length === 0) {
                    statusEl.textContent = '❌ 没有有效数据';
                    return;
                }

                // ========== 准备 Highcharts 数据 ==========
                // 使用与原始数据相同的格式 [strike, gex]
                const columnData = strikes.map(strike => [strike, gexByStrike[strike]]);

                // ========== 更新图表 ==========
                const chart = Highcharts.charts[0];

                chart.series[0].setData(columnData, false);
                chart.xAxis[0].setExtremes(strikes[0], strikes[strikes.length - 1], false);

                // ========== 覆盖 Tooltip Formatter 使用新数据 ==========
                // 格式化数字为 K/M/B
                function formatNumber(num) {
                    if (Math.abs(num) >= 1e9) return (num / 1e9).toFixed(2) + 'B';
                    if (Math.abs(num) >= 1e6) return (num / 1e6).toFixed(2) + 'M';
                    if (Math.abs(num) >= 1e3) return (num / 1e3).toFixed(2) + 'K';
                    return num.toFixed(0);
                }

                // 自定义 tooltip formatter
                chart.update({
                    tooltip: {
                        shared: true,
                        useHTML: true,
                        formatter: function () {
                            const strike = this.x;
                            const detail = strikeDetails[strike];
                            if (!detail) {
                                return `<b>Strike: ${strike.toLocaleString()}</b><br/>无数据`;
                            }

                            return `
                                <b>Strike: ${strike.toLocaleString()}</b><br/>
                                <span style="color:#4caf50">● Net GEX: ${formatNumber(detail.netGex)}</span><br/>
                                <br/>
                                <b>Open Interest:</b><br/>
                                Call OI: ${detail.callOI.toLocaleString()}<br/>
                                Put OI: ${detail.putOI.toLocaleString()}<br/>
                                <br/>
                                <b>GEX Contribution:</b><br/>
                                Call GEX: ${formatNumber(detail.callGex)}<br/>
                                Put GEX: ${formatNumber(detail.putGex)}
                            `;
                        }
                    }
                }, false);

                chart.redraw()
                chart.redraw()

                statusEl.innerHTML = `✅ 已更新！<br/>
                📊 ${strikes.length} strikes | 📅 ${selectedExps.length} 到期日<br/>`;

                console.log('📊 GEX 更新完成:', {
                    strikes: strikes.length,
                    expirations: selectedExps.length
                });

            } catch (error) {
                statusEl.textContent = '❌ 错误: ' + error.message;
                console.error('GEX Filter Error:', error);
            }
        }

        // 初始绑定 apply 按钮
        document.getElementById('gex-apply').onclick = applyFilter;

        console.log('✅ GEX Filter Panel 已创建');
        console.log('   Hover 柱状图可查看 Call/Put OI 详情');

    }); // 结束 waitForPageReady 回调

})();
