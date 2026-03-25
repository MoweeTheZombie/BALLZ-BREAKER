const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const roundValue = document.getElementById("roundValue");
const scoreValue = document.getElementById("scoreValue");
const ballCountValue = document.getElementById("ballCountValue");
const startOverlay = document.getElementById("startOverlay");
const gameOverOverlay = document.getElementById("gameOverOverlay");
const gameOverText = document.getElementById("gameOverText");
const startButton = document.getElementById("startButton");
const restartButton = document.getElementById("restartButton");

const GAME = {
  width: canvas.width,
  height: canvas.height,
  columns: 7,
  topPadding: 92,
  sidePadding: 18,
  launchY: canvas.height - 42,
  ballRadius: 7,
  ballSpeed: 640,
  launchSpacingMs: 70,
  bonusRadius: 10,
  minAimY: canvas.height * 0.3
};

const state = {
  running: false,
  gameOver: false,
  aiming: false,
  turnActive: false,
  pointer: null,
  round: 1,
  score: 0,
  ballCount: 1,
  launchOriginX: GAME.width / 2,
  nextLaunchOriginX: GAME.width / 2,
  pendingShots: 0,
  launchAccumulator: 0,
  aimDirection: null,
  balls: [],
  bricks: [],
  bonuses: [],
  recoveredBalls: 0
};

function createBall(x, y, vx, vy) {
  return {
    x,
    y,
    vx,
    vy,
    active: true
  };
}

function resetState() {
  state.running = false;
  state.gameOver = false;
  state.aiming = false;
  state.turnActive = false;
  state.pointer = null;
  state.round = 1;
  state.score = 0;
  state.ballCount = 1;
  state.launchOriginX = GAME.width / 2;
  state.nextLaunchOriginX = GAME.width / 2;
  state.pendingShots = 0;
  state.launchAccumulator = 0;
  state.aimDirection = null;
  state.balls = [];
  state.bricks = [];
  state.bonuses = [];
  state.recoveredBalls = 0;
  seedInitialRows();
  syncHud();
}

function seedInitialRows() {
  spawnRow();
  spawnRow();
}

function syncHud() {
  roundValue.textContent = state.round;
  scoreValue.textContent = state.score;
  ballCountValue.textContent = state.ballCount;
}

function getCellSize() {
  return (GAME.width - GAME.sidePadding * 2) / GAME.columns;
}

function spawnRow() {
  const size = getCellSize();
  const rowY = GAME.topPadding;

  for (const brick of state.bricks) {
    brick.y += size;
  }
  for (const bonus of state.bonuses) {
    bonus.y += size;
  }

  const guaranteedColumn = Math.floor(Math.random() * GAME.columns);
  let createdBrick = false;

  for (let column = 0; column < GAME.columns; column += 1) {
    const roll = Math.random();
    const forceBrick = column === guaranteedColumn && !createdBrick;
    if (roll < 0.58 || forceBrick) {
      const hp = Math.max(1, Math.floor(state.round + Math.random() * (state.round * 0.65 + 1)));
      state.bricks.push({
        x: GAME.sidePadding + column * size + 4,
        y: rowY + 4,
        size: size - 8,
        hp
      });
      createdBrick = true;
    } else if (roll < 0.74) {
      state.bonuses.push({
        x: GAME.sidePadding + column * size + size / 2,
        y: rowY + size / 2,
        claimed: false
      });
    }
  }
}

function startGame() {
  resetState();
  startOverlay.classList.add("hidden");
  gameOverOverlay.classList.add("hidden");
  state.running = true;
}

function endGame() {
  state.running = false;
  state.gameOver = true;
  gameOverText.textContent = `You made it to round ${state.round} with a score of ${state.score}.`;
  gameOverOverlay.classList.remove("hidden");
}

function beginAim(point) {
  if (!state.running || state.pendingShots > 0 || state.balls.length > 0) {
    return;
  }
  state.aiming = true;
  state.pointer = point;
}

function updateAim(point) {
  if (!state.aiming) {
    return;
  }
  state.pointer = point;
}

function releaseAim(point) {
  if (!state.aiming) {
    return;
  }

  state.pointer = point;
  state.aiming = false;
  const dx = point.x - state.launchOriginX;
  const dy = point.y - GAME.launchY;
  const length = Math.hypot(dx, dy);

  if (length < 12 || dy > -10) {
    return;
  }

  state.aimDirection = { x: dx / length, y: dy / length };
  state.pendingShots = state.ballCount;
  state.launchAccumulator = 0;
  state.recoveredBalls = 0;
  state.turnActive = true;
}

function getPointFromEvent(event) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = GAME.width / rect.width;
  const scaleY = GAME.height / rect.height;
  const source = event.touches ? event.touches[0] || event.changedTouches[0] : event;
  return {
    x: (source.clientX - rect.left) * scaleX,
    y: (source.clientY - rect.top) * scaleY
  };
}

