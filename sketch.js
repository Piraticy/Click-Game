let score = 0;
let clicks = 0;
let startTime;
let targetX, targetY;
let targetSize = 50;
let scoreTexts = []; // For score animation
let particles = []; // click particles
let gameDuration = 60; // seconds for progress bar demo

function setup() {
    pixelDensity(1); // Disable high DPI scaling for consistent sizing
    // Size the canvas to the play-area container so the game lives inside the rectangle
    let play = document.getElementById('play-area');
    let pw = play ? play.clientWidth : windowWidth;
    let ph = play ? play.clientHeight : windowHeight;
    let canvas = createCanvas(pw, ph);
    canvas.parent('play-area');
    startTime = millis();
    // Scale target size with play-area size for better UX on small/large screens
    targetSize = max(26, floor(min(width, height) * 0.06));
    // place target within the play area
    targetX = random(targetSize, width - targetSize);
    targetY = random(targetSize + 60, height - targetSize - 40);

    // Reset button event listener
    document.getElementById('reset').addEventListener('click', resetGame);

    // Improve text rendering
    textFont('Inter, Arial');
}

function draw() {
    // Clear canvas so CSS background shows through (remove lines)
    clear();

    // Pulsing effect for target
    let pulse = 1 + 0.2 * sin(frameCount * 0.1);
    let currentSize = targetSize * pulse;

        // Draw target with layered glow + ring for a modern game look
        noStroke();
        for (let i = 6; i >= 1; i--) {
            let alpha = map(i, 6, 1, 20, 160);
            fill(255, 110, 110, alpha * 0.7);
            ellipse(targetX, targetY, currentSize * (1 + i * 0.15), currentSize * (1 + i * 0.15));
        }
        // core
        fill(255, 60, 60);
        ellipse(targetX, targetY, currentSize, currentSize);
        // ring
        strokeWeight(max(2, targetSize * 0.06));
        stroke(255, 200, 120, 200);
        noFill();
        ellipse(targetX, targetY, currentSize * 1.45, currentSize * 1.45);
        noStroke();

    // Draw score texts
    for (let i = scoreTexts.length - 1; i >= 0; i--) {
        let txt = scoreTexts[i];
        txt.y -= 2;
        txt.alpha -= 5;
        fill(255, 255, 0, txt.alpha);
            textSize(20);
            textAlign(CENTER, CENTER);
            text('+1', txt.x, txt.y);
        if (txt.alpha <= 0) {
            scoreTexts.splice(i, 1);
        }
    }

        // Update and draw particles
        for (let i = particles.length - 1; i >= 0; i--) {
            let p = particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.12; // gravity
            p.alpha -= 6;
            fill(p.col[0], p.col[1], p.col[2], p.alpha);
            noStroke();
            ellipse(p.x, p.y, p.r, p.r);
            if (p.alpha <= 0) particles.splice(i, 1);
        }

    // Update KPIs
    document.getElementById('score').innerText = score;
    document.getElementById('time').innerText = floor((millis() - startTime) / 1000);
    document.getElementById('clicks').innerText = clicks;

        // Update progress bar (based on gameDuration)
        let elapsed = (millis() - startTime) / 1000;
        let pct = constrain((elapsed / gameDuration) * 100, 0, 100);
        let bar = document.getElementById('progressBar');
        if (bar) bar.style.width = pct + '%';
}

function mousePressed() {
    clicks++;
    let d = dist(mouseX, mouseY, targetX, targetY);
    if (d < targetSize / 2) {
        score++;
        // Add score animation
        scoreTexts.push({ x: mouseX, y: mouseY, alpha: 255 });
        // spawn particles at hit
        for (let i = 0; i < 18; i++) {
            let a = random(TWO_PI);
            let s = random(1, 4);
            particles.push({ x: mouseX, y: mouseY, vx: cos(a) * random(1, 6), vy: sin(a) * random(-4, -1), r: random(3, 7), alpha: 255, col: [255, random(180,220), 80] });
        }
        // Move target to new random position (respect HUD/top area)
        targetX = random(targetSize, width - targetSize);
        // leave room at top for title + HUD (approx 160px) and bottom for controls
        targetY = random(targetSize + 160, height - targetSize - 60);
    }
}

function touchStarted() { mousePressed(); }

function resetGame() {
    score = 0;
    clicks = 0;
    startTime = millis();
    // reposition target inside play area
    targetX = random(targetSize, width - targetSize);
    targetY = random(targetSize + 60, height - targetSize - 40);
    scoreTexts = [];
    particles = [];
    // reset progress bar
    let bar = document.getElementById('progressBar');
    if (bar) bar.style.width = '0%';
}

function windowResized() {
    // Resize canvas to match play-area's new size
    let play = document.getElementById('play-area');
    let pw = play ? play.clientWidth : windowWidth;
    let ph = play ? play.clientHeight : windowHeight;
    resizeCanvas(pw, ph);
    // Reposition target if out of bounds
    if (targetX > width) targetX = random(targetSize, width - targetSize);
    if (targetY > height) targetY = random(targetSize + 60, height - targetSize - 40);
    // Recompute target size for new play-area dimensions
    targetSize = max(26, floor(min(width, height) * 0.06));
}