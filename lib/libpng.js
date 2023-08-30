var player = null;
var playbackRate = 1.0;

var errNotPNG = new Error('Not a PNG');
var errNotAPNG = new Error('Not an animated PNG');

// '\x89PNG\x0d\x0a\x1a\x0a'
var PNGSignature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function isNotPNG(err) {
    return err === errNotPNG;
}

function isNotAPNG(err) {
    return err === errNotAPNG;
}

/**
 * @param {Uint8Array} bytes
 * @param {function(string, Uint8Array, int, int): boolean} callback
 */
function eachChunk(bytes, callback) {
  var dv = new DataView(bytes.buffer);
  var off = 8,
    type = void 0,
    length = void 0,
    res = void 0;
  do {
    length = dv.getUint32(off);
    type = readString(bytes, off + 4, 4);
    res = callback(type, bytes, off, length);
    off += 12 + length;
  } while (res !== false && type != 'IEND' && off < bytes.length);
}

/**
 *
 * @param {Uint8Array} bytes
 * @param {number} off
 * @param {number} length
 * @return {string}
 */
function readString(bytes, off, length) {
  var chars = Array.prototype.slice.call(bytes.subarray(off, off + length));
  return String.fromCharCode.apply(String, chars);
}

/**
 *
 * @param {string} x
 * @return {Uint8Array}
 */
function makeStringArray(x) {
  var res = new Uint8Array(x.length);
  for (var i = 0; i < x.length; i++) {
    res[i] = x.charCodeAt(i);
  }
  return res;
}

/**
 * @param {Uint8Array} bytes
 * @param {int} start
 * @param {int} length
 * @return {Uint8Array}
 */
function subBuffer(bytes, start, length) {
  var a = new Uint8Array(length);
  a.set(bytes.subarray(start, start + length));
  return a;
}

/**
 * @param {string} type
 * @param {Uint8Array} dataBytes
 * @return {Uint8Array}
 */
var makeChunkBytes = function makeChunkBytes(type, dataBytes) {
  var crcLen = type.length + dataBytes.length;
  var bytes = new Uint8Array(crcLen + 8);
  var dv = new DataView(bytes.buffer);

  dv.setUint32(0, dataBytes.length);
  bytes.set(makeStringArray(type), 4);
  bytes.set(dataBytes, 8);
  var crc = _crc2(bytes, 4, crcLen);
  dv.setUint32(crcLen + 4, crc);
  return bytes;
};

var makeDWordArray = function makeDWordArray(x) {
  return new Uint8Array([x >>> 24 & 0xff, x >>> 16 & 0xff, x >>> 8 & 0xff, x & 0xff]);
};

var table = new Uint32Array(256);

for (var i = 0; i < 256; i++) {
  var c = i;
  for (var k = 0; k < 8; k++) {
    c = (c & 1) !== 0 ? 0xEDB88320 ^ c >>> 1 : c >>> 1;
  }
  table[i] = c;
}

function _crc2(bytes) {
  var start = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;
  var length = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : bytes.length - start;

  var crc = -1;
  for (var _i = start, l = start + length; _i < l; _i++) {
    crc = crc >>> 8 ^ table[(crc ^ bytes[_i]) & 0xFF];
  }
  return crc ^ -1;
};

class Player {
  _apng;
  context;
  autoPlay;
  constructor(apng, context, autoPlay) {
    this._apng = apng;
    this.context = context;
    this.autoPlay = autoPlay;
    
    this.playbackRate = 1.0;
    this._currentFrameNumber = 0;
    this._ended = false;
    this._paused = true;
    this._numPlays = 0;

    this.stop();
    if (autoPlay) {
        this.play();
    }
    return this;
  }
  
