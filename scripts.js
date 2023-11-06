var sceneWidth = $("#container").width();
var sceneHeight = 500;
const group = new Konva.Group();
const stage = new Konva.Stage({
  container: "container",
  width: sceneWidth,
  height: sceneHeight,
});
const layer = new Konva.Layer();
const tr = new Konva.Transformer({
  anchorSize: 8,
  rotateAnchorOffset: 40,
  rotateEnabled: false,
  borderEnabled: true,
  enabledAnchors: [
    "top-right",
    "top-center",
    "top-left",
    "middle-left",
    "middle-right",
    "bottom-right",
    "bottom-center",
    "bottom-left",
  ],
  centerScaling: true,
});
// add a new feature, lets add ability to draw selection rectangle
const selectionRectangle = new Konva.Rect({
  visible: false,
});
const tooltip = new Konva.Text({
  text: "",
  fontFamily: "Calibri",
  fontSize: 16,
  padding: 5,
  visible: false,
  fill: "black",
  opacity: 0.75,
  textFill: "white",
});
const bottomLabel = new Konva.Label();
const bottomText = new Konva.Text({
  text: "",
  fontFamily: "Calibri",
  fontSize: 16,
  padding: 5,
  fill: "white",
});
const GUIDELINE_OFFSET = 5;
let isDraw = false;
let isSelectionRectangle = false;
let selectedRect = null;
let x1, y1, x2, y2;
let layerCount = 0;
let selectedShapes = null;
let lastShape = null;
let listShapeRect = [];
let startTimeDown = null
const MIN_SHAPE = 10

function createRect(x, y) {
  return new Konva.Rect({
    x: x,
    y: y,
    strokeWidth: 2,
    stroke: Konva.Util.getRandomColor(),
    name: "rect",
    id: "myRect_" + layerCount,
    draggable: true,
  });
}

function createTooltip(x, y, target) {
  tooltip.position({
    x: x - 5,
    y: y - 25,
  });
  tooltip.fill(target.stroke());
  tooltip.text(target.id());
  tooltip.show();
}

function createLineWithHeight(width, height, x, y) {
  bottomText.text(width + " x " + height);
  bottomLabel.add(bottomText);
  bottomLabel.position({
    x: isDraw
      ? x - width / 2 - bottomText.width() / 2
      : x + width / 2 - bottomText.width() / 2,
    y: isDraw ? y + 10 : y + height + 10,
  });
  bottomLabel.show();
}

// were can we snap our objects?
function getLineGuideStops(skipShape) {
  // we can snap to stage borders and the center of the stage
  var vertical = [0, stage.width() / 2, stage.width()];
  var horizontal = [0, stage.height() / 2, stage.height()];

  // and we snap over edges and center of each object on the canvas
  stage.find(".rect").forEach((guideItem) => {
    if (guideItem === skipShape) {
      return;
    }
    var box = guideItem.getClientRect();
    // and we can snap to all edges of shapes
    vertical.push([box.x, box.x + box.width, box.x + box.width / 2]);
    horizontal.push([box.y, box.y + box.height, box.y + box.height / 2]);
  });
  return {
    vertical: vertical.flat(),
    horizontal: horizontal.flat(),
  };
}

// what points of the object will trigger to snapping?
// it can be just center of the object
// but we will enable all edges and center
function getObjectSnappingEdges(node) {
  var box = node.getClientRect();
  var absPos = node.absolutePosition();
  return {
    vertical: [
      {
        guide: Math.round(box.x),
        offset: Math.round(absPos.x - box.x),
        snap: "start",
      },
      {
        guide: Math.round(box.x + box.width / 2),
        offset: Math.round(absPos.x - box.x - box.width / 2),
        snap: "center",
      },
      {
        guide: Math.round(box.x + box.width),
        offset: Math.round(absPos.x - box.x - box.width),
        snap: "end",
      },
    ],
    horizontal: [
      {
        guide: Math.round(box.y),
        offset: Math.round(absPos.y - box.y),
        snap: "start",
      },
      {
        guide: Math.round(box.y + box.height / 2),
        offset: Math.round(absPos.y - box.y - box.height / 2),
        snap: "center",
      },
      {
        guide: Math.round(box.y + box.height),
        offset: Math.round(absPos.y - box.y - box.height),
        snap: "end",
      },
    ],
  };
}

