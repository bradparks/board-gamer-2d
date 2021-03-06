var mainDiv = document.getElementById("mainDiv");
var userName = null;

var facePathToUrlUrl = {
  //"face1.png": "", // loading...
  //"face2.png": 'url("face2.png")',
  //"face3.png#0,0,32,32": 'url("data://...")',
};

var gameDefinition;
var objectsById;
var objectsWithSnapZones; // cache
var changeHistory;
var futureChanges;
function initGame() {
  objectsById = {};
  objectsWithSnapZones = [];
  changeHistory = [];
  futureChanges = [];
  for (var id in gameDefinition.objects) {
    if (gameDefinition.objects[id].prototype) continue;
    var objectDefinition = getObjectDefinition(id);
    if (objectDefinition.faces != null) objectDefinition.faces.forEach(preloadImagePath);
    var object = {
      id: id,
      x: objectDefinition.x,
      y: objectDefinition.y,
      z: objectDefinition.z || 0,
      width: objectDefinition.width,
      height: objectDefinition.height,
      faces: objectDefinition.faces,
      snapZones: objectDefinition.snapZones || [],
      locked: !!objectDefinition.locked,
      faceIndex: 0,
    };
    objectsById[id] = object;
    if (object.snapZones.length > 0) objectsWithSnapZones.push(object);

    mainDiv.insertAdjacentHTML("beforeend",
      '<div id="object-'+id+'" data-id="'+id+'" class="gameObject" style="display:none;">' +
        '<div id="stackHeight-'+id+'" class="stackHeight" style="display:none;"></div>' +
      '</div>'
    );
    var objectDiv = getObjectDiv(object.id);
    objectDiv.addEventListener("mousedown", onObjectMouseDown);
    objectDiv.addEventListener("mousemove", onObjectMouseMove);
    objectDiv.addEventListener("mouseout", onObjectMouseOut);
  }
  // reassign all the z's to be unique
  var objects = getObjects();
  objects.sort(compareZ);
  objects.forEach(function(object, i) {
    object.z = i;
  });
  checkForDoneLoading();
}
function getObjectDefinition(id) {
  // resolve prototypes
  var result = {};
  recurse(id, 0);
  return result;

  function recurse(id, depth) {
    var definition = gameDefinition.objects[id];
    for (var property in definition) {
      if (property === "prototypes") continue; // special handling
      if (property === "prototype" && depth !== 0) continue;  // don't inherit this property
      if (property in result) continue; // shadowed
      var value = definition[property];
      if (property === "front") {
        if (result.faces == null) result.faces = [];
        result.faces[0] = value;
      } else if (property === "back") {
        if (result.faces == null) result.faces = [];
        result.faces[1] = value;
      } else {
        result[property] = value;
      }
    }
    if (definition.prototypes != null) {
      definition.prototypes.forEach(function(id) {
        recurse(id, depth + 1);
      });
    }
  }
}
function preloadImagePath(path) {
  var url = facePathToUrlUrl[path];
  if (url != null) return; // already loaded or loading
  facePathToUrlUrl[path] = ""; // loading...
  var img = new Image();
  var hashIndex = path.indexOf("#");
  if (hashIndex !== -1) {
    var cropInfo = path.substring(hashIndex + 1).split(",");
    if (cropInfo.length !== 4) throw new Error("malformed url: " + path);
    img.src = path.substring(0, hashIndex);
  } else {
    img.src = path;
  }
  img.addEventListener("load", function() {
    if (cropInfo != null) {
      var x = parseInt(cropInfo[0], 10);
      var y = parseInt(cropInfo[1], 10);
      var width = parseInt(cropInfo[2], 10);
      var height = parseInt(cropInfo[3], 10);
      var canvas = document.createElement('canvas');
      canvas.width  = width;
      canvas.height = height;
      var context = canvas.getContext("2d");
      context.drawImage(img, x, y, width, height, 0, 0, width, height);
      facePathToUrlUrl[path] = 'url("'+canvas.toDataURL()+'")';
    } else {
      facePathToUrlUrl[path] = 'url("'+path+'")';
    }
    checkForDoneLoading();
  });
}
function checkForDoneLoading() {
  for (var key in facePathToUrlUrl) {
    if (facePathToUrlUrl[key] === "") return; // not done yet
  }
  // all done loading
  getObjects().forEach(render);
  renderOrder();
}

