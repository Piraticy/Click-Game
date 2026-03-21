import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://arqfifaxjuranixigqbu.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFycWZpZmF4anVyYW5peGlncWJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwODA1MjEsImV4cCI6MjA4OTY1NjUyMX0.jTm1EP8R9arPf9ZDexxWZBle9jINFS25MTDIDEP5LY8";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const DEFAULT_ROUND_SECONDS = 60;
const MAX_PLAYERS = 4;
const HIGH_SCORE_STORAGE_KEY = "nova-tap-simple-highscores-v1";
const ONLINE_NAME_STORAGE_KEY = "nova-tap-online-name-v1";
const APP_VERSION = "1.3.0";
const LOCATION_LOOKUP_URL = "https://ipwho.is/";

const state = {
    mode: "local",
    phase: "lobby",
    lobbyPlayers: [],
    matchPlayers: [],
    highscores: [],
    currentPlayerIndex: 0,
    roundSeconds: DEFAULT_ROUND_SECONDS,
    score: 0,
    clicks: 0,
    startedAt: 0,
    endTime: 0,
    targetX: 0,
    targetY: 0,
    targetSize: 96,
    rafId: null,
    online: {
        playerKey: createId(),
        username: "",
        location: "Locating...",
        roomCode: "",
        joinedAt: "",
        channel: null,
        players: [],
        isHost: false,
        connection: "Offline",
        syncTimer: null
    }
};

const ui = {};

window.addEventListener("DOMContentLoaded", async () => {
    cacheUi();
    bindUi();
    hydrateStoredOnlineName();
    loadHighscores();
    renderHighscores();
    syncLobbyTags();
    renderPlayerBoard();
    state.roundSeconds = getSelectedRoundSeconds();
    updateHud(state.roundSeconds);
    updateOverlay();
    placeTarget(true);
    requestAnimationFrame(updateLobbyActions);
    detectLocation();
});

function cacheUi() {
    ui.overlay = document.getElementById("overlay");
    ui.overlayCard = document.getElementById("overlay-card");
    ui.overlayKicker = document.getElementById("overlay-kicker");
    ui.overlayTitle = document.getElementById("overlay-title");
    ui.overlayCopy = document.getElementById("overlay-copy");
    ui.playerInput = document.getElementById("player-input");
    ui.nameForm = document.getElementById("name-form");
    ui.playerTags = document.getElementById("player-tags");
    ui.roundLength = document.getElementById("round-length");
    ui.results = document.getElementById("results");
    ui.primaryAction = document.getElementById("primary-action");
    ui.secondaryAction = document.getElementById("secondary-action");
    ui.target = document.getElementById("target");
    ui.arena = document.getElementById("arena");
    ui.players = document.getElementById("players");
    ui.progressBar = document.getElementById("progress-bar");
    ui.statusText = document.getElementById("status-text");
    ui.reset = document.getElementById("reset");
    ui.installApp = document.getElementById("install-app");
    ui.hudPlayer = document.getElementById("hud-player");
    ui.hudRound = document.getElementById("hud-round");
    ui.hudScore = document.getElementById("hud-score");
    ui.hudClicks = document.getElementById("hud-clicks");
    ui.hudTime = document.getElementById("hud-time");
    ui.highscoreList = document.getElementById("highscore-list");
    ui.modeLocal = document.getElementById("mode-local");
    ui.modeOnline = document.getElementById("mode-online");
    ui.localPanel = document.getElementById("local-panel");
    ui.onlinePanel = document.getElementById("online-panel");
    ui.onlineName = document.getElementById("online-name");
    ui.roomCodeInput = document.getElementById("room-code-input");
    ui.createRoom = document.getElementById("create-room");
    ui.joinRoom = document.getElementById("join-room");
    ui.leaveRoom = document.getElementById("leave-room");
    ui.onlineLocation = document.getElementById("online-location");
    ui.onlineConnection = document.getElementById("online-connection");
    ui.roomBadge = document.getElementById("room-badge");
    ui.onlinePresence = document.getElementById("online-presence");
}

