const fs = require("fs")
const path = require("path")

const root = process.cwd()
const targets = [".next", ".next-dev"]

for (const rel of targets) {
  const abs = path.join(root, rel)
  try {
    if (fs.existsSync(abs)) {
      fs.rmSync(abs, { recursive: true, force: true })
      console.log(`[clean] removed ${rel}`)
    }
  } catch (err) {
    console.warn(`[clean] failed to remove ${rel}:`, err && err.message ? err.message : err)
  }
}