function deleteEverything() {
  mainDiv.innerHTML = "";
  userName = null;
  gameDefinition = null;
  objectsById = null;
  selectedObjectIdToNewProps = {};
  // leave the image cache alone
}
function bringSelectionToTop() {
  // effectively do a stable sort.
  var selection = getEffectiveSelection();
  var z = findMaxZ(selection);
  var newPropses = [];
  for (var id in selection) {
    newPropses.push(selection[id]);
  }
  newPropses.sort(compareZ);
  newPropses.forEach(function(newProps, i) {
    newProps.z = z + i + 1;
  });
  renderAndMaybeCommitSelection(selection);
}
function findMaxZ(excludingSelection) {
  var z = null;
  getObjects().forEach(function(object) {
    if (excludingSelection != null && object.id in excludingSelection) return;
    if (z == null || object.z > z) z = object.z;
  });
  return z;
}

var DRAG_NONE = 0;
var DRAG_RECTANGLE_SELECT = 1;
var DRAG_MOVE_SELECTION = 2;
var draggingMode = DRAG_NONE;

var rectangleSelectStartX;
var rectangleSelectStartY;
var rectangleSelectEndX;
var rectangleSelectEndY;
var selectedObjectIdToNewProps = {};

var examiningObject = null;
var hoverObject;
var draggingMouseStartX;
var draggingMouseStartY;
function onObjectMouseDown(event) {
  if (event.button !== 0) return;
  if (examiningObject != null) return;
  var objectDiv = this;
  var object = objectsById[objectDiv.dataset.id];
  if (object.locked) return; // click thee behind me, satan
  event.preventDefault();
  event.stopPropagation();

  // select
  if (selectedObjectIdToNewProps[object.id] == null) {
    setSelectedObjects([object]);
  }

  // begin drag
  draggingMode = DRAG_MOVE_SELECTION;
  draggingMouseStartX = eventToMouseX(event, mainDiv);
  draggingMouseStartY = eventToMouseY(event, mainDiv);
  bringSelectionToTop();

  render(object);
  renderOrder();
}
function onObjectMouseMove(event) {
  if (draggingMode != DRAG_NONE) return;
  var objectDiv = this;
  var object = objectsById[objectDiv.dataset.id];
  if (object.locked) return;
  setHoverObject(object);
}
function onObjectMouseOut(event) {
  var objectDiv = this;
  var object = objectsById[objectDiv.dataset.id];
  if (hoverObject === object) {
    setHoverObject(null);
  }
}

mainDiv.addEventListener("mousedown", function(event) {
  if (event.button !== 0) return;
  // clicking the table
  event.preventDefault();
  if (examiningObject != null) return;
  draggingMode = DRAG_RECTANGLE_SELECT;
  rectangleSelectStartX = eventToMouseX(event, mainDiv);
  rectangleSelectStartY = eventToMouseY(event, mainDiv);
  setSelectedObjects([]);
});

