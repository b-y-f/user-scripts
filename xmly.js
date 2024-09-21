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
  let nextButton = document.querySelector(".page-next a");

  while (nextButton) {
    // Get all the track names and IDs on the current page
    let timestamp = Date.parse(new Date());
    let pageTracks = Array.from(document.querySelectorAll(".text a")).map(
      (a, index) => {
        timestamp += 5 * 60 * 1000 * index;
        let trackID = a.href.split("/").pop();
        const url = `https://www.ximalaya.com/mobile-playpage/track/v3/baseInfo/${timestamp}?device=web&trackId=${trackID}`;
        let title = a.querySelector(".title").textContent;
        return { title: title, trackID: trackID ,url};
      }
    );
    tracks = tracks.concat(pageTracks);

    // Click the next button
    nextButton.click();

    // Wait for the next page to load
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Update the next button
    nextButton = document.querySelector(".page-next a");
  }

  return tracks;
}

async function decryptUrl(tracks) {
  const tracksWithId = await getAllTracks();
}


const button = document.createElement('button');
button.textContent = 'Download Tracks';
button.style.position = 'fixed';
button.style.bottom = '10px';
button.style.right = '10px';
button.style.zIndex = 1000;
document.body.appendChild(button);

button.addEventListener('click', async function() {
  const ss = await getAllTracks()  
});