function bindUi() {
    ui.modeLocal.addEventListener("click", () => switchMode("local"));
    ui.modeOnline.addEventListener("click", () => switchMode("online"));

    ui.nameForm.addEventListener("submit", (event) => {
        event.preventDefault();
        addPlayer();
    });

    ui.playerInput.addEventListener("input", updateLobbyActions);

    ui.playerTags.addEventListener("click", (event) => {
        const remove = event.target.closest("[data-remove-index]");
        if (!remove) {
            return;
        }
        removeLobbyPlayer(Number(remove.dataset.removeIndex));
    });

    ui.roundLength.addEventListener("change", () => {
        state.roundSeconds = getSelectedRoundSeconds();
        if (state.phase === "lobby") {
            updateHud(state.roundSeconds);
            setStatus(state.mode === "online"
                ? `Round length set to ${state.roundSeconds} seconds for the next online match.`
                : `Round length set to ${state.roundSeconds} seconds.`);
        }
    });

    ui.onlineName.addEventListener("input", () => {
        const name = sanitizeName(ui.onlineName.value);
        localStorage.setItem(ONLINE_NAME_STORAGE_KEY, name);
        state.online.username = name;
        if (state.online.channel) {
            scheduleOnlinePresenceSync(true);
        }
        updateOverlay();
    });

    ui.roomCodeInput.addEventListener("input", () => {
        ui.roomCodeInput.value = sanitizeRoomCode(ui.roomCodeInput.value);
    });

    ui.createRoom.addEventListener("click", createOnlineRoom);
    ui.joinRoom.addEventListener("click", joinOnlineRoom);
    ui.leaveRoom.addEventListener("click", () => leaveOnlineRoom("Left the room."));

    ui.primaryAction.addEventListener("click", () => {
        if (state.mode === "local") {
            handleLocalPrimaryAction();
            return;
        }

        handleOnlinePrimaryAction();
    });

    ui.secondaryAction.addEventListener("click", () => {
        if (state.mode === "local") {
            handleLocalSecondaryAction();
            return;
        }

        handleOnlineSecondaryAction();
    });

    ui.reset.addEventListener("click", () => {
        if (state.mode === "online") {
            resetOnlineToLobby("Back in the online lobby.");
            return;
        }
        resetLocalSession();
    });

    ui.target.addEventListener("click", (event) => {
        event.preventDefault();
        if (!canHitTarget()) {
            return;
        }
        handleHit(true);
    });

    ui.arena.addEventListener("click", (event) => {
        if (!canCountMissClick(event)) {
            return;
        }

        state.clicks += 1;
        if (state.mode === "online") {
            scheduleOnlinePresenceSync();
        }
        updateHud(getTimeLeft());
        renderPlayerBoard();
    });

    window.addEventListener("resize", () => {
        placeTarget(false);
    });

    bindInstallFlow();
}

function bindInstallFlow() {
    let deferredPrompt = null;

    window.addEventListener("beforeinstallprompt", (event) => {
        event.preventDefault();
        deferredPrompt = event;
        ui.installApp.classList.remove("hidden");
    });

    ui.installApp.addEventListener("click", async () => {
        if (!deferredPrompt) {
            setStatus("Open this game from a supported browser to install it.");
            return;
        }

        deferredPrompt.prompt();
        await deferredPrompt.userChoice;
        deferredPrompt = null;
        ui.installApp.classList.add("hidden");
    });

    window.addEventListener("appinstalled", () => {
        ui.installApp.classList.add("hidden");
        setStatus(`Nova Tap Arena v${APP_VERSION} installed.`);
    });

    if ("serviceWorker" in navigator) {
        window.addEventListener("load", () => {
            navigator.serviceWorker.register("./service-worker.js?v=1.3.0").catch(() => {
                setStatus("Install support is unavailable right now, but the game still works.");
            });
        });
    }
}

function hydrateStoredOnlineName() {
    const stored = sanitizeName(localStorage.getItem(ONLINE_NAME_STORAGE_KEY) || "");
    if (stored) {
        ui.onlineName.value = stored;
        state.online.username = stored;
    }
}