document.addEventListener("mousemove", function(event) {
  var x = eventToMouseX(event, mainDiv);
  var y = eventToMouseY(event, mainDiv);
  if (draggingMode === DRAG_RECTANGLE_SELECT) {
    rectangleSelectEndX = x;
    rectangleSelectEndY = y;
    renderSelectionRectangle();
    (function() {
      var minX = (rectangleSelectStartX - gameDefinition.coordinates.originX) / gameDefinition.coordinates.unitWidth;
      var minY = (rectangleSelectStartY - gameDefinition.coordinates.originY) / gameDefinition.coordinates.unitHeight;
      var maxX = (rectangleSelectEndX   - gameDefinition.coordinates.originX) / gameDefinition.coordinates.unitWidth;
      var maxY = (rectangleSelectEndY   - gameDefinition.coordinates.originY) / gameDefinition.coordinates.unitHeight;
      if (minX > maxX) { var tmp = maxX; maxX = minX; minX = tmp; }
      if (minY > maxY) { var tmp = maxY; maxY = minY; minY = tmp; }
      var newSelectedObjects = [];
      getObjects().forEach(function(object) {
        if (object.locked) return;
        if (object.x > maxX) return;
        if (object.y > maxY) return;
        if (object.x + object.width  < minX) return;
        if (object.y + object.height < minY) return;
        newSelectedObjects.push(object);
      });
      setSelectedObjects(newSelectedObjects);
    })();
  } else if (draggingMode === DRAG_MOVE_SELECTION) {
    // pixels
    var dx = x - draggingMouseStartX;
    var dy = y - draggingMouseStartY;
    objectsWithSnapZones.sort(compareZ);
    Object.keys(selectedObjectIdToNewProps).forEach(function(id) {
      var object = objectsById[id];
      var newProps = selectedObjectIdToNewProps[id];
      // units
      var objectNewX = object.x + dx / gameDefinition.coordinates.unitWidth;
      var objectNewY = object.y + dy / gameDefinition.coordinates.unitHeight;
      // snap zones
      (function() {
        for (var i = objectsWithSnapZones.length - 1; i >= 0; i--) {
          var containerObject = objectsWithSnapZones[i];
          var containerRelativeX = objectNewX - containerObject.x;
          var containerRelativeY = objectNewY - containerObject.y;
          var containerObjectDefinition = getObjectDefinition(containerObject.id);
          for (var j = 0; j < containerObjectDefinition.snapZones.length; j++) {
            var snapZone = containerObjectDefinition.snapZones[j];
            var snapZoneRelativeX = containerRelativeX - snapZone.x;
            var snapZoneRelativeY = containerRelativeY - snapZone.y;
            if (snapZoneRelativeX < -1 || snapZoneRelativeX > snapZone.width)  continue; // way out of bounds
            if (snapZoneRelativeY < -1 || snapZoneRelativeY > snapZone.height) continue; // way out of bounds
            // this is the zone for us
            var roundedSnapZoneRelativeX = Math.round(snapZoneRelativeX);
            var roundedSnapZoneRelativeY = Math.round(snapZoneRelativeY);
            var inBoundsX = 0 <= roundedSnapZoneRelativeX && roundedSnapZoneRelativeX < snapZone.width;
            var inBoundsY = 0 <= roundedSnapZoneRelativeY && roundedSnapZoneRelativeY < snapZone.height;
            if (!inBoundsX && !inBoundsY) {
              // on an outside corner. we need to pick an edge to rub.
              if (Math.abs(roundedSnapZoneRelativeX - snapZoneRelativeX) > Math.abs(roundedSnapZoneRelativeY - snapZoneRelativeY)) {
                // x is further off
                inBoundsX = true;
              } else {
                // y is further off
                inBoundsY = true;
              }
            }
            if (inBoundsY) {
              objectNewX = roundedSnapZoneRelativeX + snapZone.x + containerObject.x;
            }
            if (inBoundsX) {
              objectNewY = roundedSnapZoneRelativeY + snapZone.y + containerObject.y;
            }
            return;
          }
        }
      })();
      if (!(newProps.x === objectNewX &&
            newProps.y === objectNewY)) {
        newProps.x = objectNewX;
        newProps.y = objectNewY;
        render(object);
      }
    });
    renderOrder();
  }
});
document.addEventListener("mouseup", function(event) {
  if (draggingMode === DRAG_RECTANGLE_SELECT) {
    draggingMode = DRAG_NONE;
    renderSelectionRectangle();
  } else if (draggingMode === DRAG_MOVE_SELECTION) {
    draggingMode = DRAG_NONE;
    commitSelection(selectedObjectIdToNewProps);
  }
});

