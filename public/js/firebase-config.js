// Firebase SDK initialization config helper
// Detects if running on Firebase Hosting or loads a local config.json.
// If no config is present, it will fallback to "Mock Mode" for testing.

export let firebaseConfig = null;
export let isMockMode = false;

// Firebase services references
export let app = null;
export let auth = null;
export let db = null;
export let storage = null;

export async function initializeFirebaseServices() {
  try {
    // 1. Try to fetch local config.json first (only valid if it returns real JSON)
    const response = await fetch('/config.json').catch(() => null);
    if (response && response.ok && response.headers.get('content-type')?.includes('application/json')) {
      firebaseConfig = await response.json();
    }

    // 2. If no valid config.json, use Firebase Hosting's auto-generated init.json
    if (!firebaseConfig || !firebaseConfig.apiKey) {
      const hostInit = await fetch('/__/firebase/init.json').catch(() => null);
      if (hostInit && hostInit.ok) {
        firebaseConfig = await hostInit.json();
      }
    }
  } catch (e) {
    console.warn("Could not fetch Firebase init configuration. Falling back to mock mode.");
  }

  if (firebaseConfig && firebaseConfig.apiKey) {
    // Initialize real Firebase
    const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js");
    const { getAuth } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js");
    const { getFirestore } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
    const { getStorage } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js");

    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    // Explicitly set local persistence so session is kept across restarts
    const { setPersistence, browserLocalPersistence } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js");
    setPersistence(auth, browserLocalPersistence).catch(err => {
      console.warn("Failed to set auth persistence:", err);
    });
    db = getFirestore(app);
    storage = getStorage(app);
    isMockMode = false;
    console.log("Firebase initialized successfully in PRODUCTION mode.");
  } else {
    isMockMode = true;
    console.warn("Firebase config not found. Running in MOCK MODE (in-memory state).");
    initializeMockServices();
  }
}

