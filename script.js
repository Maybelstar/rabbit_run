const scoreDisplay = document.getElementById("score");
const scoreOverlay = document.getElementById("score-overlay");
const highScoreDisplay = document.getElementById("high-score-value");
const timerDisplay = document.getElementById("timer");
const distanceDisplay = document.getElementById("distance");
const gameArea = document.getElementById("game-area");
const coinsLayer = document.getElementById("coins-layer");
const obstaclesLayer = document.getElementById("obstacles-layer");
const finishFlag = document.getElementById("finish-flag");
const runner = document.getElementById("runner");
const message = document.getElementById("message");
const controlButtons = Array.from(document.querySelectorAll(".control-button"));
const controlButtonMap = controlButtons.reduce(function (map, button) {
  map[button.dataset.control] = button;
  return map;
}, {});
const sun = document.querySelector(".decor-sun");
const clouds = Array.from(document.querySelectorAll(".decor-cloud"));
const hillBack = document.querySelector(".hill-back");
const hillFront = document.querySelector(".hill-front");
const parallaxStrip = document.getElementById("parallax-strip");

const groundHeight = 82;
const runnerWidth = 52;
const runnerHeight = 76;
const gravity = 0.82;
const jumpPower = 15.8;
const moveSpeed = 5.2;
const levelLength = 6400;
const totalCoins = 18;
const totalPipes = 5;
const totalCritters = 4;
const coinHeights = [60, 74, 88, 102, 118, 134, 150];

let score = 0;
let bestScore = loadBestScore();
let bestPlayerName = loadBestPlayerName();
let gameRunning = false;
let animationFrameId;
let lastFrameTime = 0;
let cameraX = 0;
let elapsedTime = 0;
let timePenaltyApplied = 0;
let critterHitCooldown = 0;
let messageTimeoutId = 0;
let scoreFlashTimeoutId = 0;

const controls = {
  left: false,
  right: false,
};

const keyboardControls = {
  left: false,
  right: false,
};

const activeTouchControls = {
  left: new Set(),
  right: new Set(),
};

const activeJumpInputs = new Set();

const runnerState = {
  x: 96,
  y: 0,
  velocityY: 0,
  onGround: true,
};

let coins = [];
let obstacles = [];

function getViewportScale() {
  const scaleValue = window.getComputedStyle(document.documentElement).getPropertyValue("--viewport-scale").trim();
  return Number(scaleValue) || 1;
}

function getVisibleWorldWidth() {
  return gameArea.clientWidth / getViewportScale();
}

function setMessage(text, durationMs) {
  message.textContent = text;

  if (messageTimeoutId) {
    window.clearTimeout(messageTimeoutId);
    messageTimeoutId = 0;
  }

  if (!durationMs) {
    return;
  }

  messageTimeoutId = window.setTimeout(function () {
    if (message.textContent === text) {
      message.textContent = "";
    }
  }, durationMs);
}

function flashScore(direction) {
  if (!scoreOverlay) {
    return;
  }

  scoreOverlay.classList.remove("score-up", "score-down");

  if (scoreFlashTimeoutId) {
    window.clearTimeout(scoreFlashTimeoutId);
    scoreFlashTimeoutId = 0;
  }

  if (direction === 0) {
    return;
  }

  scoreOverlay.classList.add(direction > 0 ? "score-up" : "score-down");
  scoreFlashTimeoutId = window.setTimeout(function () {
    scoreOverlay.classList.remove("score-up", "score-down");
  }, 450);
}