  play() {
    var _this2 = this;

    // this.emit('play');

    if (this._ended) {
      this.stop();
    }
    this._paused = false;

    var nextRenderTime = performance.now() + this.currentFrame().delay / this.playbackRate;
    var tick = function tick(now) {
      if (_this2._ended || _this2._paused) {
          return;
      }
      if (now >= nextRenderTime) {
        while (now - nextRenderTime >= _this2._apng.playTime / _this2.playbackRate) {
          nextRenderTime += _this2._apng.playTime / _this2.playbackRate;
          _this2._numPlays++;
        }
        do {
          _this2.renderNextFrame();
          nextRenderTime += _this2.currentFrame().delay / _this2.playbackRate;
        } while (!_this2._ended && now > nextRenderTime);
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  
  renderNextFrame() {
    this._currentFrameNumber = (this._currentFrameNumber + 1) % this._apng.frames.length;
    if (this._currentFrameNumber === this._apng.frames.length - 1) {
      this._numPlays++;
      if (this._apng.numPlays !== 0 && this._numPlays >= this._apng.numPlays) {
        this._ended = true;
        this._paused = true;
      }
    }

    if (this._prevFrame && this._prevFrame.disposeOp == 1) {
      this.context.clearRect(this._prevFrame.left, this._prevFrame.top, this._prevFrame.width, this._prevFrame.height);
    } else if (this._prevFrame && this._prevFrame.disposeOp == 2) {
      this.context.putImageData(this._prevFrameData, this._prevFrame.left, this._prevFrame.top);
    }

    var frame = this.currentFrame();
    this._prevFrame = frame;
    this._prevFrameData = null;
    if (frame.disposeOp == 2) {
      this._prevFrameData = this.context.getImageData(frame.left, frame.top, frame.width, frame.height);
    }
    if (frame.blendOp == 0) {
      this.context.clearRect(frame.left, frame.top, frame.width, frame.height);
    }
    this.context.drawImage(frame.imageElement, frame.left, frame.top);

    // this.emit('frame', this._currentFrameNumber);
    if (this._ended) {
      // this.emit('end');
    }
  }
  
  pause() {
    if (!this._paused) {
      // this.emit('pause');
      this._paused = true;
    }
  }
  
  stop() {
    // this.emit('stop');
    this._numPlays = 0;
    this._ended = false;
    this._paused = true;
    // render first frame
    this._currentFrameNumber = -1;
    this.context.clearRect(0, 0, this._apng.width, this._apng.height);
    this.renderNextFrame();
  }
  
  currentFrameNumber() {
    return this._currentFrameNumber;
  }
  
  currentFrame() {
    return this._apng.frames[this._currentFrameNumber];
  }
  
  paused() {
    return this._paused;
  }
  
  ended() {
    return this._ended;
  }
}

class APNG {
  width;
  height;
  numPlays;
  playTime;
  frames;
  
  constructor(width = 0, height = 0, numPlays = 0, playTime = 0, frames = []) {
    this.width = width;
    this.height = height;
    this.numPlays = numPlays;
    this.playTime = playTime;
    this.frames = frames;
  }
  
  createImages() {
    return Promise.all(this.frames.map(function (f) {
      return f.createImage();
    }));
  }
  
  getPlayer(context) {
    var _this = this;

    var autoPlay = false;

    return this.createImages().then(function () {
        return new Player(_this, context, autoPlay);
    });
  }
}

class Frame {
  left = 0;
  top = 0;
  width = 0;
  height = 0;
  delay = 0;
  disposeOp = 0;
  blendOp = 0;
  imageData = null;
  imageElement = null;
  
  constructor(left = 0, top = 0, width = 0, height = 0, delay = 0, disposeOp = 0, blendOp = 0, imageData = null, imageElement = null) {
    this.left = left;
    this.top = top;
    this.width = width;
    this.height = height;
    this.delay = delay;
    this.disposeOp = disposeOp;
    this.blendOp = blendOp;
    this.imageData = null;
    this.imageElement = null;
  }
  
  createImage() {
    var _this2 = this;

    if (this.imageElement) {
      return Promise.resolve();
    }
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(_this2.imageData);
      _this2.imageElement = document.createElement('img');
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

function overlayPlay(event) {
  event.target.nextElementSibling.player.play();
  event.target.classList.add("playing");
  event.target.classList.remove("paused");
  event.target.innerHTML = "❚❚";
  event.target.onclick = overlayPause;
}

function overlayPause(event) {
  event.target.nextElementSibling.player.pause();
  event.target.classList.add("paused");
  event.target.classList.remove("playing");
  event.target.innerHTML = "►";
  event.target.onclick = overlayPlay;
}

function overlayHide(event) {
  
}

function processPNG(rawData, targetElement, placeholder) {
  try {
    var keyLength = Object.keys(rawData);
    var newArray = new Uint8Array(keyLength.length);
    for (let i = 0; i < keyLength.length; ++i) {
      newArray[i] = rawData[i];
    }
    var arrayBuffer = newArray.buffer;
    
    var apng = parseAPNG(arrayBuffer);
    if(apng instanceof Error) {
      throw apng;
      // console.log(apng);
      // return;
    }
    apng.createImages().then(function () {
      
      var imageContainer = document.createElement('div');
      imageContainer.className = "png_player_container";

      var canvas = document.createElement('canvas');
      canvas.width = apng.width;
      canvas.height = apng.height;
      
      var imageOverlay = document.createElement('div');
      imageOverlay.classList.add("png_player_overlay");
      imageOverlay.classList.add("paused");
      imageOverlay.width = apng.width;
      imageOverlay.height = apng.height;
      imageOverlay.style.lineHeight = apng.height + "px";
      imageOverlay.style.fontSize = Math.round(apng.height * 0.65) + "px";
      imageOverlay.innerHTML = "►";
      
      imageContainer.appendChild(imageOverlay);
      imageContainer.appendChild(canvas);

      apng.getPlayer(canvas.getContext('2d')).then(function (p) {
        player = p;
        player.playbackRate = playbackRate;
        imageOverlay.onclick = overlayPlay;
        canvas.player = player;
        targetElement.replaceWith(imageContainer);
        //player.play();
      });
    });
  } catch(err) {
    console.log(err);
    // Revert to original picture
    switch (err.message) {
      case "Not an animated PNG":
        // Not animated. Revert to raw file.
        placeholder.parentElement.removeChild(placeholder);
        targetElement.classList.remove('psvb_invisible');
        break;
      default:
        // Do nothing. Better to leave placeholder up than
        // erroniously revert a potentially animated file.
    }
  }
}

function parseAPNG(buffer) {
  // var bytes = buffer;
  var bytes = new Uint8Array(buffer);

  if (Array.prototype.some.call(PNGSignature, function (b, i) {
    return b !== bytes[i];
  })) {
    return errNotPNG;
  }

  // fast animation test
  var isAnimated = false;
  eachChunk(bytes, function (type) {
    return !(isAnimated = type === 'acTL');
  });
  if (!isAnimated) {
    return errNotAPNG;
  }

  var preDataParts = [],
    postDataParts = [];
  var headerDataBytes = null,
    frame = null,
    frameNumber = 0,
    apng = new APNG();

  eachChunk(bytes, function (type, bytes, off, length) {
    var dv = new DataView(bytes.buffer);
    switch (type) {
      case 'IHDR':
        headerDataBytes = bytes.subarray(off + 8, off + 8 + length);
        apng.width = dv.getUint32(off + 8);
        apng.height = dv.getUint32(off + 12);
        break;
      case 'acTL':
        apng.numPlays = dv.getUint32(off + 8 + 4);
        break;
      case 'fcTL':
        if (frame) {
          apng.frames.push(frame);
          frameNumber++;
        }
        frame = new Frame();
        frame.width = dv.getUint32(off + 8 + 4);
        frame.height = dv.getUint32(off + 8 + 8);
        frame.left = dv.getUint32(off + 8 + 12);
        frame.top = dv.getUint32(off + 8 + 16);
        var delayN = dv.getUint16(off + 8 + 20);
        var delayD = dv.getUint16(off + 8 + 22);
        if (delayD === 0) {
          delayD = 100;
        }
        frame.delay = 1000 * delayN / delayD;
        // https://bugzilla.mozilla.org/show_bug.cgi?id=125137
        // https://bugzilla.mozilla.org/show_bug.cgi?id=139677
        // https://bugzilla.mozilla.org/show_bug.cgi?id=207059
        if (frame.delay <= 10) {
          frame.delay = 100;
        }
        apng.playTime += frame.delay;
        frame.disposeOp = dv.getUint8(off + 8 + 24);
        frame.blendOp = dv.getUint8(off + 8 + 25);
        frame.dataParts = [];
        if (frameNumber === 0 && frame.disposeOp === 2) {
          frame.disposeOp = 1;
        }
        break;
      case 'fdAT':
        if (frame) {
          frame.dataParts.push(bytes.subarray(off + 8 + 4, off + 8 + length));
        }
        break;
      case 'IDAT':
        if (frame) {
          frame.dataParts.push(bytes.subarray(off + 8, off + 8 + length));
        }
        break;
      case 'IEND':
        postDataParts.push(subBuffer(bytes, off, 12 + length));
        break;
      default:
        preDataParts.push(subBuffer(bytes, off, 12 + length));
    }
  });

  if (frame) {
    apng.frames.push(frame);
  }

  if (apng.frames.length == 0) {
    return errNotAPNG;
  }

  var preBlob = new Blob(preDataParts),
    postBlob = new Blob(postDataParts);

  apng.frames.forEach(function (frame) {
    var bb = [];
    bb.push(PNGSignature);
    headerDataBytes.set(makeDWordArray(frame.width), 0);
    headerDataBytes.set(makeDWordArray(frame.height), 4);
    bb.push(makeChunkBytes('IHDR', headerDataBytes));
    bb.push(preBlob);
    frame.dataParts.forEach(function (p) {
      return bb.push(makeChunkBytes('IDAT', p));
    });
    bb.push(postBlob);
    frame.imageData = new Blob(bb, { 'type': 'image/png' });
    delete frame.dataParts;
    bb = null;
  });

  return apng;
}
