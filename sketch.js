const ROUND_SECONDS = 60;
const MAX_PLAYERS = 4;
const HIGH_SCORE_STORAGE_KEY = "nova-tap-simple-highscores-v1";

const state = {
    phase: "lobby",
    lobbyPlayers: [],
    matchPlayers: [],
    highscores: [],
    currentPlayerIndex: 0,
    score: 0,
    clicks: 0,
    endTime: 0,
    targetX: 0,
    targetY: 0,
    targetSize: 96,
    rafId: null
};

const ui = {};

window.addEventListener("DOMContentLoaded", () => {
    cacheUi();
    bindUi();
    loadHighscores();
    renderHighscores();
    syncLobbyTags();
    renderPlayerBoard();
    updateHud(ROUND_SECONDS);
    setStatus("Type one name and press Start Match.");
    updateOverlay();
    placeTarget(true);
    requestAnimationFrame(updateLobbyActions);
});

function cacheUi() {
    ui.overlay = document.getElementById("overlay");
    ui.overlayKicker = document.getElementById("overlay-kicker");
    ui.overlayTitle = document.getElementById("overlay-title");
    ui.overlayCopy = document.getElementById("overlay-copy");
    ui.playerInput = document.getElementById("player-input");
    ui.nameForm = document.getElementById("name-form");
    ui.playerTags = document.getElementById("player-tags");
    ui.results = document.getElementById("results");
    ui.primaryAction = document.getElementById("primary-action");
    ui.secondaryAction = document.getElementById("secondary-action");
    ui.target = document.getElementById("target");
    ui.arena = document.getElementById("arena");
    ui.players = document.getElementById("players");
    ui.progressBar = document.getElementById("progress-bar");
    ui.statusText = document.getElementById("status-text");
    ui.reset = document.getElementById("reset");
    ui.hudPlayer = document.getElementById("hud-player");
    ui.hudRound = document.getElementById("hud-round");
    ui.hudScore = document.getElementById("hud-score");
    ui.hudClicks = document.getElementById("hud-clicks");
    ui.hudTime = document.getElementById("hud-time");
    ui.highscoreList = document.getElementById("highscore-list");
}

function bindUi() {
    ui.nameForm.addEventListener("submit", (event) => {
        event.preventDefault();
        addPlayer();
    });

    ui.playerInput.addEventListener("input", () => {
        updateLobbyActions();
    });

    ui.playerTags.addEventListener("click", (event) => {
        const remove = event.target.closest("[data-remove-index]");
        if (!remove) {
            return;
        }
        removeLobbyPlayer(Number(remove.dataset.removeIndex));
    });

    ui.primaryAction.addEventListener("click", () => {
        if (state.phase === "lobby") {
            startMatch();
            return;
        }

        if (state.phase === "between") {
            beginTurn(state.currentPlayerIndex);
            return;
        }

        if (state.phase === "results") {
            startMatch();
        }
    });

    ui.secondaryAction.addEventListener("click", () => {
        if (state.phase === "lobby") {
            state.lobbyPlayers = [];
            ui.playerInput.value = "";
            syncLobbyTags();
            setStatus("Lobby cleared.");
            return;
        }

        resetSession();
    });

    ui.reset.addEventListener("click", resetSession);

    ui.target.addEventListener("click", (event) => {
        event.preventDefault();
        if (state.phase !== "playing") {
            return;
        }
        handleHit(true);
    });

    ui.arena.addEventListener("click", (event) => {
        if (state.phase !== "playing") {
            return;
        }
        if (event.target === ui.target) {
            return;
        }

        state.clicks += 1;
        updateHud(getTimeLeft());
        renderPlayerBoard();
    });

    window.addEventListener("resize", () => {
        placeTarget(false);
    });
}

function loadHighscores() {
    try {
        const raw = localStorage.getItem(HIGH_SCORE_STORAGE_KEY);
        state.highscores = raw ? JSON.parse(raw) : [];
    } catch {
        state.highscores = [];
    }
}

