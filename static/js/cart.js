// ==========================================
// 沐曦 MuXi - 購物車與離線結帳下單系統 (cart.js)
// ==========================================

const CART_STORAGE_KEY = "muxi_cart_items";
let currentCheckoutItems = null;
let isDirectBuy = false;

// 取得購物車項目
function getCart() {
    try {
        const data = localStorage.getItem(CART_STORAGE_KEY);
        return data ? JSON.parse(data) : [];
    } catch (e) {
        console.error("讀取購物車失敗:", e);
        return [];
    }
}

// 儲存購物車項目
function saveCart(cart) {
    try {
        localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    } catch (e) {
        console.error("儲存購物車失敗:", e);
    }
    updateCartUI();
}

// 加入購物車
function addToCart(item) {
    const cart = getCart();
    // 檢查是否已有相同名稱與規格的商品
    const existingIndex = cart.findIndex(it => it.name === item.name && it.spec === item.spec);
    if (existingIndex > -1) {
        cart[existingIndex].qty += item.qty;
    } else {
        cart.push(item);
    }
    saveCart(cart);
    showToast(`🛒 已成功將【${item.name} (${item.spec}) × ${item.qty}】加入購物車！`, "success");
    openCartDrawer();
}

// 立即購買 (精準結帳當前所選商品與數量，不混入或累加購物車歷史紀錄)
function buyNow(item) {
    currentCheckoutItems = [{ ...item }];
    isDirectBuy = true;
    openCheckoutModal(currentCheckoutItems);
}

// 更新購物車數量標記
function updateCartUI() {
    const cart = getCart();
    const totalCount = cart.reduce((sum, it) => sum + it.qty, 0);

    document.querySelectorAll(".cart-btn").forEach(btn => {
        let badge = btn.querySelector(".cart-count-badge");
        if (!badge) {
            badge = document.createElement("span");
            badge.className = "cart-count-badge";
            btn.appendChild(badge);
        }
        badge.innerText = totalCount;
        badge.style.display = totalCount > 0 ? "inline-flex" : "none";
    });

    renderCartDrawerItems();
}