function setHoverObject(object) {
  if (hoverObject == object) return;
  if (examiningObject != null) return;
  if (hoverObject != null) {
    getObjectDiv(hoverObject.id).classList.remove("hoverSelect");
  }
  hoverObject = object;
  if (hoverObject != null) {
    getObjectDiv(hoverObject.id).classList.add("hoverSelect");
  }
}
function setSelectedObjects(objects) {
  for (var id in selectedObjectIdToNewProps) {
    var objectDiv = getObjectDiv(id);
    objectDiv.classList.remove("selected");
  }
  selectedObjectIdToNewProps = {};
  objects.forEach(function(object) {
    selectedObjectIdToNewProps[object.id] = newPropsForObject(object);
  });
  for (var id in selectedObjectIdToNewProps) {
    var objectDiv = getObjectDiv(id);
    objectDiv.classList.add("selected");
  }

  if (hoverObject != null) {
    if (hoverObject.id in selectedObjectIdToNewProps) {
      // better than hovering
      getObjectDiv(hoverObject.id).classList.remove("hoverSelect");
    } else {
      // back to just hovering
      getObjectDiv(hoverObject.id).classList.add("hoverSelect");
    }
  }
}
function newPropsForObject(object) {
  return {
    x: object.x,
    y: object.y,
    z: object.z,
    faceIndex: object.faceIndex,
  };
}
function getEffectiveSelection(objects) {
  // if you make changes, call renderAndMaybeCommitSelection
  if (Object.keys(selectedObjectIdToNewProps).length > 0) return selectedObjectIdToNewProps;
  if (hoverObject != null) {
    var effectiveSelection = {};
    effectiveSelection[hoverObject.id] = newPropsForObject(hoverObject);
    return effectiveSelection;
  }
  return {};
}
function renderAndMaybeCommitSelection(selection) {
  var objectsToRender = [];
  // render
  for (var id in selection) {
    var object = objectsById[id];
    var newProps = selection[id];
    if (!(object.x === newProps.x &&
          object.y === newProps.y &&
          object.z === newProps.z &&
          object.faceIndex === newProps.faceIndex)) {
      objectsToRender.push(object);
    }
  }
  if (draggingMode === DRAG_NONE) {
    // if we're dragging, don't commit yet
    commitSelection(selection);
  }
  // now that we've possibly committed a temporary selection, we can render.
  objectsToRender.forEach(render);
  renderOrder();
}
function commitSelection(selection) {
  var messages = [];
  for (var id in selection) {
    var object = objectsById[id];
    var newProps = selection[id];
    if (!(object.x === newProps.x &&
          object.y === newProps.y &&
          object.z === newProps.z &&
          object.faceIndex === newProps.faceIndex)) {
      var message = {
        cmd: "moveObject",
        user: userName,
        args: {
          id: object.id,
          from: {
            x: object.x,
            y: object.y,
            z: object.z,
            faceIndex: object.faceIndex,
          },
          to: {
            x: newProps.x,
            y: newProps.y,
            z: newProps.z,
            faceIndex: newProps.faceIndex,
          },
        },
      };
      messages.push(message);
      // anticipate
      object.x = newProps.x;
      object.y = newProps.y;
      object.z = newProps.z;
      object.faceIndex = newProps.faceIndex;
    }
  }
  var message;
  if (messages.length === 0) {
    return;
  } else if (messages.length === 1) {
    message = messages[0];
  } else if (messages.length > 1) {
    message = {
      cmd: "multi",
      user: userName,
      args: messages,
    };
  }
  sendMessage(message);
  pushChangeToHistory(message);
}

var SHIFT = 1;
var CTRL = 2;
var ALT = 4;
function getModifierMask(event) {
  return (
    (event.shiftKey ? SHIFT : 0) |
    (event.ctrlKey ? CTRL : 0) |
    (event.altKey ? ALT : 0)
  );
}
document.addEventListener("keydown", function(event) {
  var modifierMask = getModifierMask(event);
  switch (event.keyCode) {
    case "R".charCodeAt(0):
      if (modifierMask === 0) { rollSelection(); break; }
      return;
    case "S".charCodeAt(0):
      if (modifierMask === 0) { shuffleSelection(); break; }
      return; 
    case "F".charCodeAt(0):
      if (modifierMask === 0) { flipOverSelection(); break; }
      return;
    case 27: // Escape
      if (draggingMode === DRAG_MOVE_SELECTION && modifierMask === 0) { cancelMove(); break; }
      if (draggingMode === DRAG_NONE && modifierMask === 0) { setSelectedObjects([]); break; }
      return;
    case "Z".charCodeAt(0):
      if (draggingMode === DRAG_NONE && modifierMask === CTRL)         { undo(); break; }
      if (draggingMode === DRAG_NONE && modifierMask === (CTRL|SHIFT)) { redo(); break; }
      if (modifierMask === 0) { examine(); break; }
      return;
    case "Y".charCodeAt(0):
      if (modifierMask === CTRL) { redo(); break; }
      return;
    default: return;
  }
  event.preventDefault();
});
document.addEventListener("keyup", function(event) {
  var modifierMask = getModifierMask(event);
  switch (event.keyCode) {
    case "Z".charCodeAt(0):
      unexamine();
      break;
    default: return;
  }
  event.preventDefault();
});

