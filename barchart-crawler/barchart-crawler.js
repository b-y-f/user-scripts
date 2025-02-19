// ==UserScript==
// @name         Fetch Data From Barchart
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Fetch and log data from API
// @author       You
// @match        https://www.barchart.com/*
// @grant        GM_download

// ==/UserScript==

function createHeaders() {
  const myHeader = new Headers();
  myHeader.append("accept", "application/json");
  myHeader.append("accept-language", "en,en-CN;q=0.9,zh-CN;q=0.8,zh;q=0.7");
  myHeader.append("cookie", getCookie());
  myHeader.append("dnt", "1");
  myHeader.append("priority", "u=1, i");
  myHeader.append(
    "sec-ch-ua",
    '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"'
  );
  myHeader.append("sec-ch-ua-mobile", "?0");
  myHeader.append("sec-ch-ua-platform", '"Windows"');
  myHeader.append("sec-fetch-dest", "empty");
  myHeader.append("sec-fetch-mode", "cors");
  myHeader.append("sec-fetch-site", "same-origin");
  myHeader.append(
    "user-agent",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
  );
  myHeader.append("x-xsrf-token", getCookieValue("XSRF-TOKEN"));
  return myHeader;
}

function getCookie() {
  return decodeURIComponent(document.cookie);
}

function getFormattedDate() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0"); // Months are zero-based
  const day = String(today.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}


