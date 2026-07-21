// ==UserScript==
// @name         Fetch Data From Barchart
// @namespace    http://tampermonkey.net/
// @version      2.1
// @description  Fetch options flow data with pagination completeness auditing
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

const CRAWLER_CONFIG = {
  rateLimitWaitMs: 120000,
  maxRateLimitRetries: 5,
  downloadAuditReport: true
};

const LOG_PREFIX = "[BarchartCrawler]";

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

function logCrawler(level, event, details = {}) {
  const payload = {
    timestamp: new Date().toISOString(),
    event,
    ...details
  };
  const logger = typeof console[level] === "function" ? console[level] : console.log;
  logger.call(console, `${LOG_PREFIX} ${JSON.stringify(payload)}`);
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
      `page=${page}&` +
      `gt(tradeSize,50)=&` +
      `gt(premium,10000)=&` +
      `meta=field.shortName,field.type,field.description&` +
      `raw=1`;

    const headers = createHeaders(sourceConfig.referer);
    const requestOptions = {
      method: "GET",
      headers: headers,
      redirect: "follow",
    };

    const startedAt = performance.now();

    try {
      const response = await fetch(url, requestOptions);
      const http = {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        durationMs: Math.round(performance.now() - startedAt)
      };

      if (response.status === 429) {
        return { rateLimited: true, http };
      }

      if (!response.ok) {
        return { error: `HTTP ${response.status} ${response.statusText}`, http };
      }

      try {
        return { payload: await response.json(), http };
      } catch (error) {
        return { error: `Invalid JSON response: ${error.message}`, http };
      }
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
        http: {
          status: null,
          statusText: "FETCH_ERROR",
          ok: false,
          durationMs: Math.round(performance.now() - startedAt)
        }
      };
    }
  };
}

// ============================================================================
// Pagination & Download
// ============================================================================

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchWithRetry(fetchFn, page, label) {
  let retryCount = 0;

  while (retryCount <= CRAWLER_CONFIG.maxRateLimitRetries) {
    const result = await fetchFn(page);
    if (result && result.rateLimited) {
      retryCount++;
      logCrawler("warn", "rate_limited", {
        source: label,
        page,
        retryCount,
        maxRetries: CRAWLER_CONFIG.maxRateLimitRetries,
        waitMs: CRAWLER_CONFIG.rateLimitWaitMs
      });

      if (retryCount > CRAWLER_CONFIG.maxRateLimitRetries) {
        return { result, retryCount, exhausted: true };
      }

      await sleep(CRAWLER_CONFIG.rateLimitWaitMs);
      continue;
    }
    return { result, retryCount, exhausted: false };
  }
}

async function fetchAllPages(fetchFn, label) {
  const startedAt = performance.now();
  const audit = {
    source: label,
    startedAt: new Date().toISOString(),
    initialTotal: null,
    finalObservedTotal: null,
    pageSize: null,
    expectedPages: null,
    pages: [],
    fetchedRecords: 0,
    exportedRecords: 0,
    missingRawRecords: 0,
    exactDuplicateCandidates: 0,
    warnings: [],
    complete: false,
    reasons: [],
    limitation: "The API is live and has no snapshot token; count checks cannot prove that rows did not move between pages while fetching."
  };
  const optionData = [];
  const firstAttempt = await fetchWithRetry(fetchFn, 1, label);
  const firstResult = firstAttempt && firstAttempt.result;
  const firstPayload = firstResult && firstResult.payload;

  if (!firstPayload || !Number.isFinite(Number(firstPayload.total)) || !Array.isArray(firstPayload.data)) {
    audit.reasons.push(firstResult && firstResult.error ? firstResult.error : "invalid_first_page");
    audit.pages.push(createPageAudit(1, firstAttempt));
    finalizeSourceAudit(audit, optionData, startedAt);
    logCrawler("error", "source_incomplete", audit);
    return { data: optionData, audit };
  }

  audit.initialTotal = Number(firstPayload.total);
  audit.finalObservedTotal = audit.initialTotal;
  audit.pageSize = Number(firstPayload.count) > 0
    ? Number(firstPayload.count)
    : firstPayload.data.length;

  if (audit.initialTotal > 0 && audit.pageSize <= 0) {
    audit.reasons.push("invalid_page_size");
    audit.pages.push(createPageAudit(1, firstAttempt));
    finalizeSourceAudit(audit, optionData, startedAt);
    logCrawler("error", "source_incomplete", audit);
    return { data: optionData, audit };
  }

  audit.expectedPages = audit.initialTotal === 0 ? 1 : Math.ceil(audit.initialTotal / audit.pageSize);
  logCrawler("info", "source_started", {
    source: label,
    expectedTotal: audit.initialTotal,
    pageSize: audit.pageSize,
    expectedPages: audit.expectedPages
  });

  for (let page = 1; page <= audit.expectedPages; page++) {
    const attempt = page === 1 ? firstAttempt : await fetchWithRetry(fetchFn, page, label);
    const result = attempt && attempt.result;
    const payload = result && result.payload;
    const pageAudit = createPageAudit(page, attempt);
    audit.pages.push(pageAudit);

    if (!payload || !Array.isArray(payload.data)) {
      audit.reasons.push(`page_${page}_failed:${result && result.error ? result.error : "invalid_response"}`);
      logCrawler("error", "page_failed", { source: label, ...pageAudit });
      continue;
    }

    const observedTotal = Number(payload.total);
    if (Number.isFinite(observedTotal)) {
      audit.finalObservedTotal = observedTotal;
      if (observedTotal !== audit.initialTotal && !audit.reasons.includes("api_total_changed_during_fetch")) {
        audit.reasons.push("api_total_changed_during_fetch");
      }
    }

    const expectedOnPage = page < audit.expectedPages
      ? audit.pageSize
      : audit.initialTotal - (audit.pageSize * (audit.expectedPages - 1));
    if (payload.data.length !== expectedOnPage) {
      audit.reasons.push(`page_${page}_expected_${expectedOnPage}_received_${payload.data.length}`);
    }

    optionData.push(...payload.data);
    logCrawler("info", "page_fetched", {
      source: label,
      ...pageAudit,
      expectedRecords: expectedOnPage,
      cumulativeRecords: optionData.length
    });
  }

  if (optionData.length !== audit.initialTotal) {
    audit.reasons.push(`total_expected_${audit.initialTotal}_fetched_${optionData.length}`);
  }

  finalizeSourceAudit(audit, optionData, startedAt);
  logCrawler(audit.complete ? "info" : "warn", "source_finished", audit);
  return { data: optionData, audit };
}

