// ==========================================
// 沐曦 MuXi - 會員登入、註冊與資格對比系統 (member.js)
// ==========================================

window.currentMuxiMember = null;

// 初始化會員狀態檢查
async function checkMemberLoginStatus() {
    try {
        const res = await fetch("/api/member/me");
        const data = await res.json();
        if (data.success && data.logged_in && data.member) {
            window.currentMuxiMember = data.member;
            updateMemberNavbarUI(data.member);
        } else {
            window.currentMuxiMember = null;
            updateMemberNavbarUI(null);
        }
        if (typeof updateCartUI === "function") {
            updateCartUI();
        }
    } catch (e) {
        console.warn("無法取得會員狀態:", e);
    }
}

// 更新導覽列或頂部的會員按鈕
function updateMemberNavbarUI(member) {
    let memberBar = document.getElementById("muxiMemberStatusBar");
    if (!memberBar) {
        // 在 nav 或 body 頂部插入輕量會員條
        memberBar = document.createElement("div");
        memberBar.id = "muxiMemberStatusBar";
        memberBar.className = "member-top-bar";
        document.body.prepend(memberBar);
    }

    if (member) {
        const discountText = member.discount_rate < 1.0 ? `(全站享 ${(member.discount_rate * 10).toFixed(1)}折)` : "";
        memberBar.innerHTML = `
            <div class="member-bar-content">
                <span>✨ 尊貴會員：<b>${member.name}</b> <span class="member-tier-pill">${member.member_type}</span> ${discountText} ｜ 編號：<code>${member.member_id}</code></span>
                <div class="member-bar-actions">
                    <button class="member-bar-btn" onclick="location.href='/admin'" style="background:rgba(255,255,255,0.2); border-color:rgba(255,255,255,0.4);">🔐 員工後台</button>
                    <button class="member-bar-btn" onclick="memberLogout()">登出</button>
                </div>
            </div>
        `;
    } else {
        memberBar.innerHTML = `
            <div class="member-bar-content">
                <span>🐾 沐曦毛孩生活館 ｜ 註冊會員享 9 折起尊榮優惠！</span>
                <div class="member-bar-actions">
                    <button class="member-bar-btn" onclick="openMemberModal('login')">會員登入</button>
                    <button class="member-bar-btn btn-highlight" onclick="openMemberModal('register')">免費註冊</button>
                    <button class="member-bar-btn" onclick="location.href='/admin'" style="background:rgba(255,255,255,0.2); border-color:rgba(255,255,255,0.4);">🔐 員工後台</button>
                </div>
            </div>
        `;
    }
}

// 開啟會員彈窗
function openMemberModal(tab = "login") {
    injectMemberModalDOM();
    const modal = document.getElementById("muxiMemberModalOverlay");
    if (modal) {
        modal.style.setProperty("display", "flex", "important");
        modal.classList.add("active");
        switchMemberTab(tab);
    }
}

function closeMemberModal() {
    const modal = document.getElementById("muxiMemberModalOverlay");
    if (modal) {
        modal.classList.remove("active");
        modal.style.setProperty("display", "none", "important");
    }
}

function switchMemberTab(tab) {
    const loginForm = document.getElementById("memberLoginForm");
    const regForm = document.getElementById("memberRegisterForm");
    const tabLogin = document.getElementById("tabBtnLogin");
    const tabReg = document.getElementById("tabBtnReg");

    if (tab === "login") {
        if (loginForm) loginForm.style.display = "block";
        if (regForm) regForm.style.display = "none";
        if (tabLogin) tabLogin.classList.add("active");
        if (tabReg) tabReg.classList.remove("active");
    } else {
        if (loginForm) loginForm.style.display = "none";
        if (regForm) regForm.style.display = "block";
        if (tabLogin) tabLogin.classList.remove("active");
        if (tabReg) tabReg.classList.add("active");
    }
}

// 會員登入送出
async function submitMemberLogin(event) {
    if (event) event.preventDefault();
    const account = document.getElementById("loginAccount")?.value.trim();
    const password = document.getElementById("loginPassword")?.value.trim();

    if (!account) {
        if (typeof showToast === "function") showToast("請輸入會員編號、手機或信箱！", "warning");
        return;
    }

    try {
        const res = await fetch("/api/member/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ account, password })
        });
        const data = await res.json();
        if (data.success && data.member) {
            window.currentMuxiMember = data.member;
            updateMemberNavbarUI(data.member);
            closeMemberModal();
            if (typeof showToast === "function") showToast(data.message || "登入成功！", "success");
            if (typeof updateCartUI === "function") updateCartUI();
        } else {
            if (typeof showToast === "function") showToast(data.error || "登入失敗", "error");
        }
    } catch (e) {
        console.error(e);
        if (typeof showToast === "function") showToast("網路連線異常", "error");
    }
}

