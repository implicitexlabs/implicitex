(function exposeFirebaseAuthAdapter(root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.IXIDFirebaseAuth = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function buildFirebaseAuthAdapter() {
  'use strict';

  const FIREBASE_MODULE_ORIGIN = 'https://www.gstatic.com';
  const REQUIRED_OPTIONS = Object.freeze(['apiKey', 'authDomain', 'projectId', 'appId']);

  function validateConfiguration(config) {
    if (!config || config.enabled !== true) {
      throw new Error('IX ID onboarding is not enabled');
    }
    if (!config.firebase || !/^\d+\.\d+\.\d+$/.test(config.firebase.sdkVersion || '')) {
      throw new Error('A pinned Firebase SDK version is required');
    }
    const options = config.firebase.options;
    if (!options || REQUIRED_OPTIONS.some(function missing(key) { return !options[key]; })) {
      throw new Error('Firebase public web configuration is incomplete');
    }
    if (config.actionContinueUrl !== 'https://app.ixid.me/register') {
      throw new Error('Unexpected Firebase action continue URL');
    }
  }

  function moduleUrl(version, service) {
    return FIREBASE_MODULE_ORIGIN + '/firebasejs/' + version + '/firebase-' + service + '.js';
  }

  async function defaultImporter(url) {
    return import(url);
  }

  async function createFirebaseAuthAdapter(config, importer) {
    validateConfiguration(config);
    const load = importer || defaultImporter;
    const version = config.firebase.sdkVersion;
    const modules = await Promise.all([
      load(moduleUrl(version, 'app')),
      load(moduleUrl(version, 'auth')),
    ]);
    const appSdk = modules[0];
    const authSdk = modules[1];
    const app = appSdk.initializeApp(config.firebase.options);
    const auth = authSdk.getAuth(app);

    // Slice E deliberately uses memory-only persistence. Firebase refresh and ID
    // tokens remain SDK-managed for the active page session and are not written
    // into Local Storage, Session Storage, or IndexedDB by the application.
    await authSdk.setPersistence(auth, authSdk.inMemoryPersistence);

    const actionSettings = Object.freeze({
      url: config.actionContinueUrl,
      handleCodeInApp: false,
    });

    return Object.freeze({
      subscribe: function subscribe(listener) {
        return authSdk.onAuthStateChanged(auth, listener);
      },
      signUp: async function signUp(email, password) {
        const credential = await authSdk.createUserWithEmailAndPassword(auth, email, password);
        return credential.user;
      },
      signIn: async function signIn(email, password) {
        const credential = await authSdk.signInWithEmailAndPassword(auth, email, password);
        return credential.user;
      },
      signOut: function signOut() {
        return authSdk.signOut(auth);
      },
      sendVerification: function sendVerification(user) {
        return authSdk.sendEmailVerification(user, actionSettings);
      },
      sendPasswordReset: function sendPasswordReset(email) {
        return authSdk.sendPasswordResetEmail(auth, email, actionSettings);
      },
      reload: function reload(user) {
        return authSdk.reload(user);
      },
      getIdToken: function getIdToken(user, forceRefresh) {
        return authSdk.getIdToken(user, forceRefresh === true);
      },
      isEmailVerified: function isEmailVerified(user) {
        return Boolean(user && user.emailVerified === true);
      },
      getEmail: function getEmail(user) {
        return user && typeof user.email === 'string' ? user.email : '';
      },
    });
  }

  return Object.freeze({
    FIREBASE_MODULE_ORIGIN: FIREBASE_MODULE_ORIGIN,
    createFirebaseAuthAdapter: createFirebaseAuthAdapter,
    moduleUrl: moduleUrl,
    validateConfiguration: validateConfiguration,
  });
}));