async function detectLocation() {
    ui.onlineLocation.textContent = "Locating...";
    try {
        const response = await fetch(LOCATION_LOOKUP_URL);
        const payload = await response.json();
        if (payload && payload.success !== false) {
            const parts = [payload.city, payload.country].filter(Boolean);
            state.online.location = parts.length ? parts.join(", ") : payload.country || fallbackLocation();
        } else {
            state.online.location = fallbackLocation();
        }
    } catch {
        state.online.location = fallbackLocation();
    }

    ui.onlineLocation.textContent = state.online.location;
    if (state.online.channel) {
        scheduleOnlinePresenceSync(true);
    }
}

function fallbackLocation() {
    return Intl.DateTimeFormat().resolvedOptions().timeZone.replaceAll("_", " ");
}

function switchMode(mode) {
    if (state.phase === "playing") {
        setStatus("Finish the current match before switching modes.");
        return;
    }

    state.mode = mode;
    state.phase = "lobby";
    state.score = 0;
    state.clicks = 0;
    state.startedAt = 0;
    updateHud(state.roundSeconds);
    updateOverlay();
    renderPlayerBoard();

    if (mode === "online") {
        setStatus("Create or join an online room to play with friends worldwide.");
    } else {
        setStatus(`Type one name and press Start Match. Default round length is ${DEFAULT_ROUND_SECONDS} seconds.`);
    }
}

function handleLocalPrimaryAction() {
    if (state.phase === "lobby") {
        startLocalMatch();
        return;
    }

    if (state.phase === "between") {
        beginLocalTurn(state.currentPlayerIndex);
        return;
    }

    if (state.phase === "results") {
        startLocalMatch();
    }
}

function handleLocalSecondaryAction() {
    if (state.phase === "lobby") {
        state.lobbyPlayers = [];
        ui.playerInput.value = "";
        syncLobbyTags();
        setStatus("Lobby cleared.");
        return;
    }

    resetLocalSession();
}

function handleOnlinePrimaryAction() {
    if (state.phase === "lobby") {
        if (!state.online.channel) {
            setStatus("Create or join a room first.");
            return;
        }

        if (!state.online.isHost) {
            setStatus("Only the host can start the online match.");
            return;
        }

        startOnlineMatch();
        return;
    }

    if (state.phase === "results") {
        if (!state.online.isHost) {
            setStatus("Waiting for the host to reset the room.");
            return;
        }

        resetOnlineRoomForReplay();
    }
}

function handleOnlineSecondaryAction() {
    if (state.online.channel) {
        leaveOnlineRoom("Left the room.");
        return;
    }

    switchMode("local");
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
        setStatus("The local lobby is full.");
        return;
    }

    if (state.lobbyPlayers.some((player) => player.toLowerCase() === name.toLowerCase())) {
        setStatus(`${name} is already in the local lobby.`);
        return;
    }

    state.lobbyPlayers.push(name);
    ui.playerInput.value = "";
    syncLobbyTags();
    setStatus(`${name} joined the local lobby.`);
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
    if (state.mode === "online") {
        const ready = Boolean(state.online.channel && state.online.isHost);
        ui.primaryAction.disabled = !ready;
        ui.secondaryAction.disabled = false;
        return;
    }

    const hasTypedName = Boolean(sanitizeName(ui.playerInput?.value || ""));
    const hasPlayers = state.lobbyPlayers.length > 0;
    ui.primaryAction.disabled = state.phase === "lobby" && !hasPlayers && !hasTypedName;
    ui.secondaryAction.disabled = state.phase === "lobby" && !hasPlayers && !hasTypedName;
}

function startLocalMatch() {
    state.roundSeconds = getSelectedRoundSeconds();
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
        location: "Local",
        score: 0,
        clicks: 0
    }));
    state.currentPlayerIndex = 0;
    beginLocalTurn(0);
}

function beginLocalTurn(index) {
    cancelFrame();
    state.phase = "playing";
    state.currentPlayerIndex = index;
    state.score = 0;
    state.clicks = 0;
    state.startedAt = Date.now();
    state.endTime = state.startedAt + state.roundSeconds * 1000;
    placeTarget(true);
    updateOverlay();
    updateHud(state.roundSeconds);
    renderPlayerBoard();
    setStatus(`${currentLocalPlayer().name}, go. You have ${state.roundSeconds} seconds.`);
    tick();
}

async function createOnlineRoom() {
    ui.roomCodeInput.value = generateRoomCode();
    await joinOrCreateRoom(ui.roomCodeInput.value);
}