// 會員註冊送出
async function submitMemberRegister(event) {
    if (event) event.preventDefault();
    const name = document.getElementById("regName")?.value.trim();
    const phone = document.getElementById("regPhone")?.value.trim();
    const email = document.getElementById("regEmail")?.value.trim();
    const password = document.getElementById("regPassword")?.value.trim() || "123456";

    if (!name || !phone) {
        if (typeof showToast === "function") showToast("請輸入姓名與手機號碼！", "warning");
        return;
    }

    try {
        const res = await fetch("/api/member/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, phone, email, password })
        });
        const data = await res.json();
        if (data.success && data.member) {
            window.currentMuxiMember = data.member;
            updateMemberNavbarUI(data.member);
            closeMemberModal();
            if (typeof showToast === "function") showToast(data.message || "註冊成功！", "success");
            if (typeof updateCartUI === "function") updateCartUI();
        } else {
            if (typeof showToast === "function") showToast(data.error || "註冊失敗", "error");
        }
    } catch (e) {
        console.error(e);
        if (typeof showToast === "function") showToast("網路連線異常", "error");
    }
}

// 會員登出
async function memberLogout() {
    try {
        await fetch("/api/member/logout", { method: "POST" });
        window.currentMuxiMember = null;
        updateMemberNavbarUI(null);
        if (typeof showToast === "function") showToast("會員已安全登出", "info");
        if (typeof updateCartUI === "function") updateCartUI();
    } catch (e) {
        console.error(e);
    }
}

// 動態注入會員彈窗 DOM
function injectMemberModalDOM() {
    if (document.getElementById("muxiMemberModalOverlay")) return;

    const div = document.createElement("div");
    div.innerHTML = `
        <div id="muxiMemberModalOverlay" class="member-modal-overlay" onclick="if(event.target===this) closeMemberModal();">
            <div class="member-modal-card">
                <button class="btn-close-modal" onclick="closeMemberModal()">✖</button>
                <div class="member-tab-header">
                    <button id="tabBtnLogin" class="member-tab-btn active" onclick="switchMemberTab('login')">會員登入</button>
                    <button id="tabBtnReg" class="member-tab-btn" onclick="switchMemberTab('register')">註冊新會員</button>
                </div>

                <!-- 登入表單 -->
                <form id="memberLoginForm" class="member-form-body" onsubmit="submitMemberLogin(event)">
                    <div class="form-group">
                        <label>帳號 (會員編號 / 手機 / Email)</label>
                        <input type="text" id="loginAccount" placeholder="例如：0912345678 或 VIP001" required>
                    </div>
                    <div class="form-group">
                        <label>密碼 (預設: 123456)</label>
                        <input type="password" id="loginPassword" placeholder="請輸入密碼" value="123456">
                    </div>
                    <div style="margin-top: 20px;">
                        <button type="submit" class="primary-btn" style="width: 100%; font-size: 16px; padding: 12px;">立即登入</button>
                    </div>
                    <div class="member-quick-hint">
                        💡 測試會員帳號：<code>0912345678</code> (王小明) ｜ 密碼：<code>123456</code>
                    </div>
                </form>

                <!-- 註冊表單 -->
                <form id="memberRegisterForm" class="member-form-body" style="display:none;" onsubmit="submitMemberRegister(event)">
                    <div class="form-group">
                        <label>顧客真實姓名 <span style="color:red;">*</span></label>
                        <input type="text" id="regName" placeholder="請輸入您的姓名" required>
                    </div>
                    <div class="form-group">
                        <label>手機號碼 <span style="color:red;">*</span></label>
                        <input type="tel" id="regPhone" placeholder="例如：0988123456" required>
                    </div>
                    <div class="form-group">
                        <label>電子信箱</label>
                        <input type="email" id="regEmail" placeholder="例如：user@example.com">
                    </div>
                    <div class="form-group">
                        <label>設定密碼 (預設: 123456)</label>
                        <input type="password" id="regPassword" placeholder="自訂登入密碼" value="123456">
                    </div>
                    <div style="margin-top: 20px;">
                        <button type="submit" class="primary-btn" style="width: 100%; font-size: 16px; padding: 12px; background: linear-gradient(135deg, #10B981, #059669);">
                            ✨ 確認免費註冊 (立即享9折)
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;
    document.body.appendChild(div);
}

document.addEventListener("DOMContentLoaded", () => {
    checkMemberLoginStatus();
});
