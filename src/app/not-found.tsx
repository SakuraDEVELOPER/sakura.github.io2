const PROFILE_PATH_STORAGE_KEY = "sakura-profile-path";
const repoBasePath = "/sakura.github.io";
const profileBasePath = `${repoBasePath}/profile`;
const redirectScript = `
  (function () {
    var currentUrl = new URL(window.location.href);
    var legacyProfileMatch = currentUrl.pathname.match(/\\/profile\\/(\\d+)$/);

    if (legacyProfileMatch) {
      var nextProfilePath = ${JSON.stringify(profileBasePath)} + "?profile=" + legacyProfileMatch[1];
      window.sessionStorage.setItem(${JSON.stringify(PROFILE_PATH_STORAGE_KEY)}, nextProfilePath);
      window.location.replace(nextProfilePath);
      return;
    }

    window.location.replace(${JSON.stringify(repoBasePath + "/")});
  })();
`;

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#050505] px-6 text-white">
      <div className="max-w-xl text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.4em] text-[#ffb7c5]">
          Redirecting
        </p>
        <h1 className="mt-4 text-4xl font-black uppercase tracking-tighter text-white">
          Preparing Sakura Route
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-gray-400">
          Если профиль существует, страница будет автоматически восстановлена.
        </p>
      </div>

      <script
        dangerouslySetInnerHTML={{
          __html: redirectScript,
        }}
      />
    </main>
  );
}
