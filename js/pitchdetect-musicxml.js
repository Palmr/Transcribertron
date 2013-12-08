var audioContext = new AudioContext();
var sourceNode = null;
var analyser = null;
var theBuffer = null;
var timer = null;
var metronome = null;

var metronomeCount = 0;
var metronomeBeatCount = 0;
var metronomeNoteValue = 16; // It's at a 16th note granularity

var tempo = 60; // 60 bpm
var beatsPerBar = 4; // 4 beats per bar
var noteValuePerBeat = 4; // 1/4 note per beat
var msPerBeat = (1000 * 60) / tempo;
var msPerWholeNote = (msPerBeat) * noteValuePerBeat;
var msPerHalfNote = (msPerBeat / 2) * noteValuePerBeat;
var msPerQuaterNote = (msPerBeat / 4) * noteValuePerBeat;
var msPerEighthNote = (msPerBeat / 8) * noteValuePerBeat;
var msPerSixteenthNote = (msPerBeat / 16) * noteValuePerBeat;


var mcAtNoteStart = 0;
var mcAtNoteEnd = 0;
var outputXml = "";
var measureCount = 1;
var pitchList;

var recordStream = null;

window.onload = function() {

  var request = new XMLHttpRequest();
  request.open("GET", "js/gun.wav", true);
  request.responseType = "arraybuffer";
  request.onload = function() {
    audioContext.decodeAudioData( request.response, function(buffer) { 
        theBuffer = buffer;
    } );
  }
  request.send();
}

function runToggle() {
	var btn = document.getElementById("runtoggle");
	if (btn.value == "Start") {
		btn.value = "Stop";
		
		getUserMedia({audio:true}, gotStream);
	}
	else if (btn.value == "Stop") {
		btn.value = "Start";
		
    stopRecPitch();
		clearInterval(metronome);
		if (recordStream) {
			recordStream.stop();
		}
		
		exportMusicXML();
	}
}

function error(e) {
  alert('Stream generation failed: ' + e);
	console.log(e);
}

function getUserMedia(dictionary, callback) {
	try {
		navigator.getUserMedia = 
			navigator.getUserMedia ||
			navigator.webkitGetUserMedia ||
			navigator.mozGetUserMedia;
		navigator.getUserMedia(dictionary, callback, error);
	}
	catch (e) {
		alert('getUserMedia threw exception :' + e);
	}
}

function gotStream(stream) {
	recordStream = stream;

	// Create an AudioNode from the stream.
	var mediaStreamSource = audioContext.createMediaStreamSource(stream);

	// Connect it to the destination.
	analyser = audioContext.createAnalyser();
	analyser.fftSize = 2048;
	mediaStreamSource.connect( analyser );

	// Start the analysis
	outputXml = startMusicXML();
	outputXml += startMeasure();
	start();
	startMetronome();
}

function startMetronome() {
  metronome = setInterval(tick, msPerSixteenthNote);
}

function tick() {
	// Display tick once per beat
  if(metronomeCount % (metronomeNoteValue / noteValuePerBeat) == 0){
		document.getElementById('metronome').innerText += ++metronomeBeatCount;
	}
	// Every half-beat put a separator, helps visualise underlying speed
  if((metronomeCount + (noteValuePerBeat/2)) % (metronomeNoteValue / noteValuePerBeat) == 0){
		document.getElementById('metronome').innerText += ', ';
	}

	// Once per bar reset the ticks and bar-break
  if(metronomeCount % metronomeNoteValue == 0) {
		document.getElementById('metronome').innerText = '1';
		metronomeBeatCount = 1;
    stopRecPitch();
    outputXml += stopMeasure();
    outputXml += startMeasure();
    start();
  }
  metronomeCount++;
}

function playSound() {
	var now = audioContext.currentTime;

	sourceNode = audioContext.createBufferSource();
	sourceNode.buffer = theBuffer;

	sourceNode.connect( analyser );
	analyser.connect( audioContext.destination );
	sourceNode.start( now );
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
  pitchList = new Array();
  mcAtNoteStart = metronomeCount;
  timer = setInterval(function() { updatePitch(null); }, 1);
  //setTimeout(function() { stopRecPitch(pitchList,timer); },1000/16);
}

function stopRecPitch() { 
  mcAtNoteEnd = metronomeCount;
  clearInterval(timer);
  var avg = getAvgPitch(pitchList);
	console.log(pitchList);
  if(avg > 1 && pitchList.length > 20) {
    //console.log(pitchList);
    console.log(pitchList.length + ' ' + noteStrings[noteFromPitch(avg)%12] + ' ' + avg);
    recordNote(avg);
  }
  //start();
}

function updatePitch( time) {
  var cycles = new Array;
  analyser.getByteTimeDomainData( buf );

  // possible other approach to confidence: sort the array, take the median; go through the array and compute the average deviation
  var ac = autoCorrelate( buf, audioContext.sampleRate );

  if (ac == -1) {
    stopRecPitch();
  }
	else {
    pitch = ac;
    pitchList.push(pitch);
  }
}

