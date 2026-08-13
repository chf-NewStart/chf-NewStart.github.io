import {
    FilesetResolver,
    PoseLandmarker
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/vision_bundle.mjs";

const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";

const LOOP_MS = 6000;
const SYNC_WINDOW_MS = 1600;
const HOLD_MS = 700;
const COUNTDOWN_MS = 3000;
const INFERENCE_INTERVAL_MS = 70;
const SAMPLE_INTERVAL_MS = 70;
const HANDS_FREE_HOLD_MS = 1000;
const RESET_AUTOSTART_MS = 1200;
const RESET_COUNTDOWN_MS = 1800;
const RESET_HOLD_MS = 650;

const RESET_STEPS = [
    {
        id: "shrug",
        phase: 1,
        title: "Both shoulders up",
        cue: "Lift both shoulders gently into the cyan rings and hold until they pop.",
        color: "#55e3ff",
        targets: [
            { landmark: 11, dx: 0, dy: -0.14, label: "LEFT SHOULDER" },
            { landmark: 12, dx: 0, dy: -0.14, label: "RIGHT SHOULDER" }
        ]
    },
    {
        id: "release",
        phase: 1,
        title: "Let them fall",
        cue: "Release both shoulders back into the green rings. Let the movement be easy.",
        color: "#b7ff50",
        targets: [
            { landmark: 11, dx: 0, dy: 0.015, label: "LEFT SHOULDER" },
            { landmark: 12, dx: 0, dy: 0.015, label: "RIGHT SHOULDER" }
        ]
    },
    {
        id: "left",
        phase: 1,
        title: "Left shoulder up",
        cue: "Lift only your left shoulder toward its violet ring. Keep the other one easy.",
        color: "#d99cff",
        targets: [
            { landmark: 11, dx: 0, dy: -0.14, label: "LEFT SHOULDER" },
            { landmark: 12, dx: 0, dy: 0.015, label: "RIGHT / EASY" }
        ]
    },
    {
        id: "right",
        phase: 1,
        title: "Right shoulder up",
        cue: "Release the left, then lift your right shoulder into the amber ring.",
        color: "#ffc857",
        targets: [
            { landmark: 11, dx: 0, dy: 0.015, label: "LEFT / EASY" },
            { landmark: 12, dx: 0, dy: -0.14, label: "RIGHT SHOULDER" }
        ]
    },
    {
        id: "look-left",
        phase: 1,
        title: "Nose to the left ring",
        cue: "Turn or tilt gently toward the ring you see. Keep your shoulders loose.",
        color: "#ff7a90",
        targets: [
            { landmark: 0, dx: -0.23, dy: 0, radius: 0.14, label: "LOOK LEFT" }
        ]
    },
    {
        id: "look-right",
        phase: 1,
        title: "Nose to the right ring",
        cue: "Move slowly across to the ring on the other side. Stop before any strain.",
        color: "#86bfff",
        targets: [
            { landmark: 0, dx: 0.23, dy: 0, radius: 0.14, label: "LOOK RIGHT" }
        ]
    },
    {
        id: "centre",
        phase: 1,
        title: "Return to centre",
        cue: "Bring your nose back to the centre ring and let both shoulders settle.",
        color: "#b7ff50",
        targets: [
            { landmark: 0, dx: 0, dy: 0, radius: 0.15, label: "CENTRE" }
        ]
    },
    {
        id: "remix-left",
        phase: 2,
        title: "Remix: left shoulder",
        cue: "Round two. Lift the left shoulder into violet while the right stays easy.",
        color: "#d99cff",
        targets: [
            { landmark: 11, dx: 0, dy: -0.14, label: "LEFT SHOULDER" },
            { landmark: 12, dx: 0, dy: 0.015, label: "RIGHT / EASY" }
        ]
    },
    {
        id: "remix-release-left",
        phase: 2,
        title: "Release left",
        cue: "Let the left shoulder drop back into the green ring.",
        color: "#b7ff50",
        targets: [
            { landmark: 11, dx: 0, dy: 0.015, label: "LEFT / RELEASE" }
        ]
    },
    {
        id: "remix-right",
        phase: 2,
        title: "Remix: right shoulder",
        cue: "Now lift the right shoulder into amber while the left stays easy.",
        color: "#ffc857",
        targets: [
            { landmark: 11, dx: 0, dy: 0.015, label: "LEFT / EASY" },
            { landmark: 12, dx: 0, dy: -0.14, label: "RIGHT SHOULDER" }
        ]
    },
    {
        id: "remix-release-right",
        phase: 2,
        title: "Release right",
        cue: "Let the right shoulder drop back into the green ring.",
        color: "#b7ff50",
        targets: [
            { landmark: 12, dx: 0, dy: 0.015, label: "RIGHT / RELEASE" }
        ]
    },
    {
        id: "remix-shrug",
        phase: 2,
        title: "Both shoulders up",
        cue: "Bring both shoulder dots into the cyan rings together.",
        color: "#55e3ff",
        targets: [
            { landmark: 11, dx: 0, dy: -0.14, label: "LEFT SHOULDER" },
            { landmark: 12, dx: 0, dy: -0.14, label: "RIGHT SHOULDER" }
        ]
    },
    {
        id: "remix-release",
        phase: 2,
        title: "Drop and soften",
        cue: "Release both shoulders into green. Keep your breath normal.",
        color: "#b7ff50",
        targets: [
            { landmark: 11, dx: 0, dy: 0.015, label: "LEFT / RELEASE" },
            { landmark: 12, dx: 0, dy: 0.015, label: "RIGHT / RELEASE" }
        ]
    },
    {
        id: "remix-look-left",
        phase: 2,
        title: "Sweep left",
        cue: "Move your nose gently into the coral ring on the left.",
        color: "#ff7a90",
        targets: [
            { landmark: 0, dx: -0.23, dy: 0, radius: 0.14, label: "LOOK LEFT" }
        ]
    },
    {
        id: "remix-look-right",
        phase: 2,
        title: "Sweep right",
        cue: "Cross slowly to the blue ring on the right. Stop before any strain.",
        color: "#86bfff",
        targets: [
            { landmark: 0, dx: 0.23, dy: 0, radius: 0.14, label: "LOOK RIGHT" }
        ]
    },
    {
        id: "final-release",
        phase: 3,
        hold: 900,
        title: "Final release",
        cue: "Return your head to centre and let both shoulders settle into all three green rings.",
        color: "#b7ff50",
        targets: [
            { landmark: 0, dx: 0, dy: 0, radius: 0.15, label: "HEAD / CENTRE" },
            { landmark: 11, dx: 0, dy: 0.015, label: "LEFT / SOFT" },
            { landmark: 12, dx: 0, dy: 0.015, label: "RIGHT / SOFT" }
        ]
    }
];

const RESET_PHASES = [
    { start: 0, end: 7 },
    { start: 7, end: 15 },
    { start: 15, end: 16 }
];

const MODE_CONFIGS = {
    reset: {
        name: "Unclench",
        requiredLandmarks: [0, 11, 12],
        framing: "Sit about an arm's length away with your head and shoulders visible.",
        mobileNote: "Prop up your device and keep your head and both shoulders visible.",
        targets: []
    },
    desk: {
        name: "Desk mode",
        requiredLandmarks: [0, 11, 12],
        framing: "Stay seated about an arm's length away. Keep your head, shoulders, and hands in view.",
        mobileNote: "Prop up your device and keep your head, shoulders, and hands visible.",
        targets: [
            {
                x: 0.22,
                y: 0.36,
                landmark: 15,
                color: "#55e3ff",
                label: "LEFT HAND",
                title: "Left hand → cyan ring",
                instruction: "Move your left wrist into the cyan ring and hold it through the sync pulse."
            },
            {
                x: 0.78,
                y: 0.36,
                landmark: 16,
                color: "#ff5d73",
                label: "RIGHT HAND",
                title: "Right hand → coral ring",
                instruction: "Your first echo repeats. Put your right wrist in the coral ring at the same moment."
            },
            {
                x: 0.5,
                y: 0.68,
                landmark: 0,
                color: "#ffc857",
                label: "DUCK",
                title: "Head → amber ring",
                instruction: "Let both echoes work above you. Duck your head into the low amber ring."
            }
        ]
    },
    full: {
        name: "Full-body mode",
        requiredLandmarks: [0, 11, 12, 23, 24, 27, 28],
        framing: "Stand two to three metres back. Keep your head, hips, and both ankles inside the frame.",
        mobileNote: "Prop up your device and step back until your head, hips, and both feet are visible.",
        targets: [
            {
                x: 0.18,
                y: 0.34,
                landmark: 15,
                color: "#55e3ff",
                label: "LEFT HAND",
                title: "Left hand → cyan ring",
                instruction: "Reach your left wrist into the cyan ring and hold through the sync pulse."
            },
            {
                x: 0.82,
                y: 0.34,
                landmark: 16,
                color: "#ff5d73",
                label: "RIGHT HAND",
                title: "Right hand → coral ring",
                instruction: "Replay the first reach, then place your right wrist in the coral ring."
            },
            {
                x: 0.66,
                y: 0.86,
                landmark: 28,
                color: "#ffc857",
                label: "RIGHT FOOT",
                title: "Right foot → amber ring",
                instruction: "Both arm echoes replay above you. Step your right ankle into the amber ring."
            }
        ]
    }
};

function savedMode() {
    try {
        const saved = localStorage.getItem("pose-loop-experience");
        return MODE_CONFIGS[saved] ? saved : "reset";
    } catch {
        return "reset";
    }
}

let gameMode = savedMode();
let TARGETS = MODE_CONFIGS[gameMode].targets;

const BODY_CONNECTIONS = [
    [11, 12],
    [11, 13], [13, 15],
    [12, 14], [14, 16],
    [11, 23], [12, 24], [23, 24],
    [23, 25], [25, 27], [27, 31],
    [24, 26], [26, 28], [28, 32]
];

const stage = document.getElementById("stage");
const video = document.getElementById("camera");
const canvas = document.getElementById("gameCanvas");
const context = canvas.getContext("2d");
const overlay = document.getElementById("stageOverlay");
const overlayKicker = document.getElementById("overlayKicker");
const overlayTitle = document.getElementById("game-title");
const overlayCopy = document.getElementById("overlayCopy");
const modePicker = document.getElementById("modePicker");
const modeButtons = [...modePicker.querySelectorAll("[data-mode]")];
const handsFreeHint = document.getElementById("handsFreeHint");
const handsFreeTitle = document.getElementById("handsFreeTitle");
const handsFreeText = document.getElementById("handsFreeText");
const gestureProgress = document.getElementById("gestureProgress");
const actionButton = document.getElementById("actionButton");
const privacyNote = document.getElementById("privacyNote");
const cameraState = document.getElementById("cameraState");
const cameraStateText = document.getElementById("cameraStateText");
const syncBanner = document.getElementById("syncBanner");
const liveStatus = document.getElementById("liveStatus");
const loopNumber = document.getElementById("loopNumber");
const loopProgress = document.getElementById("loopProgress");
const timerText = document.getElementById("timerText");
const targetSymbol = document.getElementById("targetSymbol");
const targetTitle = document.getElementById("targetTitle");
const targetInstruction = document.getElementById("targetInstruction");
const echoList = document.getElementById("echoList");
const restartButton = document.getElementById("restartButton");
const stopButton = document.getElementById("stopButton");
const framingNote = document.getElementById("framingNote");
const brandName = document.getElementById("brandName");
const prototypeLabel = document.getElementById("prototypeLabel");
const footerMode = document.getElementById("footerMode");
const footerCue = document.getElementById("footerCue");
const resetHitCount = document.getElementById("resetHitCount");
const resetProgress = document.getElementById("resetProgress");
const resetStateLabel = document.getElementById("resetStateLabel");
const resetCueTitle = document.getElementById("resetCueTitle");
const resetCueText = document.getElementById("resetCueText");
const resetStepList = document.getElementById("resetStepList");
const releaseOrbit = document.getElementById("releaseOrbit");
const resetPanels = [...document.querySelectorAll(".reset-only")];
const echoPanels = [...document.querySelectorAll(".echo-only")];

let poseLandmarker = null;
let cameraStream = null;
let animationFrame = 0;
let state = "idle";
let loopIndex = 0;
let recordings = [];
let currentRecording = [];
let currentPose = null;
let lastInferenceAt = 0;
let lastVideoTime = -1;
let lastPoseSeenAt = 0;
let lastRecordedAt = 0;
let stablePoseFrames = 0;
let calibrationReady = false;
let countdownEnd = 0;
let loopStartedAt = 0;
let holdStartedAt = 0;
let latestHits = [false, false, false];
let canvasWidth = 0;
let canvasHeight = 0;
let currentCountdownLabel = "";
let handsFreeStartedAt = 0;
let resetAutostartAt = 0;
let resetStartedAt = 0;
let resetStepIndex = 0;
let resetAnchorPose = null;
let resetLatestHits = [];
let resetHoldStartedAt = 0;
let resetHoldProgress = 0;
let resetHitFlashUntil = 0;
let resetParticles = [];
let resetShoulderTrail = [];

function announce(message) {
    liveStatus.textContent = message;
}

function setCameraBadge(text, tone = "offline") {
    if (cameraStateText.textContent !== text) cameraStateText.textContent = text;
    cameraState.classList.toggle("is-live", tone === "live");
    cameraState.classList.toggle("is-warning", tone === "warning");
}

function showOverlay({ kicker, title, copy, button = "", enabled = true, privacy = false, showModes = false, handsFree = false }) {
    overlayKicker.textContent = kicker;
    overlayTitle.textContent = title;
    overlayCopy.textContent = copy;
    actionButton.hidden = !button;
    actionButton.textContent = button;
    actionButton.disabled = !enabled;
    privacyNote.hidden = !privacy;
    modePicker.hidden = !showModes;
    handsFreeHint.hidden = !handsFree;
    if (!handsFree) resetHandsFreeProgress();
    overlay.classList.remove("is-hidden");
}

function resetHandsFreeProgress() {
    handsFreeStartedAt = 0;
    handsFreeTitle.textContent = "HANDS-FREE START";
    gestureProgress.style.width = "0%";
    handsFreeText.textContent = "Raise both hands and hold for one second";
}

function hideOverlay() {
    overlay.classList.add("is-hidden");
}

function clearResetSession() {
    resetAutostartAt = 0;
    resetStartedAt = 0;
    resetStepIndex = 0;
    resetAnchorPose = null;
    resetLatestHits = [];
    resetHoldStartedAt = 0;
    resetHoldProgress = 0;
    resetHitFlashUntil = 0;
    resetParticles = [];
    resetShoulderTrail = [];
    releaseOrbit.style.setProperty("--hold", "0");
    syncBanner.classList.remove("is-visible", "is-hit");
    syncBanner.textContent = "SYNC WINDOW";
}

function setInitialUI() {
    const mode = MODE_CONFIGS[gameMode];
    if (gameMode === "reset") {
        showOverlay({
            kicker: "A CAMERA-GUIDED DESK RESET",
            title: "Move your dots into the glowing rings.",
            copy: "Two short rounds of gentle shoulder and head targets, then one final release. Hold each ring until it bursts.",
            button: "ENABLE CAMERA",
            privacy: true,
            showModes: true
        });
    } else {
        showOverlay({
            kicker: "ECHO PUZZLE / SECONDARY EXPERIMENT",
            title: "Cooperate with who you were six seconds ago.",
            copy: `${mode.name} is selected. Record a movement, then solve the next step beside its replay.`,
            button: "ENABLE CAMERA",
            privacy: true,
            showModes: true
        });
    }
    setCameraBadge("CAMERA OFFLINE");
    syncModeUI();
    updateHud();
}

function syncModeUI() {
    modeButtons.forEach((button) => {
        button.setAttribute("aria-pressed", String(button.dataset.mode === gameMode));
    });
    framingNote.textContent = MODE_CONFIGS[gameMode].mobileNote;
    const resetMode = gameMode === "reset";
    stage.dataset.experience = gameMode;
    brandName.textContent = resetMode ? "UNCLENCH.LAB" : "POSE_LOOP.LAB";
    prototypeLabel.textContent = resetMode ? "CAMERA TARGET BREAK / 01" : "CAMERA PUZZLE / 01";
    footerMode.textContent = resetMode
        ? "POSE LANDMARKS · TWO ROUNDS · LOCAL PROCESSING"
        : "POSE LANDMARKS · TEMPORAL REPLAY · LOCAL PROCESSING";
    footerCue.textContent = resetMode
        ? "MATCH THE RING / HOLD TO POP / STAY COMFORTABLE"
        : "MOVE SLOWLY / KEEP YOUR HANDS VISIBLE";
}

function selectMode(nextMode) {
    if (!MODE_CONFIGS[nextMode] || nextMode === gameMode) return;
    gameMode = nextMode;
    TARGETS = MODE_CONFIGS[gameMode].targets;
    try {
        localStorage.setItem("pose-loop-experience", gameMode);
    } catch {
        // A private browsing policy may block storage; the current selection still works.
    }
    syncModeUI();

    if (cameraStream) {
        recordings = [];
        currentRecording = [];
        loopIndex = 0;
        holdStartedAt = 0;
        latestHits = [false, false, false];
        stablePoseFrames = 0;
        calibrationReady = false;
        state = "calibrating";
        clearResetSession();
        if (gameMode === "reset") {
            showResetCalibrationOverlay(`${MODE_CONFIGS[gameMode].name} selected. ${MODE_CONFIGS[gameMode].framing}`);
        } else {
            showCalibrationOverlay(`${MODE_CONFIGS[gameMode].name} selected. ${MODE_CONFIGS[gameMode].framing}`);
        }
        updateHud();
        announce(`${MODE_CONFIGS[gameMode].name} selected. The previous session was cleared.`);
    } else {
        setInitialUI();
        announce(`${MODE_CONFIGS[gameMode].name} selected.`);
    }
}

async function createLandmarker(delegate) {
    const vision = await FilesetResolver.forVisionTasks(WASM_URL);
    return PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath: MODEL_URL,
            delegate
        },
        runningMode: "VIDEO",
        numPoses: 1,
        minPoseDetectionConfidence: 0.55,
        minPosePresenceConfidence: 0.55,
        minTrackingConfidence: 0.55,
        outputSegmentationMasks: false
    });
}

