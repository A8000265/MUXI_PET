// ==========================================
// 沐曦 MuXi - 員工專屬後台管理系統 (admin.js)
// ==========================================

let currentAdminTab = "bookings";
let cachedBookings = [];
let cachedOrders = [];
let cachedMembers = [];
let cachedMatches = [];

document.addEventListener("DOMContentLoaded", () => {
    checkEmployeeAuth();
});

// 1. 檢查員工登入狀態
async function checkEmployeeAuth() {
    try {
        const res = await fetch("/api/employee/status");
        const data = await res.json();
        const gate = document.getElementById("employeeLoginGate");
        const main = document.getElementById("adminMainContainer");
        const badge = document.getElementById("adminEmpBadge");

        if (data.success && data.logged_in && data.employee) {
            if (gate) gate.style.display = "none";
            if (main) main.style.display = "block";
            if (badge) badge.innerText = `👤 員工：${data.employee.name} (${data.employee.emp_no} · ${data.employee.role})`;
            
            // 載入儀表板與預設分頁資料
            loadDashboardStats();
            loadBookings();
        } else {
            if (gate) gate.style.display = "flex";
            if (main) main.style.display = "none";
        }
    } catch (e) {
        console.error("驗證失敗:", e);
    }
}

// 2. 處理員工登入
async function handleEmployeeLogin(e) {
    if (e) e.preventDefault();
    const empNo = document.getElementById("empNoInput")?.value.trim();
    const password = document.getElementById("empPwdInput")?.value.trim();
    const btn = document.getElementById("btnEmpLogin");

    if (!empNo || !password) {
        alert("請輸入員工編號與密碼！");
        return;
    }

    if (btn) {
        btn.disabled = true;
        btn.innerText = "驗證中...";
    }

    try {
        const res = await fetch("/api/employee/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ emp_no: empNo, password })
        });
        const data = await res.json();
        if (data.success) {
            checkEmployeeAuth();
        } else {
            alert(data.error || "登入失敗，請確認員工編號與密碼！");
        }
    } catch (err) {
        console.error(err);
        alert("伺服器連線異常，請稍後重試！");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerText = "登入後台系統";
        }
    }
}

// 3. 處理員工登出
async function handleEmployeeLogout() {
    if (!confirm("確定要登出員工後台系統嗎？")) return;
    try {
        await fetch("/api/employee/logout", { method: "POST" });
        checkEmployeeAuth();
    } catch (e) {
        console.error(e);
    }
}

// 4. 切換後台分頁模組
function switchAdminTab(tabName) {
    currentAdminTab = tabName;
    const tabBtns = document.querySelectorAll(".admin-tab-btn");
    tabBtns.forEach(btn => {
        if (btn.innerText.includes("預約") && tabName === "bookings") btn.classList.add("active");
        else if (btn.innerText.includes("訂單") && tabName === "orders") btn.classList.add("active");
        else if (btn.innerText.includes("會員") && tabName === "members") btn.classList.add("active");
        else if (btn.innerText.includes("速配") && tabName === "matches") btn.classList.add("active");
        else btn.classList.remove("active");
    });

    document.getElementById("tabPanelBookings").style.display = tabName === "bookings" ? "block" : "none";
    document.getElementById("tabPanelOrders").style.display = tabName === "orders" ? "block" : "none";
    document.getElementById("tabPanelMembers").style.display = tabName === "members" ? "block" : "none";
    document.getElementById("tabPanelMatches").style.display = tabName === "matches" ? "block" : "none";

    if (tabName === "bookings") loadBookings();
    else if (tabName === "orders") loadOrders();
    else if (tabName === "members") loadMembers();
    else if (tabName === "matches") loadMatches();
}

// 5. 載入儀表板統計概況
async function loadDashboardStats() {
    try {
        const res = await fetch("/api/admin/stats");
        const data = await res.json();
        if (data.success && data.stats) {
            const s = data.stats;
            document.getElementById("statTotalBookings").innerText = s.total_bookings;
            document.getElementById("statPendingOrders").innerText = s.pending_orders;
            document.getElementById("statTotalRevenue").innerText = `NT$ ${s.total_revenue.toLocaleString()}`;
            document.getElementById("statTotalMembers").innerText = s.total_members;
        }
    } catch (e) {
        console.error("載入統計失敗:", e);
    }
}

