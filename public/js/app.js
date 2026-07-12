import { initializeFirebaseServices, isMockMode } from './firebase-config.js';
import { initAuth, login, registerAdmin, logout, getCurrentUser, isManager, signUpUser, sendResetEmail } from './auth.js';
import { showToast } from './components/toast.js';
import { getIconClass } from './components/icon.js';

// Application state
let currentView = null;

// Initialize app when DOM is loaded
window.addEventListener('DOMContentLoaded', async () => {
  // Initialize services
  await initializeFirebaseServices();

  // Setup Auth callbacks
  await initAuth(handleAuthStateChange);

  // Setup Global Listeners
  setupGlobalListeners();
});

// Manage Login / Logout Visual States
async function handleAuthStateChange(user) {
  const authRoot = document.getElementById('auth-root');
  const appRoot = document.getElementById('app-root');

  if (user) {
    authRoot.style.display = 'none';
    appRoot.style.display = 'flex';

    // Set User Banner Info
    document.getElementById('user-display-name').textContent = user.name;
    document.getElementById('user-display-role').textContent = user.role;

    // Render Navigation
    renderSidebarMenu(user.role);
    renderBottomNav(user.role);

    // Unsubscribe from previous listener if any
    if (window.notifUnsubscribe) {
      window.notifUnsubscribe();
      window.notifUnsubscribe = null;
    }

    // Set up notifications count badge real-time snapshot listener
    if (isMockMode) {
      const { mockDb } = await import('./firebase-config.js');
      const checkMockUnread = () => {
        const count = (mockDb.notifications || []).filter(n => n.userId === user.id && !n.read).length;
        const badge = document.getElementById('unread-count');
        if (badge) {
          badge.style.display = count > 0 ? 'block' : 'none';
        }
      };
      checkMockUnread();
      const intervalId = setInterval(checkMockUnread, 3000);
      window.notifUnsubscribe = () => clearInterval(intervalId);
    } else {
      try {
        const { collection, query, where, onSnapshot } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
        const { db } = await import('./firebase-config.js');
        const q = query(collection(db, 'notifications'), where('userId', '==', user.id), where('read', '==', false));
        let isFirstLoad = true;
        window.notifUnsubscribe = onSnapshot(q, (snapshot) => {
          const badge = document.getElementById('unread-count');
          if (badge) {
            badge.style.display = snapshot.size > 0 ? 'block' : 'none';
          }

          // Trigger native browser notification on new unread notifications
          if (!isFirstLoad) {
            snapshot.docChanges().forEach(change => {
              if (change.type === 'added') {
                const notif = change.doc.data();
                if (notif.type === 'shift') {
                  checkForAwaitingShifts(user);
                }
                if (Notification.permission === 'granted' && user.pushNotificationsEnabled !== false) {
                  if (document.visibilityState === 'hidden') {
                    if ('serviceWorker' in navigator) {
                      navigator.serviceWorker.ready.then(reg => {
                        reg.showNotification(notif.title, {
                          body: notif.message,
                          icon: '/manifest.json',
                          badge: '/manifest.json',
                          tag: change.doc.id,
                          renotify: true
                        });
                      });
                    } else {
                      new Notification(notif.title, {
                        body: notif.message,
                        icon: '/manifest.json'
                      });
                    }
                  } else {
                    // Show a toast in foreground
                    showToast(`${notif.title}: ${notif.message}`, "info");
                  }
                }
              }
            });
          }
          isFirstLoad = false;
        }, (err) => {
          console.error("Notifications snapshot error:", err);
        });
      } catch (err) {
        console.error("Error setting up real-time notifications snapshot:", err);
      }
    }

    // Initial Routing Redirect
    const hash = window.location.hash;
    if (user.role === 'operative') {
      if (!hash.startsWith('#/mobile-jobs') && !hash.startsWith('#/mobile-card')) {
        window.location.hash = '#/mobile-jobs';
        return;
      }
    } else {
      if (hash === '' || hash === '#/' || hash.startsWith('#/mobile-jobs') || hash.startsWith('#/mobile-card') || hash === '#/dashboard') {
        window.location.hash = '#/admin';
        return;
      }
    }

    checkForAwaitingShifts(user);
    routeView();
  } else {
    // Clear notifications listener
    if (window.notifUnsubscribe) {
      window.notifUnsubscribe();
      window.notifUnsubscribe = null;
    }
    const badge = document.getElementById('unread-count');
    if (badge) badge.style.display = 'none';

    appRoot.style.display = 'none';
    authRoot.style.display = 'flex';
  }
}

