// ==UserScript==
// @name         Fetch Data From Barchart
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  Fetch and log options flow data from API
// @author       You
// @match        https://www.barchart.com/*
// @grant        GM_download
// ==/UserScript==

// ============================================================================
// Data Source Configurations
// ============================================================================

const OPTIONS_FLOW_SOURCES = {
  stock: {
    name: "Stock",
    baseSymbolType: 1,
    referer: "https://www.barchart.com/options/options-flow/stocks",
    filePrefix: "OF_Stock"
  },
  etf: {
    name: "ETF",
    baseSymbolType: 7,
    referer: "https://www.barchart.com/options/options-flow/etfs",
    filePrefix: "OF_ETF"
  },
  indices: {
    name: "Indices",
    baseSymbolType: 9,
    referer: "https://www.barchart.com/options/options-flow/indices",
    filePrefix: "OF_Indices"
  }
};

// Common fields for all options flow sources
const OPTIONS_FLOW_FIELDS = [
  "symbol",
  "baseSymbol",
  "lastPrice",
  "symbolType",
  "strikePrice",
  "expiration",
  "dte",
  "bidXSize",
  "askXSize",
  "tradePrice",
  "tradeSize",
  "side",
  "premium",
  "volume",
  "openInterest",
  "volatility",
  "delta",
  "tradeCondition",
  "label",
  "tradeTime.format(H:i:s%20%5CE%5CT)",
  "expirationType",
  "askPrice",
  "bidPrice",
  "baseSymbolType",
  "symbolCode"
].join(",");

// ============================================================================
// Utility Functions
// ============================================================================

function getCookie() {
  return decodeURIComponent(document.cookie);
}

function getCookieValue(cookieName) {
  const name = cookieName + "=";
  const decodedCookie = getCookie();
  const cookieArray = decodedCookie.split(";");

  for (let i = 0; i < cookieArray.length; i++) {
    let cookie = cookieArray[i].trim();
    if (cookie.indexOf(name) === 0) {
      return cookie.substring(name.length, cookie.length);
    }
  }
  return null;
}

function getFormattedDateInEST() {
  const today = new Date();
  const options = { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" };
  const estDate = new Intl.DateTimeFormat("en-US", options).format(today);
  const [month, day, year] = estDate.split("/");
  return `${year}-${month}-${day}`;
}

function createHeaders(referer) {
  const myHeader = new Headers();
  myHeader.append("accept", "application/json");
  myHeader.append("accept-language", "en,en-CN;q=0.9,zh-CN;q=0.8,zh;q=0.7");
  myHeader.append("cookie", encodeURIComponent(getCookie()));
  myHeader.append("dnt", "1");
  myHeader.append("priority", "u=1, i");
  myHeader.append("sec-ch-ua", '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"');
  myHeader.append("sec-ch-ua-mobile", "?0");
  myHeader.append("sec-ch-ua-platform", '"Windows"');
  myHeader.append("sec-fetch-dest", "empty");
  myHeader.append("sec-fetch-mode", "cors");
  myHeader.append("sec-fetch-site", "same-origin");
  myHeader.append("user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36");
  myHeader.append("x-xsrf-token", getCookieValue("XSRF-TOKEN"));
  if (referer) {
    myHeader.append("referer", referer);
  }
  return myHeader;
}

// ============================================================================
// Generic Options Flow Fetcher
// ============================================================================

function createOptionsFlowFetcher(sourceConfig) {
  return async function (page) {
    const url = `https://www.barchart.com/proxies/core-api/v1/options/flow?` +
      `symbols=&` +
      `fields=${OPTIONS_FLOW_FIELDS}&` +
      `orderBy=premium&orderDir=desc&` +
      `in(baseSymbolType,(${sourceConfig.baseSymbolType}))=&` +
      `in(symbolType,(Call,Put))=&` +
      `in(expirationType,(Monthly,Weekly))=&` +
      `limit=1000&page=${page}&` +
      `gt(tradeSize,100)=&` +
      `gt(premium,100000)=&` +
      `meta=field.shortName,field.type,field.description&` +
      `raw=1`;

    const headers = createHeaders(sourceConfig.referer);
    const requestOptions = {
      method: "GET",
      headers: headers,
      redirect: "follow",
    };

    try {
      const response = await fetch(url, requestOptions);
      return await response.json();
    } catch (error) {
      console.error(`Error fetching ${sourceConfig.name} data:`, error);
      return null;
    }
  };
}

// ============================================================================
// Pagination & Download
// ============================================================================

async function fetchAllPages(fetchFn, label) {
  const result = await fetchFn(1);

  if (!result || !result.total || !Array.isArray(result.data)) {
    console.error(`Invalid result from ${label} fetch`);
    return [];
  }

  // Limit pages to avoid too many requests, maximum is 10
  const pages = Math.min(10, Math.ceil(result.total / result.count));
  const optionData = [...result.data];

  for (let i = 2; i <= pages; i++) {
    const nextResult = await fetchFn(i);
    if (nextResult && Array.isArray(nextResult.data)) {
      optionData.push(...nextResult.data);
    } else {
      console.warn(`No data fetched for ${label} page ${i}`);
      break;
    }
  }

  return optionData;
}

function downloadJSON(jsonFile, fileName) {
  const blob = new Blob([JSON.stringify(jsonFile, null, 2)], { type: "application/json" });
  const blobUrl = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}

async function downloadOptionsFlowData(sourceKeys = Object.keys(OPTIONS_FLOW_SOURCES)) {
  // Create fetchers for each source
  const fetchPromises = sourceKeys.map(key => {
    const config = OPTIONS_FLOW_SOURCES[key];
    if (!config) {
      console.warn(`Unknown source: ${key}`);
      return Promise.resolve({ key, data: [] });
    }
    const fetcher = createOptionsFlowFetcher(config);
    return fetchAllPages(fetcher, config.name).then(data => ({ key, data }));
  });

  // Fetch all sources in parallel
  const results = await Promise.all(fetchPromises);

  // Download each source's data
  for (const { key, data } of results) {
    if (data.length > 0) {
      const config = OPTIONS_FLOW_SOURCES[key];
      const rawData = data.map(obj => obj.raw);
      downloadJSON(rawData, `${config.filePrefix}_${getFormattedDateInEST()}.json`);
      console.log(`Downloaded ${data.length} records for ${config.name}`);
    }
  }
}

// ============================================================================
// UI
// ============================================================================

function createStyledButton(text, rightOffset) {
  const btn = document.createElement("button");
  btn.textContent = text;
  btn.style.position = "fixed";
  btn.style.bottom = "20px";
  btn.style.right = rightOffset + "px";
  btn.style.padding = "10px 20px";
  btn.style.backgroundColor = "#007BFF";
  btn.style.color = "white";
  btn.style.border = "none";
  btn.style.borderRadius = "5px";
  btn.style.cursor = "pointer";
  btn.style.zIndex = "1000";
  return btn;
}

// Create button to download all options flow data
const ofButton = createStyledButton("OF All", 180);
ofButton.addEventListener("click", () => {
  downloadOptionsFlowData(); // Downloads stock, etf, and indices
});

document.body.appendChild(ofButton);
