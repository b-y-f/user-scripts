// ==UserScript==
// @name            喜马拉雅专辑下载器
// @version         1.2.2
// @description     XMLY Downloader
// @author          B-Y-F
// @match           *://www.ximalaya.com/*
// @grant           GM_download
// @icon            https://www.ximalaya.com/favicon.ico
// @require         https://registry.npmmirror.com/crypto-js/4.1.1/files/crypto-js.js
// @license         MIT
// @namespace https://greasyfork.org/users/323093
// ==/UserScript==

const MAX_TRACK_PER_API = 100;

async function fetchUntilSuccess(url) {
  while (true) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        return data;
      }
      console.error(
        `Failed to fetch: ${response.status} ${response.statusText}`
      );
    } catch (error) {
      console.error(`Fetch error: ${error.message}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

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
    const match = window.location.href.match(/.*\/(\d+)/);
    return match ? match[1] : null;
  }

  async function getTotalTrackCount(albumId) {
    const apiUrl = `https://www.ximalaya.com/tdk-web/seo/search/albumInfo?albumId=${albumId}`;
    const data = await fetchUntilSuccess(apiUrl);
    return data.data.trackCount;
  }

  async function fetchTracksForPage(albumId, pageNum) {
    const apiUrl = `https://www.ximalaya.com/revision/album/v1/getTracksList?albumId=${albumId}&pageNum=${pageNum}&pageSize=${MAX_TRACK_PER_API}&sort=0`;
    const data = await fetchUntilSuccess(apiUrl);
    return data.data.tracks;
  }

  const albumId = getAlbumId();
  const totalTrackNumber = await getTotalTrackCount(albumId);
  const pages = Math.ceil(totalTrackNumber / MAX_TRACK_PER_API);

  let tracks = [];
  for (let pageNum = 1; pageNum <= pages; pageNum++) {
    const partialTracks = await fetchTracksForPage(albumId, pageNum);
    if (partialTracks?.length > 0) {
      tracks = tracks.concat(partialTracks);
    }
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

async function fetchUrl(apiUrl) {
  try {
    const data = await fetchUntilSuccess(apiUrl);    
    const bestAudioUrl = data.trackInfo.playUrlList[0].url;
    return bestAudioUrl;
  } catch (error) {
    console.error("Error fetching the URL:", error);
  }
}

async function getTrueUrl(title, url, index, isSequenceOrder) {
  try {
    const fetchedUrl = await fetchUrl(url);
    const trueUrl = decrypt(fetchedUrl);
    const fileName = isSequenceOrder ? `${index}.${title}.m4a` : `${title}.m4a`;
    return { fileName, trueUrl };
  } catch (error) {
    console.error("Error getting the true url:", error);
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
  button.textContent = "解析";
  button.style.marginLeft = "10px";
  container.appendChild(button);

  let isSequenceOrder = seqNumberCheckbox.checked;
  seqNumberCheckbox.addEventListener("change", () => {
    isSequenceOrder = seqNumberCheckbox.checked;
  });

  button.addEventListener("click", async function parseUrls() {
    progressDisplay.style.display = "block";
    progressDisplay.textContent = "URL解析进行中...";

    const tracks = await getAllTracks();

    let finalDownloadList = [];
    for (let index = 0; index < tracks.length; index++) {
      const t = tracks[index];
      const item = await getTrueUrl(t.title, t.url, index, isSequenceOrder);
      finalDownloadList.push(item);
      progressDisplay.textContent = `解析进程: ${index} / ${tracks.length}`;
    }

    console.log(finalDownloadList);

    if (finalDownloadList.length > 0) {
      progressDisplay.textContent = "URL解析完成。";
      button.textContent = "下载";
      button.removeEventListener("click", parseUrls);
      button.addEventListener("click", function downloadFiles() {
        let count = 0;
        progressDisplay.textContent = `下载进程： ${count} / ${tracks.length}`;
        finalDownloadList.forEach((item) => {
          GM_download({
            url: item.trueUrl,
            name: item.fileName,
            onerror: function (error) {
              console.error("Error downloading " + item.fileName, error);
            },
            ontimeout: function () {
              console.error("Timeout downloading " + item.fileName);
            },
            onload: function () {
              console.log("Successfully downloaded " + item.fileName);
              count++;
              progressDisplay.textContent = `Downloaded ${count} / ${tracks.length}`;
            },
          });
        });
      });
    } else {
      progressDisplay.textContent = "URL解析失败，请重试";
    }
  });
}

initializeUI();