function launchBall() {
  if (!state.aimDirection) {
    return;
  }
  state.balls.push(
    createBall(
      state.launchOriginX,
      GAME.launchY,
      state.aimDirection.x * GAME.ballSpeed,
      state.aimDirection.y * GAME.ballSpeed
    )
  );
}

function advanceRound() {
  state.round += 1;
  state.launchOriginX = state.nextLaunchOriginX;
  spawnRow();

  const bottomLimit = GAME.launchY - getCellSize() * 0.5;
  if (state.bricks.some((brick) => brick.y + brick.size >= bottomLimit)) {
    endGame();
    return;
  }

  syncHud();
}

function update(dt) {
  if (!state.running) {
    return;
  }

  if (state.pendingShots > 0) {
    state.launchAccumulator += dt * 1000;
    while (state.pendingShots > 0 && state.launchAccumulator >= GAME.launchSpacingMs) {
      state.launchAccumulator -= GAME.launchSpacingMs;
      state.pendingShots -= 1;
      launchBall();
    }
  }

  const bottomY = GAME.launchY;
  const activeBalls = [];

  for (const ball of state.balls) {
    if (!ball.active) {
      continue;
    }

    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    if (ball.x <= GAME.ballRadius) {
      ball.x = GAME.ballRadius;
      ball.vx *= -1;
    } else if (ball.x >= GAME.width - GAME.ballRadius) {
      ball.x = GAME.width - GAME.ballRadius;
      ball.vx *= -1;
    }

    if (ball.y <= GAME.ballRadius) {
      ball.y = GAME.ballRadius;
      ball.vy *= -1;
    }

    for (const brick of state.bricks) {
      if (circleRectCollision(ball.x, ball.y, GAME.ballRadius, brick)) {
        resolveBrickBounce(ball, brick);
        brick.hp -= 1;
        state.score += 1;
        break;
      }
    }

    for (const bonus of state.bonuses) {
      if (!bonus.claimed && distance(ball.x, ball.y, bonus.x, bonus.y) <= GAME.ballRadius + GAME.bonusRadius) {
        bonus.claimed = true;
        state.ballCount += 1;
      }
    }

    if (ball.y >= bottomY) {
      ball.active = false;
      ball.y = bottomY;
      state.recoveredBalls += 1;
      if (state.recoveredBalls === 1) {
        state.nextLaunchOriginX = clamp(ball.x, GAME.ballRadius, GAME.width - GAME.ballRadius);
      }
    } else {
      activeBalls.push(ball);
    }
  }

  state.balls = activeBalls;
  state.bricks = state.bricks.filter((brick) => brick.hp > 0);
  state.bonuses = state.bonuses.filter((bonus) => !bonus.claimed);
  syncHud();

  if (state.turnActive && state.pendingShots === 0 && state.balls.length === 0) {
    state.turnActive = false;
    advanceRound();
  }
}

function circleRectCollision(cx, cy, radius, rect) {
  const nearestX = clamp(cx, rect.x, rect.x + rect.size);
  const nearestY = clamp(cy, rect.y, rect.y + rect.size);
  return distance(cx, cy, nearestX, nearestY) <= radius;
}

function resolveBrickBounce(ball, brick) {
  const leftDist = Math.abs(ball.x - brick.x);
  const rightDist = Math.abs(ball.x - (brick.x + brick.size));
  const topDist = Math.abs(ball.y - brick.y);
  const bottomDist = Math.abs(ball.y - (brick.y + brick.size));
  const minDist = Math.min(leftDist, rightDist, topDist, bottomDist);

  if (minDist === leftDist || minDist === rightDist) {
    ball.vx *= -1;
  } else {
    ball.vy *= -1;
  }
}

function draw() {
  ctx.clearRect(0, 0, GAME.width, GAME.height);
  drawBackground();
  drawGuide();
  drawBonuses();
  drawBricks();
  drawBalls();
  drawLauncher();
}

function drawBackground() {
  const gradient = ctx.createLinearGradient(0, 0, 0, GAME.height);
  gradient.addColorStop(0, "rgba(80, 255, 230, 0.08)");
  gradient.addColorStop(0.3, "rgba(255,255,255,0.02)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, GAME.width, GAME.height);

  ctx.strokeStyle = "rgba(64, 242, 255, 0.08)";
  ctx.lineWidth = 1;
  const cellSize = getCellSize();
  for (let x = GAME.sidePadding; x <= GAME.width - GAME.sidePadding; x += cellSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, GAME.height);
    ctx.stroke();
  }
}

function drawGuide() {
  if (!state.aiming || !state.pointer) {
    return;
  }

  const dx = state.pointer.x - state.launchOriginX;
  const dy = state.pointer.y - GAME.launchY;
  const length = Math.hypot(dx, dy);
  if (length < 12 || dy > -10 || state.pointer.y > GAME.minAimY) {
    return;
  }

  const dirX = dx / length;
  const dirY = dy / length;
  ctx.save();
  ctx.strokeStyle = "rgba(104, 255, 250, 0.95)";
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 8]);
  ctx.shadowColor = "rgba(71, 247, 255, 0.6)";
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.moveTo(state.launchOriginX, GAME.launchY);
  ctx.lineTo(state.launchOriginX + dirX * 220, GAME.launchY + dirY * 220);
  ctx.stroke();
  ctx.restore();
}

