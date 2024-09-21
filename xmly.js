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

const EACH_DOWNLOAD_DELAY = 500;

function extractTrackUrl(tracks) {
  let timestamp = Date.now();
  return Array.from(tracks).map((t, index) => {
    timestamp += 5 * 60 * 1000 * index;
    const trackID = t.trackId;
    const title = t.title;
    const url = `https://www.ximalaya.com/mobile-playpage/track/v3/baseInfo/${timestamp}?device=web&trackId=${trackID}`;
    return { title, url };
  });
}

async function getAllTracks() {
  function getTotalTrackNumber() {
    const element = document.querySelector(".title.active .s_O");
    const textContent = element.textContent;
    const numberMatch = textContent.match(/\d+/);
    const number = numberMatch ? parseInt(numberMatch[0], 10) : null;
    return number;
  }

  function getAlbumId() {
    var currentURL = window.location.href;
    var match = currentURL.match(/album\/(\d+)/);
    var albumId = match ? match[1] : null;
    return albumId;
  }

  const apiUrl = `https://www.ximalaya.com/revision/album/v1/getTracksList?albumId=${getAlbumId()}&pageNum=1&pageSize=${getTotalTrackNumber()}`;
  const response = await fetch(apiUrl);
  const resJson = await response.json();
  const tracks = resJson.data.tracks;
  return extractTrackUrl(tracks);
}

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

async function downloadFromApi(title, url) {
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

const progressDisplay = document.createElement("div");
progressDisplay.style.position = "fixed";
progressDisplay.style.bottom = "50px";
progressDisplay.style.right = "10px";
progressDisplay.style.zIndex = 1000;
progressDisplay.style.backgroundColor = "white";
progressDisplay.style.padding = "10px";
progressDisplay.style.border = "1px solid black";
progressDisplay.style.display = "none"; // Initially hidden
document.body.appendChild(progressDisplay);

button.addEventListener("click", async function () {
  const tracks = await getAllTracks();

  let downloadedCount = 0;

  console.log(`Start download! Total ${tracks.length} tracks.`);
  progressDisplay.textContent = `Start download! Total ${tracks.length} tracks.`;
  progressDisplay.style.display = "block"; // Show progress display

  for (const t of tracks) {
    try {
      await downloadFromApi(t.title, t.url);
      downloadedCount++;
      console.log(
        `Downloaded ${downloadedCount} of ${tracks.length}: ${t.title}`
      );
      progressDisplay.textContent = `Downloaded ${downloadedCount} of ${tracks.length}: ${t.title}`;
      await sleep(EACH_DOWNLOAD_DELAY);
    } catch (error) {
      console.error(`Failed to download ${t.title}:`, error);
      progressDisplay.textContent = `Failed to download ${t.title}: ${error.message}`;
    }
  }

  console.log("All downloads completed!");
  progressDisplay.textContent = "All downloads completed!";

  // Hide progress display after 2 seconds
  setTimeout(() => {
    progressDisplay.style.display = "none";
  }, 2000);
});
