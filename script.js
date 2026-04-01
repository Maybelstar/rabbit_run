const scoreDisplay = document.getElementById("score");
const highScoreDisplay = document.getElementById("high-score");
const timerDisplay = document.getElementById("timer");
const distanceDisplay = document.getElementById("distance");
const gameArea = document.getElementById("game-area");
const coinsLayer = document.getElementById("coins-layer");
const obstaclesLayer = document.getElementById("obstacles-layer");
const finishFlag = document.getElementById("finish-flag");
const runner = document.getElementById("runner");
const message = document.getElementById("message");
const startButton = document.getElementById("start-button");
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
const levelLength = 3200;
const cameraLead = 220;

let score = 0;
let bestScore = loadBestScore();
let bestPlayerName = loadBestPlayerName();
let gameRunning = false;
let animationFrameId;
let lastFrameTime = 0;
let cameraX = 0;
let elapsedTime = 0;

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
  highScoreDisplay.textContent = "High score: " + bestScore + " by " + bestPlayerName;
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

  const coinPositions = [
    [360, 60],
    [430, 95],
    [520, 120],
    [760, 60],
    [880, 138],
    [980, 138],
    [1080, 60],
    [1300, 100],
    [1380, 140],
    [1560, 70],
    [1700, 120],
    [1840, 70],
    [2040, 110],
    [2160, 150],
    [2340, 90],
    [2520, 130],
    [2710, 70],
    [2890, 120],
  ];

  const obstacleLayout = [
    { type: "pipe", x: 620 },
    { type: "critter", x: 840 },
    { type: "pipe", x: 1120 },
    { type: "pipe", x: 1480 },
    { type: "critter", x: 1660 },
    { type: "pipe", x: 1960 },
    { type: "critter", x: 2270 },
    { type: "pipe", x: 2590 },
    { type: "critter", x: 2830 },
  ];

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
  coins.forEach(function (coin) {
    if (coin.collected) {
      return;
    }

    const screenX = coin.x - cameraX;
    coin.element.style.left = screenX + "px";
    coin.element.style.bottom = groundHeight + coin.y + "px";
    coin.element.style.display = screenX < -coin.width || screenX > gameArea.clientWidth ? "none" : "block";
  });
}

function renderObstacles() {
  obstacles.forEach(function (obstacle) {
    const screenX = obstacle.x - cameraX;
    if (obstacle.defeated) {
      obstacle.element.style.display = "none";
      return;
    }

    obstacle.element.style.left = screenX + "px";
    obstacle.element.style.display =
      screenX < -obstacle.width || screenX > gameArea.clientWidth ? "none" : "block";

    if (obstacle.type === "critter") {
      obstacle.element.style.transform = obstacle.direction < 0 ? "scaleX(-1)" : "scaleX(1)";
    }
  });
}

function renderFinishFlag() {
  const screenLeft = levelLength - cameraX;
  finishFlag.style.left = screenLeft + "px";
  finishFlag.style.right = "auto";
  finishFlag.style.display = screenLeft < -80 || screenLeft > gameArea.clientWidth + 80 ? "none" : "block";
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

function loseGame(text) {
  stopGameLoop();
  const isNewBest = maybeRecordBestScore();
  message.textContent = text + " Score: " + score + "." + (isNewBest ? " New record!" : "");
  updateHud();
}

function winGame() {
  stopGameLoop();
  const speedBonus = Math.max(0, Math.round(900 - elapsedTime * 15));
  score = score + speedBonus;
  const isNewBest = maybeRecordBestScore();
  updateHud();
  message.textContent =
    "Flag reached! Speed bonus: " + speedBonus + ". Final score: " + score + "." + (isNewBest ? " New record!" : "");
}

function startGame() {
  score = 0;
  gameRunning = true;
  lastFrameTime = 0;
  cameraX = 0;
  elapsedTime = 0;
  keyboardControls.left = false;
  keyboardControls.right = false;
  resetTouchControls();

  runnerState.x = 96;
  runnerState.y = 0;
  runnerState.velocityY = 0;
  runnerState.onGround = true;

  buildLevel();
  updateHud();
  renderScene();
  runner.classList.remove("jumping");
  message.textContent = "Move fast for a bonus, but collect coins on the way.";
  startButton.textContent = "Restart Run";
  cancelAnimationFrame(animationFrameId);

  animationFrameId = requestAnimationFrame(gameLoop);
}

function jump() {
  if (gameRunning === false || runnerState.onGround === false) {
    return;
  }

  runnerState.velocityY = jumpPower;
  runnerState.onGround = false;
  runner.classList.add("jumping");
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
  const maxCamera = Math.max(0, levelLength - gameArea.clientWidth + 120);
  const targetCamera = runnerState.x - cameraLead;
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
      score = score + 10;
      updateHud();
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
        score = score + 20;
        message.textContent = "Nice stomp! +2 coins.";
        updateHud();
        continue;
      }

      const walkingIntoCritter =
        runnerState.onGround &&
        Math.abs(runnerState.velocityY) < 0.01 &&
        horizontalOverlap >= 14 &&
        (controls.left || controls.right);

      if (walkingIntoCritter) {
        loseGame("A roaming critter knocked you out");
        return;
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

  updateRunner(frameScale);
  updateCritters(frameScale);
  updateCoins();

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
    return;
  }

  if (event.code === "ArrowRight") {
    event.preventDefault();
    keyboardControls.right = true;
    syncDirectionalControls();
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

startButton.addEventListener("click", startGame);
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

updateHud();
renderScene();