async function ensureLandmarker() {
    if (poseLandmarker) return poseLandmarker;
    try {
        poseLandmarker = await createLandmarker("GPU");
    } catch (gpuError) {
        console.info("GPU pose tracking unavailable; using CPU tracking.", gpuError);
        poseLandmarker = await createLandmarker("CPU");
    }
    return poseLandmarker;
}

function cameraErrorMessage(error) {
    if (!window.isSecureContext) {
        return "Camera access needs HTTPS or localhost. Open this page from its secure site and try again.";
    }
    if (error?.name === "NotAllowedError") {
        return "Camera permission was blocked. Allow camera access for this site, then try again.";
    }
    if (error?.name === "NotFoundError") {
        return "No camera was found on this device.";
    }
    if (error?.name === "NotReadableError") {
        return "Another app may be using the camera. Close it and try again.";
    }
    return "The camera or pose model could not start. Check your connection and try again.";
}

async function enableCamera() {
    if (state === "loading") return;
    if (!navigator.mediaDevices?.getUserMedia) {
        state = "error";
        showOverlay({
            kicker: "CAMERA UNAVAILABLE",
            title: "This browser cannot open the camera.",
            copy: "Try a current version of Chrome, Safari, Edge, or Firefox on HTTPS.",
            button: "TRY AGAIN",
            privacy: true
        });
        return;
    }

    state = "loading";
    showOverlay({
        kicker: "INITIALIZING LOCAL VISION",
        title: "Waking up the pose tracker…",
        copy: "The first start downloads a small vision model. This normally takes a few seconds; frames remain inside this tab.",
        privacy: true
    });
    setCameraBadge("REQUESTING CAMERA", "warning");

    try {
        cameraStream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
                facingMode: "user",
                width: { ideal: 1280 },
                height: { ideal: 720 }
            }
        });

        video.srcObject = cameraStream;
        await video.play();
        stage.classList.add("has-camera");
        setCameraBadge("LOADING POSE MODEL", "warning");
        await ensureLandmarker();

        state = "calibrating";
        restartButton.disabled = false;
        stopButton.disabled = false;
        stablePoseFrames = 0;
        calibrationReady = false;
        setCameraBadge("FINDING YOUR POSE", "warning");
        if (gameMode === "reset") showResetCalibrationOverlay();
        else showCalibrationOverlay();
        startRenderLoop();
        announce(`Camera enabled. ${MODE_CONFIGS[gameMode].framing}`);
    } catch (error) {
        console.error(error);
        stopMediaTracks();
        restartButton.disabled = true;
        stopButton.disabled = true;
        state = "error";
        setCameraBadge("START FAILED", "warning");
        showOverlay({
            kicker: "COULD NOT START",
            title: "The camera stayed dark.",
            copy: cameraErrorMessage(error),
            button: "TRY AGAIN",
            privacy: true
        });
        announce(cameraErrorMessage(error));
    }
}