// 渲染購物車抽屜內容
function renderCartDrawerItems() {
    const container = document.getElementById("cartDrawerItemsList");
    const subtotalEl = document.getElementById("cartDrawerSubtotal");
    const discountEl = document.getElementById("cartDrawerDiscount");
    const totalEl = document.getElementById("cartDrawerTotal");
    if (!container) return;

    const cart = getCart();
    if (cart.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding: 40px 10px; color:#888;">
                <div style="font-size: 50px; margin-bottom: 10px;">🛒</div>
                <p>您的購物車目前空空如也～<br>快去挑選喜愛的毛孩糧食與零食吧！</p>
            </div>
        `;
        if (subtotalEl) subtotalEl.innerText = "$0";
        if (discountEl) discountEl.innerText = "-$0";
        if (totalEl) totalEl.innerText = "$0";
        return;
    }

    let origSubtotal = 0;
    container.innerHTML = "";

    cart.forEach((it, idx) => {
        const itemSubtotal = it.price * it.qty;
        origSubtotal += itemSubtotal;

        const row = document.createElement("div");
        row.className = "cart-drawer-item";
        row.innerHTML = `
            <div class="cart-item-img-box">
                <img src="${it.img || 'DF1.jpg'}" alt="${it.name}" onerror="this.src='/DF1.jpg'">
            </div>
            <div class="cart-item-detail">
                <div class="cart-item-title">${it.name}</div>
                <div class="cart-item-spec">規格：${it.spec}</div>
                <div class="cart-item-price-unit">$${it.price}</div>
                <div class="cart-item-qty-row">
                    <button class="cart-qty-btn" onclick="updateCartItemQty(${idx}, -1)">-</button>
                    <span class="cart-qty-num">${it.qty}</span>
                    <button class="cart-qty-btn" onclick="updateCartItemQty(${idx}, 1)">+</button>
                    <button class="cart-item-remove-btn" onclick="removeCartItem(${idx})" title="刪除商品">🗑️</button>
                </div>
            </div>
            <div class="cart-item-subtotal">$${itemSubtotal}</div>
        `;
        container.appendChild(row);
    });

    // 檢查當前會員折扣
    const currentMember = window.currentMuxiMember;
    let discountRate = 1.0;
    if (currentMember && currentMember.discount_rate) {
        discountRate = parseFloat(currentMember.discount_rate);
    }

    const discountAmount = Math.round(origSubtotal * (1.0 - discountRate));
    const finalTotal = origSubtotal - discountAmount;

    if (subtotalEl) subtotalEl.innerText = `$${origSubtotal}`;
    if (discountEl) {
        if (discountRate < 1.0) {
            discountEl.innerText = `-$${discountAmount} (${currentMember.member_type} ${(discountRate * 10).toFixed(1)}折)`;
            discountEl.parentElement.style.display = "flex";
        } else {
            discountEl.parentElement.style.display = "none";
        }
    }
    if (totalEl) totalEl.innerText = `$${finalTotal}`;
}

// 修改購物車數量
function updateCartItemQty(index, delta) {
    const cart = getCart();
    if (!cart[index]) return;

    cart[index].qty += delta;
    if (cart[index].qty <= 0) {
        cart.splice(index, 1);
    } else if (cart[index].qty > 10) {
        alert("單品數量超過 10 件，請聯繫沐曦客服為您批量安排！");
        cart[index].qty = 10;
    }
    saveCart(cart);
}

// 移除購物車項目
function removeCartItem(index) {
    const cart = getCart();
    if (!cart[index]) return;
    const name = cart[index].name;
    cart.splice(index, 1);
    saveCart(cart);
    showToast(`已移除【${name}】`, "info");
}

// 清空購物車
function clearCart() {
    saveCart([]);
}

// 開啟/關閉購物車抽屜
function openCartDrawer() {
    const drawer = document.getElementById("cartDrawerOverlay");
    if (drawer) {
        drawer.classList.add("active");
        renderCartDrawerItems();
    }
}

function closeCartDrawer() {
    const drawer = document.getElementById("cartDrawerOverlay");
    if (drawer) drawer.classList.remove("active");
}

// 開啟結帳 Modal (可傳入指定單品 directItems 或預設結帳整台購物車)
function openCheckoutModal(directItems = null) {
    closeCartDrawer();
    
    if (directItems && Array.isArray(directItems) && directItems.length > 0) {
        currentCheckoutItems = directItems;
        isDirectBuy = true;
    } else {
        currentCheckoutItems = getCart();
        isDirectBuy = false;
    }

    if (!currentCheckoutItems || currentCheckoutItems.length === 0) {
        showToast("沒有待結帳的商品！", "warning");
        return;
    }

    const modal = document.getElementById("checkoutModalOverlay");
    if (!modal) return;

    // 自動帶入會員資料
    const mem = window.currentMuxiMember;
    if (mem) {
        const nameInput = document.getElementById("checkoutName");
        const phoneInput = document.getElementById("checkoutPhone");
        const emailInput = document.getElementById("checkoutEmail");
        const memBadge = document.getElementById("checkoutMemberBadge");

        if (nameInput && !nameInput.value) nameInput.value = mem.name || "";
        if (phoneInput && !phoneInput.value) phoneInput.value = mem.phone || "";
        if (emailInput && !emailInput.value) emailInput.value = mem.email || "";
        if (memBadge) {
            memBadge.innerText = `✨ 已認證會員：${mem.name} (${mem.member_type} 享折扣)`;
            memBadge.style.display = "inline-block";
        }
    }

    renderCheckoutItemsPreview();
    modal.style.setProperty("display", "flex", "important");
    modal.classList.add("active");
}

function closeCheckoutModal() {
    const modal = document.getElementById("checkoutModalOverlay");
    if (modal) {
        modal.classList.remove("active");
        modal.style.setProperty("display", "none", "important");
    }
}

// 結帳商品預覽 (精準顯示當前準備結帳的商品清單與數量)
function renderCheckoutItemsPreview() {
    const listEl = document.getElementById("checkoutItemsSummaryList");
    const totalEl = document.getElementById("checkoutFinalTotalAmount");
    if (!listEl) return;

    const itemsToRender = (currentCheckoutItems && currentCheckoutItems.length > 0) ? currentCheckoutItems : getCart();
    let origSubtotal = 0;
    listEl.innerHTML = "";

    itemsToRender.forEach(it => {
        const sub = it.price * it.qty;
        origSubtotal += sub;
        const row = document.createElement("div");
        row.className = "checkout-item-summary-row";
        row.innerHTML = `
            <span>🔹 <b>${it.name}</b> (${it.spec}) × ${it.qty} 件</span>
            <span>$${sub}</span>
        `;
        listEl.appendChild(row);
    });

    const currentMember = window.currentMuxiMember;
    let discountRate = currentMember && currentMember.discount_rate ? parseFloat(currentMember.discount_rate) : 1.0;
    const discountAmount = Math.round(origSubtotal * (1.0 - discountRate));
    const finalTotal = origSubtotal - discountAmount;

    if (totalEl) totalEl.innerText = `$${finalTotal}`;
}

// 送出結帳訂單
async function submitCheckoutOrder() {
    const itemsToSubmit = (currentCheckoutItems && currentCheckoutItems.length > 0) ? currentCheckoutItems : getCart();
    if (!itemsToSubmit || itemsToSubmit.length === 0) {
        showToast("沒有待結帳的商品！", "warning");
        return;
    }

    const name = document.getElementById("checkoutName")?.value.trim();
    const phone = document.getElementById("checkoutPhone")?.value.trim();
    const email = document.getElementById("checkoutEmail")?.value.trim();
    const pickupMethod = document.getElementById("checkoutPickupMethod")?.value || "門市自取";
    const notes = document.getElementById("checkoutNotes")?.value.trim() || "";

    if (!name || !phone || !email) {
        showToast("請填寫完整的姓名、手機與電子信箱！", "warning");
        return;
    }

    const btnSubmit = document.getElementById("btnSubmitCheckout");
    if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.innerText = "⏳ 正在處理訂單...";
    }

    const currentMember = window.currentMuxiMember;

    try {
        const res = await fetch("/api/orders/create", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                customer_name: name,
                customer_phone: phone,
                customer_email: email,
                member_id: currentMember ? currentMember.member_id : null,
                pickup_method: pickupMethod,
                notes: notes,
                items: itemsToSubmit
            })
        });

        const data = await res.json();
        if (data.success && data.order) {
            // 若為整車結帳則清空購物車；若為立即購買則保留原本購物車項目
            if (!isDirectBuy) {
                clearCart();
            }
            currentCheckoutItems = null;
            isDirectBuy = false;
            closeCheckoutModal();

            // 彈出訂單完成備份卡片
            showOrderSuccessModal(data.order, data.notice);
            showToast("🎉 下單成功！訂單明細已同步備份並寄送至信箱！", "success");
        } else {
            showToast(data.error || "下單失敗，請稍後重試", "error");
        }
    } catch (err) {
        console.error("結帳失敗:", err);
        showToast("網路異常，請稍後重試！", "error");
    } finally {
        if (btnSubmit) {
            btnSubmit.disabled = false;
            btnSubmit.innerText = "📦 確認下單 (到店取貨付款)";
        }
    }
}

// 顯示訂單成功備份視窗
function showOrderSuccessModal(order, notice) {
    const modal = document.getElementById("orderSuccessModalOverlay");
    const contentArea = document.getElementById("orderSuccessContentArea");
    if (!modal || !contentArea) return;

    let itemsHtml = order.items.map(it => `
        <div class="order-success-item-row">
            <span>🔹 ${it.name} (${it.spec}) × ${it.qty}</span>
            <span>$${it.price * it.qty}</span>
        </div>
    `).join("");

    contentArea.innerHTML = `
        <div class="order-success-card">
            <div class="order-success-header">
                <div class="order-badge-stamp">✔ 下單完成</div>
                <h2>🎉 感謝您的訂購！</h2>
                <p>訂單編號：<b>${order.order_no}</b></p>
            </div>

            <!-- 使用者指定之道歉與感謝提示 -->
            <div class="order-offline-notice-box">
                <div class="notice-title">📢 重要取貨與付款提醒</div>
                <div class="notice-body">${notice}</div>
                <div class="notice-footer">付款方式：<b>${order.payment_status}</b> ｜ 取貨方式：<b>${order.pickup_method}</b></div>
            </div>

            <div class="order-detail-box">
                <h3>🛍️ 購買商品明細</h3>
                <div class="order-items-list">${itemsHtml}</div>
                <div class="order-totals-summary">
                    <div>原價總額：$${order.original_amount}</div>
                    ${order.discount_amount > 0 ? `<div style="color:#FE7000;">會員優惠：-$${order.discount_amount} (${order.member_type})</div>` : ''}
                    <div class="order-final-price">應付總計：$${order.total_amount}</div>
                </div>
            </div>

            <div class="order-customer-summary">
                <p>👤 訂購人姓名：${order.customer_name}</p>
                <p>📞 聯絡電話：${order.customer_phone}</p>
                <p>✉️ 電子信箱：${order.customer_email} <span class="backup-tag">已發送備份信件</span></p>
                <p>🕒 下單時間：${order.created_at}</p>
            </div>

            <div style="margin-top: 25px; text-align: center;">
                <button class="primary-btn" onclick="closeOrderSuccessModal()" style="max-width: 250px; font-size: 16px; padding: 12px 24px;">
                    確定並返回商城
                </button>
            </div>
        </div>
    `;

    modal.style.setProperty("display", "flex", "important");
    modal.classList.add("active");
}

function closeOrderSuccessModal() {
    const modal = document.getElementById("orderSuccessModalOverlay");
    if (modal) {
        modal.classList.remove("active");
        modal.style.setProperty("display", "none", "important");
    }
}

// 擷取當前頁面選取的商品資料
function extractCurrentProduct() {
    const titleEl = document.querySelector(".main-product-title") || document.querySelector("h2") || document.querySelector(".product-name");
    const name = titleEl ? titleEl.innerText.trim() : "優質寵物商品";
    const activeWeightBtn = document.querySelector(".weight-btn.active") || document.querySelector(".weight-btn");
    const spec = activeWeightBtn ? activeWeightBtn.innerText.trim() : "標準規格";
    
    let price = 880;
    if (activeWeightBtn && activeWeightBtn.getAttribute("data-price")) {
        price = parseInt(activeWeightBtn.getAttribute("data-price"), 10) || 880;
    } else {
        const priceEl = document.getElementById("product-price");
        if (priceEl) {
            const match = priceEl.innerText.match(/\d+/);
            if (match) price = parseInt(match[0], 10);
        }
    }

    const qtyEl = document.getElementById("display-qty");
    let qty = 1;
    if (qtyEl) {
        const parsed = parseInt(qtyEl.innerText.trim(), 10);
        if (!isNaN(parsed) && parsed > 0) qty = parsed;
    }

    const imgEl = document.querySelector(".product-image-area img") || document.querySelector(".main-product-img") || document.querySelector("img");
    const img = imgEl ? (imgEl.getAttribute("src") || "DF1.jpg") : "DF1.jpg";

    return { name, spec, price, qty, img };
}

// 全域事件委派：確保所有「加入購物車」、「立即購買」與「我的購物車」按鈕 100% 靈敏觸發
document.addEventListener("click", (e) => {
    // 1. 點擊「加入購物車」按鈕 (包含內部 icon 或文字)
    const btnCart = e.target.closest(".btn-cart");
    if (btnCart) {
        e.preventDefault();
        const prod = extractCurrentProduct();
        addToCart(prod);
        return;
    }

    // 2. 點擊「立即購買」按鈕
    const btnBuy = e.target.closest(".btn-buy");
    if (btnBuy) {
        e.preventDefault();
        const prod = extractCurrentProduct();
        buyNow(prod);
        return;
    }

    // 3. 點擊「我的購物車」按鈕
    const cartBtn = e.target.closest(".cart-btn");
    if (cartBtn) {
        e.preventDefault();
        openCartDrawer();
        return;
    }
});

// 初始化購物車系統
function initCartApp() {
    injectCartAndCheckoutDOM();
    updateCartUI();
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initCartApp);
} else {
    initCartApp();
}

// 自動向頁面注入購物車抽屜與結帳 Modal DOM (若頁面尚未存在)
function injectCartAndCheckoutDOM() {
    if (document.getElementById("cartDrawerOverlay")) return;

    const div = document.createElement("div");
    div.innerHTML = `
        <!-- 購物車抽屜 Overlay -->
        <div id="cartDrawerOverlay" class="cart-drawer-overlay" onclick="if(event.target===this) closeCartDrawer();">
            <div class="cart-drawer">
                <div class="cart-drawer-header">
                    <h3>🛒 我的購物清單</h3>
                    <button class="cart-drawer-close-btn" onclick="closeCartDrawer()">✖</button>
                </div>
                <div id="cartDrawerItemsList" class="cart-drawer-body">
                    <!-- 動態渲染購物車清單 -->
                </div>
                <div class="cart-drawer-footer">
                    <div class="cart-drawer-calc-row">
                        <span>商品小計</span>
                        <span id="cartDrawerSubtotal">$0</span>
                    </div>
                    <div class="cart-drawer-calc-row discount-row" style="display:none;">
                        <span>會員折扣</span>
                        <span id="cartDrawerDiscount" style="color:#FE7000;">-$0</span>
                    </div>
                    <div class="cart-drawer-calc-row total-row">
                        <span>總計 (到店付款)</span>
                        <span id="cartDrawerTotal" style="color:#9333EA; font-size:22px;">$0</span>
                    </div>
                    <div class="cart-drawer-btn-group">
                        <button class="btn-clear-cart" onclick="clearCart()">清空</button>
                        <button class="btn-goto-checkout" onclick="openCheckoutModal()">前往結帳 ➔</button>
                    </div>
                </div>
            </div>
        </div>

        <!-- 結帳填寫 Modal Overlay -->
        <div id="checkoutModalOverlay" class="checkout-modal-overlay" onclick="if(event.target===this) closeCheckoutModal();">
            <div class="checkout-modal-card">
                <button class="btn-close-modal" onclick="closeCheckoutModal()">✖</button>
                <div class="checkout-modal-header">
                    <h2>📦 商城訂單結帳 (到店取貨付款)</h2>
                    <span id="checkoutMemberBadge" class="checkout-member-badge" style="display:none;"></span>
                </div>

                <!-- 道歉與說明提示 -->
                <div class="checkout-apology-banner">
                    ⚠️ <b>溫馨提醒</b>：本商城目前採【到店取貨付款】。<br>
                    感謝顧客的購買與理解，對於暫無法線上付款深感抱歉，後續將為您更新線上支付系統！
                </div>

                <div class="checkout-form-grid">
                    <div class="form-group">
                        <label for="checkoutName">👤 訂購人姓名 <span style="color:red;">*</span></label>
                        <input type="text" id="checkoutName" placeholder="請輸入您的真實姓名" required>
                    </div>
                    <div class="form-group">
                        <label for="checkoutPhone">📞 聯絡電話 <span style="color:red;">*</span></label>
                        <input type="tel" id="checkoutPhone" placeholder="例如：0912345678" required>
                    </div>
                    <div class="form-group" style="grid-column: 1 / -1;">
                        <label for="checkoutEmail">✉️ 電子信箱 (發送訂單備份) <span style="color:red;">*</span></label>
                        <input type="email" id="checkoutEmail" placeholder="例如：user@example.com" required>
                    </div>
                    <div class="form-group" style="grid-column: 1 / -1;">
                        <label for="checkoutPickupMethod">🏬 取貨方式</label>
                        <select id="checkoutPickupMethod">
                            <option value="門市自取 (高雄建工旗艦店)">門市自取 (807高雄市三民區建工路415號)</option>
                        </select>
                    </div>
                    <div class="form-group" style="grid-column: 1 / -1;">
                        <label for="checkoutNotes">📝 訂單備註 (選填)</label>
                        <textarea id="checkoutNotes" rows="2" placeholder="如有任何取貨時間需求或特殊叮嚀請填寫"></textarea>
                    </div>
                </div>

                <div class="checkout-items-preview-box">
                    <h4>📋 購買清單確認</h4>
                    <div id="checkoutItemsSummaryList"></div>
                    <div class="checkout-final-total-row">
                        <span>應付總金額：</span>
                        <span id="checkoutFinalTotalAmount">$0</span>
                    </div>
                </div>

                <div style="text-align:center; margin-top: 20px;">
                    <button id="btnSubmitCheckout" class="primary-btn" onclick="submitCheckoutOrder()" style="font-size: 18px; padding: 14px 30px;">
                        📦 確認下單 (到店取貨付款)
                    </button>
                </div>
            </div>
        </div>

        <!-- 訂單成功備份 Modal Overlay -->
        <div id="orderSuccessModalOverlay" class="order-success-modal-overlay" onclick="if(event.target===this) closeOrderSuccessModal();">
            <div id="orderSuccessContentArea" class="order-success-modal-container"></div>
        </div>
    `;
    document.body.appendChild(div);
}

// 輕量 Toast 通知輔助
function showToast(message, type = "info") {
    let container = document.getElementById("toast-container");
    if (!container) {
        container = document.createElement("div");
        container.id = "toast-container";
        document.body.appendChild(container);
    }
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.innerText = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add("fade-out");
        setTimeout(() => toast.remove(), 400);
    }, 3000);
}
