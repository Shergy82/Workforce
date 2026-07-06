import { app, auth, isMockMode, mockCurrentUser, mockSetCurrentUser, mockDb, saveMockDb } from './firebase-config.js';
import { createUser, getUsers, getUser } from './db.js';

let currentUserProfile = null;

export async function initAuth(onAuthStateChangedCallback) {
  // Check if system is empty to trigger setup wizard
  let isSystemEmpty = false;
  try {
    const allUsers = await getUsers();
    isSystemEmpty = allUsers.length === 0;
  } catch (e) {
    console.warn("Could not check if system is empty (likely unauthenticated read blocked). Defaulting to login screen.", e);
  }

  if (isSystemEmpty) {
    document.getElementById('setup-loader').style.display = 'none';
    document.getElementById('login-form').style.display = 'none';
    document.getElementById('register-form').style.display = 'block';
    document.getElementById('auth-subtitle').textContent = 'Initial System Setup';
  } else {
    document.getElementById('setup-loader').style.display = 'none';
    document.getElementById('register-form').style.display = 'none';
    document.getElementById('login-form').style.display = 'block';
  }

  if (isMockMode) {
    // Check local session
    if (mockCurrentUser) {
      currentUserProfile = await getUser(mockCurrentUser.id);
      onAuthStateChangedCallback(currentUserProfile);
    } else {
      onAuthStateChangedCallback(null);
    }
    return;
  }

  // Real Firebase Auth lifecycle
  const { onAuthStateChanged } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js");
  onAuthStateChanged(auth, async (firebaseUser) => {
    if (firebaseUser) {
      if (!currentUserProfile || currentUserProfile.id !== firebaseUser.uid) {
        currentUserProfile = await getUser(firebaseUser.uid);
      }
      if (!currentUserProfile) {
        // Wait a short moment and try once more to avoid race condition during sign up
        await new Promise(resolve => setTimeout(resolve, 1000));
        currentUserProfile = await getUser(firebaseUser.uid);
      }
      if (!currentUserProfile) {
        // Fallback profile if Firestore user document wasn't created
        currentUserProfile = {
          id: firebaseUser.uid,
          email: firebaseUser.email,
          name: firebaseUser.displayName || 'Unnamed User',
          role: 'operative',
          status: 'active'
        };
      }
      onAuthStateChangedCallback(currentUserProfile);
    } else {
      currentUserProfile = null;
      onAuthStateChangedCallback(null);
    }
  });
}

export async function login(email, password) {
  if (isMockMode) {
    const user = mockDb.users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (user) {
      // Simulate checking credentials (mock uses matching password length > 4 or any correct password for easy logins)
      mockSetCurrentUser(user);
      currentUserProfile = user;
      return user;
    }
    throw new Error("Invalid email or password.");
  }

  const { signInWithEmailAndPassword } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js");
  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  currentUserProfile = await getUser(userCredential.user.uid);
  return currentUserProfile;
}

export async function registerAdmin(name, email, password) {
  if (isMockMode) {
    const newAdmin = {
      id: 'admin1',
      email,
      name,
      role: 'owner',
      status: 'active',
      onboarded: true,
      emergencyContact: '',
      cscsExpiry: '',
      qualifications: 'System Administrator',
      onboardingChecklist: []
    };
    mockDb.users.push(newAdmin);
    saveMockDb();
    mockSetCurrentUser(newAdmin);
    currentUserProfile = newAdmin;
    return newAdmin;
  }

  const { createUserWithEmailAndPassword, updateProfile } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js");
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  const uid = credential.user.uid;
  
  await updateProfile(credential.user, { displayName: name });
  
  const adminData = {
    email,
    name,
    role: 'owner',
    status: 'active',
    onboarded: true,
    emergencyContact: '',
    cscsExpiry: '',
    qualifications: 'System Administrator',
    onboardingChecklist: []
  };
  
  currentUserProfile = await createUser(uid, adminData);
  return currentUserProfile;
}

export async function signUpUser(name, email, password, emergencyContact = '', qualifications = '') {
  if (isMockMode) {
    const existing = mockDb.users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (existing) throw new Error("A user with this email already exists.");

    const newWorker = {
      id: 'op-' + Math.random().toString(36).substr(2, 9),
      email,
      name,
      role: 'operative',
      status: 'active',
      onboarded: false,
      emergencyContact,
      cscsExpiry: '',
      qualifications,
      onboardingChecklist: []
    };
    mockDb.users.push(newWorker);
    saveMockDb();
    mockSetCurrentUser(newWorker);
    currentUserProfile = newWorker;
    return newWorker;
  }

  const { createUserWithEmailAndPassword, updateProfile } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js");
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  const uid = credential.user.uid;
  
  await updateProfile(credential.user, { displayName: name });

  // Dynamically verify if they are the first user in the database (since they are now authenticated, read is allowed)
  let isFirstUser = false;
  try {
    const allUsers = await getUsers();
    isFirstUser = allUsers.length === 0;
  } catch (e) {
    console.warn("Could not query users database to determine role. Defaulting to operative.", e);
  }
  
  const userData = {
    email,
    name,
    role: isFirstUser ? 'owner' : 'operative',
    status: 'active',
    onboarded: isFirstUser, // Auto-onboard the owner/admin
    emergencyContact,
    cscsExpiry: '',
    qualifications,
    onboardingChecklist: []
  };
  
  currentUserProfile = await createUser(uid, userData);
  return currentUserProfile;
}

export async function sendResetEmail(email) {
  if (isMockMode) {
    console.log(`Mocking password reset for: ${email}`);
    await new Promise(resolve => setTimeout(resolve, 800));
    const user = mockDb.users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!user) throw new Error("No user found with this email address.");
    return true;
  }

  const { sendPasswordResetEmail } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js");
  await sendPasswordResetEmail(auth, email);
  return true;
}

export async function logout() {
  if (isMockMode) {
    mockSetCurrentUser(null);
    currentUserProfile = null;
    window.location.reload();
    return;
  }

  const { signOut } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js");
  await signOut(auth);
  window.location.reload();
}

export function getCurrentUser() {
  return currentUserProfile;
}

export function getUserRole() {
  return currentUserProfile ? currentUserProfile.role : 'operative';
}

export function isOwner() {
  return getUserRole() === 'owner';
}

export function isAdmin() {
  const role = getUserRole();
  return role === 'owner' || role === 'admin';
}

export function isManager() {
  const role = getUserRole();
  return role === 'owner' || role === 'admin' || role === 'manager';
}

export function isSupervisor() {
  const role = getUserRole();
  return role === 'owner' || role === 'admin' || role === 'manager' || role === 'supervisor';
}

export function isOperative() {
  return getUserRole() === 'operative';
}
