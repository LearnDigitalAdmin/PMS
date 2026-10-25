// Watch's own Firebase handle. It must not import anything from src/services/database/** (that module graph
// loads the SQLite layer). Same public web config, same project, same region as the PMS app.
import { getApp, getApps, initializeApp } from 'firebase/app';
import type { FirebaseApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFunctions } from 'firebase/functions';

const firebaseConfig = {
  apiKey: 'AIzaSyD1hg7YLv08vyR2kSWi2ymxSu2pYCRwPq8',
  authDomain: 'plot-9fd6e.firebaseapp.com',
  projectId: 'plot-9fd6e',
  storageBucket: 'plot-9fd6e.firebasestorage.app',
  messagingSenderId: '1037620305589',
  appId: '1:1037620305589:web:2672a7dcaeca4c46b068fc',
  measurementId: 'G-B90H3GJFPM',
};

export const app: FirebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const functions = getFunctions(app, 'africa-south1');
