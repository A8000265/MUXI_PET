// ==========================================
// 沐曦 MuXi - MBTI × 星座 × 水晶占卜星星瓶互動系統 (match.js)
// ==========================================

let selectedMBTI = "";
let selectedResidence = "";
let selectedCountry = "";
let selectedZodiac = "獅子座";
let selectedBirthday = "";
let currentMatchData = null;
let zodiacProfilesList = [];
let audioCtx = null;
let meteorAnimationId = null;
let divinationTimers = [];

function clearAllDivinationTimers() {
    divinationTimers.forEach(t => clearTimeout(t));
    divinationTimers = [];
}

function addDivinationTimeout(fn, delay) {
    const t = setTimeout(fn, delay);
    divinationTimers.push(t);
    return t;
}

// 初始化 Web Audio API 音效引擎
function getAudioContext() {
    if (!audioCtx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
            audioCtx = new AudioContextClass();
        }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    return audioCtx;
}

// 1. 風鈴敲玻璃清脆且帶回聲的音效 (Glass Wind Chime with Ethereal Echo)
function playGlassWindChimeEcho(index = 0) {
    try {
        const ctx = getAudioContext();
        if (!ctx) return;

        const now = ctx.currentTime;
        // 清透高頻五聲音階 (C6, D6, E6, G6, A6, C7, D7, E7)
        const scale = [1046.50, 1174.66, 1318.51, 1567.98, 1760.00, 2093.00, 2349.32, 2637.02];
        const baseFreq = scale[index % scale.length];

        // 建立主音量
        const masterGain = ctx.createGain();
        masterGain.gain.setValueAtTime(0.35, now);

        // 建立回聲延遲迴路 (Delay + Feedback)
        const delayNode = ctx.createDelay();
        delayNode.delayTime.setValueAtTime(0.18, now); // 180ms 回音間隔

        const feedbackGain = ctx.createGain();
        feedbackGain.gain.setValueAtTime(0.42, now); // 衰減反饋

        const highpass = ctx.createBiquadFilter();
        highpass.type = "highpass";
        highpass.frequency.setValueAtTime(1400, now); // 保留晶瑩高頻

        // 主玻璃敲擊音 (Fundamental Glass Strike)
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = "sine";
        osc1.frequency.setValueAtTime(baseFreq, now);

        gain1.gain.setValueAtTime(0.001, now);
        gain1.gain.exponentialRampToValueAtTime(0.8, now + 0.002); // 極瞬爆發敲擊
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.55); // 自然玻璃衰減

        osc1.connect(gain1);
        gain1.connect(masterGain);

        // 玻璃高階非整數泛音 1 (Overtone 1: ~2.76x)
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = "sine";
        osc2.frequency.setValueAtTime(baseFreq * 2.76, now);

        gain2.gain.setValueAtTime(0.001, now);
        gain2.gain.exponentialRampToValueAtTime(0.4, now + 0.002);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

        osc2.connect(gain2);
        gain2.connect(masterGain);

        // 玻璃高階非整數泛音 2 (Overtone 2: ~5.40x)
        const osc3 = ctx.createOscillator();
        const gain3 = ctx.createGain();
        osc3.type = "triangle";
        osc3.frequency.setValueAtTime(baseFreq * 5.40, now);

        gain3.gain.setValueAtTime(0.001, now);
        gain3.gain.exponentialRampToValueAtTime(0.2, now + 0.002);
        gain3.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

        osc3.connect(gain3);
        gain3.connect(masterGain);

        // 連接回聲迴路
        masterGain.connect(ctx.destination);
        masterGain.connect(delayNode);
        delayNode.connect(highpass);
        highpass.connect(feedbackGain);
        feedbackGain.connect(delayNode);
        delayNode.connect(ctx.destination);

        // 啟動與自動停止
        osc1.start(now);
        osc2.start(now);
        const stopTime = now + 1.2;
        osc1.stop(stopTime);
        osc2.stop(stopTime);
        osc3.stop(stopTime);
    } catch (e) {
        console.warn("Audio Context error:", e);
    }
}

// 2. 水晶占卜與流星風暴上升音效
function playCosmicRiser() {
    try {
        const ctx = getAudioContext();
        if (!ctx) return;
        const now = ctx.currentTime;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(250, now);
        osc.frequency.exponentialRampToValueAtTime(2600, now + 1.1);

        gain.gain.setValueAtTime(0.001, now);
        gain.gain.exponentialRampToValueAtTime(0.35, now + 0.6);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.25);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 1.3);
    } catch (e) {
        console.warn("Cosmic riser sound error:", e);
    }
}

// ==========================================
// 命定專屬鋼琴曲播放引擎 (Motivation Piano - 1:10 高潮段)
// ==========================================
const BGM_CLIMAX_TIME = 70.0; // 01:10 (高潮爆發點)
let bgmProgressInterval = null;

function formatAudioTime(seconds) {
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
}

// 播放音樂 (預設自 1:10 高潮段開始)
function playLocalBGM(fromClimax = false) {
    const audio = document.getElementById("localBgmAudio");
    const btnToggle = document.getElementById("btnToggleAudio");
    if (!audio) return;

    if (fromClimax || audio.currentTime < 1 || audio.currentTime >= 178) {
        audio.currentTime = BGM_CLIMAX_TIME;
    }

    audio.volume = 0.8;
    audio.play().then(() => {
        if (btnToggle) btnToggle.innerText = "⏸ 暫停音樂";
        startAudioProgressTracking();
    }).catch(err => {
        console.warn("Audio autoplay blocked by browser:", err);
        if (btnToggle) btnToggle.innerText = "▶ 點擊播放音樂";
    });
}

// 暫停音樂
function stopLocalBGM() {
    const audio = document.getElementById("localBgmAudio");
    const btnToggle = document.getElementById("btnToggleAudio");
    if (audio) {
        audio.pause();
    }
    if (btnToggle) btnToggle.innerText = "▶ 播放音樂";
    stopAudioProgressTracking();
}

// 切換播放 / 暫停
function toggleLocalBGM() {
    const audio = document.getElementById("localBgmAudio");
    if (!audio) return;

    if (audio.paused) {
        playLocalBGM(false);
        showToast("🎹 正在播放 Motivation Piano 鋼琴曲", "success");
    } else {
        stopLocalBGM();
        showToast("🔇 已暫停背景音樂", "info");
    }
}

// 重新自 1:10 高潮段播放
function replayLocalBGMAtClimax() {
    const audio = document.getElementById("localBgmAudio");
    if (!audio) return;
    audio.currentTime = BGM_CLIMAX_TIME;
    playLocalBGM(false);
    showToast("🎹 已重新從 01:10 唯美高潮處演奏。", "success");
}

// 跳轉進度
function seekLocalBGM(seconds) {
    const audio = document.getElementById("localBgmAudio");
    if (audio) {
        audio.currentTime = parseFloat(seconds);
    }
}

// 調整音量
function setLocalBGMVolume(vol) {
    const audio = document.getElementById("localBgmAudio");
    if (audio) {
        audio.volume = parseFloat(vol);
    }
}

// 進度條與時間即時同步
function startAudioProgressTracking() {
    stopAudioProgressTracking();
    bgmProgressInterval = setInterval(() => {
        const audio = document.getElementById("localBgmAudio");
        const currTimeEl = document.getElementById("audioCurrentTime");
        const durTimeEl = document.getElementById("audioDuration");
        const progressBar = document.getElementById("audioProgressBar");

        if (audio && !audio.paused) {
            if (currTimeEl) currTimeEl.innerText = formatAudioTime(audio.currentTime);
            if (durTimeEl && audio.duration) durTimeEl.innerText = formatAudioTime(audio.duration);
            if (progressBar) {
                progressBar.max = audio.duration || 180;
                progressBar.value = audio.currentTime;
            }
        }
    }, 500);
}