// find all snapping possibilities
function getGuides(lineGuideStops, itemBounds) {
  var resultV = [];
  var resultH = [];

  lineGuideStops.vertical.forEach((lineGuide) => {
    itemBounds.vertical.forEach((itemBound) => {
      var diff = Math.abs(lineGuide - itemBound.guide);
      // if the distance between guild line and object snap point is close we can consider this for snapping
      if (diff < GUIDELINE_OFFSET) {
        resultV.push({
          lineGuide: lineGuide,
          diff: diff,
          snap: itemBound.snap,
          offset: itemBound.offset,
        });
      }
    });
  });

  lineGuideStops.horizontal.forEach((lineGuide) => {
    itemBounds.horizontal.forEach((itemBound) => {
      var diff = Math.abs(lineGuide - itemBound.guide);
      if (diff < GUIDELINE_OFFSET) {
        resultH.push({
          lineGuide: lineGuide,
          diff: diff,
          snap: itemBound.snap,
          offset: itemBound.offset,
        });
      }
    });
  });

  var guides = [];

  // find closest snap
  var minV = resultV.sort((a, b) => a.diff - b.diff)[0];
  var minH = resultH.sort((a, b) => a.diff - b.diff)[0];
  if (minV) {
    guides.push({
      lineGuide: minV.lineGuide,
      offset: minV.offset,
      orientation: "V",
      snap: minV.snap,
    });
  }
  if (minH) {
    guides.push({
      lineGuide: minH.lineGuide,
      offset: minH.offset,
      orientation: "H",
      snap: minH.snap,
    });
  }
  return guides;
}

function drawGuides(guides) {
  guides.forEach((lg) => {
    if (lg.orientation === "H") {
      var line = new Konva.Line({
        points: [-6000, 0, 6000, 0],
        stroke: "rgb(0, 161, 255)",
        strokeWidth: 1,
        name: "guid-line",
        dash: [4, 6],
      });
      layer.add(line);
      line.absolutePosition({
        x: 0,
        y: lg.lineGuide,
      });
    } else if (lg.orientation === "V") {
      var line = new Konva.Line({
        points: [0, -6000, 0, 6000],
        stroke: "rgb(0, 161, 255)",
        strokeWidth: 1,
        name: "guid-line",
        dash: [4, 6],
      });
      layer.add(line);
      line.absolutePosition({
        x: lg.lineGuide,
        y: 0,
      });
    }
  });
}

function fitStageIntoParentContainer() {
  var container = document.querySelector("#stage-parent");

  // now we need to fit stage into parent container
  var containerWidth = container.offsetWidth;
  var containerHeight = container.offsetHeight;

  // Calculate the scale for both width and height
  var scaleX = containerWidth / sceneWidth;
  var scaleY = containerHeight / sceneHeight;

  // Use the minimum scale value to maintain aspect ratio
  var scale = Math.min(scaleX, scaleY);

  stage.width(sceneWidth * scale);
  stage.height(sceneHeight * scale);
  stage.scale({ x: scale, y: scale });
}

function formData() {
  const options = [
    "TEXT",
    "BUTTON",
    "INPUT",
    "SELECTED",
    "A",
    "IMG",
    "SPAN",
    "AREA",
    "H1",
    "H2",
    "H3",
    "H4",
    "H5",
  ];
  let optionsField = "";
  options.forEach((option) => {
    optionsField += `<option value="${option}">${option}</option>`;
  });
  const html = `
     <div id="box-field-${layerCount}" class="box-field p-3" onClick="findLayer(${layerCount})">
       <form class="w-100">
         <div class="form-group row">
           <label
             for="control_name_${layerCount}"
             class="col-xl-4 col-form-label col-form-label"
           >
             Control Name
           </label>
           <div class="col-xl-8">
             <input
               type="email"
               class="form-control form-control"
               id="control_name_${layerCount}"
             />
           </div>
         </div>
         <div class="form-group row mb-0">
           <label
             for="control_type_${layerCount}"
             class="col-xl-4 col-form-label col-form-label"
           >
             Control Type
           </label>
           <div class="col-xl-8">
             <select class="form-control" id="control_type_${layerCount}">
               ${optionsField}
             </select>
           </div>
         </div>
       </form>
     </div>`;

  $(".col.box").append(html);

  const $newForm = $(`#box-field-${layerCount}`);
  const idValue = $newForm.attr("id");
  const idParts = idValue.split("-");
  const lastNumber = idParts[idParts.length - 1];
  $newForm.hover(
    function () {
      const shape = stage.find("#myRect_" + lastNumber)[0];
      tr.nodes([shape]);
      createTooltip(shape.attrs.x, shape.attrs.y, shape);
      createLineWithHeight(
        shape.attrs.width,
        shape.attrs.height,
        shape.attrs.x,
        shape.attrs.y
      );
    },
    function () {
      tr.nodes([]);
      tooltip.hide();
      bottomLabel.hide();
    }
  );
  layerCount++;
}