function flipOverSelection() {
  var selection = getEffectiveSelection();
  for (var id in selection) {
    var object = objectsById[id];
    var newProps = selection[id];
    newProps.faceIndex += 1;
    if (object.faces.length === newProps.faceIndex) {
      newProps.faceIndex = 0;
    }
  }
  renderAndMaybeCommitSelection(selection);
  renderOrder();
}
function rollSelection() {
  var selection = getEffectiveSelection();
  for (var id in selection) {
    var object = objectsById[id];
    var newProps = selection[id];
    newProps.faceIndex = Math.floor(Math.random() * object.faces.length);
  }
  renderAndMaybeCommitSelection(selection);
  renderOrder();
}
function cancelMove() {
  var selection = selectedObjectIdToNewProps;
  for (var id in selection) {
    var object = objectsById[id];
    var newProps = selection[id];
    newProps.x = object.x;
    newProps.y = object.y;
    newProps.z = object.z;
    newProps.faceIndex = object.faceIndex;
    render(object,true);
  }
  draggingMode = DRAG_NONE;
  renderOrder();
}
function shuffleSelection() {
  var selection;
  if (Object.keys(selectedObjectIdToNewProps).length > 0) {
    // real selection
    selection = selectedObjectIdToNewProps;
  } else if (hoverObject != null) {
    // select all objects we're hovering over in this stack
    var stackId = getStackId(hoverObject, hoverObject);
    selection = {};
    getObjects().forEach(function(object) {
      if (stackId !== getStackId(object, object)) return;
      selection[object.id] = newPropsForObject(object);
    });
  } else {
    // no selection
    return;
  }

  var newPropsArray = [];
  for (var id in selection) {
    newPropsArray.push(selection[id]);
  }
  for (var i = 0; i < newPropsArray.length; i++) {
    var otherIndex = Math.floor(Math.random() * (newPropsArray.length - i)) + i;
    var tempX = newPropsArray[i].x;
    var tempY = newPropsArray[i].y;
    var tempZ = newPropsArray[i].z;
    newPropsArray[i].x = newPropsArray[otherIndex].x;
    newPropsArray[i].y = newPropsArray[otherIndex].y;
    newPropsArray[i].z = newPropsArray[otherIndex].z;
    newPropsArray[otherIndex].x = tempX;
    newPropsArray[otherIndex].y = tempY;
    newPropsArray[otherIndex].z = tempZ;
  }
  renderAndMaybeCommitSelection(selection);
  renderOrder();
}
function examine() {
  if (examiningObject != null) return; // ignore key repeat
  if (hoverObject != null) {
    examiningObject = hoverObject;
  } else if (draggingMode === DRAG_MOVE_SELECTION) {
    var loneObject = null;
    for (var id in selectedObjectIdToNewProps) {
      if (loneObject != null) return; // too many objects selected
      loneObject = objectsById[id];
    }
    if (loneObject == null) throw asdf; // always dragging a selection
      examiningObject = loneObject;
  } else {
    return;
  }
  renderExaminingObject();
}
function unexamine() {
  if (examiningObject == null) return;
  var object = examiningObject;
  examiningObject = null;
  render(object, true);
  renderOrder();
}

function undo() {
  if (changeHistory.length === 0) return;
  var newMessage = reverseChange(changeHistory.pop());
  renderOrder();
  sendMessage(newMessage);
  futureChanges.push(newMessage);
}
function redo() {
  if (futureChanges.length === 0) return;
  var newMessage = reverseChange(futureChanges.pop());
  renderOrder();
  sendMessage(newMessage);
  changeHistory.push(newMessage);
}
function reverseChange(change) {
  if (change.cmd === "multi") {
    var newArgs = change.args.map(reverseChange);
    var newChange = {cmd:"multi", user:userName, args:newArgs};
    return newChange;
  } else if (change.cmd === "moveObject") {
    var object = objectsById[change.args.id];
    object.x = change.args.from.x;
    object.y = change.args.from.y;
    object.z = change.args.from.z;
    object.faceIndex = change.args.from.faceIndex;
    var newProps = selectedObjectIdToNewProps[object.id];
    if (newProps != null) {
      newProps.x = change.args.from.x;
      newProps.y = change.args.from.y;
      newProps.z = change.args.from.z;
      newProps.faceIndex = change.args.from.faceIndex;
    }
    render(object, true);

    var newChange = JSON.parse(JSON.stringify(change));
    var tmp = newChange.args.from;
    newChange.args.from = newChange.args.to;
    newChange.args.to = tmp;
    newChange.user = userName;
    return newChange;
  } else throw asdf;
}
function pushChangeToHistory(change) {
  changeHistory.push(change);
  futureChanges = [];
}

