// Variables

var canvas = document.getElementById('test');
var context = canvas.getContext('2d');
var scaleFactor = 2;
var notes = [];

var staveHeight = 100;
var staveOffset = 60;                   
var bpm = 60;
var bpb = 4;
// Time in seconds to traverse a bar -- should equal 3.
var barTraverseTime = 60000/(bpm/bpb);
var sixteenthTraverseTime = barTraverseTime/16;
var noteStartBar = 0;
var noteStartNotePosition = 0;
var currentBar = 0;
var currentNote = 0;
var startTime;
var noteRecording = false;
// Has the recording finished?   
var ended = true;

// Hard code the bar size to 200.
var barSize = 400;
var pixelsPerMillisecond = (barSize/barTraverseTime)*scaleFactor;

var barsDisplayed = ((canvas.width/scaleFactor)/barSize);
var topOfStave = ((canvas.height-(staveHeight*scaleFactor)/2));
var leftOfStave = staveOffset*scaleFactor;

var barsSeenOnScreen = 1;

var inProgressNoteColour = '#dddddd';
var finishedNoteColour = '#8ED6FF';


// Functions


window.requestAnimFrame = (function(callback) {
  return window.requestAnimationFrame || window.webkitRequestAnimationFrame || window.mozRequestAnimationFrame || window.oRequestAnimationFrame || window.msRequestAnimationFrame ||
  function(callback) {
    window.setTimeout(callback, 1000 / 60);
  };
})();

function backingScale(context) {
  if ('devicePixelRatio' in window) {
    if (window.devicePixelRatio > 1) {
      return window.devicePixelRatio;
    }
  }
  return 1;
}

function drawBars(drawOffset) {
  // draw the vertial bar lines
  for (var i = currentBar + 2; i >= 0; i--) {
    drawBarLine(context, [staveOffset,topOfStave], i, drawOffset);
  }
}

//
function drawBarLine(context, start, barNumber, drawOffset) {
  barsDisplayed = barsDisplayed;
  // var barPosition = ((start[0]*scaleFactor)+(((canvasWidth-start[0])/barsDisplayed)*barNumber));
  var barPosition = (barSize*barNumber*scaleFactor) + leftOfStave;
  console.log("w: "+ canvas.width + " ls: " + leftOfStave + " bd: " + barsDisplayed + " barNumber: " + barNumber);
  console.log("drawing bar " + barNumber + "  at " + start[0] + "," + start[1] + " bar pos: " + barPosition);
  context.beginPath();
  context.moveTo(barPosition - drawOffset, topOfStave);
  context.lineTo(barPosition - drawOffset, topOfStave+(staveHeight*scaleFactor));
  context.lineWidth = 1*scaleFactor;
  context.stroke();
}

// Draw pos is left offset
function drawStave(context) {
  // Draw the horizontal stave lines
  for (var i = 0; i <= 4; i++) {
    drawStaveLine(context, [leftOfStave, topOfStave+(((staveHeight/4)*i)*scaleFactor)], scaleFactor);
  };
}

/**
  The start is an array.
*/
function drawStaveLine(context, start) {
  context.beginPath();
  context.moveTo(start[0], start[1]);
  context.lineTo(canvas.width, start[1]);
  context.lineWidth = scaleFactor;
  context.stroke();
}

function startRecording() {
  ended = false;
  currentBar = 0;
  currentNote = 0;
  notes = [];
  startTime = (new Date()).getTime();
  animate(canvas, context, startTime, scaleFactor, staveHeight, staveOffset);
  console.log("Start Time: " + startTime);
}

function endRecording() {
  ended = true;
}

function startNote() {
  var note = [3, 4, false];
  if (!noteRecording) {
    notes[currentNote] = [note, Math.round(((new Date()).getTime()-startTime)/sixteenthTraverseTime), null];
    noteRecording = true;
    console.log("Started Note " + currentNote + " at " + notes[currentNote][1]);
  }
}

// Takes an array of representation of note letter(represented as a number), octave, and sharp boolean.
function calculateNoteYPos(note) {
  // The minus 5 then makes e the reference note.
  var notePos = ((staveHeight*scaleFactor)/8)*((note[0]-5)-(note[1]-4));
  // This makes the 4th Ocatave the reference octave.
  var octavePos = (staveHeight*scaleFactor)*(note[1]-4);
  // This means that everything is relative to E4
  return topOfStave + ((notePos + octavePos)*-1);
}