function saveHighscores() {
    localStorage.setItem(HIGH_SCORE_STORAGE_KEY, JSON.stringify(state.highscores));
}

function addPlayer() {
    const name = sanitizeName(ui.playerInput.value);
    if (!name) {
        setStatus("Enter a player name first.");
        ui.playerInput.focus();
        return;
    }

    if (state.lobbyPlayers.length >= MAX_PLAYERS) {
        setStatus("The lobby is full.");
        return;
    }

    if (state.lobbyPlayers.some((player) => player.toLowerCase() === name.toLowerCase())) {
        setStatus(`${name} is already in the lobby.`);
        return;
    }

    state.lobbyPlayers.push(name);
    ui.playerInput.value = "";
    syncLobbyTags();
    setStatus(`${name} joined the lobby.`);
}

function removeLobbyPlayer(index) {
    state.lobbyPlayers.splice(index, 1);
    syncLobbyTags();
}

function syncLobbyTags() {
    ui.playerTags.innerHTML = state.lobbyPlayers.map((player, index) => `
        <div class="tag">
            <span>${escapeHtml(player)}</span>
            <button type="button" data-remove-index="${index}">x</button>
        </div>
    `).join("");

    updateLobbyActions();
}

function updateLobbyActions() {
    const hasTypedName = Boolean(sanitizeName(ui.playerInput?.value || ""));
    const hasPlayers = state.lobbyPlayers.length > 0;
    ui.primaryAction.disabled = state.phase === "lobby" && !hasPlayers && !hasTypedName;
    ui.secondaryAction.disabled = state.phase === "lobby" && !hasPlayers && !hasTypedName;
}

function startMatch() {
    const pendingName = sanitizeName(ui.playerInput.value);
    if (pendingName && state.lobbyPlayers.length < MAX_PLAYERS) {
        const exists = state.lobbyPlayers.some((player) => player.toLowerCase() === pendingName.toLowerCase());
        if (!exists) {
            state.lobbyPlayers.push(pendingName);
        }
        ui.playerInput.value = "";
        syncLobbyTags();
    }

    if (!state.lobbyPlayers.length) {
        setStatus("Type one name and press Start Match.");
        return;
    }

    state.matchPlayers = state.lobbyPlayers.map((name) => ({
        name,
        score: 0,
        clicks: 0
    }));
    state.currentPlayerIndex = 0;
    beginTurn(0);
}

function beginTurn(index) {
    cancelFrame();
    state.phase = "playing";
    state.currentPlayerIndex = index;
    state.score = 0;
    state.clicks = 0;
    state.endTime = Date.now() + ROUND_SECONDS * 1000;
    placeTarget(true);
    updateOverlay();
    updateHud(ROUND_SECONDS);
    renderPlayerBoard();
    setStatus(`${currentPlayer().name}, go. Hit the target as fast as you can.`);
    tick();
}

function tick() {
    if (state.phase !== "playing") {
        return;
    }

    const timeLeft = getTimeLeft();
    updateHud(timeLeft);
    if (timeLeft <= 0) {
        finishTurn();
        return;
    }

    state.rafId = requestAnimationFrame(tick);
}

function finishTurn() {
    cancelFrame();
    const player = currentPlayer();
    player.score = state.score;
    player.clicks = state.clicks;
    recordHighscore(player);

    if (state.currentPlayerIndex < state.matchPlayers.length - 1) {
        state.currentPlayerIndex += 1;
        state.phase = "between";
        setStatus(`${player.name} finished with ${player.score}. Pass the device to ${currentPlayer().name}.`);
    } else {
        state.phase = "results";
        const winner = sortedResults()[0];
        setStatus(`${winner.name} wins with ${winner.score} points.`);
    }

    updateOverlay();
    renderPlayerBoard();
    renderHighscores();
    updateHud(0);
}

function handleHit(guaranteed) {
    if (state.phase !== "playing") {
        return;
    }

    state.clicks += 1;
    if (guaranteed) {
        state.score += 1;
        ui.target.classList.add("hit");
        setTimeout(() => ui.target.classList.remove("hit"), 100);
        spawnPlus();
        spawnBursts();
        placeTarget(false);
    }

    updateHud(getTimeLeft());
    renderPlayerBoard();
}

