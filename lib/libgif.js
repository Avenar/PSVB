var bitsToNum = function (ba) {
  return ba.reduce(function (s, n) {
    return s * 2 + n;
  }, 0);
};

var byteToBitArr = function (bite) {
  var a = [];
  for (var i = 7; i >= 0; i--) {
    a.push( !! (bite & (1 << i)));
  }
  return a;
};

var Stream = function (data) {
  this.data = data;
  this.len = this.data.length;
  this.pos = 0;

  this.readByte = function () {
    if (this.pos >= this.data.length) {
      throw new Error('Attempted to read past end of stream.');
    }
    if (data instanceof Uint8Array)
      return data[this.pos++];
    else
      return data.charCodeAt(this.pos++) & 0xFF;
  };

  this.readBytes = function (n) {
    var bytes = [];
    for (var i = 0; i < n; i++) {
      bytes.push(this.readByte());
    }
    return bytes;
  };

  this.read = function (n) {
    var s = '';
    for (var i = 0; i < n; i++) {
      s += String.fromCharCode(this.readByte());
    }
    return s;
  };

  this.readUnsigned = function () { // Little-endian.
    var a = this.readBytes(2);
    return (a[1] << 8) + a[0];
  };
};

function processGIF(rawData, imageElement, placeholder) {
  try {
    var keyLength = Object.keys(rawData);
    var newArray = new Uint8Array(keyLength.length);
    for (let i = 0; i < keyLength.length; ++i) {
      newArray[i] = rawData[i];
    }
    // var data = newArray.buffer;
    var data = newArray;
    var options = {
        //viewport position
        vp_l: 0,
        vp_t: 0,
        vp_w: null,
        vp_h: null,
        //canvas sizes
        c_w: null,
        c_h: null
    };
    
    var canvas = document.createElement('canvas');
    var tmpCanvas = document.createElement('canvas');
    
    var frame = null;
    var frames = [];
    var frameOffsets = [];
    
    var playing = false;
    
    var forward = true;
    
    var ctx = canvas.getContext('2d', {willReadFrequently: true});
    var tmpCtx = canvas.getContext('2d', {willReadFrequently: true});
    
    var disposalMethod = null;
    var disposalRestoreFromIdx = null;
    var lastDisposalMethod = null;
    
    var clear = function () {
      transparency = null;
      delay = null;
      lastDisposalMethod = disposalMethod;
      disposalMethod = null;
      frame = null;
    };
    
    var doHdr = function (_hdr) {
      hdr = _hdr;
      canvas.width = hdr.width;
      canvas.height = hdr.height;

      tmpCanvas.width = hdr.width;
      tmpCanvas.height = hdr.height;
      tmpCanvas.style.width = hdr.width + 'px';
      tmpCanvas.style.height = hdr.height + 'px';
      tmpCanvas.getContext('2d', {willReadFrequently: true}).setTransform(1, 0, 0, 1, 0, 0);
    };

    var doGCE = function (gce) {
      pushFrame();
      clear();
      transparency = gce.transparencyGiven ? gce.transparencyIndex : null;
      delay = gce.delayTime;
      disposalMethod = gce.disposalMethod;
      // We don't have much to do with the rest of GCE.
    };

    var pushFrame = function () {
      if (!frame) return;
      frames.push({
          data: frame.getImageData(0, 0, hdr.width, hdr.height),
          delay: delay
        });
      frameOffsets.push({ x: 0, y: 0 });
    };
    
    var doImg = function (img) {
      if (!frame) frame = tmpCtx;

      var currIdx = frames.length;

      //ct = color table, gct = global color table
      var ct = img.lctFlag ? img.lct : hdr.gct; // TODO: What if neither exists?

      /*
      Disposal method indicates the way in which the graphic is to
      be treated after being displayed.

      Values :    0 - No disposal specified. The decoder is
                      not required to take any action.
                  1 - Do not dispose. The graphic is to be left
                      in place.
                  2 - Restore to background color. The area used by the
                      graphic must be restored to the background color.
                  3 - Restore to previous. The decoder is required to
                      restore the area overwritten by the graphic with
                      what was there prior to rendering the graphic.

                      Importantly, "previous" means the frame state
                      after the last disposal of method 0, 1, or 2.
      */
      if (currIdx > 0) {
        if (lastDisposalMethod === 3) {
          // Restore to previous
          // If we disposed every frame including first frame up to this point, then we have
          // no composited frame to restore to. In this case, restore to background instead.
          if (disposalRestoreFromIdx !== null) {
            frame.putImageData(frames[disposalRestoreFromIdx].data, 0, 0);
          } else {
            frame.clearRect(lastImg.leftPos, lastImg.topPos, lastImg.width, lastImg.height);
          }
        } else {
          disposalRestoreFromIdx = currIdx - 1;
        }

        if (lastDisposalMethod === 2) {
          // Restore to background color
          // Browser implementations historically restore to transparent; we do the same.
          // http://www.wizards-toolkit.org/discourse-server/viewtopic.php?f=1&t=21172#p86079
          frame.clearRect(lastImg.leftPos, lastImg.topPos, lastImg.width, lastImg.height);
        }
      }
      // else, Undefined/Do not dispose.
      // frame contains final pixel data from the last frame; do nothing

      //Get existing pixels for img region after applying disposal method
      var imgData = frame.getImageData(img.leftPos, img.topPos, img.width, img.height);

      //apply color table colors
      img.pixels.forEach(function (pixel, i) {
        // imgData.data === [R,G,B,A,R,G,B,A,...]
        if (pixel !== transparency) {
          imgData.data[i * 4 + 0] = ct[pixel][0];
          imgData.data[i * 4 + 1] = ct[pixel][1];
          imgData.data[i * 4 + 2] = ct[pixel][2];
          imgData.data[i * 4 + 3] = 255; // Opaque.
        }
      });

      frame.putImageData(imgData, img.leftPos, img.topPos);

      lastImg = img;
    };

    var doNothing = function () {};

    var stream = new Stream(data);
    var handler = {
      // canvas: this.canvas,
      // tmpCanvas: this.tmpCanvas,
      hdr: doHdr,
      gce: doGCE,
      com: doNothing,
      // I guess that's all for now.
      app: {
        // TODO: Is there much point in actually supporting iterations?
        NETSCAPE: doNothing
      },
      img: doImg,
      eof: function (block) {
        //toolbar.style.display = '';
        pushFrame();
        if ( ! (options.c_w && options.c_h) ) {
          canvas.width = hdr.width;
          canvas.height = hdr.height;
        }
        // TODO: return done
        // player.init();
        loading = false;
      }
    };
    parseGIF(stream, handler);
    var player = (function () {
      var i = -1;
      var iterationCount = 0;

      var showingInfo = false;
      var pinned = false;
      
      var loopDelay = 0;
      var overrideLoopMode = 'auto';

      /**
       * Gets the index of the frame "up next".
       * @returns {number}
       */
      var getNextFrameNo = function () {
        var delta = (forward ? 1 : -1);
        return (i + delta + frames.length) % frames.length;
      };

      var stepFrame = function (amount) { // XXX: Name is confusing.
        i = i + amount;

        putFrame();
      };

      var step = (function () {
        var stepping = false;

        var completeLoop = function () {
          // if (onEndListener !== null)
          //   onEndListener(gif);
          iterationCount++;

          if (overrideLoopMode !== false || iterationCount < 0) {
            doStep();
          } else {
            stepping = false;
            playing = false;
          }
        };

        var doStep = function () {
          stepping = playing;
          if (!stepping) return;

          stepFrame(1);
          var delay = frames[i].delay * 10;
          if (!delay) delay = 100; // FIXME: Should this even default at all? What should it be?

          var nextFrameNo = getNextFrameNo();
          if (nextFrameNo === 0) {
            delay += loopDelay;
            setTimeout(completeLoop, delay);
          } else {
            setTimeout(doStep, delay);
          }
        };

        return function () {
          if (!stepping) setTimeout(doStep, 0);
        };
      }());

      var putFrame = function () {
        var offset;
        i = parseInt(i, 10);

        if (i > frames.length - 1){
          i = 0;
        }

        if (i < 0){
          i = 0;
        }

        offset = frameOffsets[i];

        tmpCanvas.getContext("2d", {willReadFrequently: true}).putImageData(frames[i].data, offset.x, offset.y);
        ctx.globalCompositeOperation = "copy";
        ctx.drawImage(tmpCanvas, 0, 0);
      };

      var play = function () {
        playing = true;
        step();
      };

      var pause = function () {
        playing = false;
      };


      return {
        init: function () {
          if (options.auto_play) {
            step();
          }
          else {
            i = 0;
            putFrame();
          }
        },
        step: step,
        play: play,
        pause: pause,
        playing: playing,
        move_relative: stepFrame,
        current_frame: function() { return i; },
        length: function() { return frames.length },
        move_to: function ( frame_idx ) {
          i = frame_idx;
          putFrame();
        }
      }
    }());
    if(player.length() <= 1) {
      throw new Error("PSVB Info: gif is not animated. Skipping.");
    }
    player.init();
    var imageContainer = document.createElement('div');
    imageContainer.className = "jsgif";
    imageContainer.style.width = canvas.width + "px";
    imageContainer.style.height = canvas.height + "px";
    var controlElement = document.createElement("div");
    controlElement.innerHTML = "►";
    controlElement.style.width = canvas.width + "px";
    controlElement.style.height = canvas.height + "px";
    controlElement.style.lineHeight = canvas.height + "px";
    controlElement.style.fontSize = Math.round(canvas.height * 0.4) + "px";
    controlElement.className = "gifcontrol paused";
    controlElement.player = player;
    controlElement.addEventListener("click", function(){
      if(playing) {
        this.player.pause();
        playing = false;
        controlElement.innerHTML = "►";
        controlElement.classList.remove("playing");
        controlElement.classList.add("paused");
      } else {
        this.player.play();
        playing = true;
        controlElement.innerHTML = "❚❚";
        controlElement.classList.remove("paused");
        controlElement.classList.add("playing");
      }
    });
    
    imageContainer.appendChild(canvas);
    imageContainer.appendChild(controlElement);
    placeholder.replaceWith(imageContainer);
  } catch(err) {
    console.log(err);
    switch (err.message) {
      case "PSVB Info: gif is not animated. Skipping.":
        // Not animated. Revert to raw file.
        placeholder.nextSibling.classList.remove('psvb_invisible');
        placeholder.parentElement.removeChild(placeholder);
        break;
      default:
        // Do nothing. Better to leave placeholder up than
        // erroniously revert a potentially animated file.
    }
  }
}