function stopAudioProgressTracking() {
    if (bgmProgressInterval) {
        clearInterval(bgmProgressInterval);
        bgmProgressInterval = null;
    }
}


document.addEventListener("DOMContentLoaded", () => {
    loadMatchOptions();
    bindBirthdayListener();
});

// 3. 載入選項
async function loadMatchOptions() {
    try {
        const res = await fetch("/api/mbti/options");
        const data = await res.json();
        if (data.success) {
            renderMBTIProfiles(data.mbti_profiles);
            renderResidenceOptions(data.residence_options);
            renderCountryOptions(data.country_options);
            if (data.zodiac_profiles) {
                zodiacProfilesList = data.zodiac_profiles;
                renderZodiacOptions(data.zodiac_profiles);
            }
        }
    } catch (err) {
        console.error("載入速配選項失敗:", err);
        showToast("載入選項失敗，請重新整理頁面", "error");
    }
}

// 4. 渲染 16 型人格
function renderMBTIProfiles(profiles) {
    const container = document.getElementById("mbtiGroupsContainer");
    if (!container) return;
    container.innerHTML = "";

    profiles.forEach(group => {
        const groupBox = document.createElement("div");
        groupBox.className = "mbti-group-box";

        const header = document.createElement("div");
        header.className = "mbti-group-header";
        header.style.color = group.color;
        header.innerHTML = `<span>✨</span><span>${group.group}</span>`;
        groupBox.appendChild(header);

        const grid = document.createElement("div");
        grid.className = "mbti-cards-grid";

        group.types.forEach(t => {
            const card = document.createElement("div");
            card.className = "mbti-card";
            card.dataset.code = t.code;
            card.innerHTML = `
                <div class="mbti-code">${t.code}</div>
                <div class="mbti-name">${t.name}</div>
                <div class="mbti-tag">${t.tag}</div>
            `;
            card.onclick = () => selectMBTI(t.code, card);
            grid.appendChild(card);
        });

        groupBox.appendChild(grid);
        container.appendChild(groupBox);
    });
}

function selectMBTI(code, element) {
    selectedMBTI = code;
    document.querySelectorAll(".mbti-card").forEach(c => c.classList.remove("selected"));
    element.classList.add("selected");
}

// 5. 渲染居住環境
function renderResidenceOptions(options) {
    const container = document.getElementById("residenceOptionsContainer");
    if (!container) return;
    container.innerHTML = "";

    options.forEach(opt => {
        const card = document.createElement("div");
        card.className = "residence-card";
        card.dataset.id = opt.id;
        card.innerHTML = `
            <div class="residence-icon">${opt.icon}</div>
            <div class="residence-name">${opt.name}</div>
            <div class="residence-desc">${opt.desc}</div>
        `;
        card.onclick = () => selectResidence(opt.id, card);
        container.appendChild(card);
    });
}

function selectResidence(id, element) {
    selectedResidence = id;
    document.querySelectorAll(".residence-card").forEach(c => c.classList.remove("selected"));
    element.classList.add("selected");
}

// 6. 渲染國家選項
function renderCountryOptions(options) {
    const container = document.getElementById("countryOptionsContainer");
    if (!container) return;
    container.innerHTML = "";

    options.forEach((opt, idx) => {
        const card = document.createElement("div");
        card.className = "country-card";
        card.dataset.id = opt.id;
        card.innerHTML = `
            <div class="country-icon">${opt.icon}</div>
            <div class="country-name">${opt.name}</div>
            <div class="country-desc">${opt.desc}</div>
        `;
        card.onclick = () => selectCountry(opt.id, card);
        if (idx === 0) {
            card.classList.add("selected");
            selectedCountry = opt.id;
        }
        container.appendChild(card);
    });
}

function selectCountry(id, element) {
    selectedCountry = id;
    document.querySelectorAll(".country-card").forEach(c => c.classList.remove("selected"));
    element.classList.add("selected");
}

// 7. 渲染 12 星座選單
function renderZodiacOptions(profiles) {
    const container = document.getElementById("zodiacOptionsContainer");
    if (!container) return;
    container.innerHTML = "";

    profiles.forEach((z) => {
        const card = document.createElement("div");
        card.className = "zodiac-card";
        card.dataset.name = z.name;

        let elementClass = "element-fire";
        if (z.element === "土象") elementClass = "element-earth";
        if (z.element === "風象") elementClass = "element-air";
        if (z.element === "水象") elementClass = "element-water";

        card.innerHTML = `
            <div class="zodiac-icon">${z.icon}</div>
            <div class="zodiac-name">${z.name}</div>
            <div class="zodiac-dates">${z.dates}</div>
            <span class="zodiac-element-tag ${elementClass}">${z.element}</span>
        `;
        card.onclick = () => selectZodiac(z.name, card);

        if (z.name === "獅子座") {
            card.classList.add("selected");
            selectedZodiac = z.name;
        }

        container.appendChild(card);
    });
}

function selectZodiac(name, element) {
    selectedZodiac = name;
    document.querySelectorAll(".zodiac-card").forEach(c => c.classList.remove("selected"));
    if (element) element.classList.add("selected");

    const badge = document.getElementById("zodiacDetectedBadge");
    if (badge) {
        badge.innerText = `✨ 已選定：${name}`;
        badge.style.display = "inline-block";
    }
}

// 8. 生日輸入自動推算星座
function bindBirthdayListener() {
    const birthdayInput = document.getElementById("birthdayInput");
    if (!birthdayInput) return;

    birthdayInput.addEventListener("change", (e) => {
        const dateVal = e.target.value;
        if (!dateVal) return;
        selectedBirthday = dateVal;

        const [, monthStr, dayStr] = dateVal.split("-");
        const month = parseInt(monthStr, 10);
        const day = parseInt(dayStr, 10);

        const zodiac = calculateZodiacFromDate(month, day);
        if (zodiac) {
            const card = document.querySelector(`.zodiac-card[data-name="${zodiac}"]`);
            selectZodiac(zodiac, card);
            showToast(`🎂 依生日判定您的星座為：${zodiac}。`, "success");
        }
    });
}

function calculateZodiacFromDate(month, day) {
    const dates = [20, 19, 21, 20, 21, 22, 23, 23, 23, 24, 22, 22];
    const zodiacs = ["魔羯座", "水瓶座", "雙魚座", "牡羊座", "金牛座", "雙子座", "巨蟹座", "獅子座", "處女座", "天秤座", "天蠍座", "射手座", "魔羯座"];
    return day < dates[month - 1] ? zodiacs[month - 1] : zodiacs[month];
}


// 9. 送出配對測驗 ➔ 觸發水晶占卜與星星瓶互動
async function submitPetMatch() {
    if (!selectedMBTI) {
        showToast("請先點選您的 MBTI 人格類型。", "warning");
        return;
    }
    if (!selectedResidence) {
        showToast("請選擇您的居家空間環境。", "warning");
        return;
    }
    if (!selectedCountry) {
        showToast("請選擇您所在的國家 / 地區。", "warning");
        return;
    }

    getAudioContext(); // 確保 AudioContext 被使用者點擊啟用
    currentMatchData = null; // 清除前次配對暫存

    const btn = document.getElementById("btnStartMatch");
    if (btn) {
        btn.disabled = true;
        btn.innerText = "🔮 水晶占卜靈力凝聚中...";
    }

    // 啟動全螢幕水晶占卜與星星收集體驗
    startCrystalDivinationExperience();

    try {
        const res = await fetch("/api/mbti/match", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                mbti: selectedMBTI,
                residence: selectedResidence,
                country: selectedCountry,
                birthday: selectedBirthday,
                zodiac: selectedZodiac
            })
        });

        const data = await res.json();
        if (data.success && data.match) {
            currentMatchData = data;
        }
    } catch (err) {
        console.error("配對請求失敗:", err);
    }
}