function showResetCalibrationOverlay(note = MODE_CONFIGS.reset.framing) {
    showOverlay({
        kicker: "TWO ROUNDS / AUTO START",
        title: "First, find your shoulder dots.",
        copy: `${note} Bright rings appear after tracking locks. Match the named dot to each ring and hold until it pops.`,
        button: "START NOW",
        enabled: true,
        privacy: true,
        showModes: true,
        handsFree: true
    });
    handsFreeTitle.textContent = "POSE CHECK";
    handsFreeText.textContent = "Stay in frame—starts when the shoulder dots lock";
    gestureProgress.style.width = "0%";
    resetAutostartAt = 0;
}

function showCalibrationOverlay(note = MODE_CONFIGS[gameMode].framing) {
    const nextLoop = Math.min(loopIndex + 1, TARGETS.length);
    const handsFree = gameMode === "full";
    showOverlay({
        kicker: recordings.length ? `${recordings.length} ECHO${recordings.length === 1 ? "" : "ES"} SAVED` : "CALIBRATE YOUR SPACE",
        title: "Start when you're comfortable.",
        copy: handsFree ? `${note} Then raise both hands for one second to start.` : note,
        button: `BEGIN LOOP ${String(nextLoop).padStart(2, "0")}`,
        enabled: true,
        privacy: true,
        showModes: true,
        handsFree
    });
}

