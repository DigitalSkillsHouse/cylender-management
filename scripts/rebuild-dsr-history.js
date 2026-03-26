const parseArgs = () => {
  const args = {}

  for (const raw of process.argv.slice(2)) {
    if (!raw.startsWith("--")) continue
    const [key, value] = raw.slice(2).split("=")
    args[key] = value ?? "true"
  }

  return args
}

async function main() {
  const args = parseArgs()
  const url = args.url || process.env.DSR_REBUILD_URL || "http://localhost:3000/api/admin/dsr-rebuild"
  const payload = {
    scope: args.scope || "all",
  }

  if (args.employeeId) payload.employeeId = args.employeeId
  if (args.fromDate) payload.fromDate = args.fromDate

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  })

  const result = await response.json().catch(() => ({}))

  if (!response.ok || !result?.success) {
    console.error("DSR rebuild failed")
    console.error(JSON.stringify(result, null, 2))
    process.exit(1)
  }

  console.log("DSR rebuild completed")
  console.log(JSON.stringify(result, null, 2))
}

main().catch((error) => {
  console.error("DSR rebuild script failed:", error)
  process.exit(1)
})