// 10. 水晶占卜階段 ➔ 幸運光球升起 ➔ 展開星座夜空
function startCrystalDivinationExperience() {
    clearAllDivinationTimers();

    const overlay = document.getElementById("lotteryInteractiveOverlay");
    const crystalStage = document.getElementById("crystalDivinationStage");
    const skyStage = document.getElementById("constellationSkyStage");
    const risingOrb = document.getElementById("crystalRisingOrb");
    const starJar = document.getElementById("starJarContainer");
    const jarStars = document.getElementById("glassJarStars");
    const stormContainer = document.getElementById("meteorStormContainer");
    const flashScreen = document.getElementById("supernovaFlashScreen");
    const svgEl = document.getElementById("constellationSvg");

    if (!overlay || !crystalStage || !skyStage) return;

    overlay.style.display = "flex";
    crystalStage.style.display = "flex";
    skyStage.style.display = "none";
    if (risingOrb) {
        risingOrb.style.display = "none";
        risingOrb.innerText = "";
    }
    if (starJar) {
        starJar.style.display = "none";
        starJar.classList.remove("pouring", "jar-jiggle");
    }
    if (jarStars) jarStars.innerHTML = "";
    if (stormContainer) stormContainer.innerHTML = "";
    if (flashScreen) flashScreen.style.opacity = "0";
    if (svgEl) svgEl.innerHTML = "";

    // 播放神秘環境音
    playGlassWindChimeEcho(0);

    // 1.3 秒後升起星座幸運核
    addDivinationTimeout(() => {
        if (risingOrb) {
            risingOrb.innerText = getZodiacIcon(selectedZodiac);
            risingOrb.style.display = "flex";
        }
        playGlassWindChimeEcho(3);

        // 1.1 秒後展開星座夜空與右下角許願星星瓶
        addDivinationTimeout(() => {
            crystalStage.style.display = "none";
            skyStage.style.display = "flex";
            if (starJar) starJar.style.display = "flex";
            renderConstellationSky(selectedZodiac);
        }, 1100);
    }, 1300);
}

