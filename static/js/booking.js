// ==========================================
// 沐曦 MuXi - 線上預約與即時估價系統 (booking.js)
// ==========================================

let PRICING_DATA = {};
let ADDON_DATA = {};
let DURATION_DATA = {};
let verifiedMember = null;
let currentDate = new Date();
let selectedDateStr = "";
let selectedTimeStr = "";
let currentEstimate = { basePrice: 0, addonPrice: 0, discount: 0, total: 0 };

// 1. 初始化載入價目規則
document.addEventListener("DOMContentLoaded", () => {
    fetchPricingRules();
    bindEstimateEvents();
});

async function fetchPricingRules() {
    try {
        const res = await fetch("/api/pricing");
        const data = await res.json();
        if (data.success) {
            PRICING_DATA = data.pricing;
            ADDON_DATA = data.addons;
            DURATION_DATA = data.durations;
            calculatePrices();
        }
    } catch (err) {
        console.error("載入價目表失敗:", err);
        showToast("載入價目表失敗，請重新整理頁面", "error");
    }
}

// 2. 估價計算邏輯
function calculatePrices() {
    const petType = document.getElementById("petType")?.value || "";
    const serviceType = document.getElementById("serviceType")?.value || "";
    const addonType = document.getElementById("addonType")?.value || "無";
    const memberRadio = document.querySelector('input[name="memberType"]:checked');
    const memberType = memberRadio ? memberRadio.value : "無";

    let basePrice = 0;
    if (PRICING_DATA[petType] && PRICING_DATA[petType][serviceType]) {
        basePrice = PRICING_DATA[petType][serviceType];
    }

    let addonPrice = ADDON_DATA[addonType] || 0;
    let subtotal = basePrice + addonPrice;

    let discountRate = 0;
    if (verifiedMember && verifiedMember.member_type === memberType) {
        discountRate = 1.0 - verifiedMember.discount_rate;
    } else if (memberType === "一般會員") {
        discountRate = 0.10; // 9折 (折扣 10%)
    } else if (memberType === "黃金會員") {
        discountRate = 0.15; // 85折 (折扣 15%)
    }

    let discount = Math.round(subtotal * discountRate);
    let total = Math.max(0, subtotal - discount);

    currentEstimate = {
        petType,
        serviceType,
        addonType,
        memberType,
        basePrice,
        addonPrice,
        discount,
        total,
        duration: DURATION_DATA[serviceType] || 1
    };

    const liveTotalEl = document.getElementById("liveTotal");
    if (liveTotalEl) {
        liveTotalEl.innerText = `NT$ ${total.toLocaleString()}`;
    }

    return currentEstimate;
}

function bindEstimateEvents() {
    ["petType", "serviceType", "addonType"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener("change", calculatePrices);
    });
}

// 3. 前往第二階段 (選日期時段與填寫資料)
function goToStep2() {
    const petType = document.getElementById("petType").value;
    const serviceType = document.getElementById("serviceType").value;

    if (!petType) {
        showToast("請先選擇「寵物類別」！", "warning");
        return;
    }
    if (!serviceType) {
        showToast("請先選擇「服務項目」！", "warning");
        return;
    }

    document.getElementById("btnGoToBook").style.display = "none";
    document.getElementById("step2-book").style.display = "block";
    renderCalendar();
    
    // 平滑滾動到第二階段
    document.getElementById("step2-book").scrollIntoView({ behavior: "smooth" });
}