var parseGIF = function (st, handler) {
  handler || (handler = {});

  // LZW (GIF-specific)
  var parseCT = function (entries) { // Each entry is 3 bytes, for RGB.
      var ct = [];
      for (var i = 0; i < entries; i++) {
          ct.push(st.readBytes(3));
      }
      return ct;
  };

  var readSubBlocks = function () {
      var size, data;
      data = '';
      do {
          size = st.readByte();
          data += st.read(size);
      } while (size !== 0);
      return data;
  };

  var parseHeader = function () {
      var hdr = {};
      hdr.sig = st.read(3);
      hdr.ver = st.read(3);
      if (hdr.sig !== 'GIF') throw new Error('Not a GIF file.'); // XXX: This should probably be handled more nicely.
      hdr.width = st.readUnsigned();
      hdr.height = st.readUnsigned();

      var bits = byteToBitArr(st.readByte());
      hdr.gctFlag = bits.shift();
      hdr.colorRes = bitsToNum(bits.splice(0, 3));
      hdr.sorted = bits.shift();
      hdr.gctSize = bitsToNum(bits.splice(0, 3));

      hdr.bgColor = st.readByte();
      hdr.pixelAspectRatio = st.readByte(); // if not 0, aspectRatio = (pixelAspectRatio + 15) / 64
      if (hdr.gctFlag) {
          hdr.gct = parseCT(1 << (hdr.gctSize + 1));
      }
      handler.hdr && handler.hdr(hdr);
  };

  var parseExt = function (block) {
      var parseGCExt = function (block) {
          var blockSize = st.readByte(); // Always 4
          var bits = byteToBitArr(st.readByte());
          block.reserved = bits.splice(0, 3); // Reserved; should be 000.
          block.disposalMethod = bitsToNum(bits.splice(0, 3));
          block.userInput = bits.shift();
          block.transparencyGiven = bits.shift();

          block.delayTime = st.readUnsigned();

          block.transparencyIndex = st.readByte();

          block.terminator = st.readByte();

          handler.gce && handler.gce(block);
      };

      var parseComExt = function (block) {
          block.comment = readSubBlocks();
          handler.com && handler.com(block);
      };

      var parsePTExt = function (block) {
          // No one *ever* uses this. If you use it, deal with parsing it yourself.
          var blockSize = st.readByte(); // Always 12
          block.ptHeader = st.readBytes(12);
          block.ptData = readSubBlocks();
          handler.pte && handler.pte(block);
      };

      var parseAppExt = function (block) {
          var parseNetscapeExt = function (block) {
              var blockSize = st.readByte(); // Always 3
              block.unknown = st.readByte(); // ??? Always 1? What is this?
              block.iterations = st.readUnsigned();
              block.terminator = st.readByte();
              handler.app && handler.app.NETSCAPE && handler.app.NETSCAPE(block);
          };

          var parseUnknownAppExt = function (block) {
              block.appData = readSubBlocks();
              // FIXME: This won't work if a handler wants to match on any identifier.
              handler.app && handler.app[block.identifier] && handler.app[block.identifier](block);
          };

          var blockSize = st.readByte(); // Always 11
          block.identifier = st.read(8);
          block.authCode = st.read(3);
          switch (block.identifier) {
              case 'NETSCAPE':
                  parseNetscapeExt(block);
                  break;
              default:
                  parseUnknownAppExt(block);
                  break;
          }
      };

      var parseUnknownExt = function (block) {
          block.data = readSubBlocks();
          handler.unknown && handler.unknown(block);
      };

      block.label = st.readByte();
      switch (block.label) {
          case 0xF9:
              block.extType = 'gce';
              parseGCExt(block);
              break;
          case 0xFE:
              block.extType = 'com';
              parseComExt(block);
              break;
          case 0x01:
              block.extType = 'pte';
              parsePTExt(block);
              break;
          case 0xFF:
              block.extType = 'app';
              parseAppExt(block);
              break;
          default:
              block.extType = 'unknown';
              parseUnknownExt(block);
              break;
      }
  };
  
  var lzwDecode = function (minCodeSize, data) {
    // TODO: Now that the GIF parser is a bit different, maybe this should get an array of bytes instead of a String?
    var pos = 0; // Maybe this streaming thing should be merged with the Stream?
    var readCode = function (size) {
      var code = 0;
      for (var i = 0; i < size; i++) {
        if (data.charCodeAt(pos >> 3) & (1 << (pos & 7))) {
          code |= 1 << i;
        }
        pos++;
      }
      return code;
    };

    var output = [];

    var clearCode = 1 << minCodeSize;
    var eoiCode = clearCode + 1;

    var codeSize = minCodeSize + 1;

    var dict = [];

    var clear = function () {
      dict = [];
      codeSize = minCodeSize + 1;
      for (var i = 0; i < clearCode; i++) {
        dict[i] = [i];
      }
      dict[clearCode] = [];
      dict[eoiCode] = null;
    };

    var code;
    var last;

    while (true) {
      last = code;
      code = readCode(codeSize);

      if (code === clearCode) {
        clear();
        continue;
      }
      if (code === eoiCode) break;

      if (code < dict.length) {
        if (last !== clearCode) {
          dict.push(dict[last].concat(dict[code][0]));
        }
      }
      else {
        if (code !== dict.length) throw new Error('Invalid LZW code.');
        dict.push(dict[last].concat(dict[last][0]));
      }
      output.push.apply(output, dict[code]);

      if (dict.length === (1 << codeSize) && codeSize < 12) {
        // If we're at the last code and codeSize is 12, the next code will be a clearCode, and it'll be 12 bits long.
        codeSize++;
      }
    }

    // I don't know if this is technically an error, but some GIFs do it.
    //if (Math.ceil(pos / 8) !== data.length) throw new Error('Extraneous LZW bytes.');
    return output;
  };

  var parseImg = function (img) {
      var deinterlace = function (pixels, width) {
          // Of course this defeats the purpose of interlacing. And it's *probably*
          // the least efficient way it's ever been implemented. But nevertheless...
          var newPixels = new Array(pixels.length);
          var rows = pixels.length / width;
          var cpRow = function (toRow, fromRow) {
              var fromPixels = pixels.slice(fromRow * width, (fromRow + 1) * width);
              newPixels.splice.apply(newPixels, [toRow * width, width].concat(fromPixels));
          };

          // See appendix E.
          var offsets = [0, 4, 2, 1];
          var steps = [8, 8, 4, 2];

          var fromRow = 0;
          for (var pass = 0; pass < 4; pass++) {
              for (var toRow = offsets[pass]; toRow < rows; toRow += steps[pass]) {
                  cpRow(toRow, fromRow)
                  fromRow++;
              }
          }

          return newPixels;
      };

      img.leftPos = st.readUnsigned();
      img.topPos = st.readUnsigned();
      img.width = st.readUnsigned();
      img.height = st.readUnsigned();

      var bits = byteToBitArr(st.readByte());
      img.lctFlag = bits.shift();
      img.interlaced = bits.shift();
      img.sorted = bits.shift();
      img.reserved = bits.splice(0, 2);
      img.lctSize = bitsToNum(bits.splice(0, 3));

      if (img.lctFlag) {
          img.lct = parseCT(1 << (img.lctSize + 1));
      }

      img.lzwMinCodeSize = st.readByte();

      var lzwData = readSubBlocks();

      img.pixels = lzwDecode(img.lzwMinCodeSize, lzwData);

      if (img.interlaced) { // Move
          img.pixels = deinterlace(img.pixels, img.width);
      }

      handler.img && handler.img(img);
  };

  var parseBlock = function () {
      var block = {};
      block.sentinel = st.readByte();

      switch (String.fromCharCode(block.sentinel)) { // For ease of matching
          case '!':
              block.type = 'ext';
              parseExt(block);
              break;
          case ',':
              block.type = 'img';
              parseImg(block);
              break;
          case ';':
              block.type = 'eof';
              handler.eof && handler.eof(block);
              break;
          default:
              throw new Error('Unknown block: 0x' + block.sentinel.toString(16)); // TODO: Pad this with a 0.
      }

      if (block.type !== 'eof') setTimeout(parseBlock, 0);
  };

  /*
  var parse = function () {
      parseHeader();
      setTimeout(parseBlock, 0);
  };

  parse();
  */
  parseHeader();
  var block = {};
  while(block.type !== 'eof') {
    block = {};
    block.sentinel = st.readByte();

    switch (String.fromCharCode(block.sentinel)) { // For ease of matching
        case '!':
            block.type = 'ext';
            parseExt(block);
            break;
        case ',':
            block.type = 'img';
            parseImg(block);
            break;
        case ';':
            block.type = 'eof';
            handler.eof && handler.eof(block);
            break;
        default:
            throw new Error('Unknown block: 0x' + block.sentinel.toString(16)); // TODO: Pad this with a 0.
    }
  }
};