function createPageAudit(page, attempt) {
  const result = attempt && attempt.result;
  const payload = result && result.payload;
  return {
    page,
    httpStatus: result && result.http ? result.http.status : null,
    durationMs: result && result.http ? result.http.durationMs : null,
    retryCount: attempt ? attempt.retryCount : 0,
    apiTotal: payload && Number.isFinite(Number(payload.total)) ? Number(payload.total) : null,
    apiCount: payload && Number.isFinite(Number(payload.count)) ? Number(payload.count) : null,
    receivedRecords: payload && Array.isArray(payload.data) ? payload.data.length : 0,
    error: result && result.error ? result.error : null
  };
}

function finalizeSourceAudit(audit, optionData, startedAt) {
  audit.finishedAt = new Date().toISOString();
  audit.durationMs = Math.round(performance.now() - startedAt);
  audit.fetchedRecords = optionData.length;
  audit.missingRawRecords = optionData.filter(record => !record || !record.raw).length;
  audit.exportedRecords = optionData.length - audit.missingRawRecords;

  const fingerprints = optionData
    .filter(record => record && record.raw)
    .map(record => JSON.stringify(record.raw));
  audit.exactDuplicateCandidates = fingerprints.length - new Set(fingerprints).size;

  if (audit.missingRawRecords > 0) {
    audit.reasons.push(`missing_raw_records_${audit.missingRawRecords}`);
  }
  if (audit.exactDuplicateCandidates > 0) {
    audit.warnings.push(
      `found_${audit.exactDuplicateCandidates}_exact_duplicate_candidates; these may be valid identical trades or pagination overlap`
    );
  }
  audit.reasons = [...new Set(audit.reasons)];
  audit.complete = audit.reasons.length === 0;
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
  const runId = `${getFormattedDateInEST()}_${new Date().toISOString().replace(/[:.]/g, "-")}`;
  logCrawler("info", "run_started", { runId, sources: sourceKeys });

  // Create fetchers for each source
  const fetchPromises = sourceKeys.map(key => {
    const config = OPTIONS_FLOW_SOURCES[key];
    if (!config) {
      logCrawler("warn", "unknown_source", { runId, source: key });
      return Promise.resolve({
        key,
        data: [],
        audit: { source: key, complete: false, reasons: ["unknown_source"] }
      });
    }
    const fetcher = createOptionsFlowFetcher(config);
    return fetchAllPages(fetcher, config.name).then(result => ({ key, ...result }));
  });

  // Fetch all sources in parallel
  const results = await Promise.all(fetchPromises);

  // Merge all data into one array
  const allData = [];
  for (const { key, data } of results) {
    if (data.length > 0) {
      const config = OPTIONS_FLOW_SOURCES[key];
      const rawData = data.filter(obj => obj && obj.raw).map(obj => obj.raw);
      allData.push(...rawData);
      logCrawler("info", "source_export_ready", {
        runId,
        source: config.name,
        fetchedRecords: data.length,
        exportedRecords: rawData.length
      });
    }
  }

  const auditReport = {
    runId,
    generatedAt: new Date().toISOString(),
    complete: results.every(result => result.audit && result.audit.complete),
    totalExportedRecords: allData.length,
    sources: results.map(result => result.audit)
  };
  window.__barchartCrawlerLastAudit = auditReport;

  // Download combined data as a single file
  if (allData.length > 0) {
    downloadJSON(allData, `OF_${getFormattedDateInEST()}.json`);
  }
  if (CRAWLER_CONFIG.downloadAuditReport) {
    downloadJSON(auditReport, `OF_Audit_${runId}.json`);
  }

  logCrawler(auditReport.complete ? "info" : "warn", "run_finished", auditReport);
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
ofButton.addEventListener("click", async () => {
  ofButton.disabled = true;
  ofButton.textContent = "OF Fetching...";

  try {
    await downloadOptionsFlowData(); // Downloads stock, etf, and indices
  } catch (error) {
    logCrawler("error", "run_crashed", {
      error: error instanceof Error ? error.message : String(error)
    });
  } finally {
    ofButton.disabled = false;
    ofButton.textContent = "OF All";
  }
});

document.body.appendChild(ofButton);
