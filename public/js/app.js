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
        window.notifUnsubscribe = onSnapshot(q, (snapshot) => {
          const badge = document.getElementById('unread-count');
          if (badge) {
            badge.style.display = snapshot.size > 0 ? 'block' : 'none';
          }
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
      { name: 'completions', label: 'Completion Hub', hash: '#/completions', icon: 'fa-images' }
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
  let items = [];

  if (role === 'admin' || role === 'manager' || role === 'owner') {
    items = [
      { label: 'Easy Planner', hash: '#/admin', icon: 'fa-chalkboard-user' },
      { label: 'Dashboard', hash: '#/dashboard', icon: 'fa-chart-line' },
      { label: 'Planners', hash: '#/planner', icon: 'fa-calendar-days' },
      { label: 'Labour', hash: '#/labour', icon: 'fa-table-list' },
      { label: 'Completions', hash: '#/completions', icon: 'fa-images' }
    ];
  } else {
    items = [
      { label: 'My Shifts', hash: '#/mobile-jobs', icon: 'fa-calendar-check' }
    ];
  }

  bottomNav.innerHTML = items.map(item => `
    <button class="nav-btn" onclick="location.hash='${item.hash}'">
      <i class="fa-solid ${item.icon} fa-lg"></i>
      <span>${item.label}</span>
    </button>
  `).join('');
}

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
    const pass = document.getElementById('signup-password').value;
    const emergency = document.getElementById('signup-emergency').value;
    const quals = document.getElementById('signup-quals').value;

    errorBox.style.display = 'none';
    try {
      const user = await signUpUser(name, email, pass, emergency, quals);
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

  // Mobile navigation drawer toggle
  const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
  mobileMenuToggle.addEventListener('click', () => {
    const sidebar = document.getElementById('sidebar-nav');
    sidebar.classList.toggle('mobile-open');
  });

  // Close sidebar on navigate on mobile
  document.getElementById('desktop-menu').addEventListener('click', () => {
    const sidebar = document.getElementById('sidebar-nav');
    sidebar.classList.remove('mobile-open');
  });

  // Notification Bell Click Handler (Subscribe and View Notifications)
  const notifBell = document.getElementById('notification-bell');
  if (notifBell) {
    notifBell.addEventListener('click', async () => {
      const user = getCurrentUser();
      if (!user) {
        showToast("Please sign in first.", "error");
        return;
      }

      if (!('Notification' in window)) {
        showToast("Notifications are not supported on this browser.", "error");
        return;
      }

      // If they haven't granted permission, ask for it!
      if (Notification.permission !== 'granted') {
        try {
          const permission = await Notification.requestPermission();
          if (permission === 'granted') {
            showToast("Successfully subscribed to notifications!", "success");
            
            // Show a test local notification
            if ('serviceWorker' in navigator) {
              navigator.serviceWorker.ready.then(registration => {
                registration.showNotification("Workforce Hub", {
                  body: "Notifications enabled! You'll receive updates here.",
                  icon: "https://img.icons8.com/color/192/000000/worker-card.png"
                });
              });
            } else {
              new Notification("Workforce Hub", {
                body: "Notifications enabled! You'll receive updates here."
              });
            }
          } else {
            showToast("Notification permission was denied.", "warning");
          }
        } catch (err) {
          showToast("Error requesting notification permission: " + err.message, "error");
        }
        return;
      }

      // If already granted, show the recent notifications modal!
      try {
        const { getNotifications, markNotificationRead } = await import('./db.js');
        const { showModal, hideModal } = await import('./components/modal.js');
        const list = await getNotifications(user.id);
        
        const notifHTML = list.length === 0 
          ? `<div style="text-align: center; padding: 24px; color: hsl(var(--text-muted)); font-style: italic;">No recent notifications.</div>`
          : `<div style="display: flex; flex-direction: column; gap: 10px; max-height: 300px; overflow-y: auto; padding-right: 4px;">
              ${list.slice(0, 10).map(n => `
                <div style="padding: 10px 12px; border-radius: 6px; border: 1px solid hsl(var(--border)); background-color: ${n.read ? 'hsl(var(--bg-primary)/0.3)' : 'hsl(var(--primary)/0.03)'}; border-left: 3px solid ${n.read ? 'hsl(var(--border))' : 'hsl(var(--primary))'}; position: relative;">
                  <div style="font-weight: 700; font-size: 0.85rem; color: hsl(var(--text-main));">${n.title}</div>
                  <div style="font-size: 0.78rem; color: hsl(var(--text-muted)); margin-top: 2px;">${n.message}</div>
                  <div style="font-size: 0.65rem; color: hsl(var(--text-muted)); margin-top: 4px; text-align: right;">${new Date(n.createdAt).toLocaleDateString()}</div>
                </div>
              `).join('')}
             </div>`;

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
      } catch (err) {
        showToast("Error loading notifications: " + err.message, "error");
      }
    });
  }
}
