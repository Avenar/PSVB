var ERR_NAR = 'Not a RIFF';
var ERR_NAW = 'Not a WEBP';
var ERR_NAAW = 'Not a AWEBP';
var errNotRIFF = new Error(ERR_NAR);
var errNotWEBP = new Error(ERR_NAW);
var errNotAWEBP = new Error(ERR_NAAW);
var CHUNK_DATA_DEBUG = false;

class WebpPlayer {
  webp;
  context;
  currFrame;
  playing;
  timeoutHandle = null;
  _prevFrame = null;
  
  play() {
    var _this2 = this;

    this.playing = true;

    var nextRenderTime = performance.now() + this.currentFrame().duration;
    var tick = function tick(now) {
      if (!_this2.playing) {
          return;
      }
      if (now >= nextRenderTime) {
        do {
          _this2.renderNextFrame();
          nextRenderTime += _this2.currentFrame().duration;
        } while (!_this2._ended && now > nextRenderTime);
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  
  pause() {
    this.playing = false;
  }
  
  currentFrame() {
    return this.webp.frames[this.currFrame];
  }
  
  init() {
    Promise.all(this.webp.frames.map(function (f) {
      return f.createImage();
    })).then(() => {
      this.renderNextFrame();
    });
  }
  
  renderNextFrame() {
    this.currFrame = (this.currFrame + 1) % this.webp.frames.length;
    
    // Show next frame
    if (this._prevFrame && this._prevFrame.disposal) {
      // Dispose to background color
      this.context.clearRect();
      ctx.rect(this._prevFrame.x, this._prevFrame.y, this._prevFrame.width, this._prevFrame.height);
      ctx.fillStyle = webp.animationBackgroundColor;
      ctx.fill();
    } else {
      // Do not dispose. Basically do nothing
    }

    var frame = this.currentFrame();
    this._prevFrame = frame;
    
    if (frame.blending || frame.alphaBlock == null) {
      // Do not blend
      this.context.drawImage(frame.imageElement, frame.x, frame.y);
    } else {
      // Alpha blending
      // TODO: actually blend. Check Alpha block???
      this.context.drawImage(frame.imageElement, frame.x, frame.y);
    }
    return frame.duration;
  }
  
  constructor(webp, canvasContext) {
    this.webp = webp;
    this.context = canvasContext;

    this.currFrame = -1;
    this.playing = false;
    return this;
  }
}

class WebpFrame {
  x = -1;
  y = -1;
  width = 0;
  height = 0;
  duration = 0;
  blending = false;
  disposal = false;
  alphaBlock = null;
  imageBlob = null;
  imageElement = null;
  loaded = false;
  createImage() {
    var _this2 = this;
    if (this.imageElement) {
      return Promise.resolve();
    }
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(_this2.imageBlob);
      _this2.imageElement = new Image();
      _this2.imageElement.onload = function () {
        URL.revokeObjectURL(url);
        resolve();
      };
      _this2.imageElement.onerror = function () {
        URL.revokeObjectURL(url);
        _this2.imageElement = null;
        reject(new Error("Image creation error"));
      };
      _this2.imageElement.src = url;
    });
  }
}

class WebpStream {
  bytes;
  pointer = -1;
  fileSize = 8;
  
  eof = () => {
    return this.pointer >= (this.fileSize - 1);
  }
  
  constructor(byteArray) {
    this.bytes = byteArray;
    return this;
  }
  
  setFileSize(size) {
    if (this.fileSize != 8) throw new Error("Cannot change filesize mid-read");
    this.fileSize = size;
  }
  
  advancePointer() {
    if (++this.pointer >= this.fileSize) throw new Error("Reading stream out of bounds");
  }
  
  readBytes(numBytes) {
    let output = [];
    while(numBytes--) {
      this.advancePointer();
      output.push(this.bytes[this.pointer]);
    }
    return Uint8Array.from(output);
  }
  
  readBytesToString(numBytes) {
    let output = [];
    let data = this.readBytes(numBytes);
    for(let i = 0; i < data.length; ++i) {
      output.push(String.fromCharCode(data[i]));
    }
    return output.join("");
  }
  
  peekHeaderString() {
    let output = [];
    let data = this.readBytes(4);
    for(let i = 0; i < data.length; ++i) {
      output.push(String.fromCharCode(data[i]));
    }
    pointer -= 4;
    return output.join("");
  }
  
  readChunkHeader() {
    let output = {
      type: "",
      chunkSize: 0
    };
    let data = [];
    let fourCCSize = 4;
    while(fourCCSize--) {
      this.advancePointer();
      data.push(String.fromCharCode(this.bytes[this.pointer]));
    }
    output.type = data.join("");
    output.chunkSize = this.readUint32Int();
    return output;
  }
  