// 6. 載入預約清單 (含會員對比)
async function loadBookings() {
    const tbody = document.getElementById("bookingsTableBody");
    const date = document.getElementById("bookingFilterDate")?.value || "";
    const status = document.getElementById("bookingFilterStatus")?.value || "";
    const q = document.getElementById("bookingSearchInput")?.value.trim() || "";

    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:30px;">⏳ 正在加載預約數據...</td></tr>`;

    try {
        const url = `/api/bookings?date=${encodeURIComponent(date)}&status=${encodeURIComponent(status)}&q=${encodeURIComponent(q)}`;
        const res = await fetch(url);
        const data = await res.json();

        if (data.success) {
            cachedBookings = data.bookings;
            renderBookingsTable(data.bookings);
        } else {
            tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; color:red; padding:30px;">載入失敗：${data.error}</td></tr>`;
        }
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; color:red; padding:30px;">連線失敗</td></tr>`;
    }
}

function renderBookingsTable(bookings) {
    const tbody = document.getElementById("bookingsTableBody");
    if (!tbody) return;

    if (bookings.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:40px; color:#888;">查無符合條件的預約紀錄</td></tr>`;
        return;
    }

    tbody.innerHTML = bookings.map(b => {
        // 會員比對標籤
        let memberBadge = `<span class="pill pill-guest">一般訪客</span>`;
        if (b.is_verified_member) {
            if (b.verified_member_type === "黃金會員") {
                memberBadge = `<span class="pill pill-verified-gold">✨ 已認證黃金會員 (85折)</span><br><small style="color:#888;">${b.verified_member_id}</small>`;
            } else {
                memberBadge = `<span class="pill pill-verified-member">✨ 已認證一般會員 (9折)</span><br><small style="color:#888;">${b.verified_member_id}</small>`;
            }
        }

        // 預約狀態標籤
        let statusBadge = `<span class="pill pill-status-confirmed">已預約</span>`;
        if (b.status === "completed") statusBadge = `<span class="pill pill-status-completed">已完成</span>`;
        else if (b.status === "cancelled") statusBadge = `<span class="pill pill-status-cancelled">已取消</span>`;

        return `
            <tr>
                <td><b>${b.booking_id}</b></td>
                <td>
                    <b>${b.booking_date}</b><br>
                    <span style="color:#4F46E5; font-weight:bold;">${b.time_slot}</span>
                </td>
                <td>
                    <b>${b.owner_name}</b><br>
                    ${memberBadge}
                </td>
                <td>
                    📞 ${b.owner_phone}<br>
                    ✉️ <small>${b.owner_email}</small>
                </td>
                <td>
                    🐾 <b>${b.pet_name}</b> (${b.pet_type})
                </td>
                <td>
                    <b>${b.service_type}</b><br>
                    <small style="color:#666;">加購：${b.addon_type || '無'}</small>
                </td>
                <td>
                    <b>$${b.total_price}</b>
                    ${b.discount_amount > 0 ? `<br><small style="color:#FE7000;">省 $${b.discount_amount}</small>` : ''}
                </td>
                <td>${statusBadge}</td>
                <td>
                    ${b.status === 'confirmed' ? `
                        <button class="btn-status-act btn-act-complete" onclick="updateBookingStatus('${b.booking_id}', 'completed')">完成</button>
                        <button class="btn-status-act btn-act-cancel" onclick="updateBookingStatus('${b.booking_id}', 'cancelled')">取消</button>
                    ` : `<span style="color:#999; font-size:12px;">無操作</span>`}
                </td>
            </tr>
        `;
    }).join("");
}

