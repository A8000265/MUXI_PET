// ==========================================
// 沐曦 MuXi - 全站客服聯絡彈窗 (contact.js)
// ==========================================

function ensureContactModalDOM() {
    if (document.getElementById('contactModalOverlay')) return;

    var modalHTML = ''
        + '<div id="contactModalOverlay" class="contact-modal-overlay" onclick="closeContactModal(event)">'
        + '  <div class="contact-modal-card" onclick="event.stopPropagation()">'
        + '    <div class="contact-modal-header">'
        + '      <button type="button" class="contact-modal-close" onclick="closeContactModal()">&times;</button>'
        + '      <h3>🐾 聯絡沐曦客服</h3>'
        + '      <p>有任何毛孩洗護、住宿、商城或客製需求？歡迎隨時留言給我們！</p>'
        + '    </div>'
        + '    <div class="contact-modal-body">'
        + '      <form id="contactInquiryForm" onsubmit="event.preventDefault(); submitContactInquiry();">'
        + '        <div class="contact-form-group">'
        + '          <label for="contactName">您的稱呼 / 姓名 <span class="required-star">*</span></label>'
        + '          <input type="text" id="contactName" placeholder="例如：王小明" required>'
        + '        </div>'
        + '        <div class="contact-form-group">'
        + '          <label for="contactPhone">聯絡電話</label>'
        + '          <input type="tel" id="contactPhone" placeholder="例如：0912-345-678">'
        + '        </div>'
        + '        <div class="contact-form-group">'
        + '          <label for="contactEmail">電子信箱 <span class="required-star">*</span></label>'
        + '          <input type="email" id="contactEmail" placeholder="例如：customer@example.com" required>'
        + '        </div>'
        + '        <div class="contact-form-group">'
        + '          <label for="contactCategory">諮詢類別</label>'
        + '          <select id="contactCategory">'
        + '            <option value="寵物美容諮詢">🐕 寵物美容諮詢</option>'
        + '            <option value="寵物住宿預訂">🏠 寵物住宿預訂</option>'
        + '            <option value="水療健身預約">🌊 水療健身預約</option>'
        + '            <option value="線上商城與商品">🛍️ 線上商城與商品</option>'
        + '            <option value="會員與其他建議">💬 會員與其他建議</option>'
        + '          </select>'
        + '        </div>'
        + '        <div class="contact-form-group">'
        + '          <label for="contactMessage">諮詢與留言內容 <span class="required-star">*</span></label>'
        + '          <textarea id="contactMessage" placeholder="請詳細描述您的毛孩狀況、需求或想諮詢的問題..." required></textarea>'
        + '        </div>'
        + '        <button type="submit" id="btnSubmitContact" class="btn-contact-submit">'
        + '          ✉️ 送出諮詢信件'
        + '        </button>'
        + '        <div class="contact-notice-box">'
        + '          💡 貼心提醒：點擊送出後，系統將自動將您的留言即時發送至沐曦官方客服信箱（<b>muxipet.service@gmail.com</b>），並發送確認函至您的信箱，專人將於營業時間內儘速為您回覆！'
        + '        </div>'
        + '      </form>'
        + '    </div>'
        + '  </div>'
        + '</div>';

    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

function openContactModal(event) {
    if (event) event.preventDefault();
    ensureContactModalDOM();
    var overlay = document.getElementById('contactModalOverlay');
    if (overlay) {
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

function closeContactModal(event) {
    if (event && event.target && event.target.id !== 'contactModalOverlay' && !event.target.classList.contains('contact-modal-close')) {
        return;
    }
    var overlay = document.getElementById('contactModalOverlay');
    if (overlay) {
        overlay.classList.remove('active');
        document.body.style.overflow = '';
    }
}

async function submitContactInquiry() {
    var name = (document.getElementById('contactName') || {}).value || '';
    var phone = (document.getElementById('contactPhone') || {}).value || '';
    var email = (document.getElementById('contactEmail') || {}).value || '';
    var category = (document.getElementById('contactCategory') || {}).value || '一般諮詢';
    var message = (document.getElementById('contactMessage') || {}).value || '';
    var btn = document.getElementById('btnSubmitContact');

    name = name.trim();
    phone = phone.trim();
    email = email.trim();
    message = message.trim();

    if (!name || !email || !message) {
        alert('請填寫完整姓名、電子信箱與諮詢內容！');
        return;
    }

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '⏳ 正在傳送至客服信箱...';
    }

    try {
        var res = await fetch('/api/contact', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name, phone: phone, email: email, category: category, message: message })
        });
        var data = await res.json();

        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '✉️ 送出諮詢信件';
        }

        if (data.success) {
            alert('🎉 您的留言已成功送達沐曦客服信箱 (muxipet.service@gmail.com)！\n我們已同步發送確認信至 ' + email + '，將於營業時間內儘速與您聯繫！');
            var form = document.getElementById('contactInquiryForm');
            if (form) form.reset();
            closeContactModal();
        } else {
            alert(data.error || '寄送失敗，請稍後再試！');
        }
    } catch (err) {
        console.error('發送客服留言失敗:', err);
        alert('網路連線異常，請稍後再試！');
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '✉️ 送出諮詢信件';
        }
    }
}

function bindFooterEmailIcons() {
    ensureContactModalDOM();
    var links = document.querySelectorAll('.social-icon, .social-links a');
    links.forEach(function(link) {
        var text = link.innerText || link.textContent || '';
        if (text.indexOf('✉') !== -1 || (link.getAttribute('href') === '#' && (text.indexOf('信箱') !== -1 || text.indexOf('mail') !== -1))) {
            link.setAttribute('onclick', 'openContactModal(event)');
            link.style.cursor = 'pointer';
            link.addEventListener('click', function(e) {
                e.preventDefault();
                openContactModal(e);
            });
        }
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindFooterEmailIcons);
} else {
    bindFooterEmailIcons();
}