// 12 星座神話圖騰與星象輪廓資料庫
const ZODIAC_ART_MAP = {
    "牡羊座": {
        symbol: "♈",
        title: "牡羊座 (Aries)",
        latin: "Aries the Ram · 火象星座",
        tagline: "勇敢熱情、勇往直前的守護白羊",
        svgPath: `
            <g class="zodiac-art-group">
                <path d="M 120 180 C 80 100 130 50 190 80 C 230 100 240 160 240 280 M 360 180 C 400 100 350 50 290 80 C 250 100 240 160 240 280" 
                      fill="none" stroke="rgba(255, 215, 0, 0.45)" stroke-width="4" stroke-linecap="round"/>
                <path d="M 240 150 C 210 200 270 200 240 250" fill="none" stroke="rgba(254, 112, 0, 0.4)" stroke-width="3"/>
                <text x="240" y="325" text-anchor="middle" fill="rgba(255, 215, 0, 0.75)" font-size="16" font-weight="bold">♈ 牡羊座星象圖騰 (Aries)</text>
            </g>
        `
    },
    "金牛座": {
        symbol: "♉",
        title: "金牛座 (Taurus)",
        latin: "Taurus the Bull · 土象星座",
        tagline: "沉穩堅定、溫柔厚實的黃金公牛",
        svgPath: `
            <g class="zodiac-art-group">
                <circle cx="240" cy="210" r="55" fill="none" stroke="rgba(255, 215, 0, 0.45)" stroke-width="4"/>
                <path d="M 170 120 C 180 170 210 180 240 180 C 270 180 300 170 310 120" 
                      fill="none" stroke="rgba(255, 215, 0, 0.45)" stroke-width="4" stroke-linecap="round"/>
                <path d="M 160 100 C 130 140 180 180 210 200 M 320 100 C 350 140 300 180 270 200" 
                      fill="none" stroke="rgba(254, 112, 0, 0.35)" stroke-width="3"/>
                <text x="240" y="325" text-anchor="middle" fill="rgba(255, 215, 0, 0.75)" font-size="16" font-weight="bold">♉ 金牛座星象圖騰 (Taurus)</text>
            </g>
        `
    },
    "雙子座": {
        symbol: "♊",
        title: "雙子座 (Gemini)",
        latin: "Gemini the Twins · 風象星座",
        tagline: "機智靈動、心靈相通的星空雙子",
        svgPath: `
            <g class="zodiac-art-group">
                <path d="M 160 90 L 160 270 M 320 90 L 320 270 M 130 90 C 240 60 240 60 350 90 M 130 270 C 240 300 240 300 350 270" 
                      fill="none" stroke="rgba(255, 215, 0, 0.45)" stroke-width="4" stroke-linecap="round"/>
                <circle cx="160" cy="90" r="12" fill="none" stroke="rgba(254, 112, 0, 0.5)" stroke-width="2"/>
                <circle cx="320" cy="90" r="12" fill="none" stroke="rgba(254, 112, 0, 0.5)" stroke-width="2"/>
                <text x="240" y="325" text-anchor="middle" fill="rgba(255, 215, 0, 0.75)" font-size="16" font-weight="bold">♊ 雙子座星象圖騰 (Gemini)</text>
            </g>
        `
    },
    "巨蟹座": {
        symbol: "♋",
        title: "巨蟹座 (Cancer)",
        latin: "Cancer the Crab · 水象星座",
        tagline: "深情守護、溫暖包容的靈性巨蟹",
        svgPath: `
            <g class="zodiac-art-group">
                <circle cx="175" cy="150" r="28" fill="none" stroke="rgba(255, 215, 0, 0.45)" stroke-width="4"/>
                <path d="M 175 122 C 260 120 305 160 295 210" fill="none" stroke="rgba(255, 215, 0, 0.45)" stroke-width="4" stroke-linecap="round"/>
                <circle cx="305" cy="210" r="28" fill="none" stroke="rgba(255, 215, 0, 0.45)" stroke-width="4"/>
                <path d="M 305 238 C 220 240 175 200 185 150" fill="none" stroke="rgba(255, 215, 0, 0.45)" stroke-width="4" stroke-linecap="round"/>
                <text x="240" y="325" text-anchor="middle" fill="rgba(255, 215, 0, 0.75)" font-size="16" font-weight="bold">♋ 巨蟹座星象圖騰 (Cancer)</text>
            </g>
        `
    },
    "獅子座": {
        symbol: "♌",
        title: "獅子座 (Leo)",
        latin: "Leo the Lion · 火象星座",
        tagline: "昂首自信、陽光霸氣的萬獸之王",
        svgPath: `
            <g class="zodiac-art-group">
                <circle cx="170" cy="180" r="24" fill="none" stroke="rgba(255, 215, 0, 0.5)" stroke-width="4"/>
                <path d="M 170 156 C 170 100 230 80 270 100 C 310 120 320 170 290 220 C 260 270 330 280 350 250" 
                      fill="none" stroke="rgba(255, 215, 0, 0.5)" stroke-width="4.5" stroke-linecap="round"/>
                <path d="M 120 220 C 150 160 220 130 260 130 C 320 130 350 80 380 90 C 360 140 330 180 300 210" 
                      fill="none" stroke="rgba(254, 112, 0, 0.35)" stroke-width="2.5" stroke-dasharray="6,4"/>
                <text x="240" y="325" text-anchor="middle" fill="rgba(255, 215, 0, 0.75)" font-size="16" font-weight="bold">♌ 獅子座星象圖騰 (Leo)</text>
            </g>
        `
    },
    "處女座": {
        symbol: "♍",
        title: "處女座 (Virgo)",
        latin: "Virgo the Maiden · 土象星座",
        tagline: "純潔細膩、手握麥穗的智慧女神",
        svgPath: `
            <g class="zodiac-art-group">
                <path d="M 150 130 L 150 250 M 150 170 C 170 130 200 130 200 250 M 200 170 C 220 130 250 130 250 250 C 250 280 270 300 300 280 C 330 260 340 210 330 170" 
                      fill="none" stroke="rgba(255, 215, 0, 0.45)" stroke-width="4" stroke-linecap="round"/>
                <path d="M 290 220 L 340 270" fill="none" stroke="rgba(254, 112, 0, 0.45)" stroke-width="4"/>
                <text x="240" y="325" text-anchor="middle" fill="rgba(255, 215, 0, 0.75)" font-size="16" font-weight="bold">♍ 處女座星象圖騰 (Virgo)</text>
            </g>
        `
    },
    "天秤座": {
        symbol: "♎",
        title: "天秤座 (Libra)",
        latin: "Libra the Scales · 風象星座",
        tagline: "優雅平衡、追求和平的正義天秤",
        svgPath: `
            <g class="zodiac-art-group">
                <path d="M 130 150 L 190 150 C 200 110 280 110 290 150 L 350 150" fill="none" stroke="rgba(255, 215, 0, 0.5)" stroke-width="4.5" stroke-linecap="round"/>
                <path d="M 130 230 L 350 230" fill="none" stroke="rgba(255, 215, 0, 0.5)" stroke-width="4.5" stroke-linecap="round"/>
                <path d="M 170 150 L 140 200 L 200 200 Z M 310 150 L 280 200 L 340 200 Z" fill="none" stroke="rgba(254, 112, 0, 0.35)" stroke-width="2"/>
                <text x="240" y="325" text-anchor="middle" fill="rgba(255, 215, 0, 0.75)" font-size="16" font-weight="bold">♎ 天秤座星象圖騰 (Libra)</text>
            </g>
        `
    },
    "天蠍座": {
        symbol: "♏",
        title: "天蠍座 (Scorpio)",
        latin: "Scorpio the Scorpion · 水象星座",
        tagline: "深沉敏銳、神秘專一的靈魂天蠍",
        svgPath: `
            <g class="zodiac-art-group">
                <path d="M 140 130 L 140 250 M 140 170 C 160 130 190 130 190 250 M 190 170 C 210 130 240 130 240 250 C 240 280 280 290 300 260 L 320 275 M 325 255 L 320 275 L 300 275" 
                      fill="none" stroke="rgba(255, 215, 0, 0.45)" stroke-width="4" stroke-linecap="round"/>
                <text x="240" y="325" text-anchor="middle" fill="rgba(255, 215, 0, 0.75)" font-size="16" font-weight="bold">♏ 天蠍座星象圖騰 (Scorpio)</text>
            </g>
        `
    },
    "射手座": {
        symbol: "♐",
        title: "射手座 (Sagittarius)",
        latin: "Sagittarius the Archer · 火象星座",
        tagline: "自由奔放、張弓射向星海的半人馬",
        svgPath: `
            <g class="zodiac-art-group">
                <path d="M 150 270 L 330 90 M 270 90 L 330 90 L 330 150 M 200 200 L 260 260" 
                      fill="none" stroke="rgba(255, 215, 0, 0.5)" stroke-width="4.5" stroke-linecap="round"/>
                <path d="M 230 110 C 290 170 310 230 290 290" fill="none" stroke="rgba(254, 112, 0, 0.35)" stroke-width="2.5" stroke-dasharray="6,4"/>
                <text x="240" y="325" text-anchor="middle" fill="rgba(255, 215, 0, 0.75)" font-size="16" font-weight="bold">♐ 射手座星象圖騰 (Sagittarius)</text>
            </g>
        `
    },
    "魔羯座": {
        symbol: "♑",
        title: "魔羯座 (Capricorn)",
        latin: "Capricorn the Sea-Goat · 土象星座",
        tagline: "堅韌自律、攀登巔峰的魔羯星神",
        svgPath: `
            <g class="zodiac-art-group">
                <path d="M 150 120 L 190 240 L 230 160 C 260 120 300 130 300 180 C 300 240 240 260 250 290 C 260 320 310 320 320 280" 
                      fill="none" stroke="rgba(255, 215, 0, 0.45)" stroke-width="4" stroke-linecap="round"/>
                <text x="240" y="325" text-anchor="middle" fill="rgba(255, 215, 0, 0.75)" font-size="16" font-weight="bold">♑ 魔羯座星象圖騰 (Capricorn)</text>
            </g>
        `
    },
    "水瓶座": {
        symbol: "♒",
        title: "水瓶座 (Aquarius)",
        latin: "Aquarius the Water-Bearer · 風象星座",
        tagline: "創新博愛、傾注智慧甘露的寶瓶",
        svgPath: `
            <g class="zodiac-art-group">
                <path d="M 130 150 L 160 130 L 190 150 L 220 130 L 250 150 L 280 130 L 310 150 L 340 130" 
                      fill="none" stroke="rgba(255, 215, 0, 0.45)" stroke-width="4" stroke-linecap="round"/>
                <path d="M 130 210 L 160 190 L 190 210 L 220 190 L 250 210 L 280 190 L 310 210 L 340 190" 
                      fill="none" stroke="rgba(255, 215, 0, 0.45)" stroke-width="4" stroke-linecap="round"/>
                <text x="240" y="325" text-anchor="middle" fill="rgba(255, 215, 0, 0.75)" font-size="16" font-weight="bold">♒ 水瓶座星象圖騰 (Aquarius)</text>
            </g>
        `
    },
    "雙魚座": {
        symbol: "♓",
        title: "雙魚座 (Pisces)",
        latin: "Pisces the Fish · 水象星座",
        tagline: "浪漫溫柔、心意相連的雙魚靈光",
        svgPath: `
            <g class="zodiac-art-group">
                <path d="M 170 100 C 130 180 130 200 170 280 M 310 100 C 350 180 350 200 310 280 M 120 190 L 360 190" 
                      fill="none" stroke="rgba(255, 215, 0, 0.45)" stroke-width="4" stroke-linecap="round"/>
                <text x="240" y="325" text-anchor="middle" fill="rgba(255, 215, 0, 0.75)" font-size="16" font-weight="bold">♓ 雙魚座星象圖騰 (Pisces)</text>
            </g>
        `
    }
};

function getZodiacIcon(name) {
    const map = {
        "牡羊座": "♈", "金牛座": "♉", "雙子座": "♊", "巨蟹座": "♋",
        "獅子座": "♌", "處女座": "♍", "天秤座": "♎", "天蠍座": "♏",
        "射手座": "♐", "魔羯座": "♑", "水瓶座": "♒", "雙魚座": "♓"
    };
    return map[name] || "⭐";
}