// Mock State Storage
export let mockDb = {
  users: [
    { id: 'owner1', email: 'phil@company.com', name: 'Phil Shergold', role: 'owner', phone: '07123456780', trade: 'Owner', status: 'active', pushToken: 'mock-token-owner1' },
    { id: 'admin1', email: 'admin@company.com', name: 'Alex Admin', role: 'admin', phone: '07123456781', trade: 'Administrator', status: 'active', pushToken: 'mock-token-admin1' },
    { id: 'mgr1', email: 'manager@company.com', name: 'Sarah Manager', role: 'manager', phone: '07123456782', trade: 'Site Manager', status: 'active', pushToken: 'mock-token-mgr1' },
    { id: 'op1', email: 'op@company.com', name: 'John Welder', role: 'operative', phone: '07123456783', trade: 'Welder', status: 'active', pushToken: 'mock-token-op1' },
    { id: 'op2', email: 'carpenter@company.com', name: 'David Carpenter', role: 'operative', phone: '07123456784', trade: 'Carpenter', status: 'active', pushToken: 'mock-token-op2' },
    { id: 'op3', email: 'electrician@company.com', name: 'Sarah Electrician', role: 'operative', phone: '07123456785', trade: 'Electrician', status: 'active', pushToken: 'mock-token-op3' },
    { id: 'op4', email: 'labourer@company.com', name: 'James Labourer', role: 'operative', phone: '07123456786', trade: 'General Builder', status: 'active', pushToken: 'mock-token-op4' },
    { id: 'user-fake-1', email: 'arthur@company.com', name: 'Arthur Mason', role: 'operative', phone: '07111222331', trade: 'Bricklayer', status: 'active' },
    { id: 'user-fake-2', email: 'bobby@company.com', name: 'Bobby Plumber', role: 'operative', phone: '07111222332', trade: 'Plumber', status: 'active' },
    { id: 'user-fake-3', email: 'charlie@company.com', name: 'Charlie Painter', role: 'operative', phone: '07111222333', trade: 'Painter & Decorator', status: 'active' },
    { id: 'user-fake-4', email: 'danny@company.com', name: 'Danny Roofer', role: 'operative', phone: '07111222334', trade: 'Roofer', status: 'active' },
    { id: 'user-fake-5', email: 'ethan@company.com', name: 'Ethan Scaffolder', role: 'operative', phone: '07111222335', trade: 'Scaffolder', status: 'active' },
    { id: 'user-fake-6', email: 'fiona@company.com', name: 'Fiona Carpenter', role: 'operative', phone: '07111222336', trade: 'Carpenter', status: 'active' }
  ],
  sites: [
    {
      id: 'site-seed-A',
      address: '10 Downing Street, London',
      eNumber: 'E10001',
      scheme: 'Westminster Security Phase 1',
      managerIds: ['mgr1'],
      managerNames: ['Sarah Manager'],
      relevantPeopleIds: ['op1', 'op2'],
      relevantPeopleNames: ['John Welder', 'David Carpenter'],
      createdDate: '2026-07-05',
      status: 'active'
    },
    {
      id: 'site-seed-B',
      address: '77 Regent Street, London',
      eNumber: 'E10002',
      scheme: 'Regent Retail Fitting',
      managerIds: ['admin1'],
      managerNames: ['Alex Admin'],
      relevantPeopleIds: ['op3'],
      relevantPeopleNames: ['Sarah Electrician'],
      createdDate: '2026-07-05',
      status: 'active'
    },
    {
      id: 'site-seed-C',
      address: '221B Baker Street, London',
      eNumber: 'E10003',
      scheme: 'Holmes Investigation Office',
      managerIds: [],
      managerNames: [],
      relevantPeopleIds: [],
      relevantPeopleNames: [],
      createdDate: '2026-07-05',
      status: 'active'
    }
  ],
  planners: [
    {
      id: 'planner-seed-A',
      name: 'Westminster Security Board',
      scheme: 'Westminster Security Phase 1',
      managerIds: ['mgr1'],
      managerNames: ['Sarah Manager'],
      relevantPeopleIds: ['op1', 'op2'],
      relevantPeopleNames: ['John Welder', 'David Carpenter'],
      siteIds: ['site-seed-A'],
      createdBy: 'owner1',
      createdAt: '2026-07-05T08:00:00.000Z'
    },
    {
      id: 'planner-seed-B',
      name: 'Regent & Baker Board',
      scheme: 'Regent Retail Fitting',
      managerIds: ['admin1'],
      managerNames: ['Alex Admin'],
      relevantPeopleIds: ['op3', 'op4'],
      relevantPeopleNames: ['Sarah Electrician', 'James Labourer'],
      siteIds: ['site-seed-B', 'site-seed-C'],
      createdBy: 'owner1',
      createdAt: '2026-07-05T08:00:00.000Z'
    }
  ],
  shifts: [
    {
      id: 'shift-seed-1',
      siteId: 'site-seed-A',
      siteAddress: '10 Downing Street, London',
      eNumber: 'E10001',
      userId: 'op1',
      userName: 'John Welder',
      date: '2026-07-06',
      startTime: '08:00',
      task: 'Install security gates and reinforce frames.',
      notes: 'Requires escort at gate.',
      status: 'pending',
      managerIds: ['mgr1'],
      managerNames: ['Sarah Manager'],
      relevantPeopleIds: ['op1', 'op2'],
      relevantPeopleNames: ['John Welder', 'David Carpenter'],
      completionPhotos: [],
      incompletePhotos: [],
      timestamps: { confirmed: null, onSite: null, completed: null, incomplete: null, cancelled: null }
    },
    {
      id: 'shift-seed-2',
      siteId: 'site-seed-B',
      siteAddress: '77 Regent Street, London',
      eNumber: 'E10002',
      userId: 'user-fake-1',
      userName: 'Arthur Mason',
      date: '2026-07-06',
      startTime: '08:30',
      task: 'Lay foundation brickwork for retail unit.',
      notes: 'Check leveling specs.',
      status: 'pending',
      managerIds: ['admin1'],
      managerNames: ['Alex Admin'],
      relevantPeopleIds: ['op3'],
      relevantPeopleNames: ['Sarah Electrician'],
      completionPhotos: [],
      incompletePhotos: [],
      timestamps: { confirmed: null, onSite: null, completed: null, incomplete: null, cancelled: null }
    },
    {
      id: 'shift-seed-3',
      siteId: 'site-seed-C',
      siteAddress: '221B Baker Street, London',
      eNumber: 'E10003',
      userId: 'user-fake-2',
      userName: 'Bobby Plumber',
      date: '2026-07-06',
      startTime: '09:00',
      task: 'Install heating pipes and radiators.',
      notes: 'Check boiler specs.',
      status: 'pending',
      managerIds: [],
      managerNames: [],
      relevantPeopleIds: [],
      relevantPeopleNames: [],
      completionPhotos: [],
      incompletePhotos: [],
      timestamps: { confirmed: null, onSite: null, completed: null, incomplete: null, cancelled: null }
    },
    {
      id: 'shift-seed-4',
      siteId: 'site-seed-B',
      siteAddress: '77 Regent Street, London',
      eNumber: 'E10002',
      userId: 'op3',
      userName: 'Sarah Electrician',
      date: '2026-07-07',
      startTime: '09:00',
      task: 'Wiring checkout tills and testing breakers.',
      notes: 'Confirm with store manager before cutting power.',
      status: 'confirmed',
      managerIds: ['admin1'],
      managerNames: ['Alex Admin'],
      relevantPeopleIds: ['op3'],
      relevantPeopleNames: ['Sarah Electrician'],
      completionPhotos: [],
      incompletePhotos: [],
      timestamps: { confirmed: '2026-07-05T08:30:00Z', onSite: null, completed: null, incomplete: null, cancelled: null }
    },
    {
      id: 'shift-seed-5',
      siteId: 'site-seed-A',
      siteAddress: '10 Downing Street, London',
      eNumber: 'E10001',
      userId: 'user-fake-5',
      userName: 'Ethan Scaffolder',
      date: '2026-07-07',
      startTime: '08:00',
      task: 'Erect scaffolding on North facade.',
      notes: 'Avoid blocking emergency exit.',
      status: 'pending',
      managerIds: ['mgr1'],
      managerNames: ['Sarah Manager'],
      relevantPeopleIds: ['op1', 'op2'],
      relevantPeopleNames: ['John Welder', 'David Carpenter'],
      completionPhotos: [],
      incompletePhotos: [],
      timestamps: { confirmed: null, onSite: null, completed: null, incomplete: null, cancelled: null }
    },
    {
      id: 'shift-seed-6',
      siteId: 'site-seed-A',
      siteAddress: '10 Downing Street, London',
      eNumber: 'E10001',
      userId: 'op2',
      userName: 'David Carpenter',
      date: '2026-07-08',
      startTime: '08:00',
      task: 'Install fire doors and architrave.',
      notes: 'Check alignment carefully.',
      status: 'pending',
      managerIds: ['mgr1'],
      managerNames: ['Sarah Manager'],
      relevantPeopleIds: ['op1', 'op2'],
      relevantPeopleNames: ['John Welder', 'David Carpenter'],
      completionPhotos: [],
      incompletePhotos: [],
      timestamps: { confirmed: null, onSite: null, completed: null, incomplete: null, cancelled: null }
    },
    {
      id: 'shift-seed-7',
      siteId: 'site-seed-C',
      siteAddress: '221B Baker Street, London',
      eNumber: 'E10003',
      userId: 'user-fake-3',
      userName: 'Charlie Painter',
      date: '2026-07-08',
      startTime: '08:30',
      task: 'Prime and paint plasterboard walls.',
      notes: 'Two coats required.',
      status: 'pending',
      managerIds: [],
      managerNames: [],
      relevantPeopleIds: [],
      relevantPeopleNames: [],
      completionPhotos: [],
      incompletePhotos: [],
      timestamps: { confirmed: null, onSite: null, completed: null, incomplete: null, cancelled: null }
    },
    {
      id: 'shift-seed-8',
      siteId: 'site-seed-B',
      siteAddress: '77 Regent Street, London',
      eNumber: 'E10002',
      userId: 'user-fake-4',
      userName: 'Danny Roofer',
      date: '2026-07-09',
      startTime: '09:00',
      task: 'Lead flashing repairs on roof valley.',
      notes: 'Harness mandatory.',
      status: 'pending',
      managerIds: ['admin1'],
      managerNames: ['Alex Admin'],
      relevantPeopleIds: ['op3'],
      relevantPeopleNames: ['Sarah Electrician'],
      completionPhotos: [],
      incompletePhotos: [],
      timestamps: { confirmed: null, onSite: null, completed: null, incomplete: null, cancelled: null }
    },
    {
      id: 'shift-seed-9',
      siteId: 'site-seed-A',
      siteAddress: '10 Downing Street, London',
      eNumber: 'E10001',
      userId: 'user-fake-6',
      userName: 'Fiona Carpenter',
      date: '2026-07-09',
      startTime: '08:00',
      task: 'Cabinet installation in break room.',
      notes: 'Use robust anchor screws.',
      status: 'pending',
      managerIds: ['mgr1'],
      managerNames: ['Sarah Manager'],
      relevantPeopleIds: ['op1', 'op2'],
      relevantPeopleNames: ['John Welder', 'David Carpenter'],
      completionPhotos: [],
      incompletePhotos: [],
      timestamps: { confirmed: null, onSite: null, completed: null, incomplete: null, cancelled: null }
    },
    {
      id: 'shift-seed-10',
      siteId: 'site-seed-C',
      siteAddress: '221B Baker Street, London',
      eNumber: 'E10003',
      userId: 'user-fake-1',
      userName: 'Arthur Mason',
      date: '2026-07-10',
      startTime: '08:30',
      task: 'Repair external masonry joints.',
      notes: 'Matches original mortar tone.',
      status: 'pending',
      managerIds: [],
      managerNames: [],
      relevantPeopleIds: [],
      relevantPeopleNames: [],
      completionPhotos: [],
      incompletePhotos: [],
      timestamps: { confirmed: null, onSite: null, completed: null, incomplete: null, cancelled: null }
    },
    {
      id: 'shift-seed-11',
      siteId: 'site-seed-B',
      siteAddress: '77 Regent Street, London',
      eNumber: 'E10002',
      userId: 'op1',
      userName: 'John Welder',
      date: '2026-07-10',
      startTime: '08:00',
      task: 'Structural bracing welding.',
      notes: 'Hot works permit required.',
      status: 'pending',
      managerIds: ['admin1'],
      managerNames: ['Alex Admin'],
      relevantPeopleIds: ['op3'],
      relevantPeopleNames: ['Sarah Electrician'],
      completionPhotos: [],
      incompletePhotos: [],
      timestamps: { confirmed: null, onSite: null, completed: null, incomplete: null, cancelled: null }
    },
    {
      id: 'shift-seed-12',
      siteId: 'site-seed-A',
      siteAddress: '10 Downing Street, London',
      eNumber: 'E10001',
      userId: 'user-fake-2',
      userName: 'Bobby Plumber',
      date: '2026-07-11',
      startTime: '08:00',
      task: 'Drainage inspection and connection.',
      notes: 'Wear appropriate PPE.',
      status: 'pending',
      managerIds: ['mgr1'],
      managerNames: ['Sarah Manager'],
      relevantPeopleIds: ['op1', 'op2'],
      relevantPeopleNames: ['John Welder', 'David Carpenter'],
      completionPhotos: [],
      incompletePhotos: [],
      timestamps: { confirmed: null, onSite: null, completed: null, incomplete: null, cancelled: null }
    }
  ],
  notifications: [
    { id: 'notif1', userId: 'op1', title: 'New Shift Assigned', message: 'You have been assigned to 10 Downing Street on 2026-07-06.', type: 'shift', read: false, createdAt: '2026-07-03T08:00:00Z' }
  ],
  presets: []
};

