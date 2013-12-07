var audioContext = new AudioContext();
var isPlaying = false;
var sourceNode = null;
var analyser = null;
var theBuffer = null;
var detectorElem, 
  canvasElem,
  pitchElem,
  noteElem,
  detuneElem,
  detuneAmount;

window.onload = function() {
  detectorElem = document.getElementById( "detector" );
  canvasElem = document.getElementById( "output" );
  pitchElem = document.getElementById( "pitch" );
  noteElem = document.getElementById( "note" );
  detuneElem = document.getElementById( "detune" );
  detuneAmount = document.getElementById( "detune_amt" );

  getUserMedia({audio:true}, gotStream);
}

function error() {
    alert('Stream generation failed.');
}

function getUserMedia(dictionary, callback) {
    try {
        navigator.getUserMedia = 
          navigator.getUserMedia ||
          navigator.webkitGetUserMedia ||
          navigator.mozGetUserMedia;
        navigator.getUserMedia(dictionary, callback, error);
    } catch (e) {
        alert('getUserMedia threw exception :' + e);
    }
}

function gotStream(stream) {
    // Create an AudioNode from the stream.
    var mediaStreamSource = audioContext.createMediaStreamSource(stream);

    // Connect it to the destination.
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    mediaStreamSource.connect( analyser );
    setInterval(start,Math.ceil(1000/16))
}

var rafID = null;
var tracks = null;
var buflen = 2048;
var buf = new Uint8Array( buflen );
var MINVAL = 134;  // 128 == zero.  MINVAL is the "minimum detected signal" level.

function findNextPositiveZeroCrossing( start ) {
  var i = Math.ceil( start );
  var last_zero = -1;
  // advance until we're zero or negative
  while (i<buflen && (buf[i] > 128 ) )
    i++;
  if (i>=buflen)
    return -1;

  // advance until we're above MINVAL, keeping track of last zero.
  while (i<buflen && ((t=buf[i]) < MINVAL )) {
    if (t >= 128) {
      if (last_zero == -1)
        last_zero = i;
    } else
      last_zero = -1;
    i++;
  }

  // we may have jumped over MINVAL in one sample.
  if (last_zero == -1)
    last_zero = i;

  if (i==buflen)  // We didn't find any more positive zero crossings
    return -1;

  // The first sample might be a zero.  If so, return it.
  if (last_zero == 0)
    return 0;

  // Otherwise, the zero might be between two values, so we need to scale it.

  var t = ( 128 - buf[last_zero-1] ) / (buf[last_zero] - buf[last_zero-1]);
  return last_zero+t;
}

var noteStrings = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function noteFromPitch( frequency ) {
  var noteNum = 12 * (Math.log( frequency / 440 )/Math.log(2) );
  return Math.round( noteNum ) + 69;
}

function frequencyFromNoteNumber( note ) {
  return 440 * Math.pow(2,(note-69)/12);
}

function centsOffFromPitch( frequency, note ) {
  return Math.floor( 1200 * Math.log( frequency / frequencyFromNoteNumber( note ))/Math.log(2) );
}


function autoCorrelate( buf, sampleRate ) {
  var MIN_SAMPLES = 4;  // corresponds to an 11kHz signal
  var MAX_SAMPLES = 1000; // corresponds to a 44Hz signal
  var SIZE = 1000;
  var best_offset = -1;
  var best_correlation = 0;
  var rms = 0;

  if (buf.length < (SIZE + MAX_SAMPLES - MIN_SAMPLES))
    return -1;  // Not enough data

  for (var i=0;i<SIZE;i++) {
    var val = (buf[i] - 128)/128;
    rms += val*val;
  }
  rms = Math.sqrt(rms/SIZE);

  for (var offset = MIN_SAMPLES; offset <= MAX_SAMPLES; offset++) {
    var correlation = 0;

    for (var i=0; i<SIZE; i++) {
      correlation += Math.abs(((buf[i] - 128)/128)-((buf[i+offset] - 128)/128));
    }
    correlation = 1 - (correlation/SIZE);
    if (correlation > best_correlation) {
      best_correlation = correlation;
      best_offset = offset;
    }
  }
  if ((rms>0.01)&&(best_correlation > 0.01)) {
    return sampleRate/best_offset;
  }
  return -1;
}