function setupEventHandlers() {
  stage.on("mousedown touchstart", handleStageMouseDown);
  stage.on("mouseup touchend", handleStageMouseUp);
  stage.on("mousemove touchmove", handleStageMouseMove);
  stage.on("click tap", handleStageClick);
  layer.on("mouseover", handleLayerMouseOver);
  layer.on("mousemove", handleLayerMouseMove);
  layer.on("mouseout", handleLayerMouseOut);
  layer.on("dragmove", handleLayerDragmove);
  layer.on("dragend", handleLayerDragend);
}

function handleStageMouseDown(e) {
  startTimeDown = new Date().getTime()
  // do nothing if we mousedown on any shape
  if (e.target !== stage) {
    return;
  }

  e.evt.preventDefault();
  isDraw = true;
  const pos = stage.getPointerPosition();
  x1 = pos.x;
  y1 = pos.y;
  x2 = pos.x;
  y2 = pos.y;

  //draw new shape rectangle
  selectedRect = createRect(pos.x, pos.y);

  tr.nodes([selectedRect]);
  lastShape = selectedRect;

  selectionRectangle.visible(true);
  selectionRectangle.width(0);
  selectionRectangle.height(0);

  if (!isSelectionRectangle) {
    group.add(selectedRect);
  }
}

function handleStageMouseUp(e) {
  isDraw = false;
  // do nothing if we didn't start selection
  if (!selectionRectangle.visible()) {
    return;
  }

  e.evt.preventDefault();
  // update visibility in timeout, so we can check it in click event
  setTimeout(() => {
    selectionRectangle.visible(false);
  });

  if(new Date().getTime() - startTimeDown < 150 || (lastShape.attrs.width < MIN_SHAPE && lastShape.attrs.height < MIN_SHAPE)) {
    tr.nodes([])
    return
  }

  const shapes = stage.find(".rect");
  const box = selectionRectangle.getClientRect();
  selectedShapes = shapes.filter((shape) =>
    Konva.Util.haveIntersection(box, shape.getClientRect())
  );
  tr.nodes(selectedShapes);

  if (selectedShapes.length > 0) {
    lastShape = selectedShapes;
    listShapeRect.push(selectedRect);
    formData();
  }
  handleLayerTransform();
}

function handleStageMouseMove(e) {
  // do nothing if we didn't start selection
  if (!selectionRectangle.visible()) {
    return;
  }
  if (!isDraw) {
    return;
  }
  // prevent scrolling on touch devices
  e.evt.preventDefault();

  const pos = stage.getPointerPosition();
  x1 = selectedRect.x();
  y1 = selectedRect.y();
  x2 = pos.x;
  y2 = pos.y;

  selectionRectangle.setAttrs({
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  });

  // Update the rectangle's position and size
  selectedRect.setAttrs({
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.max(x2 - x1),
    height: Math.max(y2 - y1),
  });
  createLineWithHeight(Math.abs(x2 - x1), Math.abs(y2 - y1), x2, y2);
}

function handleStageClick(e) {
  // if we are selecting with rect, do nothing
  if (selectionRectangle.visible()) {
    return;
  }

  // if click on empty area - remove all selections
  if (e.target === stage) {
    tr.nodes([]);
    return;
  }

  // do nothing if clicked NOT on our rectangles
  if (!e.target.hasName("rect")) {
    return;
  }
  // do we pressed shift or ctrl?
  const metaPressed = e.evt.shiftKey || e.evt.ctrlKey || e.evt.metaKey;
  const isSelected = tr.nodes().indexOf(e.target) >= 0;

  if (!metaPressed && !isSelected) {
    // if no key pressed and the node is not selected
    // select just one
    tr.nodes([e.target]);
    lastShape = e.target;
  } else if (metaPressed && isSelected) {
    // if we pressed keys and node was selected
    // we need to remove it from selection:
    const nodes = tr.nodes().slice(); // use slice to have new copy of array
    // remove node from array
    nodes.splice(nodes.indexOf(e.target), 1);
    tr.nodes(nodes);
    lastShape = nodes;
  } else if (metaPressed && !isSelected) {
    // add the node into selection
    const nodes = tr.nodes().concat([e.target]);
    tr.nodes(nodes);
    lastShape = nodes;
  }
}

function handleLayerMouseOver(e) {
  var shape = e.target;
  selectedShapes = [shape];
  document.body.style.cursor = "pointer";
}