function updateCalibrationOverlay() {
    if (state !== "calibrating") return;
    const ready = stablePoseFrames >= 6;
    if (ready === calibrationReady) return;
    calibrationReady = ready;

    if (gameMode === "reset") {
        if (ready) {
            showResetCalibrationOverlay("Camera ready. Your first two targets will appear above your shoulders.");
            setCameraBadge("BODY FOUND / STARTING", "live");
            announce("Body found. The first target will appear automatically.");
        } else {
            actionButton.disabled = false;
            setCameraBadge("FINDING HEAD + SHOULDERS", "warning");
        }
        return;
    }

    if (ready) {
        const nextLoop = Math.min(loopIndex + 1, TARGETS.length);
        showOverlay({
            kicker: "POSE LOCKED",
            title: recordings.length ? "Your echoes are waiting." : "Ready to meet yourself?",
            copy: gameMode === "full"
                ? `${TARGETS[loopIndex].instruction} Raise both hands for one second to start the countdown.`
                : `${TARGETS[loopIndex].instruction} You will get a three-second countdown.`,
            button: `BEGIN LOOP ${String(nextLoop).padStart(2, "0")}`,
            enabled: true,
            privacy: true,
            showModes: true,
            handsFree: gameMode === "full"
        });
        setCameraBadge("POSE LOCKED", "live");
        announce(`Pose locked. Ready for loop ${nextLoop}.`);
    } else {
        actionButton.disabled = false;
        setCameraBadge("FINDING YOUR POSE", "warning");
    }
}

function startCountdown() {
    if (!cameraStream) return;

    state = "countdown";
    countdownEnd = performance.now() + COUNTDOWN_MS;
    currentCountdownLabel = "";
    currentRecording = [];
    holdStartedAt = 0;
    lastRecordedAt = 0;
    syncBanner.classList.remove("is-visible");
    showOverlay({
        kicker: `LOOP ${String(loopIndex + 1).padStart(2, "0")} / ${TARGETS[loopIndex].label}`,
        title: "3",
        copy: TARGETS[loopIndex].instruction
    });
    updateHud();
    announce(`Loop ${loopIndex + 1} begins in three seconds.`);
}

function startResetCountdown() {
    if (!cameraStream) return;
    state = "reset-countdown";
    countdownEnd = performance.now() + RESET_COUNTDOWN_MS;
    currentCountdownLabel = "";
    resetAutostartAt = 0;
    showOverlay({
        kicker: "TARGET 01 / BOTH SHOULDERS",
        title: "2",
        copy: "Two cyan rings are about to appear. Lift both shoulder dots into them and hold until they burst."
    });
    updateHud();
    announce("The first shoulder target begins in two seconds.");
}

function beginReset(now) {
    const anchor = currentPose ? clonePose(currentPose) : null;
    clearResetSession();
    state = "reset-playing";
    resetStartedAt = now;
    resetStepIndex = 0;
    resetAnchorPose = anchor;
    hideOverlay();
    setCameraBadge("TARGET 01 / LIVE", "live");
    updateResetHud();
    announce(`${RESET_STEPS[0].title}. ${RESET_STEPS[0].cue}`);
}

function completeReset() {
    state = "reset-complete";
    resetHoldProgress = 1;
    releaseOrbit.style.setProperty("--hold", "1");
    showOverlay({
        kicker: "BOTH ROUNDS COMPLETE",
        title: "Nice. You moved instead of waiting.",
        copy: "That is the whole reset. Notice how your shoulders feel, then change position or stand if that is comfortable.",
        button: "DO IT AGAIN",
        privacy: true,
        showModes: true
    });
    setCameraBadge("TARGET RUN COMPLETE", "live");
    updateResetHud();
    announce("Target reset complete. Both rounds and the final release are done.");
}

function restartReset() {
    clearResetSession();
    stablePoseFrames = hasPlayablePose(currentPose) ? 6 : 0;
    calibrationReady = false;
    state = "calibrating";
    showResetCalibrationOverlay("The previous run is clear. Sit comfortably and let the shoulder dots lock again.");
    updateCalibrationOverlay();
    updateHud();
    announce("Target run ready to begin again.");
}

function beginLoop(now) {
    state = "playing";
    loopStartedAt = now;
    currentRecording = [];
    holdStartedAt = 0;
    lastRecordedAt = 0;
    hideOverlay();
    announce(`Loop ${loopIndex + 1} started. ${TARGETS[loopIndex].instruction}`);
}

function completeCurrentLoop() {
    if (!currentRecording.length && currentPose) {
        currentRecording.push({ t: LOOP_MS, pose: clonePose(currentPose) });
    }
    recordings[loopIndex] = currentRecording.slice();
    const completed = loopIndex;
    loopIndex += 1;
    holdStartedAt = 0;
    syncBanner.classList.remove("is-visible");

    if (loopIndex >= TARGETS.length) {
        state = "won";
        showOverlay({
            kicker: "TEMPORAL LOCK ACHIEVED",
            title: "Three times. One moment.",
            copy: "Your two recorded selves held the upper rings while the present you completed the pattern.",
            button: "PLAY AGAIN",
            privacy: true
        });
        setCameraBadge("PUZZLE COMPLETE", "live");
        announce("Puzzle complete. All three versions of you met at the sync pulse.");
    } else {
        state = "handoff";
        showOverlay({
            kicker: `ECHO ${String(completed + 1).padStart(2, "0")} SAVED`,
            title: "That movement now belongs to your past.",
            copy: gameMode === "full"
                ? `It will replay beside you. Next: ${TARGETS[loopIndex].instruction} Raise both hands to continue.`
                : `It will replay beside you. Next: ${TARGETS[loopIndex].instruction}`,
            button: `RECORD ECHO ${String(loopIndex + 1).padStart(2, "0")}`,
            handsFree: gameMode === "full"
        });
        setCameraBadge(`${recordings.length} ECHO${recordings.length === 1 ? "" : "ES"} READY`, "live");
        announce(`Echo ${completed + 1} saved. Continue when ready.`);
    }
    updateHud();
}

function failCurrentLoop() {
    state = "retry";
    currentRecording = [];
    holdStartedAt = 0;
    syncBanner.classList.remove("is-visible");
    showOverlay({
        kicker: "SYNC MISSED",
        title: "The echo slipped.",
        copy: recordings.length
            ? `Try loop ${loopIndex + 1} again. Your ${recordings.length} saved echo${recordings.length === 1 ? " stays" : "es stay"} intact.${gameMode === "full" ? " Raise both hands to retry." : ""}`
            : `Try loop ${loopIndex + 1} again. Move into the ring before the sync window closes.${gameMode === "full" ? " Raise both hands to retry." : ""}`,
        button: `RETRY LOOP ${String(loopIndex + 1).padStart(2, "0")}`,
        handsFree: gameMode === "full"
    });
    setCameraBadge("READY TO RETRY", "warning");
    announce(`Sync missed. Retry loop ${loopIndex + 1}.`);
    updateHud();
}

