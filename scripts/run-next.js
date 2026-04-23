const fs = require("fs")
const path = require("path")
const { spawn } = require("child_process")

const mode = process.argv[2]

if (!mode || !["dev", "build"].includes(mode)) {
  console.error("[run-next] usage: node scripts/run-next.js <dev|build>")
  process.exit(1)
}

const root = process.cwd()
const distDir = mode === "dev" ? ".next-dev" : ".next"
const distPath = path.join(root, distDir)

try {
  if (fs.existsSync(distPath)) {
    fs.rmSync(distPath, { recursive: true, force: true })
    console.log(`[run-next] removed ${distDir}`)
  }
} catch (error) {
  console.warn(
    `[run-next] failed to remove ${distDir}:`,
    error && error.message ? error.message : error
  )
}

const nextBin = require.resolve("next/dist/bin/next")
const nextArgs =
  mode === "dev"
    ? [nextBin, "dev", "-H", "0.0.0.0", "-p", "3000"]
    : [nextBin, "build"]

const child = spawn(process.execPath, nextArgs, {
  stdio: "inherit",
  cwd: root,
  env: {
    ...process.env,
    NEXT_DIST_DIR: distDir,
  },
})

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 0)
})