function placeTarget(centered) {
    const arenaRect = ui.arena.getBoundingClientRect();
    const size = Math.max(68, Math.min(96, Math.min(arenaRect.width, arenaRect.height) * 0.092));
    state.targetSize = size;
    ui.target.style.width = `${size}px`;
    ui.target.style.height = `${size}px`;

    const margin = size * 0.65;
    const x = centered ? arenaRect.width / 2 : randomBetween(margin, arenaRect.width - margin);
    const y = centered ? arenaRect.height / 2 : randomBetween(margin, arenaRect.height - margin);
    state.targetX = x;
    state.targetY = y;

    ui.target.style.left = `${x}px`;
    ui.target.style.top = `${y}px`;
}

function spawnPlus() {
    const plus = document.createElement("div");
    plus.className = "plus";
    plus.textContent = "+1";
    plus.style.left = `${state.targetX}px`;
    plus.style.top = `${state.targetY}px`;
    ui.arena.appendChild(plus);
    setTimeout(() => plus.remove(), 650);
}

function spawnBursts() {
    for (let index = 0; index < 10; index += 1) {
        const burst = document.createElement("i");
        burst.className = "burst";
        burst.style.left = `${state.targetX}px`;
        burst.style.top = `${state.targetY}px`;
        const angle = (Math.PI * 2 * index) / 10;
        burst.style.setProperty("--dx", `${Math.cos(angle) * randomBetween(25, 70)}px`);
        burst.style.setProperty("--dy", `${Math.sin(angle) * randomBetween(25, 70)}px`);
        ui.arena.appendChild(burst);
        setTimeout(() => burst.remove(), 600);
    }
}

function recordHighscore(player) {
    if (player.score <= 0) {
        return;
    }

    state.highscores.push({
        name: player.name,
        score: player.score,
        clicks: player.clicks
    });
    state.highscores.sort((a, b) => b.score - a.score || a.clicks - b.clicks);
    state.highscores = state.highscores.slice(0, 8);
    saveHighscores();
}

function renderHighscores() {
    if (!state.highscores.length) {
        ui.highscoreList.innerHTML = `
            <li class="score-item">
                <div class="score-rank">-</div>
                <div>
                    <div class="score-name">No scores yet</div>
                    <div class="score-meta">Finish a round to claim the first spot.</div>
                </div>
                <div class="score-value">0</div>
            </li>
        `;
        return;
    }

    ui.highscoreList.innerHTML = state.highscores.map((item, index) => `
        <li class="score-item">
            <div class="score-rank">${index + 1}</div>
            <div>
                <div class="score-name">${escapeHtml(item.name)}</div>
                <div class="score-meta">${item.clicks} clicks</div>
            </div>
            <div class="score-value">${item.score}</div>
        </li>
    `).join("");
}

function renderPlayerBoard() {
    if (!state.matchPlayers.length) {
        ui.players.innerHTML = "";
        return;
    }

    ui.players.innerHTML = state.matchPlayers.map((player, index) => {
        const active = index === state.currentPlayerIndex;
        const liveScore = state.phase === "playing" && active ? state.score : player.score;
        const liveClicks = state.phase === "playing" && active ? state.clicks : player.clicks;
        return `
            <div class="player-chip ${active ? "active" : ""}">
                <strong>${escapeHtml(player.name)}</strong>
                <span>${liveScore} pts</span>
                <span>${liveClicks} clicks</span>
            </div>
        `;
    }).join("");
}