function resetPuzzle() {
    recordings = [];
    currentRecording = [];
    loopIndex = 0;
    holdStartedAt = 0;
    latestHits = [false, false, false];
    stablePoseFrames = hasPlayablePose(currentPose) ? 6 : 0;
    calibrationReady = false;
    state = "calibrating";
    showCalibrationOverlay("The timeline is clear. Lock your pose to begin again.");
    updateCalibrationOverlay();
    updateHud();
    announce("Puzzle restarted. No pose recordings remain.");
}

function stopMediaTracks() {
    cameraStream?.getTracks().forEach((track) => track.stop());
    cameraStream = null;
    video.srcObject = null;
    stage.classList.remove("has-camera");
}

function stopCamera() {
    stopMediaTracks();
    if (animationFrame) cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    currentPose = null;
    recordings = [];
    currentRecording = [];
    loopIndex = 0;
    stablePoseFrames = 0;
    holdStartedAt = 0;
    clearResetSession();
    state = "idle";
    restartButton.disabled = true;
    stopButton.disabled = true;
    syncBanner.classList.remove("is-visible");
    clearCanvas();
    setInitialUI();
    announce("Camera stopped. Temporary pose recordings were cleared.");
}

function hasPlayablePose(pose) {
    if (!pose) return false;
    const required = MODE_CONFIGS[gameMode].requiredLandmarks;
    return required.every((index) => {
        const point = pose[index];
        return point
            && (point.visibility ?? 1) > 0.42
            && (point.presence ?? 1) > 0.42
            && point.x > -0.08 && point.x < 1.08
            && point.y > -0.08 && point.y < 1.08;
    });
}

function clonePose(pose) {
    return pose.map((point) => ({
        x: point.x,
        y: point.y,
        z: point.z,
        visibility: point.visibility,
        presence: point.presence
    }));
}

function processResetPose(pose, now) {
    resetShoulderTrail.push({
        t: now,
        left: { x: pose[11].x, y: pose[11].y, visibility: pose[11].visibility },
        right: { x: pose[12].x, y: pose[12].y, visibility: pose[12].visibility }
    });
    resetShoulderTrail = resetShoulderTrail.filter((entry) => now - entry.t <= 2600);
}

function resetTargetGeometry(target) {
    const anchorPose = resetAnchorPose || currentPose;
    if (!anchorPose?.[target.landmark] || !anchorPose[11] || !anchorPose[12]) return null;
    const anchor = landmarkToCanvas(anchorPose[target.landmark]);
    const left = landmarkToCanvas(anchorPose[11]);
    const right = landmarkToCanvas(anchorPose[12]);
    const span = Math.max(Math.hypot(right.x - left.x, right.y - left.y), 110);
    return {
        x: anchor.x + (target.dx || 0) * span,
        y: anchor.y + (target.dy || 0) * span,
        radius: Math.min(Math.max(span * (target.radius || 0.115), 27), 54)
    };
}

function resetTargetHit(pose, target) {
    const geometry = resetTargetGeometry(target);
    const landmark = pose?.[target.landmark];
    if (!geometry || !landmark) return false;
    const point = landmarkToCanvas(landmark);
    if (!point.visible) return false;
    return Math.hypot(point.x - geometry.x, point.y - geometry.y) <= geometry.radius * 0.82;
}

function spawnResetBurst(step, now) {
    step.targets.forEach((target) => {
        const geometry = resetTargetGeometry(target);
        if (!geometry) return;
        for (let index = 0; index < 18; index += 1) {
            const angle = Math.PI * 2 * index / 18 + Math.random() * 0.18;
            const speed = 0.05 + Math.random() * 0.12;
            resetParticles.push({
                x: geometry.x,
                y: geometry.y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                born: now,
                life: 520 + Math.random() * 360,
                color: step.color
            });
        }
    });
}

function completeResetTarget(now) {
    const completedStep = RESET_STEPS[resetStepIndex];
    spawnResetBurst(completedStep, now);
    resetStepIndex += 1;
    resetHoldStartedAt = 0;
    resetHoldProgress = 0;
    resetLatestHits = [];
    resetHitFlashUntil = now + 850;
    const nextStep = RESET_STEPS[resetStepIndex];
    const phaseChanged = nextStep && nextStep.phase !== completedStep.phase;
    syncBanner.textContent = phaseChanged
        ? nextStep.phase === 2 ? "ROUND 02 · REMIX" : "FINALE · RELEASE"
        : `POP · ${String(resetStepIndex).padStart(2, "0")} / ${String(RESET_STEPS.length).padStart(2, "0")}`;
    syncBanner.classList.add("is-visible", "is-hit");
    releaseOrbit.style.setProperty("--hold", "0");

    if (resetStepIndex >= RESET_STEPS.length) {
        completeReset();
        return;
    }

    setCameraBadge(`TARGET ${String(resetStepIndex + 1).padStart(2, "0")} / LIVE`, "live");
    announce(`${nextStep.title}. ${nextStep.cue}`);
}

function runInference(now) {
    if (!poseLandmarker || !cameraStream || video.readyState < 2) return;
    if (now - lastInferenceAt < INFERENCE_INTERVAL_MS || video.currentTime === lastVideoTime) return;

    lastInferenceAt = now;
    lastVideoTime = video.currentTime;

    try {
        const result = poseLandmarker.detectForVideo(video, now);
        const pose = result.landmarks?.[0] || null;
        if (pose && hasPlayablePose(pose)) {
            currentPose = pose;
            lastPoseSeenAt = now;
            stablePoseFrames = Math.min(stablePoseFrames + 1, 12);

            if (state === "playing" && now - lastRecordedAt >= SAMPLE_INTERVAL_MS) {
                currentRecording.push({
                    t: Math.min(Math.max(now - loopStartedAt, 0), LOOP_MS),
                    pose: clonePose(pose)
                });
                lastRecordedAt = now;
            }
            if (state === "reset-playing") processResetPose(pose, now);
        } else {
            stablePoseFrames = Math.max(stablePoseFrames - 2, 0);
            if (now - lastPoseSeenAt > 260) currentPose = null;
        }
        updateCalibrationOverlay();
    } catch (error) {
        console.warn("Pose frame skipped.", error);
    }
}

function sampleRecording(recording, elapsed) {
    if (!recording?.length) return null;
    if (elapsed <= recording[0].t) return recording[0].pose;
    if (elapsed >= recording[recording.length - 1].t) return recording[recording.length - 1].pose;

    let low = 0;
    let high = recording.length - 1;
    while (low <= high) {
        const middle = (low + high) >> 1;
        if (recording[middle].t < elapsed) low = middle + 1;
        else high = middle - 1;
    }
    return recording[Math.min(low, recording.length - 1)].pose;
}