function start() {
  var pitchList = new Array();
  var timer = setInterval(function() { updatePitch(null, pitchList); }, 1);
  setTimeout(function() { stopRecPitch(pitchList,timer); },1000/16);
}

function stopRecPitch(pitchList,timer) { 
  clearInterval(timer);
  var avg = getAvgPitch(pitchList);
  if(avg > 1 && pitchList.length > 2) {
    //console.log(pitchList.length + ' ' + noteStrings[noteFromPitch(avg)%12] + ' ' + avg);
    musicXML(avg);
  } else {
    musicXML(null);
  }

}

function updatePitch( time, pitchList ) {

  var cycles = new Array;
  analyser.getByteTimeDomainData( buf );

  // possible other approach to confidence: sort the array, take the median; go through the array and compute the average deviation
  var ac = autoCorrelate( buf, audioContext.sampleRate );

  if (ac == -1) {
  } else {
    pitch = ac;

    pitchList.push(pitch);

  }
}

function getAvgPitch( pitches ) {
  var total = 0;
  var validPitchCount = 0;
  var filteredPitches = new Array();

  for(var i=0; i<pitches.length; i++) {
    if(pitches[i]<2000) {
      total += pitches[i];
      validPitchCount++;
    }
  }

  var mean = total/validPitchCount;

  var sum = 0;
  for(var i=0; i<pitches.length; i++) {
    if(pitches[i]<2000)
      sum += Math.pow(pitches[i]-mean, 2);
  }

  return mean;

}

var lastNote = null;
function musicXML(pitch) {
	if (lastNote != null) {
		if (pitch > 1) {
			if (lastNote.midiNote == noteFromPitch(pitch)) {
				lastNote.duration++;
			}
			else {
				// End the note and start a new one
				serialiseMusicXML(lastNote);

				lastNote = {
					midiNote: noteFromPitch(pitch)
				, duration: 1
				};
			}
		}
		else {
			// rest
			if (lastNote.midiNote == null) {
				lastNote.duration++;
			}
			else {
				// End the note and start a new one
				serialiseMusicXML(lastNote);

				lastNote = {
					midiNote: null
				, duration: 1
				};
			}
		}
	}
	else {
		lastNote = {
			midiNote: noteFromPitch(pitch)
		, duration: 1
		};
	}
}

var typeStrings = ["16th", "eighth", "quarter", "half", "whole"];
function serialiseMusicXML(note) {
	var noteStr = "<note>\r\n";

  var typeStringIndex = Math.log(note.duration) / Math.log(2);
  typeStringIndex = Math.floor(((Math.round(typeStringIndex*1000000))/1000000));

  typeStringIndex = Math.min(4,typeStringIndex);

  console.log('index' + typeStringIndex);

	if (note.midiNote != null && noteStrings[note.midiNote % 12]) {
    if(noteStrings[note.midiNote % 12].indexOf('#') > -1)
      noteStr += "  <accidental>sharp</accidental>\r\n";
		noteStr += "  <pitch>\r\n";
		noteStr += "  	 <step>" + noteStrings[note.midiNote % 12].replace('#','') + "</step>\r\n";
		noteStr += "  	 <octave>" + (Math.floor(note.midiNote/12)-1) + "</octave>\r\n";
		noteStr += "  </pitch>\r\n";
		noteStr += "  <duration>" + note.duration + "</duration>\r\n";
		noteStr += "  <type>" + typeStrings[typeStringIndex] + "</type>\r\n";
	}
	else {
		noteStr += "  <rest/>\r\n";
		noteStr += "  <duration>" + note.duration + "</duration>\r\n";
		noteStr += "  <type>" + typeStrings[typeStringIndex] + "</type>\r\n";
	}
	noteStr += "</note>\r\n";
	
	console.log(noteStr);
  document.write(noteStr);
}