async function joinOnlineRoom() {
    await joinOrCreateRoom(ui.roomCodeInput.value);
}

async function joinOrCreateRoom(rawRoomCode) {
    const username = sanitizeName(ui.onlineName.value);
    const roomCode = sanitizeRoomCode(rawRoomCode);

    if (!username) {
        setStatus("Enter your username before going online.");
        ui.onlineName.focus();
        return;
    }

    if (!roomCode) {
        setStatus("Enter a room code or create a new room.");
        ui.roomCodeInput.focus();
        return;
    }

    state.online.username = username;
    state.online.roomCode = roomCode;
    state.online.joinedAt = new Date().toISOString();
    localStorage.setItem(ONLINE_NAME_STORAGE_KEY, username);

    await leaveOnlineRoom("", false);
    updateConnectionStatus("Connecting...");
    ui.roomBadge.classList.remove("hidden");
    ui.roomBadge.textContent = `Room ${roomCode}`;

    const channel = supabase.channel(`room:${roomCode}`, {
        config: {
            broadcast: { self: true },
            presence: { key: state.online.playerKey }
        }
    });

    channel
        .on("presence", { event: "sync" }, () => {
            handlePresenceSync(channel);
        })
        .on("broadcast", { event: "request-sync" }, ({ payload }) => {
            if (state.online.isHost) {
                sendStateSync(payload.requesterKey);
            }
        })
        .on("broadcast", { event: "state-sync" }, ({ payload }) => {
            handleStateSync(payload);
        })
        .on("broadcast", { event: "match-start" }, ({ payload }) => {
            applyOnlineMatchStart(payload);
        })
        .on("broadcast", { event: "room-reset" }, ({ payload }) => {
            applyOnlineRoomReset(payload);
        });

    await channel.subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
            state.online.channel = channel;
            state.mode = "online";
            state.phase = "lobby";
            updateConnectionStatus("Connected");
            ui.leaveRoom.classList.remove("hidden");
            await syncOnlinePresence(true);
            await sendOnlineEvent("request-sync", { requesterKey: state.online.playerKey });
            updateOverlay();
            renderPlayerBoard();
            setStatus(`Connected to room ${roomCode}. Share the code and wait for the host to start.`);
            return;
        }

        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            updateConnectionStatus("Connection failed");
            setStatus("Supabase room connection failed. Check your room and try again.");
        }

        if (status === "CLOSED") {
            updateConnectionStatus("Offline");
        }
    });
}

async function leaveOnlineRoom(statusText = "", resetMode = true) {
    if (state.online.syncTimer) {
        clearTimeout(state.online.syncTimer);
        state.online.syncTimer = null;
    }

    if (state.online.channel) {
        try {
            await state.online.channel.untrack();
        } catch {}

        try {
            await state.online.channel.unsubscribe();
        } catch {}
    }

    state.online.channel = null;
    state.online.players = [];
    state.online.roomCode = "";
    state.online.isHost = false;
    state.startedAt = 0;
    ui.roomBadge.classList.add("hidden");
    ui.leaveRoom.classList.add("hidden");
    updateConnectionStatus("Offline");

    if (resetMode) {
        state.phase = "lobby";
        state.score = 0;
        state.clicks = 0;
        updateHud(state.roundSeconds);
        updateOverlay();
        renderPlayerBoard();
    }

    if (statusText) {
        setStatus(statusText);
    }
}

function handlePresenceSync(channel) {
    const presenceState = channel.presenceState();
    const players = Object.entries(presenceState)
        .map(([key, entries]) => ({
            key,
            ...entries[entries.length - 1]
        }))
        .sort((a, b) => new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime());

    state.online.players = players;
    state.online.isHost = players[0]?.key === state.online.playerKey;
    updateConnectionStatus(players.length ? `${players.length} online` : "Connected");
    renderPlayerBoard();
    renderOnlinePresence();
    updateOverlay();
}

async function sendStateSync(targetKey) {
    await sendOnlineEvent("state-sync", {
        targetKey,
        roomCode: state.online.roomCode,
        phase: state.phase,
        roundSeconds: state.roundSeconds,
        startedAt: state.startedAt
    });
}