  readUint32Int() {
    let numBytes =  4;
    let data = this.readBytes(numBytes);
    
    // reverse order because of little endian
    let output = ((data[3] << 24)
       | (data[2] << 16)
       | (data[1] << 8)
       | (data[0]));
    return output;
  }
}

class WEBPParser {
  parseUint24Int(bytes) {
    // reverse order because of little endian
    let output = ((bytes[2] << 16)
       | (bytes[1] << 8)
       | (bytes[0]));
    return output;
  }
  readSubChunk(chunkData) {
    return {
      type: chunkData.slice(0, 4).map((l) => { return String.fromCharCode(l) }).join(""),
      size: this.parseUint24Int(chunkData.slice(4, 4))
    };
  }
  
  parseVP8XChunk(data) {
    var vp8xSettings = {
      icc: false,
      alpha: false,
      exif: false,
      xmp: false,
      animated: false,
      canvasWidth: -1,
      canvasHeight: -1
    };
    let bitSettingsByte = data[0];
    for (let i = 0; i < 8; ++i) {
      if (bitSettingsByte & (1 << i)) {
        switch(i) {
          case 7:
            // Reserved: ignore
            break;
          case 6:
            // Animated
            break;
          case 5:
            // XMP
            vp8xSettings.icc = true;
            break;
          case 4:
            // Exif
            vp8xSettings.alpha = true;
            break;
          case 3:
            // Alpha
            vp8xSettings.exif = true;
            break;
          case 2:
            // ICC
            vp8xSettings.xmp = true;
            break;
          case 1:
            // Reserved: ignore
            vp8xSettings.animated = true;
            break;
          case 0:
            // Reserved: ignore
            break;
        }
      }
    }
    vp8xSettings.canvasWidth = this.parseUint24Int([data[4], data[5], data[6]]) + 1;
    vp8xSettings.canvasHeight = this.parseUint24Int([data[7], data[8], data[9]]) + 1;
    return vp8xSettings;
  }

  parseANIMChunk(data) {
    return {
      backgroundColor: [data[0], data[1], data[2], data[3]],
      loopCount: ((data[4] << 8) | (data[5]))
    };
  }
  
  parseANMFChunk(data, alphaBlock) {
    var frame = new WebpFrame();
    
    frame.x = this.parseUint24Int([data[0], data[1], data[2]]) * 2;
    frame.y = this.parseUint24Int([data[3], data[4], data[5]]) * 2;
    frame.width = this.parseUint24Int([data[6], data[7], data[8]]) + 1;
    frame.height = this.parseUint24Int([data[9], data[10], data[11]]) + 1;
    frame.duration = this.parseUint24Int([data[12], data[13], data[14]]);
    let bitSettingsByte = data[15];
    
    for (let i = 0; i < 8; ++i) {
      if (bitSettingsByte & (1 << i)) {
        switch(i) {
          case 0:
            // Disposal
            frame.disposal = true;
            break;
          case 1:
            // Blending
            frame.blending = true;
            break;
          case 2:
          case 3:
          case 4:
          case 5:
          case 6:
          case 7:
            // Reserved: ignore
            break;
        }
      }
    }
    
    var imageFakeHeader = data.slice(4); // 
    imageFakeHeader[0] = "R".charCodeAt(0);
    imageFakeHeader[1] = "I".charCodeAt(0);
    imageFakeHeader[2] = "F".charCodeAt(0);
    imageFakeHeader[3] = "F".charCodeAt(0);
    imageFakeHeader[4] = (imageFakeHeader.length - 8) & 0xFF;
    imageFakeHeader[5] = ((imageFakeHeader.length - 8) >> 8) & 0xFF;
    imageFakeHeader[6] = ((imageFakeHeader.length - 8) >> 16) & 0xFF;
    imageFakeHeader[7] = ((imageFakeHeader.length - 8) >> 24) & 0xFF;
    imageFakeHeader[8] = "W".charCodeAt(0);
    imageFakeHeader[9] = "E".charCodeAt(0);
    imageFakeHeader[10] = "B".charCodeAt(0);
    imageFakeHeader[11] = "P".charCodeAt(0);
    
    var newImageBlob = new Blob([imageFakeHeader], {type: "image/webp"});
    frame.imageBlob = newImageBlob;
    
    return frame;
  }
}

function parseWEBP(webp, arrayBuffer) {
  var stream = new WebpStream(new Uint8Array(arrayBuffer));
  var parser = new WEBPParser();
  var fileSize;
  var maxChunkSize = 1024;
  var chunksRead = 0;
  var chunks = [];

  if (stream.readBytesToString(4) !== 'RIFF') throw errNotRIFF;

  fileSize = stream.readUint32Int();
  stream.setFileSize(fileSize + 8); // add 4 for untracked RIFF header and filesize

  if (stream.readBytesToString(4) !== 'WEBP') throw errNotWEBP;

  // Parse chunk header
  while(chunksRead++ < maxChunkSize && !stream.eof()) {
    let header = stream.readChunkHeader();
    let chunkData = stream.readBytes(header.chunkSize);
    if (CHUNK_DATA_DEBUG) console.log(header);
    switch(header.type){
      case 'VP8 ':
        throw errNotAWEBP;
      case 'VP8L':
        throw errNotAWEBP;
      case 'VP8X':
        if (CHUNK_DATA_DEBUG) console.log("VP8X");
        webp.vp8xSettings = parser.parseVP8XChunk(chunkData);
        if (!webp.vp8xSettings.animated) throw errNotAWEBP;
        if (CHUNK_DATA_DEBUG) chunks.push({
          header: header,
          data: chunkData
        });
        break;
      case 'ANIM':
        if (CHUNK_DATA_DEBUG) console.log("ANIM");
        webp.animationSettings = parser.parseANIMChunk(chunkData);
        if (CHUNK_DATA_DEBUG) console.log(webp.animationSettings);
        if (CHUNK_DATA_DEBUG) chunks.push({
          header: header,
          data: chunkData
        });
        break;
      case 'ANMF':
        if (CHUNK_DATA_DEBUG) console.log("ANMF");
        let frame = parser.parseANMFChunk(chunkData, (webp.vp8xSettings ? webp.vp8xSettings.alpha : false));
        if (CHUNK_DATA_DEBUG) console.log(frame);
        webp.frames.push(frame);
        if (CHUNK_DATA_DEBUG) chunks.push({
          header: header,
          data: chunkData
        });
        break;
      case 'ALPH':
        if (CHUNK_DATA_DEBUG) console.log("ALPH");
        if (CHUNK_DATA_DEBUG) chunks.push({
          header: header,
          data: chunkData
        });
        break;
      case 'ICCP':
        if (CHUNK_DATA_DEBUG) console.log("ICCP");
        if (CHUNK_DATA_DEBUG) chunks.push({
          header: header,
          data: chunkData
        });
        break;
      case 'EXIF':
        if (CHUNK_DATA_DEBUG) console.log("EXIF");
        if (CHUNK_DATA_DEBUG) chunks.push({
          header: header,
          data: chunkData
        });
        break;
      case 'XMP ':
        if (CHUNK_DATA_DEBUG) console.log("XMP");
        if (CHUNK_DATA_DEBUG) chunks.push({
          header: header,
          data: chunkData
        });
        break;
      default:
        // ignore unknown chunk?
        if (CHUNK_DATA_DEBUG) console.log("Unknown Chunk", header.type);
        if (CHUNK_DATA_DEBUG) chunks.push({
          header: header,
          data: chunkData
        });
        break;
    }
  }
  if (CHUNK_DATA_DEBUG) console.log(chunks);
  
}

class WEBP {
  vp8xSettings;
  animationSettings;
  animationBackgroundColor;
  frames = [];
  
