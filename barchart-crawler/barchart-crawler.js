// ==UserScript==
// @name         Fetch Data From Barchart
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Fetch and log data from API
// @author       You
// @require      https://cdn.jsdelivr.net/npm/danfojs@1.1.2/lib/bundle.min.js
// @match        https://www.barchart.com/*
// @grant         GM_download

// ==/UserScript==

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

async function fetchData(page) {
  const todayDate = getFormattedDate();
  const url = `
https://www.barchart.com/proxies/core-api/v1/options/get?
fields=symbol,baseSymbol,baseLastPrice,baseSymbolType,symbolType,strikePrice,expirationDate,daysToExpiration,bidPrice,midpoint,askPrice,lastPrice,volume,openInterest,volumeOpenInterestRatio,volatility,delta,tradeTime,symbolCode
&orderBy=volumeOpenInterestRatio
&orderDir=desc
&baseSymbolTypes=stock
&between(volumeOpenInterestRatio,1.24,)
&between(lastPrice,.10,)
&between(tradeTime,2023-12-10,${todayDate})
&between(volume,500,)
&between(openInterest,100,)
&in(exchange,(AMEX,NYSE,NASDAQ,INDEX-CBOE))
&meta=field.shortName,field.type,field.description
&page=${page}
&limit=1000
&raw=1`;
  const myHeaders = new Headers();
  myHeaders.append("accept", "application/json");
  myHeaders.append("accept-language", "en,en-CN;q=0.9,zh-CN;q=0.8,zh;q=0.7");
  myHeaders.append("cookie", getCookie());
  myHeaders.append("dnt", "1");
  myHeaders.append("priority", "u=1, i");
  myHeaders.append(
    "referer",
    "https://www.barchart.com/options/unusual-activity/stocks"
  );
  myHeaders.append(
    "sec-ch-ua",
    '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"'
  );
  myHeaders.append("sec-ch-ua-mobile", "?0");
  myHeaders.append("sec-ch-ua-platform", '"Windows"');
  myHeaders.append("sec-fetch-dest", "empty");
  myHeaders.append("sec-fetch-mode", "cors");
  myHeaders.append("sec-fetch-site", "same-origin");
  myHeaders.append(
    "user-agent",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
  );
  myHeaders.append("x-xsrf-token", getCookieValue("XSRF-TOKEN"));

  const requestOptions = {
    method: "GET",
    headers: myHeaders,
    redirect: "follow",
  };

  try {
    const response = await fetch(url, requestOptions);
    const result = await response.json();
    const data = result.data;
    return data;
  } catch (error) {
    console.error(error);
  }
}

function processData(objList) {
  let df = new dfd.DataFrame(objList);
  df.drop({
    columns: [
      "baseSymbol",
      "expirationDate",
      "symbolType",
      "baseSymbolType",
      "strikePrice",
    ],
    inplace: true,
  });
  df.addColumn("delta_abs", df["delta"].abs(), { inplace: true });
  df.addColumn(
    "tradeDate",
    df["tradeTime"].apply((tradeTime) => {
      // Convert UNIX timestamp to milliseconds
      let date = new Date(tradeTime * 1000);
      // Convert to EST timezone
      let estDate = new Date(
        date.toLocaleString("en-US", { timeZone: "America/New_York" })
      );
      // Format to 'yyyy-mm-dd'
      let estDateString = estDate.toISOString().split("T")[0];

      return estDateString;
    }),
    { inplace: true }
  );

  // Add 'premium' column calculated as midpoint * 100 * volume
  df.addColumn("premium", df["midpoint"].mul(100).mul(df["volume"]), {
    inplace: true,
  });

  // Filter the DataFrame based on the specified conditions
  df = df.query(
    df["openInterest"]
      .gt(50)
      .and(df["daysToExpiration"].gt(90))
      .and(df["volumeOpenInterestRatio"].gt(15))
  );

  // Convert 'premium' values into string format "xx.xx B" for billions
  df.addColumn(
    "premium_str",
    df["premium"].apply((premium) => {
      let premiumInBillions = premium / 1e6;
      return premiumInBillions.toFixed(2) + " B";
    }),
    { inplace: true }
  );

  df.sortValues("premium", { ascending: false, inplace: true });

  return df;
}

function downloadCSV(dataFrame, fileName) {
  const csvContent = dfd.toCSV(dataFrame); // Convert DataFrame to CSV
  GM_download({
    url: `data:text/csv;charset=utf-8,${encodeURIComponent(csvContent)}`,
    name: fileName,
    onerror: function (error) {
      console.error("Error downloading " + fileName, error);
    },
    ontimeout: function () {
      console.error("Timeout downloading " + fileName);
    },
    onload: function () {
      console.log("Successfully downloaded " + fileName);
    },
  });
}

async function getData() {
  const optionData = [];
  for (let i = 1; i <= 2; i++) {
    const data = await fetchData(i);
    optionData.push(...data);
  }

  const optDataRaw = optionData.map((obj) => obj.raw);
  const df = processData(optDataRaw);
  downloadCSV(df, `option_${getFormattedDate()}.csv`)
}

// Create a button element
const button = document.createElement("button");
button.textContent = "Get Data";
button.style.position = "fixed";
button.style.bottom = "20px";
button.style.right = "20px";
button.style.padding = "10px 20px";
button.style.backgroundColor = "#007BFF";
button.style.color = "white";
button.style.border = "none";
button.style.borderRadius = "5px";
button.style.cursor = "pointer";
button.style.zIndex = "1000";

// Add click event to the button
button.addEventListener("click", getData);

// Append the button to the document body
document.body.appendChild(button);