async function updateBookingStatus(bookingId, newStatus) {
    const actionText = newStatus === "completed" ? "標記為已完成" : "取消此筆預約";
    if (!confirm(`確定要將預約【${bookingId}】${actionText} 嗎？`)) return;

    try {
        const res = await fetch(`/api/bookings/${bookingId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: newStatus })
        });
        const data = await res.json();
        if (data.success) {
            loadBookings();
            loadDashboardStats();
        } else {
            alert(data.error || "操作失敗");
        }
    } catch (e) {
        alert("操作異常");
    }
}

// 7. 載入商城訂單清單 (含會員對比)
async function loadOrders() {
    const tbody = document.getElementById("ordersTableBody");
    const status = document.getElementById("orderFilterStatus")?.value || "";
    const q = document.getElementById("orderSearchInput")?.value.trim() || "";

    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:30px;">⏳ 正在加載商城訂單數據...</td></tr>`;

    try {
        const url = `/api/orders/list?status=${encodeURIComponent(status)}&q=${encodeURIComponent(q)}`;
        const res = await fetch(url);
        const data = await res.json();

        if (data.success) {
            cachedOrders = data.orders;
            renderOrdersTable(data.orders);
        } else {
            tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; color:red; padding:30px;">載入失敗：${data.error}</td></tr>`;
        }
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; color:red; padding:30px;">連線失敗</td></tr>`;
    }
}

function renderOrdersTable(orders) {
    const tbody = document.getElementById("ordersTableBody");
    if (!tbody) return;

    if (orders.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:40px; color:#888;">查無符合條件的商城訂單</td></tr>`;
        return;
    }

    tbody.innerHTML = orders.map(o => {
        // 會員比對標籤
        let memberBadge = `<span class="pill pill-guest">一般訪客</span>`;
        if (o.is_verified_member) {
            if (o.verified_member_type === "黃金會員") {
                memberBadge = `<span class="pill pill-verified-gold">✨ 黃金會員 (85折)</span><br><small style="color:#888;">${o.verified_member_id}</small>`;
            } else {
                memberBadge = `<span class="pill pill-verified-member">✨ 一般會員 (9折)</span><br><small style="color:#888;">${o.verified_member_id}</small>`;
            }
        }

        // 商品明細 Chip
        let itemsHtml = `<div class="order-items-badge-list">` + 
            o.items.map(it => `<div class="order-item-chip">🛍️ ${it.product_name} (${it.spec}) × ${it.quantity} ($${it.subtotal})</div>`).join("") + 
            `</div>`;

        // 訂單狀態標籤
        let statusBadge = `<span class="pill pill-status-pending">待到店取貨付款</span>`;
        if (o.status === "completed") statusBadge = `<span class="pill pill-status-completed">已自取付款完成</span>`;
        else if (o.status === "cancelled") statusBadge = `<span class="pill pill-status-cancelled">已取消</span>`;

        return `
            <tr>
                <td><b>${o.order_no}</b></td>
                <td><small>${o.created_at}</small></td>
                <td>
                    <b>${o.customer_name}</b><br>
                    ${memberBadge}
                </td>
                <td>
                    📞 ${o.customer_phone}<br>
                    ✉️ <small>${o.customer_email}</small>
                </td>
                <td>${itemsHtml}</td>
                <td>
                    🏬 ${o.pickup_method}<br>
                    <small style="color:#666;">${o.payment_status}</small>
                </td>
                <td>
                    <b>$${o.total_amount}</b>
                    ${o.discount_amount > 0 ? `<br><small style="color:#FE7000;">優惠 -$${o.discount_amount}</small>` : ''}
                </td>
                <td>${statusBadge}</td>
                <td>
                    ${o.status === 'pending_pickup' ? `
                        <button class="btn-status-act btn-act-complete" onclick="updateOrderStatus('${o.order_no}', 'completed')">已取貨</button>
                        <button class="btn-status-act btn-act-cancel" onclick="updateOrderStatus('${o.order_no}', 'cancelled')">取消</button>
                    ` : `<span style="color:#999; font-size:12px;">無操作</span>`}
                </td>
            </tr>
        `;
    }).join("");
}

async function updateOrderStatus(orderNo, newStatus) {
    const actionText = newStatus === "completed" ? "標記為已取貨完成" : "取消此筆訂單";
    if (!confirm(`確定要將訂單【${orderNo}】${actionText} 嗎？`)) return;

    try {
        const res = await fetch(`/api/orders/update-status`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ order_no: orderNo, status: newStatus })
        });
        const data = await res.json();
        if (data.success) {
            loadOrders();
            loadDashboardStats();
        } else {
            alert(data.error || "操作失敗");
        }
    } catch (e) {
        alert("操作異常");
    }
}