function adjustScore(delta) {
  const nextScore = Math.max(0, score + delta);
  const change = nextScore - score;

  if (change === 0) {
    return;
  }

  score = nextScore;
  flashScore(change);
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function isCoinNearObstacle(coinX, obstacleLayout) {
  return obstacleLayout.some(function (obstacle) {
    const safeDistance = obstacle.type === "pipe" ? 120 : 92;
    return Math.abs(coinX - obstacle.x) < safeDistance;
  });
}

function generatePipePositions() {
  const firstPipeStart = 760;
  const lastPipeEnd = levelLength - 980;
  const slotWidth = (lastPipeEnd - firstPipeStart) / totalPipes;

  return Array.from({ length: totalPipes }, function (_, index) {
    const slotStart = firstPipeStart + index * slotWidth;
    const margin = Math.min(190, slotWidth * 0.22);
    return Math.round(randomBetween(slotStart + margin, slotStart + slotWidth - margin));
  });
}

function generateObstacleLayout() {
  const pipePositions = generatePipePositions();
  const obstacleLayout = pipePositions.map(function (position) {
    return { type: "pipe", x: position };
  });

  for (let index = 0; index < totalCritters; index += 1) {
    const leftPipe = pipePositions[index];
    const rightPipe = pipePositions[index + 1];
    const critterMinX = leftPipe + 180;
    const critterMaxX = rightPipe - 160;
    const critterX = Math.round(randomBetween(critterMinX, critterMaxX));
    obstacleLayout.push({ type: "critter", x: critterX });
  }

  return obstacleLayout.sort(function (obstacleA, obstacleB) {
    return obstacleA.x - obstacleB.x;
  });
}

function generateCoinPositions(obstacleLayout) {
  const positions = [];
  const firstCoinStart = 340;
  const lastCoinEnd = levelLength - 280;
  const slotWidth = (lastCoinEnd - firstCoinStart) / totalCoins;

  for (let index = 0; index < totalCoins; index += 1) {
    const slotStart = firstCoinStart + index * slotWidth;
    const margin = Math.min(110, slotWidth * 0.18);
    let coinX = Math.round(randomBetween(slotStart + margin, slotStart + slotWidth - margin));
    let attempts = 0;

    while (attempts < 8 && isCoinNearObstacle(coinX, obstacleLayout)) {
      coinX = Math.round(randomBetween(slotStart + margin, slotStart + slotWidth - margin));
      attempts += 1;
    }

    if (isCoinNearObstacle(coinX, obstacleLayout)) {
      coinX = Math.round(clamp(slotStart + slotWidth / 2, slotStart + margin, slotStart + slotWidth - margin));
    }

    positions.push([coinX, coinHeights[Math.floor(Math.random() * coinHeights.length)]]);
  }

  return positions;
}

function loadBestScore() {
  try {
    return Number(window.localStorage.getItem("rabbit-run-best-score-v2")) || 0;
  } catch (error) {
    return 0;
  }
}

function loadBestPlayerName() {
  try {
    return window.localStorage.getItem("rabbit-run-best-player-v2") || "Nobody yet";
  } catch (error) {
    return "Nobody yet";
  }
}

function saveBestScore() {
  try {
    window.localStorage.setItem("rabbit-run-best-score-v2", String(bestScore));
    window.localStorage.setItem("rabbit-run-best-player-v2", bestPlayerName);
  } catch (error) {
    return;
  }
}

function updateBestScoreDisplay() {
  highScoreDisplay.textContent = bestScore + " by " + bestPlayerName;
}

function maybeRecordBestScore() {
  if (score <= bestScore) {
    return false;
  }

  const enteredName = window.prompt("New high score! What is the player's name?", bestPlayerName === "Nobody yet" ? "" : bestPlayerName);
  const cleanedName = enteredName && enteredName.trim() ? enteredName.trim() : "Anonymous Rabbit";

  bestScore = score;
  bestPlayerName = cleanedName;
  saveBestScore();
  updateBestScoreDisplay();
  return true;
}

function updateHud() {
  scoreDisplay.textContent = score;
  updateBestScoreDisplay();
  timerDisplay.textContent = elapsedTime.toFixed(1);
  distanceDisplay.textContent = Math.min(100, Math.round((runnerState.x / (levelLength - runnerWidth)) * 100)) + "%";
}

function createCoin(worldX, worldY) {
  const coin = document.createElement("div");
  coin.className = "coin";
  coinsLayer.appendChild(coin);

  return {
    element: coin,
    x: worldX,
    y: worldY,
    width: 24,
    height: 32,
    collected: false,
  };
}

function createObstacle(type, worldX) {
  const obstacle = document.createElement("div");
  obstacle.className = "obstacle " + type;
  obstaclesLayer.appendChild(obstacle);

  return {
    element: obstacle,
    type: type,
    x: worldX,
    y: 0,
    width: type === "pipe" ? 64 : 42,
    height: type === "pipe" ? 72 : 34,
    direction: type === "critter" ? -1 : 0,
    speed: type === "critter" ? 1.35 : 0,
    minX: worldX,
    maxX: worldX,
    defeated: false,
  };
}

function clearLevel() {
  coins.forEach(function (coin) {
    coin.element.remove();
  });

  obstacles.forEach(function (obstacle) {
    obstacle.element.remove();
  });

  coins = [];
  obstacles = [];
}

function buildLevel() {
  clearLevel();
  const obstacleLayout = generateObstacleLayout();
  const coinPositions = generateCoinPositions(obstacleLayout);

  coinPositions.forEach(function (position) {
    coins.push(createCoin(position[0], position[1]));
  });

  obstacleLayout.forEach(function (item) {
    obstacles.push(createObstacle(item.type, item.x));
  });

  const pipes = obstacles.filter(function (obstacle) {
    return obstacle.type === "pipe";
  });

  obstacles.forEach(function (obstacle) {
    if (obstacle.type !== "critter") {
      return;
    }

    const previousPipe = [...pipes]
      .reverse()
      .find(function (pipe) {
        return pipe.x < obstacle.x;
      });
    const nextPipe = pipes.find(function (pipe) {
      return pipe.x > obstacle.x;
    });

    obstacle.minX = previousPipe ? previousPipe.x + previousPipe.width + 20 : Math.max(120, obstacle.x - 140);
    obstacle.maxX = nextPipe ? nextPipe.x - obstacle.width - 20 : Math.min(levelLength - 120, obstacle.x + 140);
  });
}

function setRunnerPosition() {
  const screenX = runnerState.x - cameraX;
  runner.style.left = screenX + "px";
  runner.style.bottom = groundHeight + runnerState.y + "px";
}

function renderCoins() {
  const visibleWorldWidth = getVisibleWorldWidth();

  coins.forEach(function (coin) {
    if (coin.collected) {
      return;
    }

    const screenX = coin.x - cameraX;
    coin.element.style.left = screenX + "px";
    coin.element.style.bottom = groundHeight + coin.y + "px";
    coin.element.style.display = screenX < -coin.width || screenX > visibleWorldWidth ? "none" : "block";
  });
}

function renderObstacles() {
  const visibleWorldWidth = getVisibleWorldWidth();

  obstacles.forEach(function (obstacle) {
    const screenX = obstacle.x - cameraX;
    if (obstacle.defeated) {
      obstacle.element.style.display = "none";
      return;
    }

    obstacle.element.style.left = screenX + "px";
    obstacle.element.style.display =
      screenX < -obstacle.width || screenX > visibleWorldWidth ? "none" : "block";

    if (obstacle.type === "critter") {
      obstacle.element.style.transform = obstacle.direction < 0 ? "scaleX(-1)" : "scaleX(1)";
    }
  });
}

function renderFinishFlag() {
  const visibleWorldWidth = getVisibleWorldWidth();
  const screenLeft = levelLength - cameraX;
  finishFlag.style.left = screenLeft + "px";
  finishFlag.style.right = "auto";
  finishFlag.style.display = screenLeft < -80 || screenLeft > visibleWorldWidth + 80 ? "none" : "block";
}

function renderScene() {
  updateParallax();
  setRunnerPosition();
  renderCoins();
  renderObstacles();
  renderFinishFlag();
}

function updateParallax() {
  if (sun) {
    sun.style.transform = "translateX(" + -cameraX * 0.06 + "px)";
  }

  clouds.forEach(function (cloud, index) {
    const factor = 0.1 + index * 0.04;
    cloud.style.transform = "translateX(" + -cameraX * factor + "px)";
  });

  if (hillBack) {
    hillBack.style.transform = "translateX(" + -cameraX * 0.18 + "px)";
  }

  if (hillFront) {
    hillFront.style.transform = "translateX(" + -cameraX * 0.28 + "px)";
  }

  if (parallaxStrip) {
    parallaxStrip.style.transform = "translateX(" + -cameraX * 0.42 + "px)";
  }
}

function stopGameLoop() {
  gameRunning = false;
  cancelAnimationFrame(animationFrameId);
  runner.classList.remove("running");
  runner.classList.remove("jumping");
}

function winGame() {
  stopGameLoop();
  const isNewBest = maybeRecordBestScore();
  updateHud();
  setMessage("Flag reached! Final score: " + score + "." + (isNewBest ? " New record!" : ""), 2000);
}

function startGame() {
  score = 0;
  gameRunning = true;
  lastFrameTime = 0;
  cameraX = 0;
  elapsedTime = 0;
  timePenaltyApplied = 0;
  critterHitCooldown = 0;
  flashScore(0);

  runnerState.x = 96;
  runnerState.y = 0;
  runnerState.velocityY = 0;
  runnerState.onGround = true;

  buildLevel();
  updateCamera();
  updateHud();
  renderScene();
  runner.classList.remove("jumping");
  setMessage("");
  cancelAnimationFrame(animationFrameId);

  animationFrameId = requestAnimationFrame(gameLoop);
}

function startGameIfNeeded() {
  if (gameRunning) {
    return false;
  }

  startGame();
  return true;
}

function jump() {
  startGameIfNeeded();

  if (runnerState.onGround === false) {
    return;
  }

  runnerState.velocityY = jumpPower;
  runnerState.onGround = false;
  runner.classList.add("jumping");
}

function applyTimePenalty() {
  const nextPenalty = Math.floor(Math.max(0, elapsedTime - 20));
  const penaltyDelta = nextPenalty - timePenaltyApplied;

  if (penaltyDelta <= 0) {
    return;
  }

  timePenaltyApplied = nextPenalty;
  adjustScore(-penaltyDelta);
}

function getRunnerBounds(nextX, nextY) {
  return {
    left: nextX + 6,
    right: nextX + runnerWidth - 6,
    bottom: groundHeight + nextY,
    top: groundHeight + nextY + runnerHeight,
  };
}

function overlaps(boundsA, boundsB) {
  return (
    boundsA.left < boundsB.right &&
    boundsA.right > boundsB.left &&
    boundsA.bottom < boundsB.top &&
    boundsA.top > boundsB.bottom
  );
}

function getObstacleBounds(obstacle) {
  return {
    left: obstacle.x,
    right: obstacle.x + obstacle.width,
    bottom: groundHeight,
    top: groundHeight + obstacle.height,
  };
}

function resolveHorizontalMovement(horizontalMove) {
  if (horizontalMove === 0) {
    return;
  }

  const currentBounds = getRunnerBounds(runnerState.x, runnerState.y);
  let nextX = runnerState.x + horizontalMove;
  nextX = Math.max(0, Math.min(levelLength, nextX));

  obstacles.forEach(function (obstacle) {
    if (obstacle.type !== "pipe" || obstacle.defeated) {
      return;
    }

    const runnerBounds = getRunnerBounds(nextX, runnerState.y);
    const obstacleBounds = getObstacleBounds(obstacle);
    const currentFeet = currentBounds.bottom;
    const isOnTopOfPipe =
      currentFeet >= obstacleBounds.top - 8 &&
      currentBounds.right > obstacleBounds.left + 8 &&
      currentBounds.left < obstacleBounds.right - 8;

    if (overlaps(runnerBounds, obstacleBounds) && isOnTopOfPipe === false) {
      const runnerCenter = (currentBounds.left + currentBounds.right) / 2;
      const obstacleCenter = (obstacleBounds.left + obstacleBounds.right) / 2;

      if (runnerCenter <= obstacleCenter) {
        nextX = obstacle.x - (runnerWidth - 6);
      } else {
        nextX = obstacle.x + obstacle.width - 6;
      }
    }
  });

  runnerState.x = Math.max(0, Math.min(levelLength, nextX));
}

function resolveVerticalMovement() {
  const previousBottom = groundHeight + runnerState.y;
  runnerState.velocityY = runnerState.velocityY - gravity;
  let nextY = runnerState.y + runnerState.velocityY;
  runnerState.onGround = false;

  if (nextY <= 0) {
    nextY = 0;
    runnerState.velocityY = 0;
    runnerState.onGround = true;
  }

  const runnerBounds = getRunnerBounds(runnerState.x, nextY);

  obstacles.forEach(function (obstacle) {
    if (obstacle.type !== "pipe" || obstacle.defeated) {
      return;
    }

    const obstacleBounds = getObstacleBounds(obstacle);

    const crossingTop =
      runnerState.velocityY <= 0 &&
      previousBottom >= obstacleBounds.top &&
      runnerBounds.bottom <= obstacleBounds.top &&
      runnerBounds.right > obstacleBounds.left + 8 &&
      runnerBounds.left < obstacleBounds.right - 8;

    if (crossingTop) {
      nextY = obstacle.height;
      runnerState.velocityY = 0;
      runnerState.onGround = true;
    }

    const standingOnTop =
      runnerState.velocityY <= 0 &&
      Math.abs(previousBottom - obstacleBounds.top) <= 8 &&
      runnerBounds.right > obstacleBounds.left + 8 &&
      runnerBounds.left < obstacleBounds.right - 8;

    if (standingOnTop) {
      nextY = obstacle.height;
      runnerState.velocityY = 0;
      runnerState.onGround = true;
    }
  });

  runnerState.y = nextY;

  if (runnerState.onGround) {
    runner.classList.remove("jumping");
  }
}

function updateRunner(frameScale) {
  const horizontalInput = (controls.right ? 1 : 0) - (controls.left ? 1 : 0);
  const horizontalMove = horizontalInput * moveSpeed * frameScale;

  resolveHorizontalMovement(horizontalMove);
  resolveVerticalMovement();

  if (gameRunning) {
    if (horizontalInput !== 0) {
      runner.classList.add("running");
    } else {
      runner.classList.remove("running");
    }
  }
}

function updateCamera() {
  const visibleWorldWidth = getVisibleWorldWidth();
  const maxCamera = Math.max(0, levelLength - visibleWorldWidth + 120);
  const targetCamera = runnerState.x - (visibleWorldWidth - runnerWidth) / 2;
  cameraX = Math.max(0, Math.min(maxCamera, targetCamera));
}

function updateCoins() {
  const runnerBounds = getRunnerBounds(runnerState.x, runnerState.y);

  coins.forEach(function (coin) {
    if (coin.collected) {
      return;
    }

    const coinBounds = {
      left: coin.x,
      right: coin.x + coin.width,
      bottom: groundHeight + coin.y,
      top: groundHeight + coin.y + coin.height,
    };

    if (overlaps(runnerBounds, coinBounds)) {
      coin.collected = true;
      coin.element.style.display = "none";
      adjustScore(1);
    }
  });
}

function updateCritters(frameScale) {
  obstacles.forEach(function (obstacle) {
    if (obstacle.type !== "critter" || obstacle.defeated) {
      return;
    }

    obstacle.x = obstacle.x + obstacle.direction * obstacle.speed * frameScale;

    if (obstacle.x <= obstacle.minX) {
      obstacle.x = obstacle.minX;
      obstacle.direction = 1;
    }

    if (obstacle.x >= obstacle.maxX) {
      obstacle.x = obstacle.maxX;
      obstacle.direction = -1;
    }
  });
}

function updateCritterCollisions() {
  const runnerBounds = getRunnerBounds(runnerState.x, runnerState.y);
  const previousBottom = groundHeight + runnerState.y - runnerState.velocityY;

  for (const obstacle of obstacles) {
    if (obstacle.type !== "critter" || obstacle.defeated) {
      continue;
    }

    const obstacleBounds = {
      left: obstacle.x + 8,
      right: obstacle.x + obstacle.width - 8,
      bottom: groundHeight + 6,
      top: groundHeight + obstacle.height - 4,
    };

    if (overlaps(runnerBounds, obstacleBounds)) {
      const horizontalOverlap =
        Math.min(runnerBounds.right, obstacleBounds.right) - Math.max(runnerBounds.left, obstacleBounds.left);
      const stompWindowTop = obstacleBounds.top + 24;
      const stompedCritter =
        runnerState.velocityY < 0 &&
        horizontalOverlap >= 6 &&
        previousBottom >= obstacleBounds.top - 4 &&
        runnerBounds.bottom <= stompWindowTop;

      if (stompedCritter) {
        obstacle.defeated = true;
        obstacle.element.style.display = "none";
        runnerState.velocityY = jumpPower * 0.55;
        runnerState.onGround = false;
        runner.classList.add("jumping");
        setMessage("Nice stomp!", 2000);
        continue;
      }

      const critterHitRunner =
        runnerState.onGround &&
        Math.abs(runnerState.velocityY) < 0.01 &&
        horizontalOverlap >= 14;

      if (critterHitRunner && critterHitCooldown <= 0) {
        critterHitCooldown = 1.1;
        adjustScore(-5);
        runnerState.velocityY = jumpPower * 0.28;
        runnerState.onGround = false;
        runner.classList.add("jumping");
        setMessage("Ouch! -5 coins.", 2000);
      }
    }
  }
}

function checkWinCondition() {
  if (runnerState.x + runnerWidth >= levelLength + 24) {
    winGame();
  }
}

function gameLoop(timestamp) {
  if (gameRunning === false) {
    return;
  }

  if (lastFrameTime === 0) {
    lastFrameTime = timestamp;
  }

  const deltaTime = timestamp - lastFrameTime;
  const frameScale = Math.min(2.2, deltaTime / 16.67);
  lastFrameTime = timestamp;
  elapsedTime = elapsedTime + deltaTime / 1000;
  critterHitCooldown = Math.max(0, critterHitCooldown - deltaTime / 1000);

  updateRunner(frameScale);
  updateCritters(frameScale);
  updateCoins();
  applyTimePenalty();

  if (gameRunning === false) {
    return;
  }

  updateCritterCollisions();

  if (gameRunning === false) {
    return;
  }

  updateCamera();
  renderScene();
  updateHud();
  checkWinCondition();
  animationFrameId = requestAnimationFrame(gameLoop);
}

function handleKeyDown(event) {
  if (event.code === "ArrowLeft") {
    event.preventDefault();
    keyboardControls.left = true;
    syncDirectionalControls();
    startGameIfNeeded();
    return;
  }

  if (event.code === "ArrowRight") {
    event.preventDefault();
    keyboardControls.right = true;
    syncDirectionalControls();
    startGameIfNeeded();
    return;
  }

  if (event.code === "Space" || event.code === "ArrowUp") {
    event.preventDefault();
    jump();
  }
}

function handleKeyUp(event) {
  if (event.code === "ArrowLeft") {
    keyboardControls.left = false;
    syncDirectionalControls();
  }

  if (event.code === "ArrowRight") {
    keyboardControls.right = false;
    syncDirectionalControls();
  }
}

function handlePointerJump(event) {
  if (event.cancelable) {
    event.preventDefault();
  }

  jump();
}

function syncDirectionalControls() {
  controls.left = keyboardControls.left || activeTouchControls.left.size > 0;
  controls.right = keyboardControls.right || activeTouchControls.right.size > 0;
}

function setButtonPressed(control, isPressed) {
  const button = controlButtonMap[control];

  if (!button) {
    return;
  }

  button.classList.toggle("pressed", isPressed);
}

function resetTouchControls() {
  activeTouchControls.left.clear();
  activeTouchControls.right.clear();
  activeJumpInputs.clear();
  setButtonPressed("left", false);
  setButtonPressed("right", false);
  setButtonPressed("jump", false);
  syncDirectionalControls();
}

function pressControl(control, inputId) {
  if (control === "jump") {
    activeJumpInputs.add(inputId);
    setButtonPressed("jump", true);
    jump();
    return;
  }

  if (control !== "left" && control !== "right") {
    return;
  }

  activeTouchControls[control].add(inputId);
  setButtonPressed(control, true);
  syncDirectionalControls();
  startGameIfNeeded();
}

function releaseControl(control, inputId) {
  if (control === "jump") {
    activeJumpInputs.delete(inputId);
    setButtonPressed("jump", activeJumpInputs.size > 0);
    return;
  }

  if (control !== "left" && control !== "right") {
    return;
  }

  activeTouchControls[control].delete(inputId);
  setButtonPressed(control, activeTouchControls[control].size > 0);
  syncDirectionalControls();
}

function getMouseInputId(control) {
  return "mouse-" + control;
}

function handleControlTouchStart(event) {
  if (event.cancelable) {
    event.preventDefault();
  }

  const control = event.currentTarget.dataset.control;

  Array.from(event.changedTouches).forEach(function (touch) {
    pressControl(control, "touch-" + touch.identifier);
  });
}

function handleControlTouchEnd(event) {
  if (event.cancelable) {
    event.preventDefault();
  }

  const control = event.currentTarget.dataset.control;

  Array.from(event.changedTouches).forEach(function (touch) {
    releaseControl(control, "touch-" + touch.identifier);
  });
}

function handleControlMouseDown(event) {
  if (event.cancelable) {
    event.preventDefault();
  }

  pressControl(event.currentTarget.dataset.control, getMouseInputId(event.currentTarget.dataset.control));
}

function handleControlMouseUp(event) {
  releaseControl(event.currentTarget.dataset.control, getMouseInputId(event.currentTarget.dataset.control));
}

function handleControlMouseLeave(event) {
  if (event.buttons !== 1) {
    return;
  }

  releaseControl(event.currentTarget.dataset.control, getMouseInputId(event.currentTarget.dataset.control));
}

function handleWindowBlur() {
  keyboardControls.left = false;
  keyboardControls.right = false;
  resetTouchControls();
}

window.addEventListener("keydown", handleKeyDown);
window.addEventListener("keyup", handleKeyUp);
window.addEventListener("blur", handleWindowBlur);
gameArea.addEventListener("pointerdown", handlePointerJump);
controlButtons.forEach(function (button) {
  button.addEventListener("touchstart", handleControlTouchStart, { passive: false });
  button.addEventListener("touchend", handleControlTouchEnd, { passive: false });
  button.addEventListener("touchcancel", handleControlTouchEnd, { passive: false });
  button.addEventListener("mousedown", handleControlMouseDown);
  button.addEventListener("mouseup", handleControlMouseUp);
  button.addEventListener("mouseleave", handleControlMouseLeave);
});

buildLevel();
updateCamera();
updateHud();
renderScene();
setMessage("Move left, right, or jump to start the run.");