function getAvgPitch( pitches ) {
  var total = 0;
  var validPitchCount = 0;

  pitches = pitches.slice(Math.floor(pitches.length / 10), pitches.length - Math.floor(pitches.length / 20));

	// To test, a rounded mode
/*	roundedPitches = [];
	for(var i=0; i < pitches.length; i++) {
    if(pitches[i] < 2000) {
      roundedPitches.push(Math.floor(pitches[i]));
    }
  }
	
	function mode(array) {
    if(array.length == 0) {
    	return null;
		}

    var modeMap = {};
    var maxEl = array[0], maxCount = 1;
    for(var i = 0; i < array.length; i++) {
    	var el = array[i];
    	if(modeMap[el] == null) {
    		modeMap[el] = 1;
			}
    	else {
    		modeMap[el]++;
			}

    	if(modeMap[el] > maxCount) {
    		maxEl = el;
    		maxCount = modeMap[el];
    	}
    }

    return maxEl;
	};
	
	var pitchMode = mode(roundedPitches);
	console.log(pitchMode);
	return pitchMode;
*/
	
  for(var i=0; i < pitches.length; i++) {
    if(pitches[i]<2000) {
      total += pitches[i];
      validPitchCount++;
    }
  }

  var mean = total/validPitchCount;

  return mean;
}

var lastNoteEnd = null;

function recordNote(pitch) {
  if(mcAtNoteStart > lastNoteEnd + 1) {
    var duration = mcAtNoteStart - lastNoteEnd;
    if(duration == 0) {
			duration = 1;
		}

    var rest = {
      midiNote: null
    , duration: duration
    }

    serialiseMusicXML(rest);  
  }

  var duration = mcAtNoteEnd - mcAtNoteStart;
  if(duration == 0) duration = 1;

  var note = {
    midiNote: noteFromPitch(pitch)
  , duration: duration
  }

  serialiseMusicXML(note);

  lastNoteEnd = mcAtNoteEnd;

}

var typeStrings = ["16th", "eighth", "quarter", "half", "whole"];
function serialiseMusicXML(note) {
	var noteStr = "            <note>\r\n";

  var typeStringIndex = Math.log(note.duration) / Math.log(2);
  typeStringIndex = Math.floor((typeStringIndex * 1000000) / 1000000);

  typeStringIndex = Math.min(4, typeStringIndex);

	if (note.midiNote != null && noteStrings[note.midiNote % 12]) {
    if(noteStrings[note.midiNote % 12].indexOf('#') > -1) {
      noteStr += "        <accidental>sharp</accidental>\r\n";
		}
		noteStr += "        <pitch>\r\n";
		noteStr += "  	       <step>" + noteStrings[note.midiNote % 12].replace('#','') + "</step>\r\n";
		noteStr += "  	       <octave>" + (Math.floor(note.midiNote/12)-1) + "</octave>\r\n";
		noteStr += "        </pitch>\r\n";
		noteStr += "        <duration>" + note.duration + "</duration>\r\n";
		noteStr += "        <type>" + typeStrings[typeStringIndex] + "</type>\r\n";
	}
	else {
		noteStr += "        <rest/>\r\n";
		noteStr += "        <duration>" + note.duration + "</duration>\r\n";
		noteStr += "        <type>" + typeStrings[typeStringIndex] + "</type>\r\n";
	}
	noteStr += "      </note>\r\n";
	
  outputXml += noteStr;
}

function startMeasure(){
  var measureXML = "    <measure number=\"" + measureCount +"\">\r\n";
  measureXML += "      <attributes>\r\n";
  measureXML += "        <divisions>4</divisions>\r\n"; // 4/4 == 16ths
	if(measureCount == 1) {  
		measureXML += "        <key>\r\n";
		measureXML += "          <fifths>0</fifths>\r\n";
		measureXML += "        </key>\r\n";
		measureXML += "        <time>\r\n";
		measureXML += "          <beats>4</beats>\r\n";
		measureXML += "          <beat-type>4</beat-type>\r\n";
		measureXML += "        </time>\r\n";
    measureXML += "        <clef>\r\n";
    measureXML += "          <sign>G</sign>\r\n";
    measureXML += "          <line>2</line>\r\n";
    measureXML += "        </clef>\r\n";
  }
  measureXML += "      </attributes>\r\n";
  if(measureCount == 1) {
    measureXML += "      <direction directive=\"yes\" placement=\"above\">\r\n";
    measureXML += "        <direction-type>\r\n";
    measureXML += "          <words default-y=\"15\" font-size=\"10.5\" font-weight=\"bold\">60bpm</words>\r\n";
    measureXML += "        </direction-type>\r\n";
    measureXML += "        <sound tempo=\"60\"/>\r\n";
    measureXML += "      </direction>\r\n";
  }
	
	measureCount++;

  return measureXML;
}

function stopMeasure(){
  return "    </measure>\r\n";
}

function startMusicXML() {
  var startXML = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"no\"?>\r\n";
  startXML += "<!DOCTYPE score-partwise PUBLIC\r\n";
  startXML += "    \"-//Recordare//DTD MusicXML 3.0 Partwise//EN\"\r\n";
  startXML += "    \"http://www.musicxml.org/dtds/partwise.dtd\">\r\n";
  startXML += "<score-partwise version=\"3.0\">\r\n";
  startXML += "  <part-list>\r\n";
  startXML += "    <score-part id=\"P1\">\r\n";
  startXML += "      <part-name>Guitar</part-name>\r\n";
  startXML += "    </score-part>\r\n";
  startXML += "  </part-list>\r\n";
  startXML += "  <part id=\"P1\">\r\n";

  return startXML;
}

function endMusicXML() {
  return "  </part>\r\n</score-partwise>";
}

function exportMusicXML() {
  outputXml += stopMeasure();
  outputXml += endMusicXML();
  console.log(outputXml);

	var pom = document.createElement('a');
	pom.setAttribute('href', 'data:text/xml;charset=utf-8,' + encodeURIComponent(outputXml));
	pom.setAttribute('download', 'test.xml');
	pom.click();
}