// Mock Authentication State
export let mockCurrentUser = null;

function initializeMockServices() {
  // Bust cached local storage mock database to force reload of fresh mock data version 2
  const seedVersion = localStorage.getItem('workforce_mock_seed_v2');
  if (!seedVersion) {
    localStorage.removeItem('workforce_mock_db');
    localStorage.setItem('workforce_mock_seed_v2', 'true');
  }

  // Try to load state from localStorage so it persists reload in mock mode
  const localDb = localStorage.getItem('workforce_mock_db');
  if (localDb) {
    try {
      const parsed = JSON.parse(localDb);
      // Merge with seeded mockDb to ensure new arrays always exist
      mockDb = {
        users: parsed.users || mockDb.users,
        sites: parsed.sites || parsed.projects || mockDb.sites,
        shifts: parsed.shifts || parsed.jobs || mockDb.shifts,
        planners: parsed.planners || mockDb.planners || [],
        notifications: parsed.notifications || mockDb.notifications || [],
        holidayRequests: parsed.holidayRequests || [],
        absences: parsed.absences || [],
        auditLogs: parsed.auditLogs || [],
        presets: parsed.presets || mockDb.presets || []
      };
    } catch (e) {
      console.error("Failed to parse local storage mock DB, resetting.", e);
    }
  }
  
  // Set current user from local storage if present
  const localUser = localStorage.getItem('workforce_mock_user');
  if (localUser) {
    try {
      mockCurrentUser = JSON.parse(localUser);
    } catch (e) {}
  }
}

export function saveMockDb() {
  localStorage.setItem('workforce_mock_db', JSON.stringify(mockDb));
}

export function mockSetCurrentUser(user) {
  mockCurrentUser = user;
  if (user) {
    localStorage.setItem('workforce_mock_user', JSON.stringify(user));
  } else {
    localStorage.removeItem('workforce_mock_user');
  }
}

