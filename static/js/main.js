// ==========================================
// 沐曦 MuXi - 全站通用互動與轉場腳本
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    // 1. 下拉選單處理
    const dropdownContainers = document.querySelectorAll('.nav-item-dropdown');
    dropdownContainers.forEach(container => {
        const toggle = container.querySelector('.dropdown-toggle');
        if (toggle) {
            toggle.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                container.classList.toggle('active');
            });
        }
    });

    document.addEventListener('click', (e) => {
        dropdownContainers.forEach(container => {
            if (!container.contains(e.target)) {
                container.classList.remove('active');
            }
        });
    });

    // 2. 轉場動畫處理
    const transitionOverlay = document.getElementById('page-transition');
    const pageLinks = document.querySelectorAll('.page-link');

    if (pageLinks.length > 0 && transitionOverlay) {
        pageLinks.forEach(link => {
            link.addEventListener('click', function(e) {
                const targetUrl = this.getAttribute('href');
                if (!targetUrl || targetUrl.startsWith('#') || targetUrl.startsWith('javascript:')) {
                    return;
                }
                
                e.preventDefault();
                
                // 關閉下拉選單
                dropdownContainers.forEach(c => c.classList.remove('active'));

                // 啟動轉場
                transitionOverlay.classList.add('active');

                // 0.6s 後跳轉
                setTimeout(() => {
                    window.location.href = targetUrl;
                }, 600);
            });
        });
    }

    // 抵達新頁面時淡出轉場遮罩
    if (transitionOverlay) {
        transitionOverlay.classList.add('active');
        setTimeout(() => {
            transitionOverlay.classList.remove('active');
        }, 250);
    }
});

// 通用 Toast 提示訊息
function showToast(message, type = 'info') {
    const existing = document.querySelector('.toast-message');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `toast-message toast-${type}`;
    
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '❌';
    if (type === 'warning') icon = '⚠️';

    toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.transition = 'opacity 0.4s, transform 0.4s';
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(20px)';
        setTimeout(() => toast.remove(), 400);
    }, 3500);
}