// Side and Bottom menus based on User Roles
function renderSidebarMenu(role) {
  const menu = document.getElementById('desktop-menu');
  let items = [];

  if (role === 'admin' || role === 'manager' || role === 'owner') {
    items = [
      { name: 'admin', label: 'Easy Planner', hash: '#/admin', icon: 'fa-chalkboard-user' },
      { name: 'dashboard', label: 'Analytics Dashboard', hash: '#/dashboard', icon: 'fa-chart-line' },
      { name: 'planner', label: 'Planners', hash: '#/planner', icon: 'fa-calendar-days' },
      { name: 'labour', label: 'Labour Sheet', hash: '#/labour', icon: 'fa-table-list' },
      { name: 'sites', label: 'Sites & Addresses', hash: '#/sites', icon: 'fa-location-dot' },
      { name: 'engineers', label: 'Engineers Directory', hash: '#/engineers', icon: 'fa-helmet-safety' },
      { name: 'completions', label: 'Completion Hub', hash: '#/completions', icon: 'fa-images' },
      { name: 'hr', label: 'HR', hash: '#/hr', icon: 'fa-user-tie' },
      { name: 'tasks', label: 'Tasks', hash: '#/tasks', icon: 'fa-list-check' },
      { name: 'forms', label: 'Forms', hash: '#/forms', icon: 'fa-clipboard-list' },
      { name: 'docs', label: 'Documents', hash: '#/docs', icon: 'fa-file-lines' },
      { name: 'chat', label: 'Chat', hash: '#/chat', icon: 'fa-comments' },
    ];
  } else {
    items = [
      { name: 'mobile-jobs', label: 'My Shifts', hash: '#/mobile-jobs', icon: 'fa-calendar-check' }
    ];
  }

  menu.innerHTML = items.map(item => `
    <button class="menu-item" data-hash="${item.hash}" onclick="location.hash='${item.hash}'">
      <i class="fa-solid ${item.icon}"></i>
      <span>${item.label}</span>
    </button>
  `).join('');
}

function renderBottomNav(role) {
  const bottomNav = document.getElementById('bottom-nav');
  let primaryItems = [];
  let moreItems = [];

  if (role === 'admin' || role === 'manager' || role === 'owner') {
    primaryItems = [
      { label: 'Planner', hash: '#/admin', icon: 'fa-chalkboard-user' },
      { label: 'Dashboard', hash: '#/dashboard', icon: 'fa-chart-line' },
      { label: 'Schedule', hash: '#/planner', icon: 'fa-calendar-days' },
      { label: 'Labour', hash: '#/labour', icon: 'fa-table-list' },
    ];
    moreItems = [
      { label: 'Sites', hash: '#/sites', icon: 'fa-location-dot' },
      { label: 'Engineers', hash: '#/engineers', icon: 'fa-helmet-safety' },
      { label: 'Completions', hash: '#/completions', icon: 'fa-images' },
      { label: 'HR', hash: '#/hr', icon: 'fa-user-tie' },
      { label: 'Tasks', hash: '#/tasks', icon: 'fa-list-check' },
      { label: 'Forms', hash: '#/forms', icon: 'fa-clipboard-list' },
      { label: 'Docs', hash: '#/docs', icon: 'fa-file-lines' },
      { label: 'Chat', hash: '#/chat', icon: 'fa-comments' },
    ];
  } else {
    primaryItems = [
      { label: 'Shifts', hash: '#/mobile-jobs', icon: 'fa-calendar-check' },
      { label: 'Docs', hash: '#/docs', icon: 'fa-file-lines' },
      { label: 'Chat', hash: '#/chat', icon: 'fa-comments' },
      { label: 'Forms', hash: '#/forms', icon: 'fa-clipboard-list' },
    ];
    moreItems = [
      { label: 'HR', hash: '#/hr', icon: 'fa-user-tie' },
      { label: 'Tasks', hash: '#/tasks', icon: 'fa-list-check' },
    ];
  }

  // Store more items for the drawer
  window._moreNavItems = moreItems;

  bottomNav.innerHTML = [
    ...primaryItems.map(item => `
      <button class="nav-btn" data-hash="${item.hash}" onclick="location.hash='${item.hash}'">
        <i class="fa-solid ${item.icon}"></i>
        <span>${item.label}</span>
      </button>
    `),
    `<button class="nav-btn nav-btn-more" id="more-nav-btn" onclick="window.openMoreDrawer()">
      <i class="fa-solid fa-ellipsis"></i>
      <span>More</span>
    </button>`
  ].join('');
}

