import fs from "node:fs/promises";

export function utcNow() {
  return new Date().toISOString();
}

export async function pathExists(pathname: string) {
  try {
    await fs.access(pathname);
    return true;
  } catch {
    return false;
  }
}

export async function readJson(pathname: string, fallback: unknown = null): Promise<any> {
  try {
    return JSON.parse(await fs.readFile(pathname, "utf8"));
  } catch (error) {
    if (fallback !== null && (error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
}

export async function writeJson(pathname: string, value: unknown) {
  const tempPath = `${pathname}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(tempPath, pathname);
}

export function normalizeQueryValue(value: unknown, fallback = ""): string {
  if (Array.isArray(value)) return value[0] || fallback;
  return (value as string) || fallback;
}
