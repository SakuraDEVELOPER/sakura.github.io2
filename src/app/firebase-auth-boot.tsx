"use client";

import { useEffect } from "react";

type FirebaseBootWindow = Window & {
  sakuraStartFirebaseAuth?: () => Promise<unknown> | unknown;
  sakuraFirebaseRuntimeInjected?: boolean;
  sakuraFirebaseRuntimePromise?: Promise<void> | null;
};

const getWindowState = () => window as FirebaseBootWindow;

const waitForRuntimeStart = (bootFn: () => Promise<void>) =>
  new Promise<void>((resolve) => {
    let attempts = 0;

    const tick = () => {
      const runtimeStart = getWindowState().sakuraStartFirebaseAuth;

      if (runtimeStart && runtimeStart !== bootFn) {
        resolve();
        return;
      }

      attempts += 1;

      if (attempts >= 20) {
        resolve();
        return;
      }

      window.setTimeout(tick, 25);
    };

    tick();
  });

export default function FirebaseAuthBoot() {
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const runtime = getWindowState();
    let idleTimerId = 0;
    let idleCallbackId: number | null = null;
    const interactionEvents = ["pointerdown", "keydown", "touchstart"] as const;

    const loadRuntime = async (startFirebase = false) => {
      if (!runtime.sakuraFirebaseRuntimeInjected && !runtime.sakuraFirebaseRuntimePromise) {
        runtime.sakuraFirebaseRuntimePromise = import("./firebase-auth-script")
          .then(async ({ default: firebaseModuleScript }) => {
            if (!runtime.sakuraFirebaseRuntimeInjected) {
              const script = document.createElement("script");

              script.type = "module";
              script.textContent = firebaseModuleScript;
              document.body.appendChild(script);
              runtime.sakuraFirebaseRuntimeInjected = true;
            }
          })
          .finally(() => {
            runtime.sakuraFirebaseRuntimePromise = null;
          });
      }

      if (runtime.sakuraFirebaseRuntimePromise) {
        await runtime.sakuraFirebaseRuntimePromise;
      }

      if (startFirebase) {
        await waitForRuntimeStart(bootNow);
        const runtimeStart = getWindowState().sakuraStartFirebaseAuth;

        if (runtimeStart && runtimeStart !== bootNow) {
          await runtimeStart();
        }
      }
    };

    const bootNow = () => loadRuntime(true);

    runtime.sakuraStartFirebaseAuth = bootNow;

    if (/(?:^|\/)profile(?:\/|$)/.test(window.location.pathname)) {
      void bootNow();
      return;
    }

    const handleInteractionStart = () => {
      interactionEvents.forEach((eventName) => {
        window.removeEventListener(eventName, handleInteractionStart);
      });

      if (
        idleCallbackId !== null &&
        "cancelIdleCallback" in window &&
        typeof window.cancelIdleCallback === "function"
      ) {
        window.cancelIdleCallback(idleCallbackId);
      }

      if (idleTimerId) {
        window.clearTimeout(idleTimerId);
      }

      void bootNow();
    };

    interactionEvents.forEach((eventName) => {
      window.addEventListener(eventName, handleInteractionStart, { once: true, passive: true });
    });

    if ("requestIdleCallback" in window && typeof window.requestIdleCallback === "function") {
      idleCallbackId = window.requestIdleCallback(() => {
        void loadRuntime(false);
      }, { timeout: 1500 });
    } else {
      idleTimerId = window.setTimeout(() => {
        void loadRuntime(false);
      }, 1200);
    }

    return () => {
      interactionEvents.forEach((eventName) => {
        window.removeEventListener(eventName, handleInteractionStart);
      });

      if (
        idleCallbackId !== null &&
        "cancelIdleCallback" in window &&
        typeof window.cancelIdleCallback === "function"
      ) {
        window.cancelIdleCallback(idleCallbackId);
      }

      if (idleTimerId) {
        window.clearTimeout(idleTimerId);
      }
    };
  }, []);

  return null;
}
