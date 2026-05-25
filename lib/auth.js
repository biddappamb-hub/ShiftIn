// ShiftIn — Firebase Authentication Service
import { FIREBASE_CONFIG } from '../config.js';
import AppState from './state.js';

const isMock = FIREBASE_CONFIG.apiKey === 'YOUR_FIREBASE_API_KEY';

let app, auth, authMod;
let initialized = false;

async function init() {
  if (initialized) return;
  initialized = true;

  if (isMock) {
    const storedUser = localStorage.getItem('mock_user');
    if (storedUser) {
      AppState.set({ user: JSON.parse(storedUser) });
    }
    return;
  }

  const appMod = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js');
  authMod = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
  app = appMod.initializeApp(FIREBASE_CONFIG);
  auth = authMod.getAuth(app);
  auth.useDeviceLanguage();

  // Check for redirect result first (handles return from Google sign-in)
  try {
    const result = await authMod.getRedirectResult(auth);
    if (result && result.user) {
      const u = result.user;
      AppState.set({ user: { uid: u.uid, email: u.email, phone: u.phoneNumber, displayName: u.displayName, photoURL: u.photoURL } });
    }
  } catch (e) {
    console.warn('Redirect result error:', e.message);
  }

  // Listen for auth state changes
  authMod.onAuthStateChanged(auth, (user) => {
    if (user) {
      AppState.set({ user: { uid: user.uid, email: user.email, phone: user.phoneNumber, displayName: user.displayName, photoURL: user.photoURL } });
    } else {
      AppState.set({ user: null, profile: null });
    }
  });
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// Google Sign-In
export async function signInWithGoogle() {
  await init();
  if (isMock) {
    await delay(500);
    const user = { uid: 'mock_google_uid', email: 'test@student.com', displayName: 'Test User', photoURL: 'https://i.pravatar.cc/150' };
    localStorage.setItem('mock_user', JSON.stringify(user));
    AppState.set({ user });
    return user;
  }
  const provider = new authMod.GoogleAuthProvider();
  provider.addScope('email');
  provider.addScope('profile');

  try {
    const result = await authMod.signInWithPopup(auth, provider);
    return result.user;
  } catch (e) {
    if (e.code === 'auth/popup-blocked' || e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') {
      await authMod.signInWithRedirect(auth, provider);
      return null;
    }
    throw e;
  }
}

// Phone OTP — Step 1: Send code
let confirmationResult = null;
export async function sendPhoneOTP(phoneNumber, recaptchaContainerId) {
  await init();
  if (isMock) {
    await delay(500);
    confirmationResult = { phone: phoneNumber };
    return true;
  }
  if (window._recaptchaVerifier) {
    try { window._recaptchaVerifier.clear(); } catch {}
  }
  window._recaptchaVerifier = new authMod.RecaptchaVerifier(auth, recaptchaContainerId, { size: 'invisible' });
  confirmationResult = await authMod.signInWithPhoneNumber(auth, phoneNumber, window._recaptchaVerifier);
  return true;
}

// Phone OTP — Step 2: Verify code
export async function verifyPhoneOTP(code) {
  if (!confirmationResult) throw new Error('Send OTP first');
  if (isMock) {
    await delay(500);
    if (code !== '123456') throw new Error('Invalid OTP (use 123456 for testing)');
    const user = { uid: 'mock_phone_' + confirmationResult.phone, phone: confirmationResult.phone };
    localStorage.setItem('mock_user', JSON.stringify(user));
    AppState.set({ user });
    return user;
  }
  const result = await confirmationResult.confirm(code);
  return result.user;
}

// Get current user
export function getCurrentUser() {
  return AppState.get('user');
}

// Email/Password Auth
export async function signInWithEmail(email, password) {
  await init();
  if (isMock) {
    await delay(500);
    const users = JSON.parse(localStorage.getItem('mock_users') || '{}');
    if (!users[email] || users[email].password !== password) throw new Error('Invalid credentials');
    const user = users[email];
    localStorage.setItem('mock_user', JSON.stringify(user));
    AppState.set({ user });
    return user;
  }
  const result = await authMod.signInWithEmailAndPassword(auth, email, password);
  return result.user;
}

export async function signUpWithEmail(email, password) {
  await init();
  if (isMock) {
    await delay(500);
    const users = JSON.parse(localStorage.getItem('mock_users') || '{}');
    if (users[email]) throw new Error('Email already in use');
    const user = { uid: 'mock_uid_' + Date.now(), email, password };
    users[email] = user;
    localStorage.setItem('mock_users', JSON.stringify(users));
    localStorage.setItem('mock_user', JSON.stringify(user));
    AppState.set({ user });
    return user;
  }
  const result = await authMod.createUserWithEmailAndPassword(auth, email, password);
  return result.user;
}

// Sign out
export async function signOut() {
  await init();
  if (isMock) {
    localStorage.removeItem('mock_user');
    AppState.clear();
    return;
  }
  await authMod.signOut(auth);
  AppState.clear();
}

export { init as initAuth };