function getFormattedDateInEST() {
  const today = new Date();

  // Convert to EST
  const options = { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" };
  const estDate = new Intl.DateTimeFormat("en-US", options).format(today);

  // Reformat the date to YYYY-MM-DD
  const [month, day, year] = estDate.split("/");
  return `${year}-${month}-${day}`;
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

async function fetchUOAData(page) {
  const UOA_stock = `https://www.barchart.com/proxies/core-api/v1/options/get?fields=symbol,marketCap,baseLastPrice,daysToExpiration,premium,midpoint,lastPrice,volume,openInterest,volumeOpenInterestRatio,volatility,delta,tradeTime&orderBy=volumeOpenInterestRatio&orderDir=desc&baseSymbolTypes=stock&between(volumeOpenInterestRatio,1.24,)=&between(lastPrice,.10,)=&between(tradeTime,2023-12-19,${getFormattedDate()})=&between(volume,500,)=&between(openInterest,100,)=&in(exchange,(AMEX,NYSE,NASDAQ,INDEX-CBOE))=&meta=field.shortName,field.type,field.description&limit=1000&page=${page}&raw=1`;
  const UOA_etf = `https://www.barchart.com/proxies/core-api/v1/options/get?fields=symbol,marketCap,baseLastPrice,daysToExpiration,premium,midpoint,lastPrice,volume,openInterest,volumeOpenInterestRatio,volatility,delta,tradeTime&orderBy=volumeOpenInterestRatio&orderDir=desc&baseSymbolTypes=etf&between(volumeOpenInterestRatio,1.24,)=&between(lastPrice,.10,)=&between(tradeTime,2023-12-19,${getFormattedDate()})=&between(volume,500,)=&between(openInterest,100,)=&in(exchange,(AMEX,NYSE,NASDAQ,INDEX-CBOE))=&meta=field.shortName,field.type,field.description&limit=1000&page=${page}&raw=1`;

  const headers = createHeaders();
  headers.append(
    "referer",
    "https://www.barchart.com/options/unusual-activity/"
  );

  const requestOptions = {
    method: "GET",
    headers: headers,
    redirect: "follow",
  };

  try {
    // Fetch both URLs concurrently
    const [stockResponse, etfResponse] = await Promise.all([
      fetch(UOA_stock, requestOptions),
      fetch(UOA_etf, requestOptions)
    ]);

    // Parse both responses
    const stockData = await stockResponse.json();
    const etfData = await etfResponse.json();

    // Merge the data arrays
    // Assuming the actual data is in a 'data' property
    const mergedData = {
      ...stockData,
      data: [...(stockData.data || []), ...(etfData.data || [])]
    };

    return mergedData;
  } catch (error) {
    console.error(error);
    throw error;
  }
}

async function fetchOFData(page) {
  const OF = `https://www.barchart.com/proxies/core-api/v1/options/flow?symbols=&fields=symbol,baseSymbol,lastPrice,symbolType,strikePrice,expiration,dte,tradePrice,tradeSize,side,premium,volume,openInterest,volatility,delta,tradeCondition,label,tradeTime,expirationType,baseSymbolType,symbolCode&orderBy=premium&orderDir=desc&in(baseSymbolType,(1))=&in(symbolType,(Call,Put))=&in(expirationType,(Monthly,Weekly))=&limit=1000&page=${page}&gt(tradeSize,100)=&raw=1`;

  const headers = createHeaders();
  headers.append(
    "referer",
    "https://www.barchart.com/options/options-flow/stocks"
  );
  const requestOptions = {
    method: "GET",
    headers: headers,
    redirect: "follow",
  };

  try {
    const response = await fetch(OF, requestOptions);
    const result = await response.json();
    return result;
  } catch (error) {
    console.error(error);
  }
}

async function fetchUOVData() {
  const UOV =
    "https://www.barchart.com/proxies/core-api/v1/quotes/get?list=options.mostActive.us&fields=symbol,symbolShortName,marketCap,lastPrice,priceChange,percentChange,optionsTotalVolume,optionsTotalOpenInterest,optionsImpliedVolatilityRank1y,optionsTotalVolumePercentChange1m,optionsCallVolume,optionsPutVolume,optionsPutCallVolumeRatio&between(lastPrice,.10,)=&gt(volatility,100)=&orderBy=optionsTotalVolumePercentChange1m&orderDir=desc&limit=1000&meta=field.shortName,field.type,field.description,lists.lastUpdate&hasOptions=true&raw=1";

  const headers = createHeaders();
  headers.append(
    "referer",
    "https://www.barchart.com/options/volume-change/stocks?orderBy=optionsTotalVolumePercentChange1m&orderDir=desc"
  );
  const requestOptions = {
    method: "GET",
    headers: headers,
    redirect: "follow",
  };

  try {
    const response = await fetch(UOV, requestOptions);
    const result = await response.json();
    return result;
  } catch (error) {
    console.error(error);
  }
}

function downloadJSON(jsonFile, fileName) {
  const blob = new Blob([JSON.stringify(jsonFile, null, 2)], {
    type: "application/json",
  });
  const blobUrl = URL.createObjectURL(blob);

  GM_download({
    url: blobUrl, // Use the Blob URL
    name: fileName,
    onerror: function (error) {
      console.error("Error downloading " + fileName, error);
    },
    ontimeout: function () {
      console.error("Timeout downloading " + fileName);
    },
    onload: function () {
      console.log("Successfully downloaded " + fileName);
      // Revoke the Blob URL to free up memory
      URL.revokeObjectURL(blobUrl);
    },
  });
}

async function downloadData(dataSource) {
  let result;
  // Fetch data based on the dataSource
  switch (dataSource) {
    case "OF":
      result = await fetchOFData(1);
      break;
    case "UOA":
      result = await fetchUOAData(1);
      break;
    case "UOV":
      result = await fetchUOVData(1);
      break;
    default:
      console.error("Invalid dataSource");
      return;
  }

  // Ensure we handle the result safely
  if (!result || !result.total || !Array.isArray(result.data)) {
    console.error("Invalid result from data fetch");
    return;
  }

  // Limit pages to avoid too many requests, maximum is 10
  const pages = Math.min(10, Math.ceil(result.total / 1000));
  const optionData = [...result.data];

  for (let i = 2; i <= pages; i++) {
    let nextResult;
    switch (dataSource) {
      case "OF":
        nextResult = await fetchOFData(i);
        break;
      case "UOA":
        nextResult = await fetchUOAData(i);
        break;
      case "UOV":
        nextResult = await fetchUOVData(i);
        break;
    }

    if (nextResult && Array.isArray(nextResult.data)) {
      optionData.push(...nextResult.data);
    } else {
      console.warn(`No data fetched for page ${i}`);
      break;
    }
  }

  // Extract raw data and download as JSON
  const optDataRaw = optionData.map((obj) => obj.raw);
  downloadJSON(optDataRaw, `${dataSource}_${getFormattedDateInEST()}.json`);
}

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

// const uoaButton = createStyledButton("UOA", 20);
// const uovButton = createStyledButton("UOV", 100);
// const ofButton = createStyledButton("OF", 180);

// Create a single button
const combinedButton = createStyledButton("UOA,OF", 180);
// Add click event that handles both downloads
combinedButton.addEventListener("click", () => {
    downloadData("UOA");
    downloadData("OF");
});

// Append the single button to the document body
document.body.appendChild(combinedButton);