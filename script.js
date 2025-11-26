lucide.createIcons();

let tabCount = 1;
document.getElementById('ntBtn').addEventListener('click', () => {
    tabCount++;
    const tabBar = document.getElementById('tabBar');
    const ntBtn = document.getElementById('ntBtn');
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    const newTab = document.createElement('div');
    newTab.className = 'tab active';
    newTab.dataset.tabId = tabCount;
    newTab.innerHTML = `
    <div class="tab-fav">
        <i data-lucide="globe"></i>
    </div>
    <span class="tab-tl">New Tab</span>
    <div class="tab-cl">
        <i data-lucide="x"></i>
    </div>`;
    tabBar.insertBefore(newTab,ntBtn);
    lucide.createIcons();
    addTL(newTab);
});

function addTL(tab) {
    tab.addEventListener('click', (e) => {
        if (e.target.closest('.tab-cl')) {
            if (document.querySelectorAll('.tab').length > 1) {
                tab.remove();
                if (tab.classList.contains('active')) {
                    const lastTab = document.querySelector('.tab:last-of-type');
                    if (lastTab) lastTab.classList.add('active');
                }
            }
        } else {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
        }
    });
}

document.querySelectorAll('.tab').forEach(addTL);

document.getElementById('refBtn').addEventListener('click', () => {
    const icon = document.querySelector('#refBtn i');
    icon.style.transform = 'rotate(360deg)';
    icon.style.transition = 'transform 0.5s';
    setTimeout(() => {
        icon.style.transform = '';
    },500);
});

document.getElementById('urlInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const url = e.target.value;
        const activeTab = document.querySelector('.tab.active .tab-tl');
        if (activeTab){
            activeTab.textContent = url || 'New Tab';
        }
    }
});

let bookmarked = false;
document.getElementById('bmBtn').addEventListener('click', () => {
    const btn = document.getElementById('bmBtn');
    bookmarked = !bookmarked;
    if (bookmarked) {
        btn.innerHTML = '<i data-lucide="star"></i>';
        lucide.createIcons();
        const svg = btn.querySelector('svg');
        svg.style.fill = '#60a5fa';
        svg.style.colour = '#60a5fa';
    } else {
        btn.innerHTML = '<i data-lucide="star"></i>';
        lucide.createIcons();
    }
});