function drawLauncher() {
  ctx.beginPath();
  ctx.fillStyle = "#f7fbff";
  ctx.shadowColor = "rgba(255,255,255,0.7)";
  ctx.shadowBlur = 14;
  ctx.arc(state.launchOriginX, GAME.launchY, GAME.ballRadius + 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
}

function drawBalls() {
  for (const ball of state.balls) {
    ctx.beginPath();
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = "rgba(120, 255, 255, 0.75)";
    ctx.shadowBlur = 14;
    ctx.arc(ball.x, ball.y, GAME.ballRadius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
}

function drawBricks() {
  for (const brick of state.bricks) {
    const colors = getBrickColors(brick.hp);
    ctx.shadowColor = colors.glow;
    ctx.shadowBlur = 22;
    ctx.fillStyle = colors.fill;
    roundRect(ctx, brick.x, brick.y, brick.size, brick.size, 16);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.lineWidth = 2;
    ctx.strokeStyle = colors.edge;
    roundRect(ctx, brick.x, brick.y, brick.size, brick.size, 16);
    ctx.stroke();

    const shine = ctx.createLinearGradient(brick.x, brick.y, brick.x, brick.y + brick.size);
    shine.addColorStop(0, colors.highlight);
    shine.addColorStop(1, "rgba(255,255,255,0.02)");
    ctx.fillStyle = shine;
    roundRect(ctx, brick.x + 2, brick.y + 2, brick.size - 4, brick.size - 4, 14);
    ctx.fill();

    ctx.fillStyle = "#eefcff";
    ctx.font = "bold 24px Trebuchet MS";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = colors.glow;
    ctx.shadowBlur = 14;
    ctx.fillText(String(brick.hp), brick.x + brick.size / 2, brick.y + brick.size / 2 + 1);
    ctx.shadowBlur = 0;
  }
}

function drawBonuses() {
  for (const bonus of state.bonuses) {
    ctx.beginPath();
    ctx.fillStyle = "#0ef7ff";
    ctx.shadowColor = "rgba(14, 247, 255, 0.75)";
    ctx.shadowBlur = 18;
    ctx.arc(bonus.x, bonus.y, GAME.bonusRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bonus.x - 5, bonus.y);
    ctx.lineTo(bonus.x + 5, bonus.y);
    ctx.moveTo(bonus.x, bonus.y - 5);
    ctx.lineTo(bonus.x, bonus.y + 5);
    ctx.stroke();
  }
}

function getBrickColors(hp) {
  if (hp >= 18) {
    return {
      fill: "rgba(255, 58, 110, 0.9)",
      edge: "rgba(255, 162, 191, 0.95)",
      glow: "rgba(255, 58, 110, 0.55)",
      highlight: "rgba(255, 210, 225, 0.24)"
    };
  }

  if (hp >= 12) {
    return {
      fill: "rgba(255, 132, 46, 0.9)",
      edge: "rgba(255, 216, 168, 0.95)",
      glow: "rgba(255, 132, 46, 0.52)",
      highlight: "rgba(255, 240, 214, 0.22)"
    };
  }

  if (hp >= 7) {
    return {
      fill: "rgba(168, 255, 77, 0.88)",
      edge: "rgba(228, 255, 194, 0.92)",
      glow: "rgba(168, 255, 77, 0.45)",
      highlight: "rgba(245, 255, 225, 0.2)"
    };
  }

  return {
    fill: "rgba(25, 242, 255, 0.86)",
    edge: "rgba(193, 253, 255, 0.96)",
    glow: "rgba(25, 242, 255, 0.48)",
    highlight: "rgba(225, 255, 255, 0.18)"
  };
}

function roundRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

function distance(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

let lastFrame = performance.now();
function frame(now) {
  const dt = Math.min(0.02, (now - lastFrame) / 1000);
  lastFrame = now;
  update(dt);
  draw();
  requestAnimationFrame(frame);
}

canvas.addEventListener("mousedown", (event) => beginAim(getPointFromEvent(event)));
canvas.addEventListener("mousemove", (event) => updateAim(getPointFromEvent(event)));
window.addEventListener("mouseup", (event) => releaseAim(getPointFromEvent(event)));

canvas.addEventListener("touchstart", (event) => {
  event.preventDefault();
  beginAim(getPointFromEvent(event));
}, { passive: false });

canvas.addEventListener("touchmove", (event) => {
  event.preventDefault();
  updateAim(getPointFromEvent(event));
}, { passive: false });

canvas.addEventListener("touchend", (event) => {
  event.preventDefault();
  releaseAim(getPointFromEvent(event));
}, { passive: false });

startButton.addEventListener("click", startGame);
restartButton.addEventListener("click", startGame);

resetState();
draw();
requestAnimationFrame(frame);
