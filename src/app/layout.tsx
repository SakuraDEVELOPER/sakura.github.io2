import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const firebaseModuleScript = `
  import { getApps, initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
  import {
    createUserWithEmailAndPassword,
    GoogleAuthProvider,
    getAuth,
    onAuthStateChanged,
    signInWithPopup,
    signInWithEmailAndPassword,
    signOut,
    updateProfile
  } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
  import {
    collection,
    doc,
    getDoc,
    getDocs,
    getFirestore,
    limit,
    query,
    runTransaction,
    setDoc,
    where
  } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

  const firebaseConfig = {
    apiKey: "AIzaSyAnZQt5NWXGOWuz3STh_vy-dSENVBM9_ZY",
    authDomain: "sakura-bfa74.firebaseapp.com",
    projectId: "sakura-bfa74",
    storageBucket: "sakura-bfa74.firebasestorage.app",
    messagingSenderId: "145336250722",
    appId: "1:145336250722:web:d31610ae8258c398e47c3b",
    measurementId: "G-1V07L6BRL0"
  };

  const LOGIN_MAX_LENGTH = 24;
  const LOGIN_MIN_LENGTH = 3;
  const LOGIN_PATTERN = /^[A-Za-zА-Яа-яЁё0-9._-]+$/;

  const createFirebaseError = (code, message) => {
    const error = new Error(message);
    error.code = code;
    return error;
  };

  const sanitizeLogin = (value) =>
    value
      .trim()
      .replace(/\s+/g, "")
      .replace(/[^A-Za-zА-Яа-яЁё0-9._-]/g, "")
      .slice(0, LOGIN_MAX_LENGTH);

  const normalizeLogin = (value) => sanitizeLogin(value).toLocaleLowerCase();

  const deriveLoginSeed = (user, preferredDisplayName = null) => {
    const source =
      preferredDisplayName?.trim() ||
      user.displayName?.trim() ||
      user.email?.split("@")[0]?.trim() ||
      "sakurauser";

    const cleaned = sanitizeLogin(source);

    return cleaned || \`user\${user.uid.slice(0, 6)}\`;
  };

  const buildLoginHistory = (existingHistory, creationTime, lastSignInTime) => {
    const previousEntries = Array.isArray(existingHistory)
      ? existingHistory.filter((entry) => typeof entry === "string")
      : [];
    const nextEntries = [lastSignInTime ?? null, creationTime ?? null].filter(Boolean);

    return [...new Set([...nextEntries, ...previousEntries])]
      .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())
      .slice(0, 8);
  };

  const toUserSnapshot = (user, details = {}) =>
    user
      ? {
          uid: user.uid,
          email: user.email ?? null,
          login: details.login ?? null,
          displayName: user.displayName ?? details.displayName ?? details.login ?? null,
          profileId: typeof details.profileId === "number" ? details.profileId : null,
          photoURL: user.photoURL ?? null,
          providerIds:
            user.providerData.map((provider) => provider?.providerId).filter(Boolean) ??
            details.providerIds ??
            [],
          creationTime: user.metadata.creationTime ?? null,
          lastSignInTime: user.metadata.lastSignInTime ?? null,
          loginHistory: Array.isArray(details.loginHistory) ? details.loginHistory : []
        }
      : null;

  window.firebaseConfig = firebaseConfig;

  try {
    const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = getFirestore(app);
    const provider = new GoogleAuthProvider();

    const userRefFor = (uid) => doc(db, "users", uid);
    const countersRef = doc(db, "meta", "counters");
    const usersCollection = collection(db, "users");

    const findUserByLogin = async (loginLower) => {
      const snapshot = await getDocs(
        query(usersCollection, where("loginLower", "==", loginLower), limit(1))
      );

      return snapshot.empty ? null : snapshot.docs[0];
    };

    const resolveAvailableLogin = async (requestedLogin, currentUid = null, automatic = false) => {
      const normalizedRequestedLogin = String(requestedLogin ?? "")
        .trim()
        .replace(/\s+/g, "");
      const baseLogin = sanitizeLogin(normalizedRequestedLogin);

      if (
        !baseLogin ||
        baseLogin.length < LOGIN_MIN_LENGTH ||
        (!automatic &&
          (normalizedRequestedLogin.length > LOGIN_MAX_LENGTH ||
            !LOGIN_PATTERN.test(normalizedRequestedLogin) ||
            baseLogin !== normalizedRequestedLogin))
      ) {
        throw createFirebaseError(
          "auth/invalid-login",
          "Login must be 3-24 characters and only contain letters, numbers, dots, underscores, or hyphens."
        );
      }

      for (let attempt = 0; attempt < 20; attempt += 1) {
        const suffix = attempt === 0 ? "" : String(attempt + 1);
        const trimmedBase = baseLogin.slice(0, LOGIN_MAX_LENGTH - suffix.length);
        const login = \`\${trimmedBase}\${suffix}\`;
        const loginLower = normalizeLogin(login);
        const existingLoginDoc = await findUserByLogin(loginLower);

        if (!existingLoginDoc || existingLoginDoc.id === currentUid) {
          return {
            login,
            loginLower,
          };
        }

        if (!automatic) {
          throw createFirebaseError(
            "auth/login-already-in-use",
            "This login is already taken."
          );
        }
      }

      throw createFirebaseError(
        "auth/login-already-in-use",
        "This login is already taken."
      );
    };

    const resolveEmailForLogin = async (identifier) => {
      const trimmedIdentifier = identifier.trim();

      if (trimmedIdentifier.includes("@")) {
        return trimmedIdentifier;
      }

      const loginLower = normalizeLogin(trimmedIdentifier);

      if (!loginLower) {
        throw createFirebaseError("auth/invalid-login", "Invalid login.");
      }

      const userDoc = await findUserByLogin(loginLower);

      if (!userDoc) {
        throw createFirebaseError("auth/login-not-found", "Login not found.");
      }

      const userData = userDoc.data();

      if (typeof userData?.email !== "string" || !userData.email) {
        throw createFirebaseError("auth/login-not-found", "Login not found.");
      }

      return userData.email;
    };

    const ensureProfileRecord = async (user, options = {}) => {
      const userRef = userRefFor(user.uid);
      const userSnapshot = await getDoc(userRef);
      const existingData = userSnapshot.exists() ? userSnapshot.data() : null;
      const existingProfileId =
        typeof existingData?.profileId === "number" ? existingData.profileId : null;
      const providerIds = user.providerData
        .map((providerData) => providerData?.providerId)
        .filter(Boolean);
      const preferredDisplayName =
        typeof options.preferredDisplayName === "string" && options.preferredDisplayName.trim()
          ? options.preferredDisplayName.trim()
          : null;

      const loginDetails =
        typeof existingData?.login === "string" && typeof existingData?.loginLower === "string"
          ? {
              login: existingData.login,
              loginLower: existingData.loginLower,
            }
          : typeof options.requestedLogin === "string" && options.requestedLogin.trim()
            ? await resolveAvailableLogin(options.requestedLogin, user.uid)
            : await resolveAvailableLogin(deriveLoginSeed(user, preferredDisplayName), user.uid, true);

      const loginHistory = buildLoginHistory(
        existingData?.loginHistory,
        user.metadata.creationTime ?? null,
        user.metadata.lastSignInTime ?? null
      );
      const profilePayload = {
        uid: user.uid,
        email: user.email ?? null,
        login: loginDetails.login,
        loginLower: loginDetails.loginLower,
        displayName:
          preferredDisplayName ??
          user.displayName ??
          existingData?.displayName ??
          loginDetails.login,
        photoURL: user.photoURL ?? null,
        providerIds,
        creationTime: user.metadata.creationTime ?? null,
        lastSignInTime: user.metadata.lastSignInTime ?? null,
        loginHistory,
        updatedAt: new Date().toISOString(),
      };

      const writeProfileData = async (profileId) => {
        await setDoc(
          userRef,
          { ...profilePayload, profileId },
          { merge: true }
        );

        return {
          ...profilePayload,
          profileId,
        };
      };

      if (existingProfileId !== null) {
        return writeProfileData(existingProfileId);
      }

      const nextProfileId = await runTransaction(db, async (transaction) => {
        const countersSnapshot = await transaction.get(countersRef);
        const currentCount =
          countersSnapshot.exists() && typeof countersSnapshot.data()?.profileCount === "number"
            ? countersSnapshot.data().profileCount
            : 0;
        const profileId = currentCount + 1;

        transaction.set(countersRef, { profileCount: profileId }, { merge: true });
        transaction.set(
          userRef,
          { ...profilePayload, profileId },
          { merge: true }
        );

        return profileId;
      });

      return {
        ...profilePayload,
        profileId: nextProfileId,
      };
    };

    const resolveUserSnapshot = async (user, options = {}) => {
      const details = await ensureProfileRecord(user, options);

      return toUserSnapshot(user, details);
    };

    const loginWithGoogle = async () => {
      const result = await signInWithPopup(auth, provider);
      return resolveUserSnapshot(result.user);
    };

    window.sakuraFirebaseAuth = {
      register: async ({ login, email, password }) => {
        const resolvedLogin = await resolveAvailableLogin(login);
        const credentials = await createUserWithEmailAndPassword(auth, email, password);

        await updateProfile(credentials.user, {
          displayName: resolvedLogin.login,
        });

        return resolveUserSnapshot(credentials.user, {
          requestedLogin: resolvedLogin.login,
          preferredDisplayName: resolvedLogin.login,
        });
      },
      login: async (identifier, password) => {
        const email = await resolveEmailForLogin(identifier);
        const credentials = await signInWithEmailAndPassword(auth, email, password);
        return resolveUserSnapshot(credentials.user);
      },
      loginWithGoogle,
      logout: async () => {
        await signOut(auth);
      },
      onAuthStateChanged: (callback) =>
        onAuthStateChanged(auth, async (user) =>
          callback(user ? await resolveUserSnapshot(user) : null)
        )
    };
    window.loginWithGoogle = loginWithGoogle;

    window.dispatchEvent(new CustomEvent("sakura-auth-ready"));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to initialize Firebase Auth.";

    window.sakuraFirebaseAuthError = message;
    window.dispatchEvent(
      new CustomEvent("sakura-auth-error", {
        detail: { message }
      })
    );
    console.error("Firebase Auth init failed:", error);
  }
`;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Sakura",
  description:
    "Free Dota 2 cheat with camera distance, enemy resource bars, and a clean in-game menu.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ru"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <script
          type="module"
          dangerouslySetInnerHTML={{
            __html: firebaseModuleScript,
          }}
        />
      </body>
    </html>
  );
}
