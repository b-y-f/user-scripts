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

async function getAllTracks() {
  let tracks = [];
  let nextButton = document.querySelector(".page-next.N_t a");

  // console.log('nextButton',nextButton);
  

  const extractTracks = () => {
    let timestamp = Date.parse(new Date());
    return Array.from(document.querySelectorAll(".text a")).map((a, index) => {
      timestamp += 5 * 60 * 1000 * index;
      let trackID = a.href.split("/").pop();
      const url = `https://www.ximalaya.com/mobile-playpage/track/v3/baseInfo/${timestamp}?device=web&trackId=${trackID}`;
      let title = a.querySelector(".title").textContent;
      return { title: title, url };
    });
  };

  while (nextButton) {
    // console.log("while loop");
    
    // Get all the track names and IDs on the current page
    tracks = tracks.concat(extractTracks());

    // Click the next button
    nextButton.click();

    // Wait for the next page to load
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Update the next button
    nextButton = document.querySelector(".page-next a");
  }

  // Fetch the tracks on the last page
  tracks = tracks.concat(extractTracks());

  // console.log("tracks", tracks);
  

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

  console.log(tracks);
  

  for (const t of tracks) {
    try {
      await downloadFromApi(t.url, t.title);
      downloadedCount++;
      console.log(`Downloaded ${downloadedCount} of ${tracks.length}: ${t.title}`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`Failed to download ${t.title}:`, error);
    }
  }

  console.log("All downloads completed!");
});
