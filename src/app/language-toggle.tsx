"use client";

import { setPreferredUiLocale, useUiLocale } from "@/lib/ui-locale";

export default function LanguageToggle() {
  const locale = useUiLocale();

  return (
    <div className="fixed right-4 bottom-4 z-[120]">
      <div className="inline-flex items-center gap-1 rounded-full border border-[#3a2a31] bg-[#120d10]/95 p-1 shadow-[0_0_24px_rgba(255,183,197,0.14)] backdrop-blur">
        <button
          type="button"
          onClick={() => setPreferredUiLocale("ru")}
          className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] transition ${
            locale === "ru"
              ? "bg-[#ffb7c5] text-black"
              : "text-[#ffb7c5] hover:text-white"
          }`}
          aria-label="Switch language to Russian"
        >
          RU
        </button>
        <button
          type="button"
          onClick={() => setPreferredUiLocale("en")}
          className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] transition ${
            locale === "en"
              ? "bg-[#ffb7c5] text-black"
              : "text-[#ffb7c5] hover:text-white"
          }`}
          aria-label="Switch language to English"
        >
          EN
        </button>
      </div>
    </div>
  );
}