function updateHud(timeLeft) {
    const player = currentPlayer();
    ui.hudPlayer.textContent = player ? player.name : "Waiting";
    ui.hudRound.textContent = state.matchPlayers.length ? `${Math.min(state.currentPlayerIndex + 1, state.matchPlayers.length)}/${state.matchPlayers.length}` : "0/0";
    ui.hudScore.textContent = state.phase === "playing" ? state.score : player ? player.score : 0;
    ui.hudClicks.textContent = state.phase === "playing" ? state.clicks : player ? player.clicks : 0;
    ui.hudTime.textContent = `${Math.max(0, timeLeft)}s`;
    const progress = state.phase === "playing" ? ((ROUND_SECONDS - timeLeft) / ROUND_SECONDS) * 100 : 0;
    ui.progressBar.style.width = `${Math.max(0, Math.min(100, progress))}%`;
}

function updateOverlay() {
    ui.overlay.classList.toggle("hidden", state.phase === "playing");
    ui.nameForm.classList.toggle("hidden", state.phase !== "lobby");
    ui.playerTags.classList.toggle("hidden", state.phase !== "lobby");
    ui.results.classList.toggle("hidden", state.phase === "lobby");

    if (state.phase === "lobby") {
        ui.overlayKicker.textContent = "Lobby";
        ui.overlayTitle.textContent = "Register players and start the match.";
        ui.overlayCopy.textContent = "Type one name and press Start Match for solo play, or add more names first for pass-and-play multiplayer.";
        ui.primaryAction.textContent = state.lobbyPlayers.length > 1 ? "Start Multiplayer Match" : "Start Match";
        ui.secondaryAction.textContent = "Clear Players";
        ui.results.innerHTML = "";
        updateLobbyActions();
        return;
    }

    if (state.phase === "between") {
        const next = currentPlayer();
        const previous = state.matchPlayers[state.currentPlayerIndex - 1];
        ui.overlayKicker.textContent = "Next Turn";
        ui.overlayTitle.textContent = `${next.name}, you are up next.`;
        ui.overlayCopy.textContent = `${previous.name} scored ${previous.score}. Pass the device and start the next turn.`;
        ui.primaryAction.textContent = `Start ${next.name}'s Turn`;
        ui.secondaryAction.textContent = "Back To Lobby";
        ui.results.innerHTML = renderResults();
        return;
    }

    if (state.phase === "results") {
        const winner = sortedResults()[0];
        ui.overlayKicker.textContent = "Results";
        ui.overlayTitle.textContent = `${winner.name} wins the match.`;
        ui.overlayCopy.textContent = `${winner.name} finished with ${winner.score} points. You can replay with the same roster or return to the lobby.`;
        ui.primaryAction.textContent = "Play Again";
        ui.secondaryAction.textContent = "Back To Lobby";
        ui.results.innerHTML = renderResults();
    }
}

function renderResults() {
    return sortedResults().map((player, index) => `
        <div class="result-row">
            <div class="result-rank">${index + 1}</div>
            <strong>${escapeHtml(player.name)}</strong>
            <span>${player.clicks} clicks</span>
            <strong>${player.score}</strong>
        </div>
    `).join("");
}

function resetSession() {
    cancelFrame();
    state.phase = "lobby";
    state.matchPlayers = [];
    state.currentPlayerIndex = 0;
    state.score = 0;
    state.clicks = 0;
    updateHud(ROUND_SECONDS);
    renderPlayerBoard();
    updateOverlay();
    setStatus("Back in the lobby.");
    placeTarget(true);
}

function currentPlayer() {
    return state.matchPlayers[state.currentPlayerIndex] || null;
}

function sortedResults() {
    return [...state.matchPlayers].sort((a, b) => b.score - a.score || a.clicks - b.clicks);
}

function getTimeLeft() {
    return Math.ceil(Math.max(0, state.endTime - Date.now()) / 1000);
}

function cancelFrame() {
    if (state.rafId) {
        cancelAnimationFrame(state.rafId);
        state.rafId = null;
    }
}

function setStatus(text) {
    ui.statusText.textContent = text;
}

function sanitizeName(value) {
    return value.replace(/\s+/g, " ").trim().slice(0, 18);
}

function randomBetween(min, max) {
    return Math.random() * (max - min) + min;
}

function escapeHtml(value) {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll("\"", "&quot;")
        .replaceAll("'", "&#39;");
}
