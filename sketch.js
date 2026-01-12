let score = 0;
let clicks = 0;
let startTime;
let targetX, targetY;
let targetSize = 50;
let scoreTexts = []; // For score animation

function setup() {
    pixelDensity(1); // Disable high DPI scaling for consistent sizing
    let canvas = createCanvas(windowWidth, windowHeight);
    canvas.parent('game-container');
    startTime = millis();
    targetX = random(width);
    targetY = random(height);

    // Reset button event listener
    document.getElementById('reset').addEventListener('click', resetGame);
}

function draw() {
    // Simple gradient background for performance
    background(135, 206, 235);
    for (let y = 0; y < height; y += 10) {
        let inter = map(y, 0, height, 0, 1);
        let c = lerpColor(color(135, 206, 235), color(25, 25, 112), inter);
        stroke(c);
        line(0, y, width, y);
    }

    // Pulsing effect for target
    let pulse = 1 + 0.2 * sin(frameCount * 0.1);
    let currentSize = targetSize * pulse;

    // Draw target with glow effect
    noStroke();
    fill(255, 100, 100, 150);
    ellipse(targetX, targetY, currentSize * 1.2, currentSize * 1.2);
    fill(255, 0, 0);
    ellipse(targetX, targetY, currentSize, currentSize);

    // Draw score texts
    for (let i = scoreTexts.length - 1; i >= 0; i--) {
        let txt = scoreTexts[i];
        txt.y -= 2;
        txt.alpha -= 5;
        fill(255, 255, 0, txt.alpha);
        textSize(24);
        text('+1', txt.x, txt.y);
        if (txt.alpha <= 0) {
            scoreTexts.splice(i, 1);
        }
    }

    // Update KPIs
    document.getElementById('score').innerText = score;
    document.getElementById('time').innerText = floor((millis() - startTime) / 1000);
    document.getElementById('clicks').innerText = clicks;
}

function mousePressed() {
    clicks++;
    let d = dist(mouseX, mouseY, targetX, targetY);
    if (d < targetSize / 2) {
        score++;
        // Add score animation
        scoreTexts.push({ x: mouseX, y: mouseY, alpha: 255 });
        // Move target to new random position
        targetX = random(width);
        targetY = random(height);
    }
}

function resetGame() {
    score = 0;
    clicks = 0;
    startTime = millis();
    targetX = random(width);
    targetY = random(height);
    scoreTexts = [];
}

function windowResized() {
    resizeCanvas(windowWidth, windowHeight);
    // Reposition target if out of bounds
    if (targetX > width) targetX = random(width);
    if (targetY > height) targetY = random(height);
}