function bothHandsRaised(pose) {
    if (!pose) return false;
    const leftShoulder = pose[11];
    const rightShoulder = pose[12];
    const leftWrist = pose[15];
    const rightWrist = pose[16];
    const points = [leftShoulder, rightShoulder, leftWrist, rightWrist];
    if (points.some((point) => !point || (point.visibility ?? 1) < 0.42 || (point.presence ?? 1) < 0.42)) {
        return false;
    }
    return leftWrist.y < leftShoulder.y - 0.035 && rightWrist.y < rightShoulder.y - 0.035;
}

function updateHandsFreeStart(now) {
    const eligibleState = state === "calibrating" || state === "handoff" || state === "retry";
    const eligible = gameMode === "full"
        && eligibleState
        && !handsFreeHint.hidden
        && hasPlayablePose(currentPose);

    if (!eligible || !bothHandsRaised(currentPose)) {
        if (handsFreeStartedAt) resetHandsFreeProgress();
        return;
    }

    if (!handsFreeStartedAt) handsFreeStartedAt = now;
    const progress = Math.min((now - handsFreeStartedAt) / HANDS_FREE_HOLD_MS, 1);
    gestureProgress.style.width = `${progress * 100}%`;
    handsFreeText.textContent = progress < 1
        ? `Keep holding… ${Math.ceil((1 - progress) * 10) / 10}s`
        : "Starting countdown";

    if (progress >= 1) {
        resetHandsFreeProgress();
        announce("Hands-free start recognized. Countdown beginning.");
        startCountdown();
    }
}

function updateResetAutostart(now) {
    const eligible = gameMode === "reset"
        && state === "calibrating"
        && !handsFreeHint.hidden
        && stablePoseFrames >= 6
        && hasPlayablePose(currentPose);

    if (!eligible) {
        if (resetAutostartAt) {
            resetAutostartAt = 0;
            gestureProgress.style.width = "0%";
            handsFreeTitle.textContent = "POSE CHECK";
            handsFreeText.textContent = "Stay in frame—starts when the shoulder dots lock";
        }
        return;
    }

    if (!resetAutostartAt) resetAutostartAt = now;
    const progress = Math.min((now - resetAutostartAt) / RESET_AUTOSTART_MS, 1);
    handsFreeTitle.textContent = "POSE CHECK";
    gestureProgress.style.width = `${progress * 100}%`;
    handsFreeText.textContent = progress < 1
        ? `Shoulder dots locked… ${Math.ceil((1 - progress) * 12) / 10}s`
        : "Targets incoming";

    if (progress >= 1) startResetCountdown();
}

function updateCountdown(now) {
    const remaining = Math.max(0, countdownEnd - now);
    const label = String(Math.max(1, Math.ceil(remaining / 1000)));
    if (label !== currentCountdownLabel) {
        currentCountdownLabel = label;
        overlayTitle.textContent = label;
    }
    if (remaining <= 0) {
        if (state === "reset-countdown") beginReset(now);
        else beginLoop(now);
    }
}

function updateReset(now) {
    if (now >= resetHitFlashUntil) {
        syncBanner.classList.remove("is-visible", "is-hit");
    }

    if (!resetAnchorPose && currentPose) resetAnchorPose = clonePose(currentPose);
    const step = RESET_STEPS[resetStepIndex];
    if (!step || !currentPose) {
        resetLatestHits = [];
        resetHoldStartedAt = 0;
        resetHoldProgress = 0;
        releaseOrbit.style.setProperty("--hold", "0");
        return;
    }

    resetLatestHits = step.targets.map((target) => resetTargetHit(currentPose, target));
    if (resetLatestHits.every(Boolean)) {
        if (!resetHoldStartedAt) resetHoldStartedAt = now;
        resetHoldProgress = Math.min((now - resetHoldStartedAt) / (step.hold || RESET_HOLD_MS), 1);
        if (resetHoldProgress >= 1) completeResetTarget(now);
    } else {
        resetHoldStartedAt = 0;
        resetHoldProgress = 0;
    }
    releaseOrbit.style.setProperty("--hold", resetHoldProgress.toFixed(3));
}

function updatePlaying(now) {
    const elapsed = Math.min(Math.max(now - loopStartedAt, 0), LOOP_MS);
    const syncActive = elapsed >= LOOP_MS - SYNC_WINDOW_MS;
    syncBanner.classList.toggle("is-visible", syncActive);
    latestHits = getTargetHits(elapsed);
    const allRequiredTargetsHit = latestHits.slice(0, loopIndex + 1).every(Boolean);

    if (syncActive && allRequiredTargetsHit) {
        if (!holdStartedAt) holdStartedAt = now;
        if (now - holdStartedAt >= HOLD_MS) {
            completeCurrentLoop();
            return;
        }
    } else {
        holdStartedAt = 0;
    }

    if (elapsed >= LOOP_MS) {
        failCurrentLoop();
        return;
    }

    updateTimeline(elapsed);
}

function updateTimeline(elapsed) {
    const progress = Math.min(Math.max(elapsed / LOOP_MS, 0), 1);
    loopProgress.style.width = `${progress * 100}%`;
    timerText.textContent = `${Math.max((LOOP_MS - elapsed) / 1000, 0).toFixed(1)} SEC`;
}

function updateResetHud() {
    const activeIndex = state === "reset-complete" ? RESET_STEPS.length : resetStepIndex;
    const displayedCount = state === "reset-complete" ? RESET_STEPS.length : resetStepIndex;
    resetHitCount.textContent = String(displayedCount).padStart(2, "0");
    resetProgress.style.width = `${Math.min((displayedCount + resetHoldProgress) / RESET_STEPS.length, 1) * 100}%`;

    const activeStep = RESET_STEPS[Math.min(activeIndex, RESET_STEPS.length - 1)];
    resetCueTitle.textContent = state === "reset-complete" ? "Complete" : activeStep.title;
    resetCueText.textContent = state === "reset-complete"
        ? "Both rounds are complete. Notice how you feel, then change position if that is comfortable."
        : activeStep.cue;
    resetStateLabel.textContent = state === "reset-playing"
        ? !currentPose ? "FIND YOUR DOTS" : resetHoldProgress > 0 ? "HOLDING" : "MATCH THE RING"
        : state === "reset-complete" ? "COMPLETE" : "READY";
    releaseOrbit.textContent = state === "reset-complete"
        ? "✓"
        : resetHoldProgress > 0
            ? `${Math.round(resetHoldProgress * 100)}%`
            : String(Math.min(activeIndex + 1, RESET_STEPS.length)).padStart(2, "0");

    [...resetStepList.children].forEach((item, index) => {
        const phase = RESET_PHASES[index];
        item.classList.toggle("is-current", state === "reset-playing" && activeIndex >= phase.start && activeIndex < phase.end);
        item.classList.toggle("is-complete", displayedCount >= phase.end || state === "reset-complete");
    });
}