// 11. 繪製穩定好點擊的星座星圖與底層星座圖騰
function renderConstellationSky(zodiacName) {
    const skyTitle = document.getElementById("constellationSignTitle");
    const jarCounter = document.getElementById("jarCollectedCount");
    const jarTotal = document.getElementById("jarTotalCount");
    const svgEl = document.getElementById("constellationSvg");

    const artData = ZODIAC_ART_MAP[zodiacName] || ZODIAC_ART_MAP["獅子座"];

    if (skyTitle) {
        skyTitle.innerHTML = `✨ ${artData.symbol} ${artData.title} ✨<br><small style="font-size:14px; color:#FFD5B3; font-weight:normal;">「${artData.tagline}」</small>`;
    }

    const profile = zodiacProfilesList.find(z => z.name === zodiacName) || {
        stars: [{"x": 100, "y": 100}, {"x": 200, "y": 140}, {"x": 300, "y": 120}, {"x": 380, "y": 200}],
        lines: [[0, 1], [1, 2], [2, 3]]
    };

    const totalStars = profile.stars.length;
    let collectedCount = 0;

    if (jarCounter) jarCounter.innerText = "0";
    if (jarTotal) jarTotal.innerText = totalStars;

    if (!svgEl) return;
    svgEl.innerHTML = "";

    // 1. 繪製底層專屬星座神話圖騰與剪影輪廓 (Underlay Artwork)
    const underlayGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    underlayGroup.setAttribute("class", "constellation-art-underlay");
    underlayGroup.innerHTML = artData.svgPath;
    svgEl.appendChild(underlayGroup);

    // 2. 繪製星座星點連線
    profile.lines.forEach(([startIdx, endIdx]) => {
        const start = profile.stars[startIdx];
        const end = profile.stars[endIdx];
        if (start && end) {
            const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
            line.setAttribute("x1", start.x);
            line.setAttribute("y1", start.y);
            line.setAttribute("x2", end.x);
            line.setAttribute("y2", end.y);
            line.setAttribute("class", "constellation-line");
            svgEl.appendChild(line);
        }
    });

    // 3. 繪製靜態、大面積、極好點擊的星點
    profile.stars.forEach((star, index) => {
        const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
        g.setAttribute("class", "interactive-star");
        g.setAttribute("transform", `translate(${star.x}, ${star.y})`);

        // 外層大範圍觸控感應區 (半透明光暈)
        const hitArea = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        hitArea.setAttribute("r", "26");
        hitArea.setAttribute("fill", "rgba(255, 215, 0, 0.15)");
        hitArea.setAttribute("class", "star-hit-area");

        // 中層光暈
        const halo = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        halo.setAttribute("r", "15");
        halo.setAttribute("fill", "rgba(255, 215, 0, 0.5)");
        halo.setAttribute("filter", "drop-shadow(0 0 8px #FFD700)");

        // 核心亮星
        const core = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        core.setAttribute("r", "8.5");
        core.setAttribute("fill", "#FFFFFF");
        core.setAttribute("stroke", "#FFD700");
        core.setAttribute("stroke-width", "2");
        core.setAttribute("class", "star-core");

        g.appendChild(hitArea);
        g.appendChild(halo);
        g.appendChild(core);

        // 點擊事件：播放風鈴敲玻璃回聲音效 + 星星飛入右下角玻璃瓶
        g.addEventListener("click", (e) => {
            if (g.classList.contains("popped")) return;
            g.classList.add("popped");

            collectedCount++;
            if (jarCounter) jarCounter.innerText = collectedCount;

            // 底層星座圖騰隨收集進度增亮
            if (underlayGroup) {
                const progressRatio = collectedCount / totalStars;
                underlayGroup.style.opacity = `${0.4 + (progressRatio * 0.6)}`;
                underlayGroup.style.filter = `drop-shadow(0 0 ${10 + progressRatio * 20}px rgba(255, 215, 0, 0.8))`;
            }

            // 播放清脆風鈴敲玻璃回聲音效
            playGlassWindChimeEcho(collectedCount);

            // 取得星點當前螢幕絕對坐標
            const rect = g.getBoundingClientRect();
            const startX = rect.left + rect.width / 2;
            const startY = rect.top + rect.height / 2;

            // 觸發星光拋物線飛入右下角玻璃瓶
            animateStarFlyToJar(startX, startY, collectedCount, totalStars);
        });

        svgEl.appendChild(g);
    });
}

// 12. 星星 Pop 掉並劃出星光飛入右下角玻璃瓶
function animateStarFlyToJar(startX, startY, collectedCount, totalStars) {
    const starJar = document.getElementById("starJarContainer");
    const jarStars = document.getElementById("glassJarStars");
    if (!starJar) return;

    const jarRect = starJar.getBoundingClientRect();
    const targetX = jarRect.left + jarRect.width / 2;
    const targetY = jarRect.top + jarRect.height / 2 + 10;

    // 建立飛行星光粒子
    const particle = document.createElement("div");
    particle.className = "flying-star-particle";
    particle.innerText = "✨";
    particle.style.left = `${startX}px`;
    particle.style.top = `${startY}px`;
    document.body.appendChild(particle);

    // 強制 reflow 觸發平滑動畫
    particle.getBoundingClientRect();

    particle.style.transform = `translate(${targetX - startX}px, ${targetY - startY}px) scale(0.6)`;
    particle.style.opacity = "0.7";

    setTimeout(() => {
        particle.remove();

        // 玻璃瓶內增加一顆發光星星
        if (jarStars) {
            const captured = document.createElement("div");
            captured.className = "jar-captured-star";
            captured.innerText = "⭐";
            jarStars.appendChild(captured);
        }

        // 玻璃瓶微震效果
        starJar.classList.add("jar-jiggle");
        setTimeout(() => starJar.classList.remove("jar-jiggle"), 400);

        // 如果全部星星都收集到玻璃瓶中 ➔ 倒出星星化為流星雨
        if (collectedCount === totalStars) {
            setTimeout(() => {
                pourStarsAndTriggerMeteorStorm();
            }, 600);
        }
    }, 650);
}

// 13. 倒出玻璃瓶 ➔ 噴發漫天流星雨 ➔ 焦點超新星吞噬全螢幕
function pourStarsAndTriggerMeteorStorm() {
    const starJar = document.getElementById("starJarContainer");
    const skyStage = document.getElementById("constellationSkyStage");
    const stormContainer = document.getElementById("meteorStormContainer");
    const flashScreen = document.getElementById("supernovaFlashScreen");
    const overlay = document.getElementById("lotteryInteractiveOverlay");

    if (skyStage) skyStage.style.display = "none";
    if (starJar) starJar.classList.add("pouring");

    playCosmicRiser();

    // 1 秒後玻璃瓶噴發出流星雨
    setTimeout(() => {
        if (starJar) starJar.style.display = "none";

        if (stormContainer) {
            stormContainer.innerHTML = "";
            // 產生漫天流星雨
            for (let i = 0; i < 20; i++) {
                const meteor = document.createElement("div");
                meteor.className = "storm-meteor";
                meteor.style.top = `${Math.random() * 85}%`;
                meteor.style.left = `${Math.random() * 65}%`;
                meteor.style.animationDelay = `${i * 0.06}s`;
                stormContainer.appendChild(meteor);
            }

            // 產生中央焦點超新星
            const focalStar = document.createElement("div");
            focalStar.className = "supernova-focal-star";
            stormContainer.appendChild(focalStar);
        }

        // 0.85 秒後超新星白光全螢幕吞噬
        setTimeout(() => {
            if (flashScreen) {
                flashScreen.style.opacity = "1";
            }

            // 白光維持 0.5 秒後淡入獨立全螢幕神秘結果彈出視窗
            setTimeout(() => {
                if (overlay) overlay.style.display = "none";
                if (flashScreen) flashScreen.style.opacity = "0";

                const btn = document.getElementById("btnStartMatch");
                if (btn) {
                    btn.disabled = false;
                    btn.innerText = "🔮 開始毛孩速配測驗";
                }

                // 開啟獨立神秘結果視窗
                openMysticResultModal();
            }, 600);
        }, 850);
    }, 1000);
}