  constructor(byteArray) {
    parseWEBP(this, byteArray);
    this.animationBackgroundColor = "rgba(" + this.animationSettings.backgroundColor.join(", ") + ")";
  }
}

function processWEBP(rawData, imageElement, placeholder) {
  try {
    var keyLength = Object.keys(rawData);
    var newArray = new Uint8Array(keyLength.length);
    for (let i = 0; i < keyLength.length; ++i) {
      newArray[i] = rawData[i];
    }
    var arrayBuffer = newArray.buffer;
    
    var webp = new WEBP(arrayBuffer);
    
    var canvas = document.createElement('canvas');
    canvas.width = webp.vp8xSettings.canvasWidth;
    canvas.height = webp.vp8xSettings.canvasHeight;
    var ctx = canvas.getContext('2d', {willReadFrequently: true});
    
    let player = new WebpPlayer(webp, ctx);
    player.init();
    
    canvas.player = player;
    
    let imageContainer = document.createElement('div');
    imageContainer.className = "webp_player_container";
    imageContainer.style.width = canvas.width + "px";
    imageContainer.style.height = canvas.height + "px";
    let imageOverlay = document.createElement('div');
    imageOverlay.className = "webp_player_overlay paused";
    imageOverlay.style.width = canvas.width + "px";
    imageOverlay.style.height = canvas.height + "px";
    imageOverlay.style.lineHeight = canvas.height + "px";
    imageOverlay.style.fontSize = Math.round(canvas.height * 0.65) + "px";
    imageOverlay.innerHTML = "►";
    
    /*
    canvas.style.width = compStyle.getPropertyValue('width');
    canvas.style.height = compStyle.getPropertyValue('height');
    */
    
    imageOverlay.onclick = (event) => {
      if (event.target.nextElementSibling.player.playing) {
        event.target.nextElementSibling.player.pause();
        event.target.classList.add("paused");
        event.target.classList.remove("playing");
        event.target.innerHTML = "►";
      } else {
        event.target.nextElementSibling.player.play();
        event.target.classList.add("playing");
        event.target.classList.remove("paused");
        event.target.innerHTML = "❚❚";
      }
    }
    
    imageContainer.appendChild(imageOverlay);
    imageContainer.appendChild(canvas);

    placeholder.replaceWith(imageContainer);
    imageElement.parentElement.removeChild(imageElement);
  } catch (err) {
    console.log("WEBP processing error:", err);
    if (err.message == ERR_NAAW) {
      placeholder.parentElement.removeChild(placeholder);
      imageElement.classList.remove('psvb_invisible');
    }
  }
}