function updateHud() {
    const resetMode = gameMode === "reset";
    resetPanels.forEach((panel) => { panel.hidden = !resetMode; });
    echoPanels.forEach((panel) => { panel.hidden = resetMode; });
    restartButton.textContent = resetMode ? "RESTART RESET" : "RESTART PUZZLE";

    if (resetMode) {
        updateResetHud();
        return;
    }

    const cameraActive = Boolean(cameraStream);
    const displayLoop = state === "won" ? TARGETS.length : Math.min(loopIndex + 1, TARGETS.length);
    loopNumber.textContent = cameraActive ? String(displayLoop).padStart(2, "0") : "00";

    if (state !== "playing") {
        loopProgress.style.width = state === "won" ? "100%" : "0%";
        timerText.textContent = state === "won" ? "LOCKED" : "6.0 SEC";
    }

    if (cameraActive && loopIndex < TARGETS.length) {
        const target = TARGETS[loopIndex];
        targetTitle.textContent = target.title;
        targetInstruction.textContent = target.instruction;
        targetSymbol.textContent = loopIndex === 2 ? "⌄" : "○";
        targetSymbol.style.color = `${target.color}26`;
    } else if (state === "won") {
        targetTitle.textContent = "Timeline complete";
        targetInstruction.textContent = "All three poses met during the same sync pulse.";
        targetSymbol.textContent = "✓";
        targetSymbol.style.color = "rgba(183, 255, 80, 0.18)";
    } else {
        targetTitle.textContent = "Camera not started";
        targetInstruction.textContent = "Give the browser camera access, then step far enough back for pose tracking.";
        targetSymbol.textContent = "○";
        targetSymbol.style.color = "rgba(85, 227, 255, 0.15)";
    }

    [...echoList.children].forEach((item, index) => {
        const recorded = index < recordings.length;
        const current = cameraActive && index === loopIndex && state !== "won";
        item.classList.toggle("is-recorded", recorded);
        item.classList.toggle("is-current", current);
        const status = item.querySelector("em");
        if (recorded) status.textContent = "recorded";
        else if (current) status.textContent = state === "playing" ? "recording" : "next";
        else status.textContent = state === "won" ? "complete" : "waiting";
    });
}

function syncCanvasSize() {
    const bounds = stage.getBoundingClientRect();
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    canvasWidth = Math.max(1, bounds.width);
    canvasHeight = Math.max(1, bounds.height);
    canvas.width = Math.round(canvasWidth * pixelRatio);
    canvas.height = Math.round(canvasHeight * pixelRatio);
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
}

function clearCanvas() {
    context.clearRect(0, 0, canvasWidth, canvasHeight);
}

function landmarkToCanvas(point) {
    const videoWidth = video.videoWidth || canvasWidth;
    const videoHeight = video.videoHeight || canvasHeight;
    const scale = Math.max(canvasWidth / videoWidth, canvasHeight / videoHeight);
    const drawnWidth = videoWidth * scale;
    const drawnHeight = videoHeight * scale;
    const offsetX = (canvasWidth - drawnWidth) / 2;
    const offsetY = (canvasHeight - drawnHeight) / 2;
    const unmirroredX = offsetX + point.x * drawnWidth;
    return {
        x: canvasWidth - unmirroredX,
        y: offsetY + point.y * drawnHeight,
        visible: (point.visibility ?? 1) > 0.32 && (point.presence ?? 1) > 0.32
    };
}

function targetGeometry(index) {
    const target = TARGETS[index];
    return {
        x: target.x * canvasWidth,
        y: target.y * canvasHeight,
        radius: Math.min(Math.max(Math.min(canvasWidth, canvasHeight) * 0.072, 34), 62)
    };
}

function hitTarget(pose, index) {
    if (!pose) return false;
    const landmark = pose[TARGETS[index].landmark];
    if (!landmark) return false;
    const point = landmarkToCanvas(landmark);
    if (!point.visible) return false;
    const target = targetGeometry(index);
    return Math.hypot(point.x - target.x, point.y - target.y) <= target.radius * 0.78;
}

function getTargetHits(elapsed) {
    return TARGETS.map((target, index) => {
        if (index < loopIndex) return hitTarget(sampleRecording(recordings[index], elapsed), index);
        if (index === loopIndex) return hitTarget(currentPose, index);
        return false;
    });
}

function drawTarget(index, hit, holdProgress) {
    const target = TARGETS[index];
    const geometry = targetGeometry(index);
    const available = index <= loopIndex;
    const active = index === loopIndex;

    context.save();
    context.translate(geometry.x, geometry.y);
    context.globalAlpha = available ? 1 : 0.22;

    context.beginPath();
    context.arc(0, 0, geometry.radius, 0, Math.PI * 2);
    context.fillStyle = hit ? `${target.color}2d` : "rgba(5, 9, 10, 0.4)";
    context.fill();
    context.lineWidth = active ? 3 : 1.5;
    context.strokeStyle = hit ? target.color : `${target.color}8f`;
    context.setLineDash(hit ? [] : [7, 7]);
    context.stroke();

    if (active && holdProgress > 0) {
        context.beginPath();
        context.arc(0, 0, geometry.radius + 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * holdProgress);
        context.setLineDash([]);
        context.lineWidth = 4;
        context.strokeStyle = target.color;
        context.stroke();
    }

    context.setLineDash([]);
    context.fillStyle = hit ? target.color : "rgba(232, 239, 236, 0.7)";
    context.font = "600 10px IBM Plex Mono, monospace";
    context.textAlign = "center";
    context.fillText(target.label, 0, geometry.radius + 21);

    context.fillStyle = target.color;
    context.beginPath();
    context.arc(0, 0, hit ? 5 : 3, 0, Math.PI * 2);
    context.fill();
    context.restore();
}

function drawPose(pose, color, alpha, lineWidth, label = "") {
    if (!pose) return;
    const points = pose.map(landmarkToCanvas);

    context.save();
    context.globalAlpha = alpha;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = color;
    context.fillStyle = color;
    context.lineWidth = lineWidth;
    context.shadowColor = color;
    context.shadowBlur = alpha > 0.75 ? 8 : 13;

    for (const [start, end] of BODY_CONNECTIONS) {
        const a = points[start];
        const b = points[end];
        if (!a?.visible || !b?.visible) continue;
        context.beginPath();
        context.moveTo(a.x, a.y);
        context.lineTo(b.x, b.y);
        context.stroke();
    }

    [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28].forEach((index) => {
        const point = points[index];
        if (!point?.visible) return;
        context.beginPath();
        context.arc(point.x, point.y, index === 0 ? 5 : 3.2, 0, Math.PI * 2);
        context.fill();
    });

    if (label && points[0]?.visible) {
        context.shadowBlur = 0;
        context.font = "600 10px IBM Plex Mono, monospace";
        context.textAlign = "center";
        context.fillText(label, points[0].x, points[0].y - 18);
    }
    context.restore();
}

function drawResetTrail(side, color, now) {
    if (resetShoulderTrail.length < 2) return;
    context.save();
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = 3;
    context.strokeStyle = color;
    context.beginPath();
    let started = false;
    resetShoulderTrail.forEach((entry) => {
        const point = landmarkToCanvas(entry[side]);
        if (!point.visible) return;
        if (!started) {
            context.moveTo(point.x, point.y);
            started = true;
        } else {
            context.lineTo(point.x, point.y);
        }
    });
    const newest = resetShoulderTrail[resetShoulderTrail.length - 1];
    context.globalAlpha = Math.min((now - resetShoulderTrail[0].t) / 1200, 1) * 0.52;
    context.shadowColor = color;
    context.shadowBlur = 10;
    context.stroke();
    context.globalAlpha = newest ? 0.18 : 0;
    context.restore();
}