// 8. 載入會員名冊與比對庫
async function loadMembers() {
    const tbody = document.getElementById("membersTableBody");
    const q = document.getElementById("memberSearchInput")?.value.trim() || "";

    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:30px;">⏳ 正在加載會員數據...</td></tr>`;

    try {
        const url = `/api/members/list?q=${encodeURIComponent(q)}`;
        const res = await fetch(url);
        const data = await res.json();

        if (data.success) {
            cachedMembers = data.members;
            renderMembersTable(data.members);
        } else {
            tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; color:red; padding:30px;">載入失敗：${data.error}</td></tr>`;
        }
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; color:red; padding:30px;">連線失敗</td></tr>`;
    }
}

function renderMembersTable(members) {
    const tbody = document.getElementById("membersTableBody");
    if (!tbody) return;

    if (members.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:40px; color:#888;">查無符合條件的會員</td></tr>`;
        return;
    }

    tbody.innerHTML = members.map(m => {
        let tierBadge = m.member_type === "黃金會員" 
            ? `<span class="pill pill-verified-gold">👑 黃金會員</span>`
            : `<span class="pill pill-verified-member">⭐ 一般會員</span>`;

        return `
            <tr>
                <td><code><b>${m.member_id}</b></code></td>
                <td><b>${m.name}</b></td>
                <td>📞 ${m.phone}</td>
                <td>✉️ ${m.email || '未提供'}</td>
                <td>${tierBadge}</td>
                <td><b style="color:#FE7000;">${(m.discount_rate * 10).toFixed(1)} 折</b></td>
                <td><b>${m.booking_count || 0}</b> 次</td>
                <td><b>${m.order_count || 0}</b> 筆</td>
                <td><small>${m.created_at}</small></td>
            </tr>
        `;
    }).join("");
}

// 9. 載入毛孩速配測驗紀錄
async function loadMatches() {
    const tbody = document.getElementById("matchesTableBody");
    const q = document.getElementById("matchSearchInput")?.value.trim() || "";

    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:30px;">⏳ 正在加載測驗數據...</td></tr>`;

    try {
        const res = await fetch("/api/matches/saved");
        const data = await res.json();

        if (data.success && data.saved_matches) {
            let list = data.saved_matches;
            if (q) {
                list = list.filter(m => 
                    (m.email && m.email.includes(q)) || 
                    (m.owner_name && m.owner_name.includes(q)) || 
                    (m.breed_name && m.breed_name.includes(q)) ||
                    (m.mbti && m.mbti.includes(q))
                );
            }
            cachedMatches = list;
            renderMatchesTable(list);
        } else {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:#888; padding:30px;">暫無速配測驗紀錄</td></tr>`;
        }
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:red; padding:30px;">連線失敗</td></tr>`;
    }
}

function renderMatchesTable(matches) {
    const tbody = document.getElementById("matchesTableBody");
    if (!tbody) return;

    if (matches.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:40px; color:#888;">查無符合條件的速配紀錄</td></tr>`;
        return;
    }

    tbody.innerHTML = matches.map(m => `
        <tr>
            <td>#${m.id}</td>
            <td>
                <b>${m.owner_name}</b><br>
                ✉️ <small>${m.email}</small>
            </td>
            <td><span class="pill pill-verified-member">${m.mbti}</span></td>
            <td>${m.zodiac || '占卜匹配'} ${m.birthday ? `(${m.birthday})` : ''}</td>
            <td><b>${m.breed_name}</b> (${m.pet_type})</td>
            <td><b style="color:#10B981;">${m.match_score}%</b></td>
            <td><span class="pill pill-status-completed">✔ 已寄送備份</span></td>
            <td><small>${m.created_at}</small></td>
        </tr>
    `).join("");
}

// 10. 匯出 CSV 工具
function exportBookingsCSV() {
    window.open("/api/admin/export/csv", "_blank");
}

function exportOrdersCSV() {
    if (cachedOrders.length === 0) {
        alert("目前沒有訂單可匯出！");
        return;
    }
    let csvContent = "\uFEFF訂單編號,下單時間,顧客姓名,顧客電話,顧客信箱,會員身份,訂單總額,取貨方式,付款狀態,訂單狀態\n";
    cachedOrders.forEach(o => {
        csvContent += `"${o.order_no}","${o.created_at}","${o.customer_name}","${o.customer_phone}","${o.customer_email}","${o.member_type}","${o.total_amount}","${o.pickup_method}","${o.payment_status}","${o.status}"\n`;
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `MUXI_商城訂單報表_${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
}
