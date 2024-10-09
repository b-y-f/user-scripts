// ==UserScript==
// @name            喜马拉雅专辑下载器
// @version         1.1.3
// @description     XMLY Downloader
// @author          Y
// @match           *://www.ximalaya.com/*
// @grant           GM_download
// @icon            https://www.ximalaya.com/favicon.ico
// @require         https://registry.npmmirror.com/crypto-js/4.1.1/files/crypto-js.js
// @license         MIT
// @namespace https://greasyfork.org/users/323093
// ==/UserScript==

const MAX_TRACK_PER_API = 100;

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
  function getAlbumId() {
    var currentURL = window.location.href;
    var match = currentURL.match(/.*\/(\d+)/);
    var albumId = match ? match[1] : null;
    return albumId;
  }

  async function getTotalTrackCount(albumId) {
    const apiUrl = `https://www.ximalaya.com/tdk-web/seo/search/albumInfo?albumId=${albumId}`;
    const response = await fetch(apiUrl);
    const resJson = await response.json();
    const trackCount = resJson.data.trackCount;
    return trackCount;
  }

  const albumId = getAlbumId();
  let tracks = [];
  const pages =
    Math.floor((await getTotalTrackCount(albumId)) / MAX_TRACK_PER_API) + 1;

  for (let pageNum = 1; pageNum <= pages; pageNum++) {
    const apiUrl = `https://www.ximalaya.com/revision/album/v1/getTracksList?albumId=${albumId}&pageNum=${pageNum}&pageSize=100&sort=0`;
    const response = await fetch(apiUrl);
    const resJson = await response.json();
    tracks = tracks.concat(resJson.data.tracks);
  }
  console.log(tracks);

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

async function downloadFromApi(title, url, index, isSequenceOrder) {
  try {
    const fetchedUrl = await fetchUrl(url);
    const trueUrl = decrypt(fetchedUrl);
    const fileName = isSequenceOrder ? `${index}.${title}.m4a` : `${title}.m4a`;

    const downloadFile = async (attempt = 1) => {
      GM_download({
        url: trueUrl,
        name: fileName,
        saveAs: true,
        onerror: async (e) => {
          console.error(
            `Attempt ${attempt} failed for ${fileName}, trying again...`,
            e
          );
          await downloadFile(attempt + 1);
        },
      });
    };

    await downloadFile();
  } catch (error) {
    console.error("Error downloading the file:", error);
  }
}

function initializeUI() {
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

  // Create a container div
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.bottom = "10px";
  container.style.right = "10px";
  container.style.zIndex = 1000;
  container.style.display = "flex";
  container.style.alignItems = "center";
  document.body.appendChild(container);

  // Create the checkbox
  const seqNumberCheckbox = document.createElement("input");
  seqNumberCheckbox.type = "checkbox";
  container.appendChild(seqNumberCheckbox);

  const label = document.createElement("label");
  label.htmlFor = "sequenceOrder";
  label.textContent = "加序号";
  label.style.marginLeft = "5px";
  label.style.backgroundColor = "white";
  container.appendChild(label);

  const button = document.createElement("button");
  button.textContent = "Download";
  button.style.marginLeft = "10px";
  container.appendChild(button);

  let isSequenceOrder = seqNumberCheckbox.checked;
  seqNumberCheckbox.addEventListener("change", () => {
    isSequenceOrder = seqNumberCheckbox.checked;
  });

  button.addEventListener("click", async function () {
    const tracks = await getAllTracks();

    console.log(`Start download! Total ${tracks.length} tracks.`);
    progressDisplay.style.display = "block";

    for (let index = 0; index < tracks.length; index++) {
      const t = tracks[index];
      try {
        await downloadFromApi(t.title, t.url, index, isSequenceOrder);
        progressDisplay.textContent = `Downloaded ${index + 1} / ${
          tracks.length
        }`;
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
}

initializeUI();