function drawResetTarget(target, index, step, now) {
    const geometry = resetTargetGeometry(target);
    if (!geometry) return;
    const point = currentPose?.[target.landmark] ? landmarkToCanvas(currentPose[target.landmark]) : null;
    const hit = Boolean(resetLatestHits[index]);
    const pulse = (Math.sin(now / 210 + index * 1.4) + 1) / 2;

    context.save();
    if (point?.visible) {
        context.globalAlpha = hit ? 0.7 : 0.34;
        context.strokeStyle = step.color;
        context.lineWidth = 1.5;
        context.setLineDash([4, 6]);
        context.beginPath();
        context.moveTo(point.x, point.y);
        context.lineTo(geometry.x, geometry.y);
        context.stroke();

        context.setLineDash([]);
        context.globalAlpha = 0.95;
        context.fillStyle = hit ? step.color : "#f2f6f3";
        context.beginPath();
        context.arc(point.x, point.y, hit ? 7 : 5, 0, Math.PI * 2);
        context.fill();
    }

    context.translate(geometry.x, geometry.y);
    context.globalAlpha = 0.92;
    context.fillStyle = hit ? `${step.color}42` : "rgba(5, 9, 10, 0.44)";
    context.strokeStyle = step.color;
    context.lineWidth = hit ? 4 : 2.5;
    context.setLineDash(hit ? [] : [7, 7]);
    context.beginPath();
    context.arc(0, 0, geometry.radius, 0, Math.PI * 2);
    context.fill();
    context.stroke();

    context.setLineDash([]);
    context.globalAlpha = 0.32 + pulse * 0.22;
    context.lineWidth = 2;
    context.beginPath();
    context.arc(0, 0, geometry.radius * (1.42 - pulse * 0.18), 0, Math.PI * 2);
    context.stroke();

    if (resetHoldProgress > 0) {
        context.globalAlpha = 1;
        context.lineWidth = 5;
        context.beginPath();
        context.arc(0, 0, geometry.radius + 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * resetHoldProgress);
        context.stroke();
    }

    context.globalAlpha = 0.9;
    context.fillStyle = step.color;
    context.font = "600 10px IBM Plex Mono, monospace";
    context.textAlign = "center";
    context.fillText(hit ? "LOCKED" : target.label, 0, geometry.radius + 22);
    context.restore();
}

function drawResetParticles(now) {
    resetParticles = resetParticles.filter((particle) => now - particle.born < particle.life);
    context.save();
    context.globalCompositeOperation = "screen";
    resetParticles.forEach((particle) => {
        const age = now - particle.born;
        const progress = age / particle.life;
        context.globalAlpha = Math.max(1 - progress, 0);
        context.fillStyle = particle.color;
        context.beginPath();
        context.arc(
            particle.x + particle.vx * age,
            particle.y + particle.vy * age + age * age * 0.000025,
            2 + (1 - progress) * 3,
            0,
            Math.PI * 2
        );
        context.fill();
    });
    context.restore();
}

function drawResetField(now) {
    if (currentPose) {
        const step = RESET_STEPS[Math.min(resetStepIndex, RESET_STEPS.length - 1)];
        const color = step?.color || "#55e3ff";
        drawResetTrail("left", color, now);
        drawResetTrail("right", color, now);
    }

    if (state === "reset-playing") {
        const step = RESET_STEPS[resetStepIndex];
        step?.targets.forEach((target, index) => drawResetTarget(target, index, step, now));
    }

    drawResetParticles(now);
}

function drawFrame(now) {
    clearCanvas();
    if (!cameraStream) return;

    if (gameMode === "reset") {
        drawResetField(now);
        if (currentPose) drawPose(currentPose, "#e8f3ef", 0.58, 2.2, state === "reset-playing" ? "MOVE / LIVE" : "POSE / LIVE");
        return;
    }

    let elapsed = 0;
    if (state === "playing") elapsed = Math.min(Math.max(now - loopStartedAt, 0), LOOP_MS);

    const showGameTargets = ["countdown", "playing", "handoff", "retry", "won"].includes(state);
    if (showGameTargets) {
        const holdProgress = holdStartedAt ? Math.min((now - holdStartedAt) / HOLD_MS, 1) : 0;
        TARGETS.forEach((target, index) => drawTarget(index, latestHits[index], index === loopIndex ? holdProgress : 0));
    }

    recordings.forEach((recording, index) => {
        const pose = sampleRecording(recording, elapsed);
        drawPose(pose, TARGETS[index].color, 0.58, 3.5, `ECHO ${String(index + 1).padStart(2, "0")}`);
    });

    if (currentPose) {
        drawPose(currentPose, "#f3f7f4", 0.9, 2.7, state === "playing" ? "YOU / LIVE" : "POSE / LIVE");
    }
}

function updatePoseBadge(now) {
    if (!["playing", "countdown", "reset-playing", "reset-countdown"].includes(state)) return;
    if (currentPose && now - lastPoseSeenAt < 300) {
        const label = state === "reset-playing"
            ? `TARGET ${String(resetStepIndex + 1).padStart(2, "0")} / ${String(RESET_STEPS.length).padStart(2, "0")}`
            : state === "playing" ? "RECORDING POSE" : "POSE LOCKED";
        setCameraBadge(label, "live");
    } else {
        setCameraBadge("STEP INTO FRAME", "warning");
    }
}

function render(now) {
    animationFrame = requestAnimationFrame(render);
    runInference(now);
    updateHandsFreeStart(now);
    updateResetAutostart(now);

    if (state === "countdown" || state === "reset-countdown") updateCountdown(now);
    else if (state === "playing") updatePlaying(now);
    else if (state === "reset-playing") updateReset(now);

    updatePoseBadge(now);
    updateHud();
    drawFrame(now);
}

function startRenderLoop() {
    if (animationFrame) return;
    syncCanvasSize();
    animationFrame = requestAnimationFrame(render);
}

actionButton.addEventListener("click", () => {
    if (state === "idle" || state === "error") enableCamera();
    else if (gameMode === "reset") {
        if (state === "calibrating") startResetCountdown();
        else if (state === "reset-complete") {
            restartReset();
            startResetCountdown();
        }
    } else if (state === "calibrating" || state === "handoff" || state === "retry") startCountdown();
    else if (state === "won") {
        resetPuzzle();
        if (hasPlayablePose(currentPose)) startCountdown();
    }
});

modeButtons.forEach((button) => {
    button.addEventListener("click", () => selectMode(button.dataset.mode));
});

restartButton.addEventListener("click", () => {
    if (gameMode === "reset") restartReset();
    else resetPuzzle();
});
stopButton.addEventListener("click", stopCamera);

document.addEventListener("visibilitychange", () => {
    if (document.hidden && (state === "reset-playing" || state === "reset-countdown")) {
        state = "calibrating";
        stablePoseFrames = 0;
        calibrationReady = false;
        clearResetSession();
        showResetCalibrationOverlay("The reset paused while this tab was hidden. Sit comfortably to begin again.");
        announce("The target run paused because the tab was hidden.");
    } else if (document.hidden && (state === "playing" || state === "countdown")) {
        state = "calibrating";
        currentRecording = [];
        holdStartedAt = 0;
        stablePoseFrames = 0;
        calibrationReady = false;
        syncBanner.classList.remove("is-visible");
        showCalibrationOverlay("The round paused while this tab was hidden. Re-lock your pose to resume.");
        announce("Round paused because the tab was hidden.");
    }
});

window.addEventListener("beforeunload", stopMediaTracks);
new ResizeObserver(syncCanvasSize).observe(stage);

setInitialUI();
syncCanvasSize();
