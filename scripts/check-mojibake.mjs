import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT_DIR = process.cwd();
const TARGET_DIRECTORIES = ["src", "scripts", ".github"];
const TEXT_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".css",
  ".md",
  ".yml",
  ".yaml",
]);
const IGNORE_DIRECTORIES = new Set([
  "node_modules",
  ".next",
  "out",
  ".git",
]);
const IGNORE_FILES = new Set([
  "scripts/check-mojibake.mjs",
]);

// Common mojibake signatures when Cyrillic UTF-8 text is decoded incorrectly.
const MOJIBAKE_PATTERNS = [
  {
    name: "repeated-cyrillic-garble",
    regex: /(Р[^\s]|С[^\s]){3,}/,
  },
  {
    name: "windows-1252-dash-garble",
    regex: /вЂ/,
  },
  {
    name: "times-sign-garble",
    regex: /Г—/,
  },
  {
    name: "middle-dot-garble",
    regex: /В·/,
  },
  {
    name: "replacement-char",
    regex: /�/,
  },
];

const collectFiles = async (directoryPath, files) => {
  let entries;
  try {
    entries = await fs.readdir(directoryPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (IGNORE_DIRECTORIES.has(entry.name)) {
      continue;
    }

    const fullPath = path.join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      await collectFiles(fullPath, files);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const extension = path.extname(entry.name).toLowerCase();
    if (TEXT_EXTENSIONS.has(extension)) {
      files.push(fullPath);
    }
  }
};

const formatSnippet = (line) => {
  const trimmed = line.trim();
  if (trimmed.length <= 160) {
    return trimmed;
  }

  return `${trimmed.slice(0, 157)}...`;
};

const findMojibakeIssues = async () => {
  const files = [];

  for (const directory of TARGET_DIRECTORIES) {
    await collectFiles(path.join(ROOT_DIR, directory), files);
  }

  const issues = [];

  for (const filePath of files) {
    const relativePath = path.relative(ROOT_DIR, filePath);
    if (IGNORE_FILES.has(relativePath.replace(/\\/g, "/"))) {
      continue;
    }
    const content = await fs.readFile(filePath, "utf8");
    const lines = content.split(/\r?\n/);

    lines.forEach((line, index) => {
      for (const pattern of MOJIBAKE_PATTERNS) {
        if (!pattern.regex.test(line)) {
          continue;
        }

        issues.push({
          file: relativePath,
          line: index + 1,
          pattern: pattern.name,
          snippet: formatSnippet(line),
        });
        break;
      }
    });
  }

  return issues;
};

const main = async () => {
  const issues = await findMojibakeIssues();

  if (!issues.length) {
    console.log("Mojibake check passed.");
    return;
  }

  console.error("Mojibake-like text detected:");
  issues.forEach((issue) => {
    console.error(
      `- ${issue.file}:${issue.line} [${issue.pattern}] ${issue.snippet}`
    );
  });
  process.exit(1);
};

await main();