// 4. 月曆渲染
function renderCalendar() {
    const grid = document.getElementById("calendarGrid");
    const monthYearDisplay = document.getElementById("calendarMonthYear");
    if (!grid || !monthYearDisplay) return;

    grid.innerHTML = "";
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    monthYearDisplay.innerText = `${year} 年 ${month + 1} 月`;

    const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
    weekdays.forEach(day => {
        const div = document.createElement("div");
        div.className = "weekday";
        div.innerText = day;
        grid.appendChild(div);
    });

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < firstDay; i++) {
        grid.appendChild(document.createElement("div"));
    }

    for (let i = 1; i <= daysInMonth; i++) {
        const dateObj = new Date(year, month, i);
        const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(i).padStart(2, "0")}`;
        const div = document.createElement("div");
        div.className = "day";
        div.dataset.date = dateStr;

        if (dateObj < today) {
            div.classList.add("disabled");
            div.innerHTML = `<span>${i}</span><span class="day-status">已過期</span>`;
        } else {
            div.innerHTML = `<span>${i}</span><span class="day-status" style="color:#28a745">可選</span>`;
            if (dateStr === selectedDateStr) {
                div.classList.add("selected");
            }
            div.onclick = () => selectDate(dateStr, div);
        }
        grid.appendChild(div);
    }
}

function changeMonth(offset) {
    currentDate.setMonth(currentDate.getMonth() + offset);
    renderCalendar();
}

// 5. 點選日期 -> 向後端 API 查詢該日期的時段預約狀況
async function selectDate(dateStr, element) {
    selectedDateStr = dateStr;
    document.getElementById("selectedDate").value = dateStr;

    document.querySelectorAll(".calendar-grid .day").forEach(d => d.classList.remove("selected"));
    element.classList.add("selected");

    const container = document.getElementById("timeSlotsContainer");
    container.innerHTML = '<p style="grid-column: span 4; color: #666; font-size: 14px;">⏳ 正在查詢時段預約狀況...</p>';

    try {
        const res = await fetch(`/api/availability?date=${dateStr}`);
        const data = await res.json();

        if (!data.success) {
            container.innerHTML = `<p style="grid-column: span 4; color: #d93025;">❌ 查詢失敗: ${data.error}</p>`;
            return;
        }

        renderTimeSlots(data.all_slots, data.booked_slots);
    } catch (err) {
        console.error("查詢時段失敗:", err);
        container.innerHTML = '<p style="grid-column: span 4; color: #d93025;">❌ 連線異常，請稍後再試</p>';
    }
}

function renderTimeSlots(allSlots, bookedSlots) {
    const container = document.getElementById("timeSlotsContainer");
    container.innerHTML = "";
    selectedTimeStr = "";
    document.getElementById("selectedTime").value = "";

    allSlots.forEach(time => {
        const btn = document.createElement("button");
        btn.type = "button";
        const isBooked = bookedSlots.includes(time);

        if (isBooked) {
            btn.className = "time-btn booked";
            btn.innerText = `${time} (額滿)`;
            btn.disabled = true;
        } else {
            btn.className = "time-btn available";
            btn.innerText = time;
            btn.onclick = function () {
                document.querySelectorAll(".time-btn").forEach(b => b.classList.remove("selected"));
                btn.classList.add("selected");
                selectedTimeStr = time;
                document.getElementById("selectedTime").value = time;
            };
        }
        container.appendChild(btn);
    });
}

// 6. 會員身分切換與驗證
function updateMemberLogic() {
    const memberType = document.querySelector('input[name="memberType"]:checked').value;
    const memberIdGroup = document.getElementById("memberIdGroup");
    const feedbackEl = document.getElementById("verifyFeedback");

    if (memberType === "無") {
        memberIdGroup.style.display = "none";
        document.getElementById("memberId").value = "";
        verifiedMember = null;
        if (feedbackEl) feedbackEl.innerHTML = "";
    } else {
        memberIdGroup.style.display = "block";
    }
    calculatePrices();
}

async function verifyMemberId() {
    const memberId = document.getElementById("memberId").value.trim();
    const feedbackEl = document.getElementById("verifyFeedback");
    const memberType = document.querySelector('input[name="memberType"]:checked').value;

    if (!memberId) {
        feedbackEl.className = "verify-feedback error";
        feedbackEl.innerHTML = "❌ 請輸入會員編號";
        return;
    }

    feedbackEl.className = "verify-feedback";
    feedbackEl.innerHTML = "⏳ 驗證中...";

    try {
        const res = await fetch("/api/members/validate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ member_id: memberId })
        });
        const data = await res.json();

        if (data.valid) {
            verifiedMember = data.member;
            feedbackEl.className = "verify-feedback success";
            feedbackEl.innerHTML = `✅ 驗證成功！會員：${data.member.name} (${data.member.member_type})`;
            
            // 自動同動選取正確的會員等級
            const radioToSelect = document.querySelector(`input[name="memberType"][value="${data.member.member_type}"]`);
            if (radioToSelect) radioToSelect.checked = true;

            calculatePrices();
            showToast(`會員「${data.member.name}」驗證成功！已套用折扣`, "success");
        } else {
            verifiedMember = null;
            feedbackEl.className = "verify-feedback error";
            feedbackEl.innerHTML = `❌ ${data.message}`;
            calculatePrices();
        }
    } catch (err) {
        feedbackEl.className = "verify-feedback error";
        feedbackEl.innerHTML = "❌ 驗證連線失敗，請稍後再試";
    }
}

// 7. 送出預約至後端 MySQL
async function submitBooking() {
    const bookingDate = document.getElementById("selectedDate").value;
    const timeSlot = document.getElementById("selectedTime").value;
    const ownerName = document.getElementById("ownerName").value.trim();
    const ownerPhone = document.getElementById("ownerPhone").value.trim();
    const ownerEmail = document.getElementById("ownerEmail").value.trim();
    const petName = document.getElementById("petName").value.trim() || "未命名";
    const petType = document.getElementById("petType").value;
    const serviceType = document.getElementById("serviceType").value;
    const addonType = document.getElementById("addonType").value;
    const memberType = document.querySelector('input[name="memberType"]:checked').value;
    const memberId = document.getElementById("memberId")?.value.trim() || "";

    // 必填欄位驗證
    if (!bookingDate) return showToast("請在月曆上點選預約日期！", "warning");
    if (!timeSlot) return showToast("請選擇預約時間時段！", "warning");
    if (!ownerName) return showToast("請填寫主人姓名！", "warning");
    if (!ownerPhone) return showToast("請填寫手機號碼！", "warning");
    if (!ownerEmail) return showToast("請填寫電子信箱！", "warning");
    if (memberType !== "無" && !memberId) return showToast("具備會員身分者，請務必輸入會員編號！", "warning");

    const submitBtn = document.querySelector("#step2-book .primary-btn");
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerText = "⏳ 正在確認時段並建立預約...";
    }

    try {
        const payload = {
            booking_date: bookingDate,
            time_slot: timeSlot,
            owner_name: ownerName,
            owner_phone: ownerPhone,
            owner_email: ownerEmail,
            pet_name: petName,
            pet_type: petType,
            service_type: serviceType,
            addon_type: addonType,
            member_type: memberType,
            member_id: memberId,
            notes: ""
        };

        const res = await fetch("/api/bookings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        const result = await res.json();

        if (!res.ok || !result.success) {
            showToast(result.error || "預約失敗，請確認資料後再試", "error");
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerText = "確定預約";
            }
            return;
        }

        // 成功，渲染收據
        renderReceipt(result.booking);
        showToast("🎉 預約成功！歡迎光臨沐曦！", "success");
    } catch (err) {
        console.error("提交預約發生錯誤:", err);
        showToast("網路異常，請稍後再試", "error");
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerText = "確定預約";
        }
    }
}

function renderReceipt(booking) {
    document.getElementById("step1-estimate").style.display = "none";
    document.getElementById("step2-book").style.display = "none";

    const discountText = booking.discount_amount > 0 ? ` (已折抵 NT$ ${booking.discount_amount})` : "";
    const memberBadge = booking.member_type !== "無" ? `<span style="color:#FE7000; font-weight:bold;">${booking.member_type} (${booking.member_id})</span>` : "一般顧客";

    const html = `
        <h3>✅ 預約申請已成功確認！</h3>
        <p style="text-align:center; font-size:15px; color:#666; margin-bottom:20px;">感謝您的預約，我們期待為您的毛孩提供最溫暖貼心的服務！</p>
        
        <div class="receipt-row"><span>📋 <b>預約編號：</b></span><span style="font-family:monospace; font-size:18px; color:#FE7000; font-weight:bold;">${booking.booking_id}</span></div>
        <div class="receipt-row"><span>📅 <b>預約時段：</b></span><span>${booking.booking_date} ${booking.time_slot}</span></div>
        <div class="receipt-row"><span>👤 <b>主人資訊：</b></span><span>${booking.owner_name} / ${booking.owner_phone}</span></div>
        <div class="receipt-row"><span>✉️ <b>電子信箱：</b></span><span>${booking.owner_email}</span></div>
        <div class="receipt-row"><span>👑 <b>會員身分：</b></span><span>${memberBadge}</span></div>
        <hr>
        <div class="receipt-row"><span>🐾 <b>寵物名字：</b></span><span>${booking.pet_name} (${booking.pet_type})</span></div>
        <div class="receipt-row"><span>✂️ <b>服務項目：</b></span><span>${booking.service_type}</span></div>
        <div class="receipt-row"><span>🌿 <b>加購服務：</b></span><span>${booking.addon_type}</span></div>
        <div class="receipt-row"><span>⏱️ <b>預估時數：</b></span><span>約 ${booking.estimated_duration} 小時</span></div>
        <div class="receipt-row" style="margin-top:10px; font-size:20px;">
            <span>💰 <b>預估總金額：</b></span>
            <span style="color:#FE7000; font-weight:bold; font-size:24px;">NT$ ${booking.total_price.toLocaleString()}${discountText}</span>
        </div>
        
        <div class="warning-text">
            ⚠️ <b>注意事項：</b><br>
            1. 美容當天請準時帶毛孩至沐曦，若需接送或更改時段請提前來電。<br>
            2. 若填寫之會員編號經複查資格不符，系統將會自動調整費用或另行發送通知。<br>
            3. 若毛孩有易緊張、疾病史或打結情況，美容師施作前將再次與您確認。
        </div>

        <div style="display:flex; gap:15px; justify-content:center; margin-top:25px; flex-wrap:wrap;">
            <button class="btn-secondary" onclick="window.print()" style="padding:12px 24px;">🖨️ 列印預約憑證</button>
            <button class="primary-btn" onclick="location.href='/'" style="width:auto; padding:12px 28px;">回首頁</button>
        </div>
    `;

    const receiptDiv = document.getElementById("step3-receipt");
    receiptDiv.innerHTML = html;
    receiptDiv.style.display = "block";
    receiptDiv.scrollIntoView({ behavior: "smooth" });
}