function eventToMouseX(event, mainDiv) { return event.clientX - mainDiv.getBoundingClientRect().left; }
function eventToMouseY(event, mainDiv) { return event.clientY - mainDiv.getBoundingClientRect().top; }

function render(object, isAnimated) {
  if (object === examiningObject) return; // different handling for this
  var x = object.x;
  var y = object.y;
  var z = object.z;
  var faceIndex = object.faceIndex;
  var newProps = selectedObjectIdToNewProps[object.id];
  if (newProps != null) {
    x = newProps.x;
    y = newProps.y;
    z = newProps.z;
    faceIndex = newProps.faceIndex;
  }
  var objectDiv = getObjectDiv(object.id);
  var facePath = object.faces[faceIndex];
  var pixelX = mainDiv.offsetLeft + gameDefinition.coordinates.originX + gameDefinition.coordinates.unitWidth  * x;
  var pixelY = mainDiv.offsetTop  + gameDefinition.coordinates.originY + gameDefinition.coordinates.unitHeight * y;
  var pixelWidth = gameDefinition.coordinates.unitWidth * object.width;
  var pixelHeight = gameDefinition.coordinates.unitHeight * object.height;
  var imageUrlUrl = facePathToUrlUrl[facePath];
  if (isAnimated) {
    objectDiv.classList.add("animatedMovement");
  } else {
    objectDiv.classList.remove("animatedMovement");
  }
  objectDiv.style.left = pixelX + "px";
  objectDiv.style.top  = pixelY + "px";
  objectDiv.style.width  = pixelWidth;
  objectDiv.style.height = pixelHeight;
  objectDiv.style.zIndex = z;
  if (imageUrlUrl !== "" && objectDiv.dataset.facePath !== facePath) {
    objectDiv.dataset.facePath = facePath;
    objectDiv.style.backgroundImage = imageUrlUrl;
  }
  objectDiv.style.display = "block";
}
function renderExaminingObject() {
  var object = examiningObject;
  var windowWidth  = window.innerWidth;
  var windowHeight = window.innerHeight;
  var windowAspectRatio = windowWidth / windowHeight;
  var objectDiv = getObjectDiv(object.id);
  var objectAspectRatio = object.width / object.height;
  var bigWidth;
  var bigHeight;
  if (windowAspectRatio < objectAspectRatio) {
    bigWidth  = windowWidth;
    bigHeight = windowWidth  / objectAspectRatio;
  } else {
    bigWidth  = windowHeight * objectAspectRatio;
    bigHeight = windowHeight;
  }
  objectDiv.classList.add("animatedMovement");
  objectDiv.style.left = (windowWidth  - bigWidth)  / 2;
  objectDiv.style.top  = (windowHeight - bigHeight) / 2;
  objectDiv.style.width  = bigWidth;
  objectDiv.style.height = bigHeight;
  objectDiv.style.zIndex = findMaxZ() + 1;
  var stackHeightDiv = getStackHeightDiv(object.id);
  stackHeightDiv.style.display = "none";
}
function renderOrder() {
  var sizeAndLocationToIdAndZList = {};
  getObjects().forEach(function(object) {
    var newProps = selectedObjectIdToNewProps[object.id];
    if (newProps == null) newProps = object;
    var key = getStackId(newProps, object);
    var idAndZList = sizeAndLocationToIdAndZList[key];
    if (idAndZList == null) idAndZList = sizeAndLocationToIdAndZList[key] = [];
    idAndZList.push({id:object.id, z:newProps.z});
  });
  for (var key in sizeAndLocationToIdAndZList) {
    var idAndZList = sizeAndLocationToIdAndZList[key];
    idAndZList.sort(compareZ);
    idAndZList.forEach(function(idAndZ, i) {
      if (examiningObject != null && examiningObject.id === idAndZ.id) return;
      var stackHeightDiv = getStackHeightDiv(idAndZ.id);
      if (i > 0) {
        stackHeightDiv.textContent = (i + 1).toString();
        stackHeightDiv.style.display = "block";
      } else {
        stackHeightDiv.style.display = "none";
      }
    });
  }
}
function getStackId(newProps, object) {
  return [newProps.x, newProps.y, object.width, object.height].join(",");
}
function renderSelectionRectangle() {
  var selectionRectangleDiv = document.getElementById("selectionRectangleDiv");
  if (draggingMode === DRAG_RECTANGLE_SELECT) {
    var x = rectangleSelectStartX;
    var y = rectangleSelectStartY;
    var width  = rectangleSelectEndX - rectangleSelectStartX;
    var height = rectangleSelectEndY - rectangleSelectStartY;
    var borderWidth = parseInt(selectionRectangleDiv.style.borderWidth);
    if (width >= 0) {
      width -= 2 * borderWidth;
    } else {
      width *= -1;
      x -= width;
    }
    if (height >= 0) {
      height -= 2 * borderWidth;
    } else {
      height *= -1;
      y -= height;
    }
    if (height <= 0) height = 1;
    if (width  <= 0) width  = 1;
    selectionRectangleDiv.style.left = (mainDiv.offsetLeft + x) + "px";
    selectionRectangleDiv.style.top  = (mainDiv.offsetTop  + y) + "px";
    selectionRectangleDiv.style.width  = width  + "px";
    selectionRectangleDiv.style.height = height + "px";
    selectionRectangleDiv.style.display = "block";
  } else {
    selectionRectangleDiv.style.display = "none";
  }
}

