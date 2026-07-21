// ==UserScript==
// @name            喜马拉雅专辑下载器
// @version         1.3.9
// @description     XMLY Downloader
// @author          B-Y-F
// @match           *://www.ximalaya.com/*
// @grant           GM_download
// @grant           GM_xmlhttpRequest
// @connect         *
// @icon            https://www.ximalaya.com/favicon.ico
// @require         https://registry.npmmirror.com/crypto-js/4.1.1/files/crypto-js.js
// @run-at          document-idle
// @license         MIT
// @namespace https://greasyfork.org/users/323093
// ==/UserScript==

const UI_HOST_ID = "xmly-downloader-host";
const TRACKS_PER_PAGE = 30;

const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function fetchJson(url, maxAttempts = 5) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      lastError = error;
      console.warn(`请求失败 (${attempt}/${maxAttempts}):`, url, error);
    }
    if (attempt < maxAttempts) await sleep(Math.min(attempt * 1000, 3000));
  }
  throw new Error(`请求多次失败: ${lastError?.message || url}`);
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

async function getAllTrackIds() {
  function getAlbumId() {
    const match = window.location.href.match(/.*\/(\d+)/);
    return match ? match[1] : null;
  }

  async function getAlbumInfo() {
    const albumId = getAlbumId();
    const apiUrl = `https://www.ximalaya.com/tdk-web/seo/search/albumInfo?albumId=${albumId}`;
    const data = await fetchJson(apiUrl);
    const albumData = data.data || {};
    return {
      albumName:
        albumData.albumTitle ||
        albumData.title ||
        albumData.mainTitle ||
        albumData.albumName ||
        albumData.name ||
        "",
      trackCount: albumData.trackCount,
    };
  }

  function tracksOnCurrentPage() {
    const result = new Map();
    document
      .querySelectorAll('.sound-list a[href*="/sound/"], .sound-list li a[href]')
      .forEach((anchor) => {
        const href = anchor.getAttribute("href") || "";
        const match = href.match(/\/(?:sound\/)?(\d+)(?:[/?#]|$)/);
        if (!match) return;
        const title =
          anchor.getAttribute("title") || anchor.textContent?.trim() || match[1];
        result.set(match[1], { title, trackId: match[1] });
      });
    return [...result.values()];
  }

  async function fetchTracks(pages) {
    const tracks = new Map();
    for (let index = 0; index < pages; index++) {
      let current = [];
      for (let wait = 0; wait < 20 && current.length === 0; wait++) {
        current = tracksOnCurrentPage();
        if (current.length === 0) await sleep(250);
      }
      if (current.length === 0) throw new Error("页面中没有找到声音列表");
      current.forEach((track) => tracks.set(track.trackId, track));

      if (index >= pages - 1) break;
      const before = current.map((track) => track.trackId).join(",");
      const nextPageButton = document.querySelector(
        "li.page-next:not(.disabled) a.page-link, li.page-next:not(.disabled) button, a.page-link[rel='next']"
      );
      if (!nextPageButton) {
        throw new Error(`只解析到第 ${index + 1} 页，找不到下一页按钮`);
      }
      nextPageButton.click();
      let changed = false;
      for (let wait = 0; wait < 40; wait++) {
        await sleep(250);
        const after = tracksOnCurrentPage()
          .map((track) => track.trackId)
          .join(",");
        if (after && after !== before) {
          changed = true;
          break;
        }
      }
      if (!changed) throw new Error(`第 ${index + 2} 页加载超时`);
    }
    return [...tracks.values()];
  }

  const albumInfo = await getAlbumInfo();
  const pages = Math.ceil(albumInfo.trackCount / TRACKS_PER_PAGE);
  const tracks = await fetchTracks(pages);
  console.log("raw tracks", tracks);
  return {
    albumName: albumInfo.albumName,
    tracks: extractTrackUrl(tracks),
  };
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

async function fetchAudioUrl(apiUrl) {
  try {
    const data = await fetchJson(apiUrl);
    if (data.ret === 1001) {
      throw new Error(
        "Rate limited!!! Wait for a while then download again..."
      );
    }
    const audioQualities = data.trackInfo?.playUrlList;
    if (!Array.isArray(audioQualities) || audioQualities.length === 0) {
      throw new Error("接口没有返回可下载音质，可能需要登录或该声音不可下载");
    }
    return audioQualities;
  } catch (error) {
    console.error("Error fetching the URL:", error);
    throw error;
  }
}

function sanitizeFileName(fileName) {
  return String(fileName || "").replace(/[\\/:*?"<>|\r\n]+/g, "_").trim();
}

function extensionFromContentType(contentType) {
  const mime = String(contentType || "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  const extensions = {
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/mp4": "m4a",
    "audio/x-m4a": "m4a",
    "audio/aac": "aac",
    "audio/aacp": "aac",
    "audio/flac": "flac",
    "audio/ogg": "ogg",
    "audio/opus": "opus",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
  };
  return extensions[mime] || null;
}

function extensionFromUrl(url) {
  try {
    const match = new URL(url).pathname.match(
      /\.([a-z0-9]{2,5})$/i
    );
    const extension = match && match[1].toLowerCase();
    return ["mp3", "m4a", "mp4", "aac", "flac", "ogg", "opus", "wav"].includes(
      extension
    )
      ? extension === "mp4"
        ? "m4a"
        : extension
      : null;
  } catch (error) {
    return null;
  }
}

function sniffAudioExtension(buffer) {
  const bytes = new Uint8Array(buffer || new ArrayBuffer(0));
  const text = (...indexes) =>
    indexes.map((index) => String.fromCharCode(bytes[index] || 0)).join("");

  if (text(0, 1, 2) === "ID3") return "mp3";
  if (bytes.length >= 2 && bytes[0] === 0xff) {
    // ADTS uses layer bits 00; MPEG audio (including MP3) does not.
    if ((bytes[1] & 0xf6) === 0xf0) return "aac";
    if ((bytes[1] & 0xe0) === 0xe0) return "mp3";
  }
  if (text(4, 5, 6, 7) === "ftyp") return "m4a";
  if (text(0, 1, 2, 3) === "fLaC") return "flac";
  if (text(0, 1, 2, 3) === "OggS") return "ogg";
  if (text(0, 1, 2, 3) === "RIFF" && text(8, 9, 10, 11) === "WAVE") {
    return "wav";
  }
  return null;
}

function getResponseHeader(responseHeaders, name) {
  const match = String(responseHeaders || "").match(
    new RegExp(`^${name}:\\s*(.+)$`, "im")
  );
  return match ? match[1].trim() : "";
}

function detectAudioExtension(url, declaredType) {
  return new Promise((resolve) => {
    let settled = false;
    let responseHint = null;
    const fallback = () => {
      const declaredExtension = String(declaredType || "")
        .split("_", 1)[0]
        .toLowerCase();
      resolve(responseHint || extensionFromUrl(url) || declaredExtension || "mp3");
    };

    const request = GM_xmlhttpRequest({
      method: "GET",
      url,
      headers: { Range: "bytes=0-31" },
      responseType: "arraybuffer",
      timeout: 10000,
      onreadystatechange(response) {
        if (settled || response.readyState !== 2) return;
        responseHint = extensionFromContentType(
          getResponseHeader(response.responseHeaders, "content-type")
        );
        // Do not accidentally fetch an entire audio file if the CDN ignores Range.
        if (response.status !== 206) {
          settled = true;
          request.abort();
          fallback();
        }
      },
      onload(response) {
        if (settled) return;
        settled = true;
        resolve(
          sniffAudioExtension(response.response) ||
            extensionFromContentType(
              getResponseHeader(response.responseHeaders, "content-type")
            ) ||
            extensionFromUrl(response.finalUrl || url) ||
            String(declaredType || "").split("_", 1)[0].toLowerCase() ||
            "mp3"
        );
      },
      onerror() {
        if (settled) return;
        settled = true;
        fallback();
      },
      ontimeout() {
        if (settled) return;
        settled = true;
        fallback();
      },
    });
  });
}

async function buildDownloadList(
  finalDownloadList,
  selectedQualityIndex,
  isSequenceOrder
) {
  return Promise.all(finalDownloadList.map(async (item, index) => {
    const selectedQuality =
      item.audioQualities[selectedQualityIndex] || item.audioQualities[0];
    const trueUrl = decrypt(selectedQuality.url);
    const fileType = await detectAudioExtension(trueUrl, selectedQuality.type);
    const fileName = sanitizeFileName(`${item.title}.${fileType}`);

    return {
      ...item,
      trueUrl,
      fileName: isSequenceOrder ? `${index}.${fileName}` : fileName,
    };
  }));
}

function exportAria2Links(downloadList, albumName) {
  const content = downloadList
    .map((item) => `${item.trueUrl}\n  out=${item.fileName}`)
    .join("\n\n");
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const link = document.createElement("a");
  const objectUrl = URL.createObjectURL(blob);
  const baseName = sanitizeFileName(albumName) || "links";

  link.href = objectUrl;
  link.download = `${baseName}.txt`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

function initializeUI() {
  if (document.getElementById(UI_HOST_ID)) return;

  // Keep Ximalaya's (and browser extensions') page CSS from hiding the controls.
  const uiHost = document.createElement("div");
  uiHost.id = UI_HOST_ID;
  uiHost.style.cssText =
    "all: initial; position: fixed; right: 0; bottom: 0; z-index: 2147483647;";
  document.body.appendChild(uiHost);
  const uiRoot = uiHost.attachShadow
    ? uiHost.attachShadow({ mode: "open" })
    : uiHost;

  const progressDisplay = document.createElement("div");
  progressDisplay.style.cssText =
    "all: initial; position: fixed; right: 10px; bottom: 50px; " +
    "box-sizing: border-box; display: none; padding: 10px; border: 1px solid #000; " +
    "background: #fff; color: #000; font: 14px/1.4 sans-serif;";
  uiRoot.appendChild(progressDisplay);

  // Create a container div
  const container = document.createElement("div");
  container.style.cssText =
    "all: initial; position: fixed; right: 10px; bottom: 10px; " +
    "box-sizing: border-box; display: flex; align-items: center; padding: 5px; " +
    "background: #fff; color: #000; font: 14px/1.4 sans-serif;";
  uiRoot.appendChild(container);

  const button = document.createElement("button");
  button.textContent = "解析ID";
  button.style.cssText =
    "all: revert; display: inline-block; box-sizing: border-box; padding: 2px 8px; " +
    "border: 1px solid #767676; border-radius: 2px; background: #efefef; " +
    "color: #000; font: 14px/1.4 sans-serif; cursor: pointer;";
  container.appendChild(button);

  button.addEventListener("click", async function parseIds() {
    progressDisplay.style.display = "block";
    progressDisplay.textContent = "ID解析进行中...";
    const album = await getAllTrackIds();
    const albumName = album.albumName;
    const tracks = album.tracks;
    progressDisplay.textContent = "ID解析完成";
    button.textContent = "解析URL";

    button.removeEventListener("click", parseIds);
    button.addEventListener("click", async function parseUrls() {
      progressDisplay.textContent = "URL解析进行中...";
      // TODO
      let finalDownloadList = [];
      for (let index = 0; index < tracks.length; index++) {
        const t = tracks[index];
        const audioQualities = await fetchAudioUrl(t.url)
        finalDownloadList.push({ title: t.title, audioQualities });
        progressDisplay.textContent = `解析进程: ${index} / ${tracks.length}`;

      }

      console.log("Before set audio quality\n", finalDownloadList);

      if (finalDownloadList.length > 0) {
        progressDisplay.textContent = "URL解析完成。";

        // Create quality selection dropdown
        const qualityLabel = document.createElement("label");
        qualityLabel.htmlFor = "qualitySelect";
        qualityLabel.textContent = "音质: ";
        qualityLabel.style.marginRight = "5px";
        container.appendChild(qualityLabel);

        const qualitySelect = document.createElement("select");
        qualitySelect.id = "qualitySelect";
        qualitySelect.style.marginRight = "30px";

        // Get available quality types from the first item
        const availableQualities = finalDownloadList[0]['audioQualities'];
        availableQualities.forEach((quality, index) => {
          const option = document.createElement("option");
          option.value = index;
          option.textContent = `${quality.type} (${(quality.fileSize / 1024 / 1024).toFixed(2)}MB)`;
          qualitySelect.appendChild(option);
        });

        container.appendChild(qualitySelect);

        // Variable to store selected quality index
        let selectedQualityIndex = 0;
        qualitySelect.addEventListener("change", (e) => {
          selectedQualityIndex = parseInt(e.target.value);
        });
        button.textContent = "直接下载";
        button.style.marginRight = "5px";

        const exportButton = document.createElement("button");
        exportButton.textContent = "导出aria2链接";
        exportButton.style.marginRight = "30px";
        container.insertBefore(exportButton, button.nextSibling);

        // Create the checkbox
        const label = document.createElement("label");
        label.htmlFor = "sequenceOrder";
        label.textContent = "加序号: ";
        label.style.marginRight = "5px";
        container.appendChild(label);
        const seqNumberCheckbox = document.createElement("input");
        seqNumberCheckbox.type = "checkbox";
        container.appendChild(seqNumberCheckbox);
        let isSequenceOrder = seqNumberCheckbox.checked;
        seqNumberCheckbox.addEventListener("change", () => {
          isSequenceOrder = seqNumberCheckbox.checked;
        });

        button.removeEventListener("click", parseUrls);
        button.addEventListener("click", async function downloadFiles() {
          let count = 0;
          progressDisplay.textContent = "正在识别真实音频格式...";
          const downloadList = await buildDownloadList(
            finalDownloadList,
            selectedQualityIndex,
            isSequenceOrder
          );
          progressDisplay.textContent = `下载进程： ${count} / ${tracks.length}`;
          console.log("After decrypt url\n", downloadList);
          downloadList.forEach((item) => {
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

        exportButton.addEventListener("click", async function exportLinks() {
          progressDisplay.textContent = "正在识别真实音频格式...";
          const downloadList = await buildDownloadList(
            finalDownloadList,
            selectedQualityIndex,
            isSequenceOrder
          );
          exportAria2Links(downloadList, albumName);
          progressDisplay.textContent = "aria2 链接已导出";
        });
      } else {
        progressDisplay.textContent = "URL解析失败，请重试";
      }
    });
  });
}

if (document.body) {
  initializeUI();
} else {
  window.addEventListener("DOMContentLoaded", initializeUI, { once: true });
}