function endNote(note) {
  if (noteRecording) {
    notes[currentNote][0] = note;
    notes[currentNote][2] = Math.round(((new Date()).getTime()-startTime)/sixteenthTraverseTime);
    currentNote++;
    noteRecording = false;
    console.log("Ended Note " + currentNote + " at " + notes[currentNote][2]);
  }
}

function drawNotes(drawOffset) {
  var noteWidth;
  var yPos;
  var noteHeight;
  var noteColour;
  for (var i = notes.length - 1; i >= 0; i--) {
    if (notes[i][2] === null) {
      noteWidth = (Math.round(((new Date()).getTime()-startTime)/sixteenthTraverseTime) - notes[i][1]) * sixteenthTraverseTime * pixelsPerMillisecond;
      yPos = topOfStave;
      noteHeight = staveHeight * scaleFactor;
      context.globalAlpha=0.5;
      noteColour = inProgressNoteColour;
    }
    else {
      noteWidth = ((notes[i][2] - notes[i][1]) * sixteenthTraverseTime * pixelsPerMillisecond);
      yPos = calculateNoteYPos(notes[i][0]);
      noteHeight = ((staveHeight*scaleFactor)/4);
      noteColour = finishedNoteColour;
      context.globalAlpha = 0.8;
    }
    console.log("drawing Note("+notes[i][2] + ", " + notes[i][1] +") at " + (pixelsPerMillisecond*(notes[i][1] - startTime)) + ", " + noteWidth);
    context.beginPath();
    context.rect(((staveOffset * scaleFactor +(pixelsPerMillisecond*(notes[i][1]*sixteenthTraverseTime)))-(drawOffset)), (yPos+(noteHeight*0.125)), noteWidth, (noteHeight*0.75));
    context.fillStyle = noteColour;
    context.fill();
    context.lineWidth = 2;
    context.strokeStyle = 'black';
    context.stroke();
    context.globalAlpha=1;
    
  };
}

function animate(canvas, context, startTime) {


  var currentTime = (new Date()).getTime();

  if (currentTime > startTime + ((currentBar+1)*barTraverseTime)) {
    currentBar++;
    console.log("Current bar: " + currentBar + "@ " + currentTime);
  }

  // update
  var time = currentTime - startTime;

  var moveBy = time * pixelsPerMillisecond;
  
  if (!ended) {

    var maxOffset = (((canvas.width - staveOffset)/barsDisplayed)/scaleFactor)*barsSeenOnScreen;
    var cursorOffset = moveBy;
    var drawOffset = 0;


    if (moveBy >= maxOffset) {
      cursorOffset = maxOffset;
      drawOffset = moveBy - maxOffset;
    }

    // clear
    context.clearRect(0, 0, canvas.width, canvas.height);

    console.log(moveBy);

    // draw Stave
    drawStave(context);

    // draw bars
    drawBars(drawOffset);

    // draw cursor

    context.beginPath();
    context.moveTo(Math.round(staveOffset * scaleFactor + cursorOffset), ((canvas.height-(staveHeight*scaleFactor))/2));
    context.lineTo(Math.round(staveOffset * scaleFactor + cursorOffset), ((canvas.height-(staveHeight*scaleFactor))/2)+((staveHeight)*scaleFactor));
    context.lineWidth = 1*scaleFactor;
    context.stroke();

    // draw notes.

    drawNotes(drawOffset);

    // request new frame
    requestAnimFrame(function() {
      animate( canvas, context, startTime);
    });
  }
  else {
    console.log('ended');
  }
}


// HERE BE STUFF HAPPENING.

if (scaleFactor > 1) {
    canvas.width = canvas.width * scaleFactor;
    canvas.height = canvas.height * scaleFactor;
    // update the context for the new canvas scale
    var context = canvas.getContext("2d");
}
else {
  scaleFactor = 1;
}

console.log(scaleFactor);

drawStave(context, canvas.width, canvas.height, staveOffset, staveHeight, scaleFactor);
drawBars(0);