// 14. 開啟獨立全螢幕神秘結果視窗 (含持續流星背景與仙境音樂)
async function openMysticResultModal() {
    const modal = document.getElementById("mysticResultModal");
    if (!modal) return;

    // 鎖定背景網頁滾動，確保上下滾動全由彈窗獨立順暢處理
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    modal.style.display = "block";
    modal.scrollTop = 0;

    // 啟動 Canvas 流星動態背景
    startFlowingMeteorsCanvas();

    // 啟動 Motivation Piano 鋼琴背景音樂 (自 01:10 高潮段開始)
    playLocalBGM(true);

    // 等待後端配對數據就緒 (最多等待 2 秒)
    if (!currentMatchData || !currentMatchData.match) {
        for (let i = 0; i < 15; i++) {
            if (currentMatchData && currentMatchData.match) break;
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    // 若後端回應正常，使用後端數據；若極端延遲，啟動前端備援配對引擎
    if (!currentMatchData || !currentMatchData.match) {
        currentMatchData = getClientSideFallbackMatch(selectedMBTI, selectedResidence, selectedZodiac, selectedCountry);
    }

    if (currentMatchData && currentMatchData.match) {
        renderMysticModalContent(
            currentMatchData.match,
            currentMatchData.alternatives,
            currentMatchData.query,
            currentMatchData.country_advice,
            currentMatchData.zodiac_advice
        );
        modal.scrollTop = 0;
        showToast("🎉 願星光照亮您與毛孩的相遇。", "success");
    }
}

// 前端備援配對資料庫 (確保 100% 保證渲染)
function getClientSideFallbackMatch(mbti, residence, zodiac, country) {
    const fallbackMap = {
        "INFP": { breed_name: "英國短毛貓", pet_type: "短毛貓", title: "治癒系安靜守護者", personality_traits: "溫柔沉靜、獨立不黏人、低噪不擾鄰", match_score: 98, image_icon: "🐱", match_reason: "INFP 內心細膩需要個人放鬆空間，英國短毛貓獨立安靜，不會過度索求關注，能給予彼此最適當的心靈慰藉。", care_tips: "英短日常需定期梳除廢毛以防毛球症，建議定期預約沐曦「純清潔」與「深層護髮SPA」。", recommended_service: "純清潔 + 深層護髮SPA" },
        "ENFP": { breed_name: "威爾斯柯基犬", pet_type: "中型犬", title: "活力四射的快樂泉源", personality_traits: "熱情開朗、幽默頑皮、親和力滿分", match_score: 99, image_icon: "🐕", match_reason: "ENFP 充滿好奇心與活力，短腿大屁股的柯基總是元氣滿滿，兩者相處每天都充滿歡笑與驚喜！", care_tips: "柯基短毛但掉毛量大且易胖，建議定期來沐曦體驗「純清潔」排廢毛與「碳酸泉浴」舒緩關節肌肉。", recommended_service: "純清潔 + 碳酸泉浴" },
        "INFJ": { breed_name: "俄羅斯藍貓", pet_type: "短毛貓", title: "神秘優雅的沉思者", personality_traits: "安靜害羞、忠誠專一、極度安靜", match_score: 98, image_icon: "🐱", match_reason: "INFJ 喜歡深度的靈魂共鳴與寧靜，俄羅斯藍貓動作優雅，只對最信任的主人敞開心房，是生活中的寧靜伴侶。", care_tips: "短密毛髮護理簡便，推薦沐曦「純清潔」溫和洗劑調理，維持銀藍色皮毛的光澤質感。", recommended_service: "純清潔" },
        "ENFJ": { breed_name: "比熊犬", pet_type: "小型犬", title: "人見人愛的小棉花糖", personality_traits: "樂觀友善、極愛撒嬌、社交達人", match_score: 98, image_icon: "🐩", match_reason: "ENFJ 喜歡照顧他人且極具號召力，比熊犬圓滾滾的棉花糖外型與樂天個性，能激發 ENFJ 的滿滿愛心！", care_tips: "比熊需維持經典圓頭造型，推薦沐曦「大美容（精緻手剪）」搭配「深層護髮SPA」，維持雪白蓬鬆！", recommended_service: "大美容 + 深層護髮SPA" },
        "INTJ": { breed_name: "德國牧羊犬", pet_type: "大型犬", title: "冷靜敏銳的戰略護衛", personality_traits: "極高服從度、聰明機警、忠心不二", match_score: 97, image_icon: "🐕", match_reason: "INTJ 欣賞聰明與執行力，德國牧羊犬具備頂級智商與工作能力，是能與 INTJ 達成默契的高智商夥伴。", care_tips: "大型工作犬關節皮毛保養至關重要，建議施作沐曦「大美容」與「碳酸泉浴」維護肌肉關節健康。", recommended_service: "大美容 + 碳酸泉浴" },
        "ENTJ": { breed_name: "杜賓犬", pet_type: "大型犬", title: "威嚴果斷的領導風範", personality_traits: "自信從容、紀律嚴明、高貴敏捷", match_score: 97, image_icon: "🐕", match_reason: "ENTJ 天生領導者氣場強大，杜賓犬身形矯健、忠心耿耿且服從性高，展現王者風範！", care_tips: "短毛但需注意皮脂分泌與毛孔健康，推薦沐曦「小美容」與「除蚤藥浴 / 草本浴」。", recommended_service: "小美容 + 草本浴" },
        "INTP": { breed_name: "米克斯貓", pet_type: "短毛貓", title: "奇思妙想的哲學家貓", personality_traits: "自得其樂、好奇心強、低維護成本", match_score: 96, image_icon: "🐱", match_reason: "INTP 沉浸於自己的思想世界，米克斯貓極度聰明且獨立，在生活中能自得其樂探索世界，不會打擾思考節奏。", care_tips: "定期基本梳洗剪指甲，交給沐曦「純清潔」輕鬆搞定！", recommended_service: "純清潔" },
        "ENTP": { breed_name: "邊境牧羊犬", pet_type: "中型犬", title: "機智滿分的高智商挑戰者", personality_traits: "反應極快、鬼點子多、學習力超群", match_score: 96, image_icon: "🐕", match_reason: "ENTP 熱愛智力挑戰與創新，邊牧智商犬界第一，兩者在一起就像智商對決，隨時能互動訓練把戲！", care_tips: "邊牧活動量大毛髮易髒，建議預約沐曦「大美容」進行深層清潔與廢毛梳整。", recommended_service: "大美容" },
        "ISFJ": { breed_name: "布偶貓", pet_type: "長毛貓", title: "溫柔撫慰的家庭天使", personality_traits: "黏人貼心、極具母愛、性格溫和", match_score: 99, image_icon: "🐱", match_reason: "ISFJ 善於照顧他人且富有同情心，布偶貓渴望愛撫與陪伴，兩者相處就像溫暖的互相擁抱！", care_tips: "布偶貓絲滑長毛需細緻護理，推薦沐曦「大美容」與日本 Afloat「深層護髮SPA」。", recommended_service: "大美容 + 深層護髮SPA" },
        "ESFJ": { breed_name: "博美犬", pet_type: "小型犬", title: "熱情洋溢的社交小狐狸", personality_traits: "開朗活潑、討人喜歡、極具存在感", match_score: 97, image_icon: "🐶", match_reason: "ESFJ 喜歡熱鬧與照顧朋友，博美犬蓬鬆毛量與靈動雙眼隨時帶來滿滿歡樂！", care_tips: "博美犬雙層毛需維持圓球立體感，推薦沐曦「大美容（精緻手剪）」呈現最完美的蓬鬆圓球造型！", recommended_service: "大美容" },
        "ISTJ": { breed_name: "迷你雪納瑞", pet_type: "小型犬", title: "守規矩的忠實小老頭", personality_traits: "不掉毛、機警守規律、適應力極強", match_score: 98, image_icon: "🐕", match_reason: "ISTJ 重視責任感與生活規律，雪納瑞個性沉穩有原則，定時作息，不掉毛特質非常適合規律生活。", care_tips: "雪納瑞招牌鬍鬚與眉毛造型，推薦沐曦「小美容」定期精準修剪保持帥氣！", recommended_service: "小美容" },
        "ESTJ": { breed_name: "拉布拉多犬", pet_type: "大型犬", title: "紀律嚴明的家庭保衛者", personality_traits: "忠實果敢、服從命令、具責任感", match_score: 98, image_icon: "🐕", match_reason: "ESTJ 重視秩序與組織力，拉布拉多的服從與高度責任感能完美配合家庭步調。", care_tips: "推薦定期預約沐曦「大美容」進行皮毛保養與筋骨舒緩碳酸泉浴。", recommended_service: "大美容 + 碳酸泉浴" },
        "ISFP": { breed_name: "金吉拉貓", pet_type: "長毛貓", title: "優雅安靜的藝術品", personality_traits: "氣質優雅、不吵不鬧、愛乾淨、神情溫柔", match_score: 97, image_icon: "🐱", match_reason: "ISFP 具備藝術家審美與敏感心靈，金吉拉貓宛如行走的藝術品，帶來視覺與心靈的和諧美感。", care_tips: "金吉拉毛髮飄逸需防打結，推薦沐曦「深層護髮SPA」與「純清潔」維持毛髮柔順。", recommended_service: "純清潔 + 深層護髮SPA" },
        "ESFP": { breed_name: "黃金獵犬", pet_type: "大型犬", title: "陽光燦爛的派對之星", personality_traits: "超級熱情、人來瘋、自帶陽光笑容", match_score: 99, image_icon: "🐕", match_reason: "ESFP 熱愛派對與歡笑，黃金獵犬搖著大尾巴迎接每個人，生活無時無刻都是嘉年華！", care_tips: "大型長毛犬洗澡吹整耗時，沐曦專業設備提供「大美容」及「深層護髮SPA」。", recommended_service: "大美容 + 深層護髮SPA" },
        "ISTP": { breed_name: "柴犬", pet_type: "中型犬", title: "獨立冷酷的武士犬", personality_traits: "有主見、不黏人、愛乾淨、身手矯捷", match_score: 96, image_icon: "🐕", match_reason: "ISTP 享受個人空間與獨立行事，柴犬自律愛乾淨且不黏人，彼此尊重邊界，默契絕佳！", care_tips: "柴犬換毛季毛量驚人，推薦沐曦「小美容」深層除廢毛與清潔耳道。", recommended_service: "小美容" },
        "ESTP": { breed_name: "傑克羅素梗", pet_type: "小型犬", title: "永不疲倦的極限運動家", personality_traits: "精力充沛、無所畏懼、靈敏敏捷", match_score: 97, image_icon: "🐶", match_reason: "ESTP 熱愛冒險與挑戰，傑克羅素梗電力滿格、反應極快，是陪你上山下海的最佳戶外搭檔！", care_tips: "戶外活動頻繁需預防體外寄生蟲，推薦沐曦「小美容」與「除蚤藥浴」。", recommended_service: "小美容 + 除蚤藥浴" }
    };
    const m = fallbackMap[mbti] || fallbackMap["INFP"];
    return {
        match: m,
        query: { mbti: mbti || "INFP", residence: residence || "電梯大樓", country: country || "台灣", zodiac: zodiac || "獅子座" },
        country_advice: "🇹🇼 【台灣海島氣候照護重點】：台灣氣候長年潮濕悶熱，毛孩容易有皮脂分泌過盛、耳道潮濕發炎與體外寄生蟲困擾。沐曦特別推薦定期施作「除蚤藥浴」與「草本泥浴」，有效淨化毛囊、舒緩換季皮膚搔癢！",
        zodiac_advice: `✨ ${zodiac || "獅子座"} 的星象祝福注入靈魂默契，讓您與 ${m.breed_name} 的相遇充滿星光共鳴與溫暖守護。`,
        alternatives: [
            { breed_name: "英國短毛貓", pet_type: "短毛貓", title: "溫柔治癒系", personality_traits: "安靜沉穩、低噪獨立", image_icon: "🐱" },
            { breed_name: "黃金獵犬", pet_type: "大型犬", title: "陽光大天使", personality_traits: "友善親人、熱愛陪伴", image_icon: "🐕" }
        ]
    };
}

// 關閉神秘結果視窗
function closeMysticResultModal() {
    const modal = document.getElementById("mysticResultModal");
    if (modal) modal.style.display = "none";

    // 解除背景網頁滾動鎖定
    document.body.style.overflow = "";
    document.documentElement.style.overflow = "";

    if (meteorAnimationId) {
        cancelAnimationFrame(meteorAnimationId);
        meteorAnimationId = null;
    }
    // 停止 Motivation Piano 鋼琴背景音樂
    stopLocalBGM();

    // 清除所有排隊中的占卜動畫計時器
    clearAllDivinationTimers();
    currentMatchData = null;

    // 重設占卜各階段 DOM 元素，確保二次測驗完全乾淨
    const overlay = document.getElementById("lotteryInteractiveOverlay");
    const crystalStage = document.getElementById("crystalDivinationStage");
    const skyStage = document.getElementById("constellationSkyStage");
    const risingOrb = document.getElementById("crystalRisingOrb");
    const starJar = document.getElementById("starJarContainer");
    const jarStars = document.getElementById("glassJarStars");
    const stormContainer = document.getElementById("meteorStormContainer");
    const flashScreen = document.getElementById("supernovaFlashScreen");
    const svgEl = document.getElementById("constellationSvg");

    if (overlay) overlay.style.display = "none";
    if (crystalStage) crystalStage.style.display = "none";
    if (skyStage) skyStage.style.display = "none";
    if (risingOrb) {
        risingOrb.style.display = "none";
        risingOrb.innerText = "";
    }
    if (starJar) {
        starJar.style.display = "none";
        starJar.classList.remove("pouring", "jar-jiggle");
    }
    if (jarStars) jarStars.innerHTML = "";
    if (stormContainer) stormContainer.innerHTML = "";
    if (flashScreen) flashScreen.style.opacity = "0";
    if (svgEl) svgEl.innerHTML = "";

    const btn = document.getElementById("btnStartMatch");
    if (btn) {
        btn.disabled = false;
        btn.innerText = "🔮 開始毛孩速配測驗";
    }

    // 捲動回測驗選項頂部
    window.scrollTo({ top: 0, behavior: "smooth" });
}

// 15. Canvas 流星雨持續流動背景
function startFlowingMeteorsCanvas() {
    const canvas = document.getElementById("flowingMeteorsCanvas");
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    window.addEventListener("resize", () => {
        if (canvas) {
            width = canvas.width = window.innerWidth;
            height = canvas.height = window.innerHeight;
        }
    });

    const meteors = [];
    const stars = [];

    // 靜態閃爍背景星
    for (let i = 0; i < 80; i++) {
        stars.push({
            x: Math.random() * width,
            y: Math.random() * height,
            radius: Math.random() * 1.5 + 0.5,
            alpha: Math.random(),
            speed: Math.random() * 0.02 + 0.005
        });
    }

    function createMeteor() {
        return {
            x: Math.random() * width + 200,
            y: Math.random() * height * 0.5 - 100,
            length: Math.random() * 120 + 80,
            speed: Math.random() * 8 + 6,
            angle: Math.PI / 4 + 0.1,
            alpha: Math.random() * 0.6 + 0.4
        };
    }

    for (let i = 0; i < 8; i++) {
        meteors.push(createMeteor());
    }

    function draw() {
        ctx.clearRect(0, 0, width, height);

        // 繪製背景微星
        stars.forEach(s => {
            s.alpha += s.speed;
            const a = (Math.sin(s.alpha) + 1) / 2;
            ctx.fillStyle = `rgba(255, 255, 255, ${a * 0.7})`;
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
            ctx.fill();
        });

        // 繪製劃過的斜向流星
        meteors.forEach((m, idx) => {
            ctx.save();
            ctx.beginPath();
            const grad = ctx.createLinearGradient(
                m.x, m.y,
                m.x - Math.cos(m.angle) * m.length,
                m.y - Math.sin(m.angle) * m.length
            );
            grad.addColorStop(0, `rgba(255, 255, 255, ${m.alpha})`);
            grad.addColorStop(0.3, `rgba(255, 215, 0, ${m.alpha * 0.8})`);
            grad.addColorStop(1, "rgba(254, 112, 0, 0)");

            ctx.strokeStyle = grad;
            ctx.lineWidth = 2.5;
            ctx.lineCap = "round";
            ctx.moveTo(m.x, m.y);
            ctx.lineTo(
                m.x - Math.cos(m.angle) * m.length,
                m.y - Math.sin(m.angle) * m.length
            );
            ctx.stroke();
            ctx.restore();

            m.x += Math.cos(m.angle) * m.speed;
            m.y += Math.sin(m.angle) * m.speed;

            // 超出邊界重置
            if (m.x > width + 200 || m.y > height + 200) {
                meteors[idx] = createMeteor();
            }
        });

        meteorAnimationId = requestAnimationFrame(draw);
    }

    if (meteorAnimationId) cancelAnimationFrame(meteorAnimationId);
    draw();
}

// 16. 渲染獨立神秘結果視窗內容
function renderMysticModalContent(match, alternatives, query, countryAdvice, zodiacAdvice) {
    const container = document.getElementById("mysticModalContentArea");
    if (!container) return;

    const traits = (match.personality_traits || "").split(/[、,]/).map(t => t.trim()).filter(Boolean);
    const traitsHtml = traits.map(t => `<span class="trait-pill"># ${t}</span>`).join("");

    let altHtml = "";
    if (alternatives && alternatives.length > 0) {
        altHtml = `
            <div class="alt-recommendations" style="margin-top:25px;">
                <h4 style="color:#444; font-size:17px; margin-bottom:10px;">🐾 另外也很適合您的命定毛孩夥伴：</h4>
                <div class="alt-grid">
                    ${alternatives.map(alt => `
                        <div class="alt-card">
                            <div class="alt-header">
                                <span style="font-size:26px;">${alt.image_icon || '🐾'}</span>
                                <div>
                                    <div class="alt-breed">${alt.breed_name} (${alt.pet_type})</div>
                                    <small style="color:#FE7000; font-weight:bold;">${alt.title}</small>
                                </div>
                            </div>
                            <div class="alt-traits">${alt.personality_traits}</div>
                        </div>
                    `).join("")}
                </div>
            </div>
        `;
    }

    container.innerHTML = `
        <div class="match-result-card" style="box-shadow:none; padding:0; background:transparent; position:relative;">
            <div class="score-badge" style="position:absolute; top:10px; right:45px;">💖 契合度 ${match.match_score}%</div>

            <div class="result-main-header">
                <div class="pet-avatar-icon">${match.image_icon || '🐾'}</div>
                <div class="pet-main-title">
                    <h3>${match.breed_name} <span style="font-size:20px; color:#666; font-weight:normal;">(${match.pet_type})</span></h3>
                    <p>「${match.title}」</p>
                </div>
            </div>

            <div class="traits-pill-container">
                ${traitsHtml}
            </div>

            <div class="zodiac-box">
                <div class="box-title" style="color:#9333EA;"><span>⭐</span> 星座默契指南 (${query.zodiac || selectedZodiac} × ${match.breed_name})：</div>
                <div class="box-content">${zodiacAdvice || '星光指引下，你們的相遇充滿默契與靈魂共鳴。'}</div>
            </div>

            <div class="reason-box">
                <div class="box-title"><span>💡</span> 為什麼你們是天生一對？</div>
                <div class="box-content">${match.match_reason}</div>
            </div>

            <div class="country-box">
                <div class="box-title" style="color:#001EFE;"><span>🌏</span> 所在國家/氣候專屬飼育指引 (${query.country || selectedCountry})：</div>
                <div class="box-content">${countryAdvice || ''}</div>
            </div>

            <div class="care-box">
                <div class="box-title" style="color:#00A85A;"><span>🛁</span> 沐曦專業照護與推薦洗護：</div>
                <div class="box-content">
                    <p style="margin-bottom:8px;">${match.care_tips}</p>
                    <p><b>✨ 推薦方案：</b><span style="color:#00A85A; font-weight:bold;">${match.recommended_service}</span></p>
                </div>
            </div>

            ${altHtml}

            <!-- 是否保留結果信箱備份區塊 -->
            <div class="backup-section" style="background:#FFF9F5;">
                <h4>💌 是否保留此測驗結果？</h4>
                <p>輸入您的電子信箱，我們將把這份「${match.breed_name} 星座與速配報告」完整備份寄送至您的信箱，隨時回顧。</p>
                
                <form id="emailBackupForm" class="email-backup-form" onsubmit="event.preventDefault(); sendMatchBackup();">
                    <input type="text" id="backupName" placeholder="您的姓名 / 稱呼 (選填)" style="max-width: 180px;">
                    <input type="email" id="backupEmail" placeholder="請輸入您的電子信箱 (必填)" required>
                    <button type="submit" id="btnSendBackup" class="btn-send-backup">
                        📤 寄送結果備份至信箱
                    </button>
                </form>

                <div id="backupSuccessBadge" class="backup-success-badge"></div>
            </div>

            <div style="display:flex; gap:15px; justify-content:center; margin-top:30px; flex-wrap:wrap;">
                <button class="btn-secondary" onclick="document.getElementById('mysticResultModal').scrollTo({top:0, behavior:'smooth'})" style="padding:12px 26px;">
                    ⬆️ 回到頂部
                </button>
                <button class="btn-secondary" onclick="closeMysticResultModal()" style="padding:12px 26px;">
                    🔄 重新占卜測驗
                </button>
                <button class="primary-btn" onclick="location.href='/'" style="padding:12px 26px; max-width:200px;">
                    🏠 返回首頁
                </button>
            </div>
        </div>
    `;
}

// 17. 發送結果備份至信箱
async function sendMatchBackup() {
    const email = document.getElementById("backupEmail")?.value.trim();
    const name = document.getElementById("backupName")?.value.trim() || "親愛的毛孩家長";

    if (!email) {
        showToast("請輸入電子信箱。", "warning");
        return;
    }

    if (!currentMatchData || !currentMatchData.match) {
        showToast("尚未有測驗結果。", "warning");
        return;
    }

    const btn = document.getElementById("btnSendBackup");
    if (btn) {
        btn.disabled = true;
        btn.innerText = "⏳ 正在寄送備份中...";
    }

    try {
        const payload = {
            email: email,
            owner_name: name,
            mbti: currentMatchData.query.mbti,
            residence: currentMatchData.query.residence,
            country: currentMatchData.query.country,
            birthday: currentMatchData.query.birthday || selectedBirthday,
            zodiac: currentMatchData.query.zodiac || selectedZodiac,
            match_data: currentMatchData.match
        };

        const res = await fetch("/api/mbti/send-backup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        const data = await res.json();

        if (btn) {
            btn.disabled = false;
            btn.innerText = "📤 寄送結果備份至信箱";
        }

        if (!data.success) {
            showToast(data.error || "寄送失敗，請稍後再試", "error");
            return;
        }

        const badge = document.getElementById("backupSuccessBadge");
        if (badge) {
            badge.innerHTML = `✅ 測驗結果報告已成功備份至 <b>${email}</b>。歡迎至信箱查閱存查。`;
            badge.style.display = "block";
        }

        showToast("🎉 結果備份已成功寄出。", "success");
    } catch (err) {
        console.error("發送備份失敗:", err);
        showToast("網路異常，請稍後再試", "error");
        if (btn) {
            btn.disabled = false;
            btn.innerText = "📤 寄送結果備份至信箱";
        }
    }
}