function handleLayerMouseMove(e) {
  if (isDraw) {
    return;
  }
  const shape = e.target;
  // update tooltip
  createTooltip(shape.attrs.x, shape.attrs.y, shape);
  // update Line With and Height
  createLineWithHeight(
    shape.attrs.width,
    shape.attrs.height,
    shape.attrs.x,
    shape.attrs.y
  );
}

function handleLayerMouseOut(e) {
  tooltip.hide();
  bottomLabel.hide();
  document.body.style.cursor = "default";
}

function handleLayerDragmove(e) {
  tooltip.hide();
  bottomLabel.hide();
  // clear all previous lines on the screen
  layer.find(".guid-line").forEach((l) => l.destroy());

  // find possible snapping lines
  var lineGuideStops = getLineGuideStops(e.target);
  // find snapping points of current object
  var itemBounds = getObjectSnappingEdges(e.target);

  // now find where can we snap current object
  var guides = getGuides(lineGuideStops, itemBounds);

  // do nothing of no snapping
  if (!guides.length) {
    return;
  }

  drawGuides(guides);

  var absPos = e.target.absolutePosition();
  // now force object position
  guides.forEach((lg) => {
    switch (lg.snap) {
      case "start": {
        switch (lg.orientation) {
          case "V": {
            absPos.x = lg.lineGuide + lg.offset;
            break;
          }
          case "H": {
            absPos.y = lg.lineGuide + lg.offset;
            break;
          }
        }
        break;
      }
      case "center": {
        switch (lg.orientation) {
          case "V": {
            absPos.x = lg.lineGuide + lg.offset;
            break;
          }
          case "H": {
            absPos.y = lg.lineGuide + lg.offset;
            break;
          }
        }
        break;
      }
      case "end": {
        switch (lg.orientation) {
          case "V": {
            absPos.x = lg.lineGuide + lg.offset;
            break;
          }
          case "H": {
            absPos.y = lg.lineGuide + lg.offset;
            break;
          }
        }
        break;
      }
    }
  });
  e.target.absolutePosition(absPos);
}

function handleLayerDragend(e) {
  // clear all previous lines on the screen
  layer.find(".guid-line").forEach((l) => l.destroy());
}

function handleLayerTransform() {
  // if (listShapeRect.length) {
  //   for (const rect of listShapeRect) {
  //     rect.on("transformstart", function () {
  //       console.log("Transform started for Rect " + rect.id());
  //     });
  //     rect.on("dragmove", function () {
  //       const x = rect.x();
  //       const y = rect.y();
  //       const width = rect.width() * rect.scaleX();
  //       const height = rect.height() * rect.scaleY();
  //       createLineWithHeight(width, height, x, y);
  //     });
  //     rect.on("transform", function () {
  //       const x = rect.x();
  //       const y = rect.y();
  //       const width = Math.round(rect.width() * rect.scaleX());
  //       const height = Math.round(rect.height() * rect.scaleY());
  //       console.log("Transform for Rect " + rect.id());
  //       createLineWithHeight(width, height, x, y);
  //     });
  //     rect.on("transformend", function () {
  //       console.log("Transform end for Rect " + rect.id());
  //     });
  //   }
  // }
}

$(document).ready(() => {
  bottomLabel.add(
    new Konva.Tag({
      fill: "blue",
      pointerWidth: 20,
      pointerHeight: 28,
      lineJoin: "round",
    })
  );
  group.add(selectionRectangle, bottomLabel, bottomText, tooltip, tr);
  layer.add(group);
  stage.add(layer);

  fitStageIntoParentContainer();

  setupEventHandlers();

  // $(document).on("keydown", (e) => {
  //   if ((e.keyCode === 8 || e.keyCode === 46) && lastShape) {
  //     tr.nodes([]);
  //     if (Array.isArray(lastShape)) {
  //       // If lastShape is an array, loop through its elements and destroy them
  //       $.each(lastShape, function (index, shape) {
  //         shape.destroy();
  //       });
  //     } else {
  //       // If lastShape is not an array, destroy it
  //       lastShape.destroy();
  //     }
  //     lastShape = null;
  //     layer.draw();
  //     // stageToJson = stage.toJSON();
  //     // localStorage.setItem("jsonStage", stageToJson);
  //   }
  // });

  $("#move").on("click", () => {
    isSelectionRectangle = true;
    tr.nodes([]);
  });

  $("#shape").on("click", () => {
    isSelectionRectangle = false;
  });

  window.addEventListener("resize", fitStageIntoParentContainer);
});
