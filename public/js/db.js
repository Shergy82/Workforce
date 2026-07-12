import { db, isMockMode, mockDb, saveMockDb, auth, mockCurrentUser } from './firebase-config.js';
import { generateUUID, getLocalDateString } from './utils.js';

// Dynamically import Firestore modules if not in mock mode
async function getFirestoreSDK() {
  return await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js"); // placeholder, actual imports are done locally
}

// ----------------------------------------------------
// USERS COLLECTION
// ----------------------------------------------------
export async function getUsers() {
  if (isMockMode) {
    return mockDb.users;
  }
  const { collection, getDocs } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
  const snapshot = await getDocs(collection(db, 'users'));
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

export async function getUser(userId) {
  if (isMockMode) {
    return mockDb.users.find(u => u.id === userId) || null;
  }
  const { doc, getDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
  const docRef = doc(db, 'users', userId);
  const snap = await getDoc(docRef);
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createUser(userId, userData) {
  if (isMockMode) {
    const newUser = { id: userId, ...userData, status: 'active', onboarded: false, onboardingChecklist: [] };
    mockDb.users.push(newUser);
    saveMockDb();
    return newUser;
  }
  const { doc, setDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
  const docRef = doc(db, 'users', userId);
  const data = { ...userData, status: 'active', onboarded: false, onboardingChecklist: [] };
  await setDoc(docRef, data);
  return { id: userId, ...data };
}

export async function updateUser(userId, updates) {
  if (isMockMode) {
    const idx = mockDb.users.findIndex(u => u.id === userId);
    if (idx !== -1) {
      mockDb.users[idx] = { ...mockDb.users[idx], ...updates };
      saveMockDb();
      return mockDb.users[idx];
    }
    return null;
  }
  const { doc, updateDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
  const docRef = doc(db, 'users', userId);
  await updateDoc(docRef, updates);
  return { id: userId, ...updates };
}

export async function deleteUser(userId) {
  if (isMockMode) {
    const idx = mockDb.users.findIndex(u => u.id === userId);
    if (idx !== -1) {
      mockDb.users.splice(idx, 1);
      saveMockDb();
      return true;
    }
    return false;
  }
  const { doc, deleteDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
  await deleteDoc(doc(db, 'users', userId));
  return true;
}

// ----------------------------------------------------
// PROJECTS & SITES
// ----------------------------------------------------
export async function getSites() {
  if (isMockMode) {
    return mockDb.sites.map(s => ({
      ...s,
      address: s.address || s.name || 'Unnamed Site Address'
    }));
  }
  const { collection, getDocs } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
  const snapshot = await getDocs(collection(db, 'sites'));
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}
export const getProjects = getSites;

export async function createSite(siteData) {
  const payload = {
    eNumber: siteData.eNumber || '',
    address: siteData.address || '',
    scheme: siteData.scheme || siteData.client || '',
    client: siteData.scheme || siteData.client || '', // keep client for backward compatibility
    description: siteData.description || '',
    notes: siteData.notes || '',
    managerIds: siteData.managerIds || [],
    relevantPeopleIds: siteData.relevantPeopleIds || [],
    files: siteData.files || [],
    photos: siteData.photos || [],
    createdDate: siteData.createdDate || getLocalDateString(),
    status: siteData.status || 'active'
  };
  if (isMockMode) {
    const newSite = { id: generateUUID(), ...payload };
    mockDb.sites.push(newSite);
    saveMockDb();
    return newSite;
  }
  const { collection, addDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
  const docRef = await addDoc(collection(db, 'sites'), payload);
  return { id: docRef.id, ...payload };
}
export const createProject = createSite;

export async function updateSite(siteId, updates) {
  if (isMockMode) {
    const idx = mockDb.sites.findIndex(s => s.id === siteId);
    if (idx !== -1) {
      mockDb.sites[idx] = { ...mockDb.sites[idx], ...updates };
      saveMockDb();
      return mockDb.sites[idx];
    }
    return null;
  }
  const { doc, updateDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
  const docRef = doc(db, 'sites', siteId);
  await updateDoc(docRef, updates);
  return { id: siteId, ...updates };
}
export const updateProject = updateSite;

export async function deleteSite(siteId) {
  if (isMockMode) {
    const idx = mockDb.sites.findIndex(s => s.id === siteId);
    if (idx !== -1) {
      mockDb.sites.splice(idx, 1);
      saveMockDb();
      return true;
    }
    return false;
  }
  const { doc, deleteDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
  await deleteDoc(doc(db, 'sites', siteId));
  return true;
}
export const deleteProject = deleteSite;


// ----------------------------------------------------
// SHIFTS
// ----------------------------------------------------
export async function getShifts() {
  const currentUid = isMockMode ? (mockCurrentUser ? mockCurrentUser.id : null) : (auth && auth.currentUser ? auth.currentUser.uid : null);
  if (!currentUid) return [];

  // Check user role first
  const user = await getUser(currentUid);
  const role = user ? user.role : 'operative';
  const isSupervisorOrAbove = role === 'admin' || role === 'manager' || role === 'owner' || role === 'supervisor';

  if (isMockMode) {
    if (!isSupervisorOrAbove) {
      return mockDb.shifts.filter(s => s.userId === currentUid);
    }
    return mockDb.shifts;
  }

  try {
    const { collection, getDocs, query, where } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
    let ref = collection(db, 'shifts');
    if (!isSupervisorOrAbove) {
      ref = query(ref, where('userId', '==', currentUid));
    }
    const snapshot = await getDocs(ref);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (err) {
    console.error("Error in getShifts:", err);
    return [];
  }
}

export async function createShift(shiftData) {
  const payload = {
    siteId: shiftData.siteId || '',
    siteAddress: shiftData.siteAddress || '',
    eNumber: shiftData.eNumber || '',
    userId: shiftData.userId || '',
    userName: shiftData.userName || '',
    date: shiftData.date || getLocalDateString(),
    startTime: shiftData.startTime || '',
    task: shiftData.task || '',
    notes: shiftData.notes || '',
    status: shiftData.status || 'pending',
    managerIds: shiftData.managerIds || [],
    managerNames: shiftData.managerNames || [],
    relevantPeopleIds: shiftData.relevantPeopleIds || [],
    relevantPeopleNames: shiftData.relevantPeopleNames || [],
    files: shiftData.files || [],
    completionPhotos: shiftData.completionPhotos || [],
    incompletePhotos: shiftData.incompletePhotos || [],
    requiredPhotos: shiftData.requiredPhotos || [],
    completionNotes: shiftData.completionNotes || '',
    incompleteReason: shiftData.incompleteReason || '',
    timestamps: shiftData.timestamps || { confirmed: null, onSite: null, completed: null, incomplete: null, cancelled: null }
  };
  if (isMockMode) {
    const newShift = { id: generateUUID(), ...payload };
    mockDb.shifts.push(newShift);
    saveMockDb();
    return newShift;
  }
  const { collection, addDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
  const docRef = await addDoc(collection(db, 'shifts'), payload);
  return { id: docRef.id, ...payload };
}

export async function updateShift(shiftId, updates) {
  if (isMockMode) {
    const idx = mockDb.shifts.findIndex(s => s.id === shiftId);
    if (idx !== -1) {
      mockDb.shifts[idx] = { ...mockDb.shifts[idx], ...updates };
      saveMockDb();
      return mockDb.shifts[idx];
    }
    return null;
  }
  const { doc, updateDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
  const docRef = doc(db, 'shifts', shiftId);
  await updateDoc(docRef, updates);
  return { id: shiftId, ...updates };
}

export async function deleteShift(shiftId) {
  if (isMockMode) {
    mockDb.shifts = mockDb.shifts.filter(s => s.id !== shiftId);
    saveMockDb();
    return true;
  }
  const { doc, deleteDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
  await deleteDoc(doc(db, 'shifts', shiftId));
  return true;
}

// ----------------------------------------------------
// PLANNERS
// ----------------------------------------------------
export async function getPlanners() {
  if (isMockMode) {
    if (!mockDb.planners) mockDb.planners = [];
    return mockDb.planners;
  }
  const { collection, getDocs } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
  const snapshot = await getDocs(collection(db, 'planners'));
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

export async function createPlanner(plannerData) {
  const payload = {
    name: plannerData.name || '',
    scheme: plannerData.scheme || '',
    managerIds: plannerData.managerIds || [],
    relevantPeopleIds: plannerData.relevantPeopleIds || [],
    siteIds: plannerData.siteIds || [],
    createdDate: plannerData.createdDate || getLocalDateString()
  };
  if (isMockMode) {
    if (!mockDb.planners) mockDb.planners = [];
    const newPlanner = { id: generateUUID(), ...payload };
    mockDb.planners.push(newPlanner);
    saveMockDb();
    return newPlanner;
  }
  const { collection, addDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
  const docRef = await addDoc(collection(db, 'planners'), payload);
  return { id: docRef.id, ...payload };
}

export async function updatePlanner(plannerId, updates) {
  if (isMockMode) {
    if (!mockDb.planners) mockDb.planners = [];
    const idx = mockDb.planners.findIndex(p => p.id === plannerId);
    if (idx !== -1) {
      mockDb.planners[idx] = { ...mockDb.planners[idx], ...updates };
      saveMockDb();
      return mockDb.planners[idx];
    }
    return null;
  }
  const { doc, updateDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
  const docRef = doc(db, 'planners', plannerId);
  await updateDoc(docRef, updates);
  return { id: plannerId, ...updates };
}

export async function deletePlanner(plannerId) {
  if (isMockMode) {
    if (!mockDb.planners) mockDb.planners = [];
    mockDb.planners = mockDb.planners.filter(p => p.id !== plannerId);
    saveMockDb();
    return true;
  }
  const { doc, deleteDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
  await deleteDoc(doc(db, 'planners', plannerId));
  return true;
}

// ----------------------------------------------------
// TIMESHEETS (TIMECLOCK)
// ----------------------------------------------------
export async function getTimesheets() {
  if (isMockMode) return mockDb.timesheets;
  const { collection, getDocs } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
  const snapshot = await getDocs(collection(db, 'timesheets'));
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

export async function clockIn(userId, projectId, projectTitle, shiftId, coords) {
  const clockInTime = new Date().toISOString();
  const dateStr = clockInTime.split('T')[0];
  const payload = {
    userId,
    projectId,
    projectTitle,
    shiftId: shiftId || null,
    date: dateStr,
    clockInTime,
    clockOutTime: null,
    clockInLocation: coords || null,
    clockOutLocation: null,
    breaks: [],
    totalHours: 0,
    approvedStatus: 'pending',
    approvedBy: null
  };

  if (isMockMode) {
    const newTimesheet = { id: generateUUID(), ...payload };
    mockDb.timesheets.push(newTimesheet);
    saveMockDb();
    return newTimesheet;
  }
  const { collection, addDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
  const docRef = await addDoc(collection(db, 'timesheets'), payload);
  return { id: docRef.id, ...payload };
}

export async function clockOut(timesheetId, coords) {
  const clockOutTime = new Date().toISOString();
  if (isMockMode) {
    const ts = mockDb.timesheets.find(t => t.id === timesheetId);
    if (ts) {
      ts.clockOutTime = clockOutTime;
      ts.clockOutLocation = coords || null;
      
      const inTime = new Date(ts.clockInTime);
      const outTime = new Date(clockOutTime);
      let diffMs = outTime - inTime;
      
      // Subtract break durations
      let breakMs = 0;
      ts.breaks.forEach(b => {
        if (b.start && b.end) {
          breakMs += (new Date(b.end) - new Date(b.start));
        }
      });
      
      ts.totalHours = Math.max(0, ((diffMs - breakMs) / (1000 * 60 * 60))).toFixed(2);
      saveMockDb();
      return ts;
    }
    return null;
  }
  const { doc, getDoc, updateDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
  const docRef = doc(db, 'timesheets', timesheetId);
  const snap = await getDoc(docRef);
  if (snap.exists()) {
    const data = snap.data();
    const inTime = new Date(data.clockInTime);
    const outTime = new Date(clockOutTime);
    let diffMs = outTime - inTime;
    let breakMs = 0;
    (data.breaks || []).forEach(b => {
      if (b.start && b.end) {
        breakMs += (new Date(b.end) - new Date(b.start));
      }
    });
    const totalHours = Math.max(0, ((diffMs - breakMs) / (1000 * 60 * 60))).toFixed(2);

    const updates = {
      clockOutTime,
      clockOutLocation: coords || null,
      totalHours
    };
    await updateDoc(docRef, updates);
    return { id: timesheetId, ...data, ...updates };
  }
  return null;
}

export async function toggleBreak(timesheetId) {
  const now = new Date().toISOString();
  if (isMockMode) {
    const ts = mockDb.timesheets.find(t => t.id === timesheetId);
    if (ts) {
      const activeBreakIdx = ts.breaks.findIndex(b => !b.end);
      if (activeBreakIdx !== -1) {
        ts.breaks[activeBreakIdx].end = now;
      } else {
        ts.breaks.push({ start: now, end: null });
      }
      saveMockDb();
      return ts;
    }
    return null;
  }
  const { doc, getDoc, updateDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
  const docRef = doc(db, 'timesheets', timesheetId);
  const snap = await getDoc(docRef);
  if (snap.exists()) {
    const data = snap.data();
    const breaks = data.breaks || [];
    const activeBreakIdx = breaks.findIndex(b => !b.end);
    if (activeBreakIdx !== -1) {
      breaks[activeBreakIdx].end = now;
    } else {
      breaks.push({ start: now, end: null });
    }
    await updateDoc(docRef, { breaks });
    return { id: timesheetId, ...data, breaks };
  }
  return null;
}

export async function approveTimesheet(timesheetId, approverId, status = 'approved') {
  if (isMockMode) {
    const ts = mockDb.timesheets.find(t => t.id === timesheetId);
    if (ts) {
      ts.approvedStatus = status;
      ts.approvedBy = approverId;
      saveMockDb();
      return ts;
    }
    return null;
  }
  const { doc, updateDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
  const docRef = doc(db, 'timesheets', timesheetId);
  const updates = { approvedStatus: status, approvedBy: approverId };
  await updateDoc(docRef, updates);
  return { id: timesheetId, ...updates };
}

// ----------------------------------------------------
// TASKS
// ----------------------------------------------------
export async function getTasks() {
  if (isMockMode) return mockDb.tasks;
  const { collection, getDocs } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
  const snapshot = await getDocs(collection(db, 'tasks'));
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

export async function createTask(taskData) {
  if (isMockMode) {
    const newTask = { id: generateUUID(), status: 'pending', notes: '', completionPhoto: '', ...taskData };
    mockDb.tasks.push(newTask);
    saveMockDb();
    return newTask;
  }
  const { collection, addDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
  const payload = { status: 'pending', notes: '', completionPhoto: '', ...taskData };
  const docRef = await addDoc(collection(db, 'tasks'), payload);
  return { id: docRef.id, ...payload };
}

export async function updateTask(taskId, updates) {
  if (isMockMode) {
    const idx = mockDb.tasks.findIndex(t => t.id === taskId);
    if (idx !== -1) {
      mockDb.tasks[idx] = { ...mockDb.tasks[idx], ...updates };
      saveMockDb();
      return mockDb.tasks[idx];
    }
    return null;
  }
  const { doc, updateDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
  const docRef = doc(db, 'tasks', taskId);
  await updateDoc(docRef, updates);
  return { id: taskId, ...updates };
}

// ----------------------------------------------------
// FORMS / SUBMISSIONS
// ----------------------------------------------------
export async function getForms() {
  if (isMockMode) return mockDb.forms;
  const { collection, getDocs } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
  const snapshot = await getDocs(collection(db, 'forms'));
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

export async function createForm(formData) {
  if (isMockMode) {
    const newForm = { id: generateUUID(), createdAt: getLocalDateString(), ...formData };
    mockDb.forms.push(newForm);
    saveMockDb();
    return newForm;
  }
  const { collection, addDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
  const payload = { createdAt: getLocalDateString(), ...formData };
  const docRef = await addDoc(collection(db, 'forms'), payload);
  return { id: docRef.id, ...payload };
}

export async function getFormSubmissions() {
  if (isMockMode) return mockDb.formSubmissions;
  const { collection, getDocs } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
  const snapshot = await getDocs(collection(db, 'formSubmissions'));
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

export async function submitForm(submissionData) {
  if (isMockMode) {
    const newSub = { id: generateUUID(), submittedAt: new Date().toISOString(), ...submissionData };
    mockDb.formSubmissions.push(newSub);
    saveMockDb();
    return newSub;
  }
  const { collection, addDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
  const payload = { submittedAt: new Date().toISOString(), ...submissionData };
  const docRef = await addDoc(collection(db, 'formSubmissions'), payload);
  return { id: docRef.id, ...payload };
}

// ----------------------------------------------------
// COMMUNICATIONS & CHATS
// ----------------------------------------------------
export async function getAnnouncements() {
  if (isMockMode) return mockDb.announcements;
  const { collection, getDocs } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
  const snapshot = await getDocs(collection(db, 'announcements'));
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

export async function createAnnouncement(annData) {
  if (isMockMode) {
    const newAnn = { id: generateUUID(), createdAt: new Date().toISOString(), readBy: [], ...annData };
    mockDb.announcements.push(newAnn);
    saveMockDb();
    return newAnn;
  }
  const { collection, addDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
  const payload = { createdAt: new Date().toISOString(), readBy: [], ...annData };
  const docRef = await addDoc(collection(db, 'announcements'), payload);
  return { id: docRef.id, ...payload };
}

export async function markAnnouncementAsRead(annId, userId) {
  if (isMockMode) {
    const ann = mockDb.announcements.find(a => a.id === annId);
    if (ann && !ann.readBy.includes(userId)) {
      ann.readBy.push(userId);
      saveMockDb();
    }
    return ann;
  }
  const { doc, getDoc, updateDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
  const docRef = doc(db, 'announcements', annId);
  const snap = await getDoc(docRef);
  if (snap.exists()) {
    const readBy = snap.data().readBy || [];
    if (!readBy.includes(userId)) {
      readBy.push(userId);
      await updateDoc(docRef, { readBy });
    }
  }
}

export async function getChats() {
  if (isMockMode) return mockDb.chats;
  const { collection, getDocs } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
  const snapshot = await getDocs(collection(db, 'chats'));
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

export async function createChat(chatData) {
  if (isMockMode) {
    const newChat = { id: generateUUID(), ...chatData };
    mockDb.chats.push(newChat);
    saveMockDb();
    return newChat;
  }
  const { collection, addDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
  const docRef = await addDoc(collection(db, 'chats'), chatData);
  return { id: docRef.id, ...chatData };
}

export async function getMessages(chatId) {
  if (isMockMode) {
    return mockDb.messages
      .filter(m => m.chatId === chatId)
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  }
  const { collection, getDocs, query, where, orderBy } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
  const q = query(collection(db, 'messages'), where('chatId', '==', chatId), orderBy('timestamp', 'desc'));
  const snapshot = await getDocs(q);
  const messages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  return messages.reverse();
}

export async function sendMessage(chatId, senderId, senderName, content, mediaUrl = '') {
  const payload = {
    chatId,
    senderId,
    senderName,
    content,
    mediaUrl,
    timestamp: new Date().toISOString()
  };
  if (isMockMode) {
    const newMsg = { id: generateUUID(), ...payload };
    mockDb.messages.push(newMsg);
    saveMockDb();
    return newMsg;
  }
  const { collection, addDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
  const docRef = await addDoc(collection(db, 'messages'), payload);
  return { id: docRef.id, ...payload };
}

// ----------------------------------------------------
// NOTIFICATIONS
// ----------------------------------------------------
export async function getNotifications(userId) {
  if (isMockMode) {
    return mockDb.notifications.filter(n => n.userId === userId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
  const { collection, getDocs, query, where } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
  const q = query(collection(db, 'notifications'), where('userId', '==', userId));
  const snapshot = await getDocs(q);
  const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export async function createNotification(userId, title, message, type = 'system') {
  const payload = {
    userId,
    title,
    message,
    type,
    read: false,
    createdAt: new Date().toISOString()
  };
  if (isMockMode) {
    const newN = { id: generateUUID(), ...payload };
    mockDb.notifications.push(newN);
    saveMockDb();
    return newN;
  }
  const { collection, addDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
  await addDoc(collection(db, 'notifications'), payload);
}

export async function markNotificationRead(notifId) {
  if (isMockMode) {
    const n = mockDb.notifications.find(item => item.id === notifId);
    if (n) n.read = true;
    saveMockDb();
    return;
  }
  const { doc, updateDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
  await updateDoc(doc(db, 'notifications', notifId), { read: true });
}

// ----------------------------------------------------
// DOCUMENTS & RAMS
// ----------------------------------------------------
export async function getDocuments() {
  if (isMockMode) return mockDb.documents;
  const { collection, getDocs } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
  const snapshot = await getDocs(collection(db, 'documents'));
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

export async function createDocument(docData) {
  if (isMockMode) {
    const newDoc = { id: generateUUID(), views: [], signatures: [], ...docData };
    mockDb.documents.push(newDoc);
    saveMockDb();
    return newDoc;
  }
  const { collection, addDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
  const payload = { views: [], signatures: [], ...docData };
  const docRef = await addDoc(collection(db, 'documents'), payload);
  return { id: docRef.id, ...payload };
}

export async function signDocument(docId, userId) {
  if (isMockMode) {
    const docItem = mockDb.documents.find(d => d.id === docId);
    if (docItem) {
      if (!docItem.signatures.includes(userId)) docItem.signatures.push(userId);
      saveMockDb();
    }
    return docItem;
  }
  const { doc, getDoc, updateDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
  const docRef = doc(db, 'documents', docId);
  const snap = await getDoc(docRef);
  if (snap.exists()) {
    const signatures = snap.data().signatures || [];
    if (!signatures.includes(userId)) {
      signatures.push(userId);
      await updateDoc(docRef, { signatures });
    }
  }
}

// ----------------------------------------------------
// HR: HOLIDAYS, ABSENCES & RECORDS
// ----------------------------------------------------
export async function getHolidayRequests() {
  if (isMockMode) return mockDb.holidayRequests;
  const { collection, getDocs } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
  const snapshot = await getDocs(collection(db, 'holidayRequests'));
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

export async function createHolidayRequest(requestData) {
  if (isMockMode) {
    const newReq = { id: generateUUID(), status: 'pending', createdAt: new Date().toISOString(), ...requestData };
    mockDb.holidayRequests.push(newReq);
    saveMockDb();
    return newReq;
  }
  const { collection, addDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
  const payload = { status: 'pending', createdAt: new Date().toISOString(), ...requestData };
  const docRef = await addDoc(collection(db, 'holidayRequests'), payload);
  return { id: docRef.id, ...payload };
}

export async function updateHolidayStatus(reqId, status, approverId) {
  if (isMockMode) {
    const r = mockDb.holidayRequests.find(h => h.id === reqId);
    if (r) {
      r.status = status;
      r.approvedBy = approverId;
      saveMockDb();
      return r;
    }
    return null;
  }
  const { doc, updateDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
  const docRef = doc(db, 'holidayRequests', reqId);
  const updates = { status, approvedBy: approverId };
  await updateDoc(docRef, updates);
  return { id: reqId, ...updates };
}

export async function getAbsences() {
  if (isMockMode) return mockDb.absences;
  const { collection, getDocs } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
  const snapshot = await getDocs(collection(db, 'absences'));
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

export async function createAbsence(absenceData) {
  if (isMockMode) {
    const newAbs = { id: generateUUID(), createdAt: new Date().toISOString(), ...absenceData };
    mockDb.absences.push(newAbs);
    saveMockDb();
    return newAbs;
  }
  const { collection, addDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
  const payload = { createdAt: new Date().toISOString(), ...absenceData };
  const docRef = await addDoc(collection(db, 'absences'), payload);
  return { id: docRef.id, ...payload };
}

// ----------------------------------------------------
// AUDIT LOGS
// ----------------------------------------------------
export async function addAuditLog(userId, action, details) {
  const payload = {
    userId,
    action,
    details,
    timestamp: new Date().toISOString()
  };
  if (isMockMode) {
    mockDb.auditLogs.push({ id: generateUUID(), ...payload });
    saveMockDb();
    return;
  }
  try {
    const { collection, addDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
    await addDoc(collection(db, 'auditLogs'), payload);
  } catch (err) {
    console.error("Audit log failed:", err);
  }
}

// ----------------------------------------------------
// QUICK SHIFT PRESETS
// ----------------------------------------------------
export async function getPresets() {
  if (isMockMode) {
    if (!mockDb.presets) mockDb.presets = [];
    return mockDb.presets;
  }
  return [];
}

export async function createPreset(presetData) {
  if (isMockMode) {
    if (!mockDb.presets) mockDb.presets = [];
    const newPreset = {
      id: generateUUID(),
      ...presetData
    };
    mockDb.presets.push(newPreset);
    saveMockDb();
    return newPreset;
  }
  return presetData;
}

export async function deletePreset(presetId) {
  if (isMockMode) {
    if (!mockDb.presets) mockDb.presets = [];
    mockDb.presets = mockDb.presets.filter(p => p.id !== presetId);
    saveMockDb();
    return true;
  }
  return true;
}