// Build and open the More drawer
window.openMoreDrawer = function() {
  const user = getCurrentUser();
  const moreItems = window._moreNavItems || [];
  const drawerContent = document.getElementById('more-drawer-content');

  drawerContent.innerHTML = `
    <div class="more-drawer-header">
      <i class="fa-solid fa-users-gear" style="color: hsl(var(--primary)); font-size: 1.4rem;"></i>
      <div>
        <div class="more-drawer-name">${user?.name || 'User'}</div>
        <div class="more-drawer-role">${(user?.role || 'operative').charAt(0).toUpperCase() + (user?.role || '').slice(1)}</div>
      </div>
    </div>
    <div class="more-drawer-grid">
      ${moreItems.map(item => `
        <button class="more-drawer-item" onclick="location.hash='${item.hash}'; window.closeMoreDrawer();">
          <div class="more-drawer-icon">
            <i class="fa-solid ${item.icon}"></i>
          </div>
          <span>${item.label}</span>
        </button>
      `).join('')}
    </div>
    <div style="padding: 0 16px 16px;">
      <button class="btn btn-secondary" style="width:100%; justify-content:center; gap:10px;" onclick="window.openProfileSheet(); window.closeMoreDrawer();">
        <i class="fa-solid fa-circle-user"></i> Profile & Settings
      </button>
    </div>
  `;

  document.getElementById('more-drawer').classList.add('open');
  document.getElementById('more-drawer').setAttribute('aria-hidden', 'false');
  document.getElementById('sheet-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
};

window.closeMoreDrawer = function() {
  document.getElementById('more-drawer').classList.remove('open');
  document.getElementById('more-drawer').setAttribute('aria-hidden', 'true');
  const overlay = document.getElementById('sheet-overlay');
  // Only close overlay if profile sheet is also closed
  if (!document.getElementById('profile-sheet').classList.contains('open')) {
    overlay.classList.remove('open');
    document.body.style.overflow = '';
  }
};

window.openProfileSheet = function() {
  const user = getCurrentUser();
  const profileContent = document.getElementById('profile-sheet-content');
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

  profileContent.innerHTML = `
    <div class="profile-sheet-header">
      <div class="profile-sheet-avatar">
        <i class="fa-solid fa-circle-user" style="font-size: 3rem; color: hsl(var(--primary));"></i>
      </div>
      <div class="profile-sheet-name">${user?.name || 'User'}</div>
      <div class="profile-sheet-email">${user?.email || ''}</div>
      <span class="badge badge-info" style="margin-top: 4px; text-transform: capitalize;">${user?.role || 'operative'}</span>
    </div>
    <div class="profile-sheet-actions">
      <button class="profile-sheet-action-btn" id="profile-theme-btn" onclick="window.toggleThemeFromSheet()">
        <i class="fa-solid ${isDark ? 'fa-sun' : 'fa-moon'}"></i>
        <span>${isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}</span>
        <i class="fa-solid fa-chevron-right" style="margin-left:auto; color: hsl(var(--text-muted));"></i>
      </button>
      <button class="profile-sheet-action-btn" onclick="location.hash='#/engineers'; window.closeProfileSheet();">
        <i class="fa-solid fa-id-card"></i>
        <span>My Profile</span>
        <i class="fa-solid fa-chevron-right" style="margin-left:auto; color: hsl(var(--text-muted));"></i>
      </button>
    </div>
    <div style="padding: 0 16px 16px;">
      <button class="btn btn-danger" style="width:100%; justify-content:center; gap:10px;" id="profile-logout-btn">
        <i class="fa-solid fa-right-from-bracket"></i> Sign Out
      </button>
    </div>
  `;

  document.getElementById('profile-logout-btn').addEventListener('click', async () => {
    window.closeProfileSheet();
    await logout();
  });

  document.getElementById('profile-sheet').classList.add('open');
  document.getElementById('profile-sheet').setAttribute('aria-hidden', 'false');
  document.getElementById('sheet-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
};

window.toggleThemeFromSheet = function() {
  const html = document.documentElement;
  const currentTheme = html.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
  localStorage.setItem('theme_manually_set', 'true');
  const themeIcon = document.getElementById('theme-icon');
  if (themeIcon) themeIcon.className = newTheme === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
  // Re-render profile sheet to update icon
  window.openProfileSheet();
};

window.closeProfileSheet = function() {
  document.getElementById('profile-sheet').classList.remove('open');
  document.getElementById('profile-sheet').setAttribute('aria-hidden', 'true');
  document.getElementById('sheet-overlay').classList.remove('open');
  document.body.style.overflow = '';
};

// SPA Routing Controller
async function routeView() {
  const hash = window.location.hash || '#/dashboard';
  const mount = document.getElementById('view-mount');
  const viewTitle = document.getElementById('view-title');

  // Highlight menu selections
  document.querySelectorAll('.menu-item, .nav-btn').forEach(btn => {
    const btnHash = btn.getAttribute('data-hash') || btn.getAttribute('onclick')?.match(/'([^']+)'/)?.[1];
    if (btnHash && hash.startsWith(btnHash)) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Extract route name
  const route = hash.replace('#/', '').split('?')[0] || 'dashboard';

  // Format header title
  let formattedTitle = route.charAt(0).toUpperCase() + route.slice(1).replace('-', ' ');
  if (route === 'planner') {
    formattedTitle = 'Planners';
  }
  viewTitle.textContent = formattedTitle;

  // Render view
  mount.innerHTML = `<div style="display:flex; justify-content:center; padding:50px;"><i class="fa-solid fa-circle-notch fa-spin fa-2x" style="color:hsl(var(--primary));"></i></div>`;

  try {
    const module = await import(`./views/${route}.js`);
    if (currentView && currentView.destroy) {
      currentView.destroy();
    }
    
    currentView = module;
    if (module.init) {
      await module.init(mount);
    }
  } catch (err) {
    console.error("Routing error for:", route, err);
    mount.innerHTML = `
      <div class="card" style="text-align:center; padding:40px;">
        <i class="fa-solid fa-triangle-exclamation fa-3x" style="color:hsl(var(--danger)); margin-bottom:16px;"></i>
        <h3>Failed to load view</h3>
        <p style="color:hsl(var(--text-muted)); font-size:0.9rem; margin-top:8px;">The section "${route}" could not be retrieved.</p>
        <button class="btn btn-primary" onclick="location.hash='#/dashboard'" style="margin-top:16px;">Go to Dashboard</button>
      </div>
    `;
  }
}

// Navigation hash change listener
window.addEventListener('hashchange', routeView);

// Set up event listeners for global UI actions
function setupGlobalListeners() {
  const loginForm = document.getElementById('login-form');
  const signupForm = document.getElementById('signup-form');
  const forgotForm = document.getElementById('forgot-form');
  const errorBox = document.getElementById('auth-error');
  const subtitle = document.getElementById('auth-subtitle');

  // Go to forgot password screen
  document.getElementById('link-goto-forgot').addEventListener('click', (e) => {
    e.preventDefault();
    errorBox.style.display = 'none';
    loginForm.style.display = 'none';
    signupForm.style.display = 'none';
    forgotForm.style.display = 'block';
    subtitle.textContent = 'Reset your password';
  });

  // Go to sign up screen
  document.getElementById('link-goto-signup').addEventListener('click', (e) => {
    e.preventDefault();
    errorBox.style.display = 'none';
    loginForm.style.display = 'none';
    forgotForm.style.display = 'none';
    signupForm.style.display = 'block';
    subtitle.textContent = 'Create your account';
  });

  // Go back to login screen
  document.querySelectorAll('.link-goto-login').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      errorBox.style.display = 'none';
      signupForm.style.display = 'none';
      forgotForm.style.display = 'none';
      loginForm.style.display = 'block';
      subtitle.textContent = 'Sign in to manage your schedule and tasks';
    });
  });

  // Sign Up Form Submission
  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('signup-name').value;
    const email = document.getElementById('signup-email').value;
    const phone = document.getElementById('signup-phone').value;
    const pass = document.getElementById('signup-password').value;
    const emergency = document.getElementById('signup-emergency').value;
    const quals = document.getElementById('signup-quals').value;

    errorBox.style.display = 'none';
    try {
      const user = await signUpUser(name, email, pass, phone, emergency, quals);
      showToast("Account registered! Welcome to the hub.", "success");
      if (isMockMode) {
        await handleAuthStateChange(user);
      }
    } catch (err) {
      errorBox.textContent = err.message || "Registration failed.";
      errorBox.style.display = 'block';
    }
  });

  // Forgot Password Form Submission
  forgotForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('forgot-email').value;

    errorBox.style.display = 'none';
    try {
      await sendResetEmail(email);
      showToast("Password reset link has been dispatched to your email address.", "success");
      
      // Redirect back to login
      forgotForm.style.display = 'none';
      loginForm.style.display = 'block';
      subtitle.textContent = 'Sign in to manage your schedule and tasks';
    } catch (err) {
      errorBox.textContent = err.message || "Failed to trigger reset email.";
      errorBox.style.display = 'block';
    }
  });

  // Login Form Submission
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-password').value;

    errorBox.style.display = 'none';
    try {
      const user = await login(email, pass);
      showToast("Welcome back!", "success");
      if (isMockMode) {
        await handleAuthStateChange(user);
      }
    } catch (err) {
      errorBox.textContent = err.message || "Failed to log in.";
      errorBox.style.display = 'block';
    }
  });

  // Setup Wizard / Registration Submission
  const registerForm = document.getElementById('register-form');
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('reg-name').value;
    const email = document.getElementById('reg-email').value;
    const pass = document.getElementById('reg-password').value;
    const errorBox = document.getElementById('auth-error');

    errorBox.style.display = 'none';
    try {
      const user = await registerAdmin(name, email, pass);
      showToast("Admin account registered! Initializing...", "success");
      if (isMockMode) {
        await handleAuthStateChange(user);
      }
    } catch (err) {
      errorBox.textContent = err.message || "Registration failed.";
      errorBox.style.display = 'block';
    }
  });

  // Logout Button
  document.getElementById('logout-btn').addEventListener('click', async () => {
    await logout();
  });

  // Theme Toggle
  const themeToggle = document.getElementById('theme-toggle');
  themeToggle.addEventListener('click', () => {
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    html.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    localStorage.setItem('theme_manually_set', 'true');

    const themeIcon = document.getElementById('theme-icon');
    if (newTheme === 'dark') {
      themeIcon.className = 'fa-solid fa-sun';
    } else {
      themeIcon.className = 'fa-solid fa-moon';
    }
  });

  // Restore stored theme (default to light unless manually overridden to dark)
  let savedTheme = localStorage.getItem('theme');
  if (!localStorage.getItem('theme_manually_set')) {
    savedTheme = 'light';
    localStorage.setItem('theme', 'light');
  }
  if (!savedTheme) {
    savedTheme = 'light';
  }
  document.documentElement.setAttribute('data-theme', savedTheme);
  document.getElementById('theme-icon').className = savedTheme === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';

  // Notification Bell Click Handler - iOS/Android/PWA aware
  const notifBell = document.getElementById('notification-bell');
  if (notifBell) {
    notifBell.addEventListener('click', async () => {
      const user = getCurrentUser();
      if (!user) { showToast("Please sign in first.", "error"); return; }

      // Detect iOS
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
      // Detect if running as installed PWA
      const isPWA = window.matchMedia('(display-mode: standalone)').matches
        || window.navigator.standalone === true;

      // iOS ONLY supports notifications when installed as PWA (Add to Home Screen)
      if (isIOS && !isPWA) {
        const { showModal } = await import('./components/modal.js');
        showModal({
          title: '📲 Enable Notifications on iPhone',
          bodyHTML: `
            <div style="text-align:center; padding: 8px 0;">
              <i class="fa-solid fa-mobile-screen-button" style="font-size:2.5rem; color:hsl(var(--primary)); margin-bottom:12px;"></i>
              <p style="font-weight:700; margin-bottom:8px;">iPhone requires the app to be installed first.</p>
              <p style="color:hsl(var(--text-muted)); font-size:0.9rem; line-height:1.6; margin-bottom:16px;">
                To receive notifications on your iPhone, add this app to your Home Screen:
              </p>
              <ol style="text-align:left; font-size:0.9rem; line-height:2; color:hsl(var(--text-main)); padding-left: 20px;">
                <li>Tap the <strong>Share</strong> button <i class="fa-solid fa-arrow-up-from-bracket"></i> at the bottom of Safari</li>
                <li>Scroll down and tap <strong>"Add to Home Screen"</strong></li>
                <li>Tap <strong>"Add"</strong> in the top right</li>
                <li>Open the app from your Home Screen</li>
                <li>Tap the bell again to enable notifications ✅</li>
              </ol>
            </div>
          `,
          confirmText: 'Got it!',
          cancelText: null,
          onConfirm: () => {}
        });
        return;
      }

      // Android / Desktop — check API support
      if (!('Notification' in window)) {
        showToast("Notifications are not supported on this browser.", "error");
        return;
      }

      // Helper function to show notifications modal
      const showNotificationsListModal = async () => {
        try {
          const { getNotifications, markNotificationRead } = await import('./db.js');
          const { showModal, hideModal } = await import('./components/modal.js');
          const list = await getNotifications(user.id);
          const pushEnabled = user.pushNotificationsEnabled !== false;
          
          const notifHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:12px; margin-bottom:16px; border-radius:8px; background:hsl(var(--bg-primary)/0.6); border:1px solid hsl(var(--border)/0.8); flex-wrap:wrap; gap:10px;">
              <div style="display:flex; align-items:center; gap:8px;">
                <i class="fa-solid fa-bell${pushEnabled ? '' : '-slash'}" style="color:hsl(var(--${pushEnabled ? 'primary' : 'text-muted'})); font-size:1.1rem;"></i>
                <div style="font-size:0.82rem;">
                  <span style="font-weight:700;">Push Status:</span> 
                  <span style="font-weight:800; color:hsl(var(--${pushEnabled ? 'success' : 'danger'}));">${pushEnabled ? 'Subscribed' : 'Unsubscribed'}</span>
                </div>
              </div>
              <button class="btn ${pushEnabled ? 'btn-secondary' : 'btn-primary'}" id="btn-toggle-notif-subscription" style="font-size:0.75rem; padding:6px 12px; flex:unset;">
                <i class="fa-solid fa-bell${pushEnabled ? '-slash' : ''}" style="margin-right:4px;"></i>
                ${pushEnabled ? 'Unsubscribe' : 'Subscribe'}
              </button>
            </div>
            ${list.length === 0 
              ? `<div style="text-align: center; padding: 24px; color: hsl(var(--text-muted)); font-style: italic;">No recent notifications.</div>`
              : `<div style="display: flex; flex-direction: column; gap: 10px; max-height: 300px; overflow-y: auto; padding-right: 4px;">
                  ${list.slice(0, 10).map(n => `
                    <div style="padding: 10px 12px; border-radius: 6px; border: 1px solid hsl(var(--border)); background-color: ${n.read ? 'hsl(var(--bg-primary)/0.3)' : 'hsl(var(--primary)/0.03)'}; border-left: 3px solid ${n.read ? 'hsl(var(--border))' : 'hsl(var(--primary))'}; position: relative;">
                      <div style="font-weight: 700; font-size: 0.85rem; color: hsl(var(--text-main));">${n.title}</div>
                      <div style="font-size: 0.78rem; color: hsl(var(--text-muted)); margin-top: 2px;">${n.message}</div>
                      <div style="font-size: 0.65rem; color: hsl(var(--text-muted)); margin-top: 4px; text-align: right;">${new Date(n.createdAt).toLocaleDateString()}</div>
                    </div>
                  `).join('')}
                 </div>`
            }
          `;

          showModal({
            title: 'Recent Notifications',
            bodyHTML: notifHTML,
            confirmText: 'Mark All Read',
            cancelText: 'Close',
            onConfirm: async () => {
              const unreadList = list.filter(n => !n.read);
              if (unreadList.length > 0) {
                for (const n of unreadList) {
                  await markNotificationRead(n.id);
                }
                showToast("All notifications marked as read.", "success");
              }
              hideModal();
            }
          });

          // Wire up subscription toggle button
          const toggleSubBtn = document.getElementById('btn-toggle-notif-subscription');
          if (toggleSubBtn) {
            toggleSubBtn.addEventListener('click', async () => {
              const currentStatus = user.pushNotificationsEnabled !== false;
              if (currentStatus) {
                try {
                  const { updateUser } = await import('./db.js');
                  await updateUser(user.id, { pushNotificationsEnabled: false });
                  user.pushNotificationsEnabled = false;
                  showToast("Unsubscribed from push notifications.", "warning");
                  hideModal();
                  await showNotificationsListModal();
                } catch (err) {
                  showToast(err.message, "error");
                }
              } else {
                try {
                  const permission = await Notification.requestPermission();
                  if (permission === 'granted') {
                    const { updateUser } = await import('./db.js');
                    await updateUser(user.id, { pushNotificationsEnabled: true });
                    user.pushNotificationsEnabled = true;
                    showToast("Subscribed to push notifications! ✅", "success");
                    hideModal();
                    await showNotificationsListModal();
                  } else {
                    showToast("Notification permission not granted.", "error");
                  }
                } catch (err) {
                  showToast(err.message, "error");
                }
              }
            });
          }
        } catch (err) {
          showToast("Error loading notifications: " + err.message, "error");
        }
      };

      // If they haven't granted permission yet, ask for it
      if (Notification.permission !== 'granted') {
        try {
          const permission = await Notification.requestPermission();
          if (permission === 'granted') {
            showToast("Notifications enabled! ✅", "success");
            if ('serviceWorker' in navigator) {
              const reg = await navigator.serviceWorker.ready;
              reg.showNotification("Workforce Hub", {
                body: "Notifications enabled! You'll receive shift updates here.",
                icon: "/manifest.json"
              });
            }
            await showNotificationsListModal();
          } else if (permission === 'denied') {
            const { showModal } = await import('./components/modal.js');
            showModal({
              title: 'Notifications Blocked',
              bodyHTML: `<p style="line-height:1.6;">You have blocked notifications for this site. To enable them:<br><br>
                <strong>Chrome Android:</strong> Tap the lock icon in the address bar → Notifications → Allow<br><br>
                <strong>Desktop Chrome:</strong> Click the lock icon → Site Settings → Notifications → Allow</p>`,
              confirmText: 'OK',
              cancelText: null,
              onConfirm: () => {}
            });
          } else {
            showToast("Notification permission dismissed.", "warning");
          }
        } catch (err) {
          showToast("Could not request notification permission: " + err.message, "error");
        }
        return;
      }

      // If already granted, show the recent notifications modal!
      await showNotificationsListModal();
    });
  }

  // Mobile profile button
  const mobileProfileBtn = document.getElementById('mobile-profile-btn');
  if (mobileProfileBtn) {
    mobileProfileBtn.addEventListener('click', () => window.openProfileSheet());
  }

  // Sheet overlay closes all sheets when tapped
  const sheetOverlay = document.getElementById('sheet-overlay');
  if (sheetOverlay) {
    sheetOverlay.addEventListener('click', () => {
      window.closeMoreDrawer();
      window.closeProfileSheet();
    });
  }
}

async function checkForAwaitingShifts(user) {
  if (!user || user.role !== 'operative') return;

  try {
    const { getShifts, updateShift } = await import('./db.js');
    const { showModal, hideModal } = await import('./components/modal.js');
    const { showToast } = await import('./components/toast.js');

    const shifts = await getShifts();
    const awaitingShifts = shifts.filter(s => s.userId === user.id && (s.status === 'awaiting' || s.status === 'pending' || !s.status));

    if (awaitingShifts.length > 0) {
      const shift = awaitingShifts[0];
      
      const modalHTML = `
        <div style="text-align: center; padding: 12px 0;">
          <i class="fa-solid fa-calendar-check" style="font-size: 3rem; color: hsl(var(--primary)); margin-bottom: 16px; display: block;"></i>
          <h4 style="margin-bottom: 12px; font-weight: 700; font-size: 1.1rem; color: hsl(var(--text-main));">New Shift Issued!</h4>
          <p style="font-size: 0.88rem; margin-bottom: 24px; color: hsl(var(--text-main)); text-align: left; line-height: 1.6; background: hsl(var(--bg-primary)/0.4); padding: 12px; border-radius: 8px; border: 1px solid hsl(var(--border)/0.5);">
            <strong>Site Address:</strong> ${shift.siteAddress || 'TBC'}<br>
            <strong>Date:</strong> ${shift.date}<br>
            <strong>Start Time:</strong> ${shift.startTime || 'TBC'}<br>
            <strong>Task Instruction:</strong> ${shift.task || 'N/A'}
          </p>
          <div style="display: flex; flex-direction: column; gap: 10px;">
            <button id="btn-accept-shift-modal" class="btn btn-primary" style="width: 100%; padding: 12px; font-weight: 700;">
              <i class="fa-solid fa-check" style="margin-right: 6px;"></i> Accept Shift
            </button>
            <button id="btn-reject-shift-modal" class="btn btn-secondary" style="width: 100%; padding: 12px; border: 1px solid hsl(var(--danger)); color: hsl(var(--danger)); font-weight: 700; background: transparent;">
              <i class="fa-solid fa-xmark" style="margin-right: 6px;"></i> Reject Shift
            </button>
          </div>
        </div>
      `;

      showModal({
        title: 'Action Required',
        bodyHTML: modalHTML,
        showFooter: false,
        showCloseBtn: false
      });

      document.getElementById('btn-accept-shift-modal').addEventListener('click', async () => {
        try {
          const btn = document.getElementById('btn-accept-shift-modal');
          btn.disabled = true;
          btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Accepting...';
          const now = new Date().toISOString();
          const timestamps = shift.timestamps || {};
          timestamps.confirmed = now;
          await updateShift(shift.id, { status: 'confirmed', timestamps });
          showToast("Shift accepted! ✅", "success");
          hideModal();
          checkForAwaitingShifts(user);
        } catch (err) {
          showToast("Error accepting shift: " + err.message, "error");
          btn.disabled = false;
          btn.innerHTML = '<i class="fa-solid fa-check" style="margin-right: 6px;"></i> Accept Shift';
        }
      });

      document.getElementById('btn-reject-shift-modal').addEventListener('click', async () => {
        try {
          const btn = document.getElementById('btn-reject-shift-modal');
          btn.disabled = true;
          btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Rejecting...';
          const now = new Date().toISOString();
          const timestamps = shift.timestamps || {};
          timestamps.rejected = now;
          await updateShift(shift.id, { status: 'rejected', timestamps });
          showToast("Shift rejected.", "warning");
          hideModal();
          checkForAwaitingShifts(user);
        } catch (err) {
          showToast("Error rejecting shift: " + err.message, "error");
          btn.disabled = false;
          btn.innerHTML = '<i class="fa-solid fa-xmark" style="margin-right: 6px;"></i> Reject Shift';
        }
      });
    }
  } catch (err) {
    console.error("Error in checkForAwaitingShifts:", err);
  }
}