function handleStateSync(payload) {
    if (payload.targetKey && payload.targetKey !== state.online.playerKey) {
        return;
    }

    if (!payload.roomCode || payload.roomCode !== state.online.roomCode) {
        return;
    }

    if (payload.phase === "playing") {
        applyOnlineMatchStart(payload);
        return;
    }

    if (payload.phase === "results") {
        state.phase = "results";
        updateOverlay();
        renderPlayerBoard();
        setStatus("The room is showing results.");
    }
}

async function startOnlineMatch() {
    if (!state.online.channel) {
        setStatus("Create or join a room first.");
        return;
    }

    state.roundSeconds = getSelectedRoundSeconds();
    const payload = {
        roomCode: state.online.roomCode,
        roundSeconds: state.roundSeconds,
        startedAt: Date.now() + 2500
    };

    await sendOnlineEvent("match-start", payload);
    applyOnlineMatchStart(payload);
}

function applyOnlineMatchStart(payload) {
    if (payload.roomCode !== state.online.roomCode) {
        return;
    }

    cancelFrame();
    state.mode = "online";
    state.phase = "playing";
    state.roundSeconds = Number(payload.roundSeconds) || DEFAULT_ROUND_SECONDS;
    state.score = 0;
    state.clicks = 0;
    state.startedAt = payload.startedAt;
    state.endTime = payload.startedAt + state.roundSeconds * 1000;
    placeTarget(true);
    updateOverlay();
    updateHud(state.roundSeconds);
    renderPlayerBoard();
    scheduleOnlinePresenceSync(true);
    setStatus(`Room ${state.online.roomCode} is starting. Get ready.`);
    tick();
}

async function resetOnlineRoomForReplay() {
    await sendOnlineEvent("room-reset", { roomCode: state.online.roomCode });
    applyOnlineRoomReset({ roomCode: state.online.roomCode });
}

function applyOnlineRoomReset(payload) {
    if (payload.roomCode !== state.online.roomCode) {
        return;
    }

    cancelFrame();
    state.phase = "lobby";
    state.score = 0;
    state.clicks = 0;
    state.startedAt = 0;
    state.endTime = 0;
    updateHud(state.roundSeconds);
    placeTarget(true);
    scheduleOnlinePresenceSync(true);
    updateOverlay();
    renderPlayerBoard();
    setStatus("The host reset the room. Adjust settings and start again.");
}

function tick() {
    if (state.phase !== "playing") {
        return;
    }

    if (state.mode === "online" && Date.now() < state.startedAt) {
        const secondsUntilStart = Math.max(1, Math.ceil((state.startedAt - Date.now()) / 1000));
        updateHud(state.roundSeconds);
        setStatus(`Match starts in ${secondsUntilStart}...`);
        state.rafId = requestAnimationFrame(tick);
        return;
    }

    const timeLeft = getTimeLeft();
    updateHud(timeLeft);
    if (timeLeft <= 0) {
        if (state.mode === "online") {
            finishOnlineMatch();
        } else {
            finishLocalTurn();
        }
        return;
    }

    state.rafId = requestAnimationFrame(tick);
}

function finishLocalTurn() {
    cancelFrame();
    const player = currentLocalPlayer();
    player.score = state.score;
    player.clicks = state.clicks;
    recordHighscore(player);

    if (state.currentPlayerIndex < state.matchPlayers.length - 1) {
        state.currentPlayerIndex += 1;
        state.phase = "between";
        setStatus(`${player.name} finished with ${player.score}. Pass the device to ${currentLocalPlayer().name}.`);
    } else {
        state.phase = "results";
        const winner = sortedLocalResults()[0];
        setStatus(`${winner.name} wins with ${winner.score} points.`);
    }

    updateOverlay();
    renderPlayerBoard();
    renderHighscores();
    updateHud(0);
}

function finishOnlineMatch() {
    cancelFrame();
    state.phase = "results";
    scheduleOnlinePresenceSync(true);
    const self = getOnlineSelf();
    if (self) {
        recordHighscore({
            name: self.username,
            score: state.score,
            clicks: state.clicks
        });
        renderHighscores();
    }

    const winner = sortedOnlinePlayers()[0];
    if (winner) {
        setStatus(`${winner.username} from ${winner.location} is leading with ${winner.score} points.`);
    } else {
        setStatus("Match finished.");
    }
    updateOverlay();
    renderPlayerBoard();
    updateHud(0);
}