function getObjects() {
  var objects = [];
  for (var objectId in objectsById) {
    objects.push(objectsById[objectId]);
  }
  return objects;
}
function getObjectsInZOrder() {
  var objects = [];
  objects.sort(compareZ);
  return objects;
}
function compareZ(a, b) {
  return operatorCompare(a.z, b.z);
}
function operatorCompare(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

var socket;
var isConnected = false;
function connectToServer() {
  var host = location.host;
  var pathname = location.pathname;
  var isHttps = location.protocol === "https:";
  var match = host.match(/^(.+):(\d+)$/);
  var defaultPort = isHttps ? 443 : 80;
  var port = match ? parseInt(match[2], 10) : defaultPort;
  var hostName = match ? match[1] : host;
  var wsProto = isHttps ? "wss:" : "ws:";
  var wsUrl = wsProto + "//" + hostName + ":" + port + pathname;
  socket = new WebSocket(wsUrl);
  socket.addEventListener('open', onOpen, false);
  socket.addEventListener('message', onMessage, false);
  socket.addEventListener('error', timeoutThenCreateNew, false);
  socket.addEventListener('close', timeoutThenCreateNew, false);

  function onOpen() {
    isConnected = true;
    connectionEstablished();
  }
  function onMessage(event) {
    var msg = event.data;
    if (msg === "keepAlive") return;
    console.log(msg);
    var message = JSON.parse(msg);
    handleMessage(message);
  }
  function timeoutThenCreateNew() {
    socket.removeEventListener('error', timeoutThenCreateNew, false);
    socket.removeEventListener('close', timeoutThenCreateNew, false);
    socket.removeEventListener('open', onOpen, false);
    if (isConnected) {
      isConnected = false;
      connectionLost();
    }
    setTimeout(connectToServer, 1000);
  }
}

function connectionEstablished() {
  console.log("connected");
}
function connectionLost() {
  console.log("disconnected");
  deleteEverything();
}
function sendMessage(message) {
  socket.send(JSON.stringify(message));
}
function handleMessage(message) {
  var objectsToRender = [];
  var storeInHistory = false;
  executeMessage(message);

  objectsToRender.forEach(function(object) {
    render(object, true);
  });
  renderOrder();
  if (storeInHistory) pushChangeToHistory(message);

  function executeMessage(message) {
    switch (message.cmd) {
      case "login":
        userName = message.args;
        break;
      case "game":
        gameDefinition = message.args;
        initGame();
        break;
      case "multi":
        message.args.forEach(executeMessage);
        break;
      case "moveObject":
        if (message.user === userName) return;
        storeInHistory = true;
        var object = objectsById[message.args.id];
        object.x = message.args.to.x;
        object.y = message.args.to.y;
        object.z = message.args.to.z;
        object.faceIndex = message.args.to.faceIndex;
        objectsToRender.push(object);
        break;
      default:
        console.log("unknown command:", message.cmd);
    }
  }
}

function generateRandomId() {
  var result = "";
  for (var i = 0; i < 16; i++) {
    var n = Math.floor(Math.random() * 16);
    var c = n.toString(16);
    result += c;
  }
  return result;
}
function getObjectDiv(id) {
  return document.getElementById("object-" + id);
}
function getStackHeightDiv(id) {
  return document.getElementById("stackHeight-" + id);
}

connectToServer();
