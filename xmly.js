// ==UserScript==
// @name            喜马拉雅专辑下载器
// @version         1.0.0
// @description     XMLY Downloader
// @author          Y
// @match           *://www.ximalaya.com/*
// @grant           GM_download
// @icon            https://www.ximalaya.com/favicon.ico
// @require         https://registry.npmmirror.com/crypto-js/4.1.1/files/crypto-js.js
// @license         MIT
// ==/UserScript==

// increase this value if load slow, otherwise it will use last page data 
const NEXT_PAGE_LOAD_TIME = 3000;
const EACH_DOWNLOAD_DELAY = 500;

function decrypt(t) {
  return CryptoJS.AES.decrypt(
    {
      ciphertext: CryptoJS.enc.Base64url.parse(t),
    },
    CryptoJS.enc.Hex.parse("aaad3e4fd540b0f79dca95606e72bf93"),
    {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7,
    }
  ).toString(CryptoJS.enc.Utf8);
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getAllTracks() {
  const tracks = [];
  const NEXT_BUTTON_SELECTOR = ".page-next.N_t a";
  const TRACK_LINK_SELECTOR = ".text a";


  function extractTracks() {
    let timestamp = Date.now();
    return Array.from(document.querySelectorAll(TRACK_LINK_SELECTOR)).map(
      (a, index) => {
        timestamp += 5 * 60 * 1000 * index;
        const trackID = a.href.split("/").pop();
        const url = `https://www.ximalaya.com/mobile-playpage/track/v3/baseInfo/${timestamp}?device=web&trackId=${trackID}`;
        const title = a.querySelector(".title").textContent;
        return { title, url };
      }
    );
  }

  let nextButton = document.querySelector(NEXT_BUTTON_SELECTOR);

  while (nextButton) {
    tracks.push(...extractTracks());
    nextButton.click();
    await sleep(NEXT_PAGE_LOAD_TIME);
    nextButton = document.querySelector(NEXT_BUTTON_SELECTOR);
  }

  tracks.push(...extractTracks());

  return tracks;
}

async function fetchUrl(apiUrl) {
  try {
    const response = await fetch(apiUrl);
    const data = await response.json();
    const bestAudioUrl = data.trackInfo.playUrlList[0].url;
    return bestAudioUrl;
  } catch (error) {
    console.error("Error fetching the URL:", error);
  }
}

async function downloadFromApi(url, title) {
  try {
    const fetchedUrl = await fetchUrl(url);
    const trueUrl = decrypt(fetchedUrl);
    GM_download({
      url: trueUrl,
      name: `${title}.m4a`,
      saveAs: true,
    });
  } catch (error) {
    console.error("Error downloading the file:", error);
  }
}

const button = document.createElement("button");
button.textContent = "Download Tracks";
button.style.position = "fixed";
button.style.bottom = "10px";
button.style.right = "10px";
button.style.zIndex = 1000;
document.body.appendChild(button);

button.addEventListener("click", async function () {
  const tracks = await getAllTracks();

  let downloadedCount = 0;

  console.log(`Start download! Total ${tracks.length} tracks.`);
  for (const t of tracks) {
    try {
      await downloadFromApi(t.url, t.title);
      downloadedCount++;
      console.log(`Downloaded ${downloadedCount} of ${tracks.length}: ${t.title}`);
      await sleep(EACH_DOWNLOAD_DELAY);
    } catch (error) {
      console.error(`Failed to download ${t.title}:`, error);
    }
  }

  console.log("All downloads completed!");
});
