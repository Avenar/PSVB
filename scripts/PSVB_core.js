const _PSVB_DEBUG = false;
const _psvb_logger = (msg, LEVEL = "info", data = null) => { console.log("PSVB " + LEVEL + ": ", msg); if (data !== null) { console.log(data); } };

_psvb_logger("Initializing photosensitive video blocker.");

class PSVB {
  fixVideosTimeout;
  ignoreList = [];
  ignoreListLoaded = false;

  doVideoCheck() {
    let videos = document.getElementsByTagName('video');
    for (let i = 0; i < videos.length; ++i){
      if ((videos[i].dataset._fix_videos_tagged < 3 || videos[i].dataset._fix_videos_tagged === undefined) && videos[i].paused === false) {
        videos[i].dataset._fix_videos_tagged = parseInt(videos[i].dataset._fix_videos_tagged) + 1 || 0;
        videos[i].pause();
        videos[i].removeAttribute('loop');
        videos[i].controls = true;
        videos[i].currentTime = 0;
        videos[i].volume = 0.4;
        videos[i].muted = false;
      }
    }
  }
  
  checkIgnoreList(url) {
    let i = 0;
    while(!this.ignoreListLoaded && i++ < 100) {
      _psvb_logger("Delay for url ignore list to load.");
    }
    return this.ignoreList.indexOf(url) !== -1;
  }
  
  replaceImageWithPlaceholder(imageElement) {
    let placeholderCanvas = document.createElement('canvas');
    placeholderCanvas.width = imageElement.style.width || imageElement.width;
    placeholderCanvas.height = imageElement.style.height || imageElement.height;
    placeholderCanvas.getContext('2d').drawImage(imageElement, 0, 0);
    imageElement.classList.add('psvb_invisible');
    imageElement.parentElement.insertBefore(placeholderCanvas, imageElement);
    return placeholderCanvas;
  }
  
  // Fix GIF
  reworkGif(imageElement) {
    // immediately replace with placeholder
    let placeholderCanvas = PSVBInstance.replaceImageWithPlaceholder(imageElement);
    // rework and replace placeholder with playable gif
    chrome.runtime.sendMessage(
      {
        type: "PSVBImageFetch",
        url: imageElement.src
      },
      data => processGIF(data, imageElement, placeholderCanvas)
    );
  }

  // Fix PNG
  reworkPng(imageElement) {
    // immediately replace with placeholder
    let placeholderCanvas = PSVBInstance.replaceImageWithPlaceholder(imageElement);
    // rework and replace placeholder with playable png
    chrome.runtime.sendMessage(
      {
        type: "PSVBImageFetch",
        url: imageElement.src
      },
      data => processPNG(data, imageElement, placeholderCanvas)
    ); 
  }

  // Fix WEBP
  reworkWebp(imageElement) {
    // immediately replace with placeholder
    let placeholderCanvas = PSVBInstance.replaceImageWithPlaceholder(imageElement);
    // rework and replace placeholder with playable webp
    chrome.runtime.sendMessage(
      {
        type: "PSVBImageFetch",
        url: imageElement.src
      },
      data => processWEBP(data, imageElement, placeholderCanvas)
    ); 
  }

  init(instance) {
    chrome.runtime.sendMessage(
      {
        type: "PSVBTabIDFetch"
      },
      tabId => {
        chrome.storage.sync.get(["PSVBExtensionDisabled_" + tabId], function(result) {
          if (result["PSVBExtensionDisabled_" + tabId] === true) {
            _psvb_logger("extension should be disabled!");
          } else {
            _psvb_logger("Running video blocker.");
            instance.fixVideosTimeout = setInterval(() => { instance.doVideoCheck() }, 300);
            
            _psvb_logger("Initializing ignorelist");
            chrome.storage.sync.get(["ignoreList"]).then((result) => {
              instance.ignoreList = result.ignoreList;
              instance.ignoreListLoaded = true;
            });
            
            var urlCheckAndInvokeRework = (target) => {
              // TODO: add detection for base64 data url
              let imgUrl = target.src;
              if (imgUrl.split(".gif").length > 1) {
                if (_PSVB_DEBUG) _psvb_logger("this was a gif");
                instance.reworkGif(target);
              } else if (imgUrl.split(".png").length > 1) {
                if (_PSVB_DEBUG) _psvb_logger("this was a png");
                instance.reworkPng(target);
              } else if (imgUrl.split(".webp").length > 1) {
                if (_PSVB_DEBUG) _psvb_logger("this was a webp");
                instance.reworkWebp(target);
              } else {
                if (_PSVB_DEBUG) _psvb_logger("unhandled img", "ERROR", target);
              }
            }
            
            var onLoadCheckerFunction = (e) => {
              if (e.target.tagName) {
                if (e.target.tagName.toLowerCase() == 'img') {
                  urlCheckAndInvokeRework(e.target);
                }
              }
            }

            // Attach listener and run fixer on images
            _psvb_logger("Initializing image listener.");
            document.addEventListener('load', onLoadCheckerFunction, true);
            
            // Check for cached images
            let imgs = document.getElementsByTagName('img');
            for (let i = 0; i < imgs.length; ++i) {
              if (imgs[i].complete) {
                urlCheckAndInvokeRework(imgs[i])
              }
            }
          }
        })
      }
    );
  }
}

var PSVBInstance = new PSVB();
PSVBInstance.init(PSVBInstance);
_psvb_logger("Finished.");