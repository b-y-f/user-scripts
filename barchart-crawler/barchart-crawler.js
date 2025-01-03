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
  const UOA = `https://www.barchart.com/proxies/core-api/v1/options/get?fields=symbol,marketCap,baseLastPrice,daysToExpiration,lastPrice,volume,openInterest,volumeOpenInterestRatio,tradeCondition,label,volatility,delta,tradeTime&orderBy=volumeOpenInterestRatio&orderDir=desc&baseSymbolTypes=stock&between(volumeOpenInterestRatio,1.24,)=&between(lastPrice,.10,)=&between(tradeTime,2023-12-19,${getFormattedDate()})=&between(volume,500,)=&between(openInterest,100,)=&in(exchange,(AMEX,NYSE,NASDAQ,INDEX-CBOE))=&meta=field.shortName,field.type,field.description&limit=1000&page=${page}&raw=1`;

  const headers = createHeaders();
  headers.append(
    "referer",
    "https://www.barchart.com/options/unusual-activity/stocks"
  );
  const requestOptions = {
    method: "GET",
    headers: headers,
    redirect: "follow",
  };

  try {
    const response = await fetch(UOA, requestOptions);
    const result = await response.json();
    const data = result.data;
    return data;
  } catch (error) {
    console.error(error);
  }
}

async function fetchOFData(page) {
  const OF = `https://www.barchart.com/proxies/core-api/v1/options/flow?symbols=&fields=symbol,baseSymbol,lastPrice,symbolType,strikePrice,expiration,dte,tradePrice,tradeSize,side,premium,volume,openInterest,volatility,delta,tradeCondition,label,tradeTime,expirationType,baseSymbolType,symbolCode&orderBy=premium&orderDir=desc&in(baseSymbolType,(1))=&in(symbolType,(Call,Put))=&in(expirationType,(Monthly,Weekly))=&limit=1000&page=${page}&gt(tradeSize,100)=&raw=1`;

  const headers = createHeaders();
  headers.append("referer", "https://www.barchart.com/options/options-flow/stocks");
  const requestOptions = {
    method: "GET",
    headers: headers,
    redirect: "follow",
  };

  try {
    const response = await fetch(OF, requestOptions);
    const result = await response.json();
    const data = result.data;
    return data;
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
    const data = result.data;

    return data;
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

async function downloadUOAData() {
  const optionData = [];
  for (let i = 1; i <= 2; i++) {
    const data = await fetchUOAData(i);
    optionData.push(...data);
  }

  const optDataRaw = optionData.map((obj) => obj.raw);
  downloadJSON(optDataRaw, `UOA_${getFormattedDate()}.json`);
}

async function downloadOFData() {
  const optionData = [];
  for (let i = 1; i <= 2; i++) {
    const data = await fetchOFData(i);
    optionData.push(...data);
  }

  const optDataRaw = optionData.map((obj) => obj.raw);
  downloadJSON(optDataRaw, `OF_${getFormattedDate()}.json`);
}

async function downloadUOVData() {
  const optionData = await fetchUOVData();
  const optDataRaw = optionData.map((obj) => obj.raw);
  downloadJSON(optDataRaw, `UOV_${getFormattedDate()}.json`);
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

const uoaButton = createStyledButton("UOA", 20);
const uovButton = createStyledButton("UOV", 100);
const ofButton = createStyledButton("OF", 180);

// Add click event to the button
uoaButton.addEventListener("click", downloadUOAData);
uovButton.addEventListener("click", downloadUOVData);
ofButton.addEventListener("click", downloadOFData);

// Append the button to the document body
document.body.appendChild(uoaButton);
document.body.appendChild(uovButton);
document.body.appendChild(ofButton);