function handleHit(guaranteed) {
    if (!canHitTarget()) {
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

    if (state.mode === "online") {
        scheduleOnlinePresenceSync();
    }

    updateHud(getTimeLeft());
    renderPlayerBoard();
}

function canHitTarget() {
    if (state.phase !== "playing") {
        return false;
    }

    if (state.mode === "online" && Date.now() < state.startedAt) {
        return false;
    }

    return true;
}

function canCountMissClick(event) {
    if (!canHitTarget()) {
        return false;
    }

    return event.target !== ui.target;
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
    if (state.mode === "online") {
        renderOnlinePlayerBoard();
        return;
    }

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

function renderOnlinePlayerBoard() {
    if (!state.online.players.length) {
        ui.players.innerHTML = "";
        renderOnlinePresence();
        return;
    }

    const players = sortedOnlinePlayers();
    ui.players.innerHTML = players.map((player) => {
        const active = player.key === state.online.playerKey;
        return `
            <div class="player-chip ${active ? "active" : ""}">
                <strong>${escapeHtml(player.username)}</strong>
                <span>${escapeHtml(player.location)}</span>
                <span>${player.score || 0} pts · ${player.clicks || 0} clicks</span>
            </div>
        `;
    }).join("");

    renderOnlinePresence();
}

function renderOnlinePresence() {
    if (!state.online.players.length) {
        ui.onlinePresence.innerHTML = `
            <div class="presence-row">
                <div>
                    <strong>No players connected</strong>
                    <small>Create a room or join one with a code.</small>
                </div>
                <span class="presence-state">Idle</span>
                <span>0 pts</span>
            </div>
        `;
        return;
    }

    ui.onlinePresence.innerHTML = sortedOnlinePlayers().map((player) => `
        <div class="presence-row">
            <div>
                <strong>${escapeHtml(player.username)}${player.key === state.online.players[0]?.key ? " (Host)" : ""}</strong>
                <small>${escapeHtml(player.location)}</small>
            </div>
            <span class="presence-state">${escapeHtml(player.phase || "lobby")}</span>
            <span>${player.score || 0} pts</span>
        </div>
    `).join("");
}

function updateHud(timeLeft) {
    if (state.mode === "online") {
        ui.hudPlayer.textContent = state.online.username || "Online";
        ui.hudRound.textContent = state.online.roomCode ? `${state.online.players.length}P` : "Online";
        ui.hudScore.textContent = state.score;
        ui.hudClicks.textContent = state.clicks;
        ui.hudTime.textContent = `${Math.max(0, timeLeft)}s`;
        const progress = state.phase === "playing" && Date.now() >= state.startedAt
            ? ((state.roundSeconds - timeLeft) / state.roundSeconds) * 100
            : 0;
        ui.progressBar.style.width = `${Math.max(0, Math.min(100, progress))}%`;
        return;
    }

    const player = currentLocalPlayer();
    ui.hudPlayer.textContent = player ? player.name : "Waiting";
    ui.hudRound.textContent = state.matchPlayers.length ? `${Math.min(state.currentPlayerIndex + 1, state.matchPlayers.length)}/${state.matchPlayers.length}` : "0/0";
    ui.hudScore.textContent = state.phase === "playing" ? state.score : player ? player.score : 0;
    ui.hudClicks.textContent = state.phase === "playing" ? state.clicks : player ? player.clicks : 0;
    ui.hudTime.textContent = `${Math.max(0, timeLeft)}s`;
    const progress = state.phase === "playing" ? ((state.roundSeconds - timeLeft) / state.roundSeconds) * 100 : 0;
    ui.progressBar.style.width = `${Math.max(0, Math.min(100, progress))}%`;
}

function updateOverlay() {
    ui.modeLocal.classList.toggle("active", state.mode === "local");
    ui.modeOnline.classList.toggle("active", state.mode === "online");
    ui.localPanel.classList.toggle("hidden", state.mode !== "local" || state.phase !== "lobby");
    ui.onlinePanel.classList.toggle("hidden", state.mode !== "online" || state.phase !== "lobby");
    ui.overlay.classList.toggle("hidden", state.phase === "playing");
    ui.results.classList.toggle("hidden", state.phase === "lobby");
    ui.overlayCard.classList.toggle("compact", state.mode === "online" && state.phase === "lobby");

    if (state.mode === "online") {
        updateOnlineOverlay();
        return;
    }

    updateLocalOverlay();
}

function updateLocalOverlay() {
    if (state.phase === "lobby") {
        ui.overlayKicker.textContent = "Lobby";
        ui.overlayTitle.textContent = "Register players and start the match.";
        ui.overlayCopy.textContent = `Type one name and press Start Match for solo play, or add more names first for pass-and-play multiplayer. Default round time is ${DEFAULT_ROUND_SECONDS} seconds, and you can extend it here before starting.`;
        ui.primaryAction.textContent = state.lobbyPlayers.length > 1 ? "Start Multiplayer Match" : "Start Match";
        ui.secondaryAction.textContent = "Clear Players";
        ui.results.innerHTML = "";
        updateLobbyActions();
        return;
    }

    if (state.phase === "between") {
        const next = currentLocalPlayer();
        const previous = state.matchPlayers[state.currentPlayerIndex - 1];
        ui.overlayKicker.textContent = "Next Turn";
        ui.overlayTitle.textContent = `${next.name}, you are up next.`;
        ui.overlayCopy.textContent = `${previous.name} scored ${previous.score}. Pass the device and start the next turn.`;
        ui.primaryAction.textContent = `Start ${next.name}'s Turn`;
        ui.primaryAction.disabled = false;
        ui.secondaryAction.textContent = "Back To Lobby";
        ui.secondaryAction.disabled = false;
        ui.results.innerHTML = renderLocalResults();
        return;
    }

    if (state.phase === "results") {
        const winner = sortedLocalResults()[0];
        ui.overlayKicker.textContent = "Results";
        ui.overlayTitle.textContent = `${winner.name} wins the match.`;
        ui.overlayCopy.textContent = `${winner.name} finished with ${winner.score} points. You can replay with the same roster or return to the lobby.`;
        ui.primaryAction.textContent = "Play Again";
        ui.primaryAction.disabled = false;
        ui.secondaryAction.textContent = "Back To Lobby";
        ui.secondaryAction.disabled = false;
        ui.results.innerHTML = renderLocalResults();
    }
}

function updateOnlineOverlay() {
    if (state.phase === "lobby") {
        ui.overlayKicker.textContent = "Online";
        ui.overlayTitle.textContent = state.online.roomCode
            ? `Room ${state.online.roomCode} is ready.`
            : "Create or join an online room.";
        ui.overlayCopy.textContent = `Play with friends in different countries. Your room shows your username and approximate location: ${state.online.username || "your username"} from ${state.online.location}.`;
        ui.primaryAction.textContent = state.online.isHost ? "Start Online Match" : "Waiting For Host";
        ui.primaryAction.disabled = !state.online.channel || !state.online.isHost;
        ui.secondaryAction.textContent = state.online.channel ? "Leave Room" : "Switch To Local";
        ui.secondaryAction.disabled = false;
        ui.results.innerHTML = "";
        renderOnlinePresence();
        return;
    }

    if (state.phase === "results") {
        const winner = sortedOnlinePlayers()[0];
        ui.overlayKicker.textContent = "Online Results";
        ui.overlayTitle.textContent = winner
            ? `${winner.username} from ${winner.location} is on top.`
            : "Online match finished.";
        ui.overlayCopy.textContent = state.online.isHost
            ? "You can reset the room for another match or leave the room."
            : "Waiting for the host to reset the room, or you can leave now.";
        ui.primaryAction.textContent = state.online.isHost ? "Play Again" : "Waiting For Host";
        ui.primaryAction.disabled = !state.online.isHost;
        ui.secondaryAction.textContent = "Leave Room";
        ui.secondaryAction.disabled = false;
        ui.results.innerHTML = renderOnlineResults();
    }
}

function renderLocalResults() {
    return sortedLocalResults().map((player, index) => `
        <div class="result-row">
            <div class="result-rank">${index + 1}</div>
            <strong>${escapeHtml(player.name)}</strong>
            <span>${player.clicks} clicks</span>
            <strong>${player.score}</strong>
        </div>
    `).join("");
}

function renderOnlineResults() {
    return sortedOnlinePlayers().map((player, index) => `
        <div class="result-row">
            <div class="result-rank">${index + 1}</div>
            <strong>${escapeHtml(player.username)} · ${escapeHtml(player.location)}</strong>
            <span>${player.clicks || 0} clicks</span>
            <strong>${player.score || 0}</strong>
        </div>
    `).join("");
}

function resetLocalSession() {
    cancelFrame();
    state.phase = "lobby";
    state.matchPlayers = [];
    state.currentPlayerIndex = 0;
    state.score = 0;
    state.clicks = 0;
    state.startedAt = 0;
    updateHud(state.roundSeconds);
    renderPlayerBoard();
    updateOverlay();
    setStatus("Back in the local lobby.");
    placeTarget(true);
}

function resetOnlineToLobby(statusText) {
    cancelFrame();
    state.phase = "lobby";
    state.score = 0;
    state.clicks = 0;
    state.startedAt = 0;
    updateHud(state.roundSeconds);
    renderPlayerBoard();
    updateOverlay();
    scheduleOnlinePresenceSync(true);
    setStatus(statusText);
    placeTarget(true);
}

function currentLocalPlayer() {
    return state.matchPlayers[state.currentPlayerIndex] || null;
}

function getOnlineSelf() {
    return state.online.players.find((player) => player.key === state.online.playerKey) || {
        username: state.online.username,
        location: state.online.location,
        score: state.score,
        clicks: state.clicks
    };
}

function sortedLocalResults() {
    return [...state.matchPlayers].sort((a, b) => b.score - a.score || a.clicks - b.clicks);
}

function sortedOnlinePlayers() {
    return [...state.online.players].sort((a, b) => (b.score || 0) - (a.score || 0) || (a.clicks || 0) - (b.clicks || 0));
}

function getTimeLeft() {
    if (state.mode === "online" && Date.now() < state.startedAt) {
        return state.roundSeconds;
    }

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

function updateConnectionStatus(text) {
    state.online.connection = text;
    ui.onlineConnection.textContent = text;
}

function scheduleOnlinePresenceSync(force = false) {
    if (!state.online.channel) {
        return;
    }

    if (force) {
        if (state.online.syncTimer) {
            clearTimeout(state.online.syncTimer);
            state.online.syncTimer = null;
        }
        syncOnlinePresence(true);
        return;
    }

    if (state.online.syncTimer) {
        return;
    }

    state.online.syncTimer = setTimeout(() => {
        state.online.syncTimer = null;
        syncOnlinePresence(true);
    }, 180);
}

async function syncOnlinePresence(force = false) {
    if (!state.online.channel) {
        return;
    }

    const payload = {
        username: state.online.username || "Guest",
        location: state.online.location,
        joinedAt: state.online.joinedAt || new Date().toISOString(),
        phase: state.phase,
        score: state.score,
        clicks: state.clicks
    };

    try {
        await state.online.channel.track(payload);
        if (force) {
            renderOnlinePresence();
            renderPlayerBoard();
        }
    } catch {
        updateConnectionStatus("Sync issue");
    }
}

async function sendOnlineEvent(event, payload) {
    if (!state.online.channel) {
        return;
    }

    await state.online.channel.send({
        type: "broadcast",
        event,
        payload
    });
}

function sanitizeName(value) {
    return (value || "").replace(/\s+/g, " ").trim().slice(0, 18);
}

function sanitizeRoomCode(value) {
    return (value || "")
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, 6);
}

function getSelectedRoundSeconds() {
    return Number(ui.roundLength?.value) || DEFAULT_ROUND_SECONDS;
}

function generateRoomCode() {
    return Math.random().toString(36).slice(2, 6).toUpperCase();
}

function createId() {
    if (crypto.randomUUID) {
        return crypto.randomUUID();
    }

    return `player-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

function randomBetween(min, max) {
    return Math.random() * (max - min) + min;
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll("\"", "&quot;")
        .replaceAll("'", "&#39;");
}
