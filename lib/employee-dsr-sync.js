import DailyCylinderTransaction from "@/models/DailyCylinderTransaction"
import DailyRefill from "@/models/DailyRefill"
import EmployeeCylinderTransaction from "@/models/EmployeeCylinderTransaction"
import EmployeeDailyStockReport from "@/models/EmployeeDailyStockReport"
import EmployeeInventoryItem from "@/models/EmployeeInventoryItem"
import EmployeePurchaseOrder from "@/models/EmployeePurchaseOrder"
import EmployeeSale from "@/models/EmployeeSale"
import ReturnTransaction from "@/models/ReturnTransaction"
import StockAssignment from "@/models/StockAssignment"
import User from "@/models/User"
import {
  compareDates,
  getEndOfDate,
  getLocalDateString,
  getLocalDateStringFromDate,
  getNextDate,
  getStartOfDate,
} from "@/lib/date-utils"

const normalizeName = (value) =>
  String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()

const normalizeComparableStockName = (value) =>
  normalizeName(value)
    .replace(/^(gas|cylinder)\s+/i, "")
    .replace(/\bwith gas\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()

export const normalizeEmployeeEntryDate = (value) => {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return value.trim()
  }
  return getLocalDateString()
}

const addToMap = (map, key, value) => {
  if (!key || !value) return
  map[key] = (map[key] || 0) + value
}

const buildDateList = (startDate, endDate) => {
  const dates = []
  let cursor = startDate

  while (compareDates(cursor, endDate) <= 0) {
    dates.push(cursor)
    cursor = getNextDate(cursor)
  }

  return dates
}

const EMPLOYEE_DSR_BULK_BATCH_SIZE = 500

const findMatchingCylinderInventory = (gasItem, cylinderItems = []) => {
  const gasComparableName = normalizeComparableStockName(gasItem?.product?.name || "")
  if (!gasComparableName) return null

  let exactMatch = null
  let partialMatch = null

  for (const cylinderItem of cylinderItems) {
    const cylinderComparableName = normalizeComparableStockName(cylinderItem?.product?.name || "")
    if (!cylinderComparableName) continue

    if (cylinderComparableName === gasComparableName) {
      exactMatch = cylinderItem
      break
    }

    if (
      !partialMatch &&
      (cylinderComparableName.includes(gasComparableName) || gasComparableName.includes(cylinderComparableName))
    ) {
      partialMatch = cylinderItem
    }
  }

  return exactMatch || partialMatch
}

export async function syncEmployeeInventoryGasCylinderParity(employeeId) {
  if (!employeeId) {
    throw new Error("employeeId is required for inventory parity sync")
  }

  const inventoryItems = await EmployeeInventoryItem.find({ employee: employeeId })
    .populate("product", "name category")
    .lean()

  const gasItems = inventoryItems.filter(
    (item) => item?.category === "gas" && item?.product?.name && Number(item.currentStock) > 0
  )
  const cylinderItems = inventoryItems.filter((item) => item?.category === "cylinder" && item?.product?.name)

  const bulkOperations = []
  let updated = 0

  for (const gasItem of gasItems) {
    const cylinderItem = findMatchingCylinderInventory(gasItem, cylinderItems)
    if (!cylinderItem) continue

    const gasStock = Math.max(0, Number(gasItem.currentStock) || 0)
    const currentFull = Math.max(0, Number(cylinderItem.availableFull) || 0)
    const currentEmpty = Math.max(0, Number(cylinderItem.availableEmpty) || 0)

    let targetFull = gasStock
    let targetEmpty = currentEmpty
    let targetGas = gasStock

    if (currentFull < gasStock) {
      const refillFromEmpty = Math.min(gasStock - currentFull, currentEmpty)
      targetFull = currentFull + refillFromEmpty
      targetEmpty = currentEmpty - refillFromEmpty

      if (targetFull < gasStock) {
        targetGas = targetFull
      }
    } else if (currentFull > gasStock) {
      const moveToEmpty = currentFull - gasStock
      targetFull = gasStock
      targetEmpty = currentEmpty + moveToEmpty
    }

    const cylinderNeedsUpdate = targetFull !== currentFull || targetEmpty !== currentEmpty
    const gasNeedsUpdate = targetGas !== gasStock

    if (!cylinderNeedsUpdate && !gasNeedsUpdate) continue

    const now = new Date()

    if (gasNeedsUpdate) {
      bulkOperations.push({
        updateOne: {
          filter: { _id: gasItem._id },
          update: {
            $set: {
              currentStock: targetGas,
              lastUpdatedAt: now,
            },
          },
        },
      })
    }

    if (cylinderNeedsUpdate) {
      bulkOperations.push({
        updateOne: {
          filter: { _id: cylinderItem._id },
          update: {
            $set: {
              availableFull: targetFull,
              availableEmpty: targetEmpty,
              lastUpdatedAt: now,
            },
          },
        },
      })
    }

    updated += 1
  }

  if (bulkOperations.length > 0) {
    await EmployeeInventoryItem.bulkWrite(bulkOperations, { ordered: false })
  }

  return {
    success: true,
    employeeId: String(employeeId),
    updatedPairs: updated,
  }
}

const matchCylinderName = (productName, candidateNames = []) => {
  const normalizedProductName = normalizeName(productName)
  if (!normalizedProductName) return ""

  const firstWord = normalizedProductName.split(" ")[0] || ""

  for (const candidate of candidateNames) {
    const normalizedCandidate = normalizeName(candidate)
    if (!normalizedCandidate) continue

    if (
      normalizedProductName.includes(normalizedCandidate) ||
      normalizedCandidate.includes(normalizedProductName) ||
      (firstWord && normalizedCandidate.includes(firstWord))
    ) {
      return candidate
    }
  }

  return ""
}

const getEmployeeSaleDateValue = (sale) => getLocalDateStringFromDate(sale?.createdAt || new Date())

const getEmployeeCylinderDateValue = (transaction) => getLocalDateStringFromDate(transaction?.createdAt || new Date())

const getEmployeeAssignmentDateValue = (assignment) => {
  if (assignment?.status === "returned" && assignment?.returnedDate) {
    return getLocalDateStringFromDate(assignment.returnedDate)
  }

  let receivedDate = assignment?.receivedDate || assignment?.updatedAt || assignment?.createdAt || ""

  if (assignment?.status === "received" && !receivedDate) {
    receivedDate = assignment?.assignedDate || assignment?.createdAt || ""
  }

  return receivedDate ? getLocalDateStringFromDate(receivedDate) : ""
}

const getEmployeeReturnDateValue = (transaction) =>
  getLocalDateStringFromDate(transaction?.returnDate || transaction?.processedAt || transaction?.createdAt || new Date())

const resolveAssignmentCylinderName = (assignment, candidateNames = []) => {
  const productName = assignment?.product?.name || assignment?.productName || ""
  let category = assignment?.category || assignment?.displayCategory || assignment?.product?.category || ""
  category = String(category || "").toLowerCase()

  if (category === "gas") {
    return (
      assignment?.cylinderProductId?.name ||
      assignment?.relatedCylinderName ||
      matchCylinderName(productName, candidateNames) ||
      ""
    )
  }

  return productName
}

const resolveEmployeeSaleCylinderName = (item, candidateNames = []) =>
  item?.cylinderName ||
  item?.cylinderProductId?.name ||
  matchCylinderName(item?.product?.name || item?.productName || "", candidateNames) ||
  ""

const resolveEmployeeReturnCylinderName = (transaction, candidateNames = []) => {
  if (transaction?.stockType === "gas") {
    return (
      transaction?.cylinderProductId?.name ||
      matchCylinderName(transaction?.product?.name || "", candidateNames) ||
      ""
    )
  }

  return transaction?.product?.name || ""
}

const buildEmployeeRelevantProductNames = ({
  inventoryItems,
  employeeSales,
  employeeCylinderTransactions,
  dailyRefills,
  dailyPurchases,
  stockAssignments,
  returnTransactions,
  existingReports,
}) => {
  const names = new Set()
  const inventoryCylinderNames = inventoryItems.map((item) => item.product?.name || "").filter(Boolean)

  for (const name of inventoryCylinderNames) {
    names.add(name)
  }

  for (const sale of employeeSales) {
    for (const item of sale.items || []) {
      const category = item.category || item.product?.category || ""
      if (category === "gas") {
        const resolved = resolveEmployeeSaleCylinderName(item, inventoryCylinderNames)
        if (resolved) names.add(resolved)
      } else if (category === "cylinder") {
        const resolved = item.product?.name || item.productName || ""
        if (resolved) names.add(resolved)
      }
    }
  }

  for (const transaction of employeeCylinderTransactions) {
    const items = Array.isArray(transaction.items) && transaction.items.length > 0
      ? transaction.items
      : [{
          productId: transaction.product?._id || transaction.product,
          productName: transaction.product?.name || "",
        }]

    for (const item of items) {
      if (item.productName) names.add(item.productName)
    }
  }

  for (const refill of dailyRefills) {
    if (refill?.cylinderName) names.add(refill.cylinderName)
  }

  for (const purchase of dailyPurchases) {
    if (purchase?.cylinderName) names.add(purchase.cylinderName)
  }

  for (const assignment of stockAssignments) {
    const resolved = resolveAssignmentCylinderName(assignment, inventoryCylinderNames)
    if (resolved) names.add(resolved)
  }

  for (const transaction of returnTransactions) {
    const resolved = resolveEmployeeReturnCylinderName(transaction, inventoryCylinderNames)
    if (resolved) names.add(resolved)
  }

  for (const report of existingReports) {
    const reportItemName = report?.itemName || ""
    const normalizedReportName = normalizeName(reportItemName)
    if (!normalizedReportName) continue

    const matchesKnownEmployeeItem = Array.from(names).some(
      (name) => normalizeName(name) === normalizedReportName
    )

    if (matchesKnownEmployeeItem) {
      names.add(reportItemName)
    }
  }

  return Array.from(names).filter(Boolean)
}

const buildEmployeeDailyAggregation = (date, groupedData, candidateNames = []) => {
  const gasSales = {}
  const fullCylinderSales = {}
  const emptyCylinderSales = {}
  const refilled = {}
  const deposits = {}
  const returns = {}
  const transferGas = {}
  const transferEmpty = {}
  const receivedGas = {}
  const receivedEmpty = {}
  const emptyPurchase = {}
  const fullPurchase = {}

  const salesList = groupedData.employeeSalesByDate.get(date) || []
  for (const sale of salesList) {
    for (const item of sale.items || []) {
      const quantity = Number(item.quantity) || 0
      const category = item.category || item.product?.category || ""

      if (quantity <= 0) continue

      if (category === "gas") {
        const key = normalizeName(resolveEmployeeSaleCylinderName(item, candidateNames))
        addToMap(gasSales, key, quantity)
      } else if (category === "cylinder") {
        const key = normalizeName(item.product?.name || item.productName)
        if (item.cylinderStatus === "full") {
          addToMap(fullCylinderSales, key, quantity)
        } else {
          addToMap(emptyCylinderSales, key, quantity)
        }
      }
    }
  }

  const cylinderList = groupedData.employeeCylinderByDate.get(date) || []
  for (const transaction of cylinderList) {
    const items = Array.isArray(transaction.items) && transaction.items.length > 0
      ? transaction.items
      : [{
          productId: transaction.product?._id || transaction.product,
          productName: transaction.product?.name || "",
          quantity: transaction.quantity,
        }]

    for (const item of items) {
      const key = normalizeName(item.productName || transaction.product?.name)
      const quantity = Number(item.quantity) || 0

      if (!key || quantity <= 0) continue

      if (transaction.type === "deposit") {
        addToMap(deposits, key, quantity)
      } else if (transaction.type === "return") {
        addToMap(returns, key, quantity)
      }
    }
  }

  const refillList = groupedData.dailyRefillsByDate.get(date) || []
  for (const record of refillList) {
    const key = normalizeName(record.cylinderName)
    addToMap(refilled, key, Number(record.todayRefill) || 0)
  }

  const purchaseList = groupedData.dailyPurchasesByDate.get(date) || []
  for (const record of purchaseList) {
    const key = normalizeName(record.cylinderName)
    if (!key) continue

    addToMap(emptyPurchase, key, Number(record.emptyCylinderPurchaseQuantity) || 0)
    addToMap(fullPurchase, key, Number(record.fullCylinderPurchaseQuantity) || 0)
  }

  const assignments = groupedData.stockAssignmentsByDate.get(date) || []
  for (const assignment of assignments) {
    let category = assignment.category || assignment.displayCategory || assignment.product?.category || ""
    category = String(category || "").toLowerCase()
    const quantity = Number(assignment.quantity || assignment.remainingQuantity || 0)
    const key = normalizeName(resolveAssignmentCylinderName(assignment, candidateNames))
    const status = String(assignment.status || "").toLowerCase()

    if (!key || quantity <= 0 || !["received", "returned"].includes(status)) continue

    if (status === "received") {
      if (category === "gas") {
        addToMap(receivedGas, key, quantity)
      } else {
        addToMap(receivedEmpty, key, quantity)
      }
    } else if (status === "returned") {
      if (category === "gas") {
        addToMap(transferGas, key, quantity)
      } else {
        addToMap(transferEmpty, key, quantity)
      }
    }
  }

  const returnTransactions = groupedData.returnTransactionsByDate.get(date) || []
  for (const transaction of returnTransactions) {
    const quantity = Number(transaction.quantity) || 0
    const key = normalizeName(resolveEmployeeReturnCylinderName(transaction, candidateNames))

    if (!key || quantity <= 0) continue

    if (transaction.stockType === "gas") {
      addToMap(transferGas, key, quantity)
    } else {
      addToMap(transferEmpty, key, quantity)
    }
  }

  return {
    gasSales,
    fullCylinderSales,
    emptyCylinderSales,
    refilled,
    deposits,
    returns,
    transferGas,
    transferEmpty,
    receivedGas,
    receivedEmpty,
    emptyPurchase,
    fullPurchase,
  }
}

export async function findEmployeeIdsForDsrRebuild() {
  const [users, inventoryEmployees, assignmentEmployees, saleEmployees, cylinderEmployees, returnEmployees] = await Promise.all([
    User.find({ role: "employee" }).select("_id").lean(),
    EmployeeInventoryItem.distinct("employee", {}),
    StockAssignment.distinct("employee", {}),
    EmployeeSale.distinct("employee", {}),
    EmployeeCylinderTransaction.distinct("employee", {}),
    ReturnTransaction.distinct("employee", {}),
  ])

  return Array.from(
    new Set(
      [
        ...users.map((user) => String(user._id)),
        ...inventoryEmployees.map(String),
        ...assignmentEmployees.map(String),
        ...saleEmployees.map(String),
        ...cylinderEmployees.map(String),
        ...returnEmployees.map(String),
      ].filter(Boolean)
    )
  )
}

export async function findEmployeeDsrRebuildStartDate(employeeId) {
  const filterEmployee = employeeId ? { employee: employeeId } : {}
  const filterEmployeeId = employeeId ? { employeeId } : {}
  const filterReport = employeeId ? { employeeId } : {}

  const [oldestSale, oldestCylinder, oldestRefill, oldestPurchase, oldestAssignment, oldestReturn, oldestSnapshot, oldestEmployeePurchase] =
    await Promise.all([
      EmployeeSale.findOne(filterEmployee).sort({ createdAt: 1 }).select("createdAt").lean(),
      EmployeeCylinderTransaction.findOne(filterEmployee).sort({ createdAt: 1 }).select("createdAt").lean(),
      DailyRefill.findOne(filterEmployeeId).sort({ date: 1, createdAt: 1 }).select("date createdAt").lean(),
      DailyCylinderTransaction.findOne(filterEmployeeId).sort({ date: 1, createdAt: 1 }).select("date createdAt").lean(),
      StockAssignment.findOne(employeeId ? { employee: employeeId } : {})
        .sort({ returnedDate: 1, receivedDate: 1, assignedDate: 1, createdAt: 1 })
        .select("returnedDate receivedDate assignedDate createdAt status")
        .lean(),
      ReturnTransaction.findOne(
        employeeId
          ? { employee: employeeId, status: { $in: ["pending", "received"] } }
          : { status: { $in: ["pending", "received"] } }
      )
        .sort({ returnDate: 1, createdAt: 1 })
        .select("returnDate createdAt")
        .lean(),
      EmployeeDailyStockReport.findOne(filterReport).sort({ date: 1, createdAt: 1 }).select("date createdAt").lean(),
      EmployeePurchaseOrder.findOne(employeeId ? { employee: employeeId } : {})
        .sort({ purchaseDate: 1, createdAt: 1 })
        .select("purchaseDate createdAt")
        .lean(),
    ])

  const candidates = [
    oldestSale ? getEmployeeSaleDateValue(oldestSale) : "",
    oldestCylinder ? getEmployeeCylinderDateValue(oldestCylinder) : "",
    oldestRefill?.date || "",
    oldestPurchase?.date || "",
    oldestAssignment ? getEmployeeAssignmentDateValue(oldestAssignment) : "",
    oldestReturn ? getEmployeeReturnDateValue(oldestReturn) : "",
    oldestSnapshot?.date || "",
    oldestEmployeePurchase ? getLocalDateStringFromDate(oldestEmployeePurchase.purchaseDate || oldestEmployeePurchase.createdAt) : "",
  ].filter(Boolean)

  if (!candidates.length) {
    return getLocalDateString()
  }

  return candidates.reduce((earliest, candidate) =>
    compareDates(candidate, earliest) < 0 ? candidate : earliest
  )
}

export async function recalculateEmployeeDailyStockReportsFrom(employeeId, startDateInput) {
  const startDate = normalizeEmployeeEntryDate(startDateInput)
  const today = getLocalDateString()

  if (!employeeId) {
    throw new Error("employeeId is required for employee DSR rebuild")
  }

  if (compareDates(startDate, today) > 0) {
    return { success: true, updated: 0, startDate, endDate: today, employeeId: String(employeeId) }
  }

  await syncEmployeeInventoryGasCylinderParity(employeeId)

  const dateList = buildDateList(startDate, today)

  const [
    historicalClosings,
    inventoryItems,
    employeeSales,
    employeeCylinderTransactions,
    dailyRefills,
    dailyPurchases,
    stockAssignments,
    returnTransactions,
    existingReports,
  ] = await Promise.all([
    EmployeeDailyStockReport.find({ employeeId, date: { $lt: startDate } }).sort({ date: 1 }).lean(),
    EmployeeInventoryItem.find({ employee: employeeId, category: "cylinder" })
      .populate("product", "name category")
      .lean(),
    EmployeeSale.find({
      employee: employeeId,
      createdAt: {
        $gte: getStartOfDate(startDate),
        $lte: getEndOfDate(today),
      },
    })
      .populate("items.product", "name category")
      .populate({ path: "items.cylinderProductId", select: "name", strictPopulate: false })
      .lean(),
    EmployeeCylinderTransaction.find({
      employee: employeeId,
      createdAt: {
        $gte: getStartOfDate(startDate),
        $lte: getEndOfDate(today),
      },
    })
      .populate("product", "name category")
      .lean(),
    DailyRefill.find({
      employeeId,
      date: { $gte: startDate, $lte: today },
    }).lean(),
    DailyCylinderTransaction.find({
      employeeId,
      date: { $gte: startDate, $lte: today },
      isEmployeeTransaction: true,
    }).lean(),
    StockAssignment.find({
      employee: employeeId,
      status: { $in: ["received", "returned"] },
      $or: [
        { returnedDate: { $gte: getStartOfDate(startDate), $lte: getEndOfDate(today) } },
        { receivedDate: { $gte: getStartOfDate(startDate), $lte: getEndOfDate(today) } },
        { assignedDate: { $gte: getStartOfDate(startDate), $lte: getEndOfDate(today) } },
        { updatedAt: { $gte: getStartOfDate(startDate), $lte: getEndOfDate(today) } },
        { createdAt: { $gte: getStartOfDate(startDate), $lte: getEndOfDate(today) } },
      ],
    })
      .populate("product", "name category")
      .populate({ path: "cylinderProductId", select: "name", strictPopulate: false })
      .lean(),
    ReturnTransaction.find({
      employee: employeeId,
      status: { $in: ["pending", "received"] },
      returnDate: {
        $gte: getStartOfDate(startDate),
        $lte: getEndOfDate(today),
      },
    })
      .populate("product", "name category")
      .populate({ path: "cylinderProductId", select: "name", strictPopulate: false })
      .lean(),
    EmployeeDailyStockReport.find({
      employeeId,
      date: { $gte: startDate, $lte: today },
    })
      .select("itemName date")
      .lean(),
  ])

  const relevantProductNames = buildEmployeeRelevantProductNames({
    inventoryItems,
    employeeSales,
    employeeCylinderTransactions,
    dailyRefills,
    dailyPurchases,
    stockAssignments,
    returnTransactions,
    existingReports,
  })

  const previousClosings = {}
  const currentInventoryByName = {}

  for (const inventoryItem of inventoryItems) {
    const key = normalizeName(inventoryItem?.product?.name)
    if (!key) continue

    currentInventoryByName[key] = {
      availableFull: Math.max(0, Number(inventoryItem.availableFull) || 0),
      availableEmpty: Math.max(0, Number(inventoryItem.availableEmpty) || 0),
    }
  }

  for (const report of historicalClosings) {
    const key = normalizeName(report.itemName)
    if (!key) continue

    previousClosings[key] = {
      closingFull: Number(report.closingFull) || 0,
      closingEmpty: Number(report.closingEmpty) || 0,
      date: report.date,
    }
  }

  const groupByDate = (records, getDate) => {
    const map = new Map()

    for (const record of records) {
      const date = getDate(record)
      if (!date) continue

      const list = map.get(date) || []
      list.push(record)
      map.set(date, list)
    }

    return map
  }

  const groupedData = {
    employeeSalesByDate: groupByDate(employeeSales, getEmployeeSaleDateValue),
    employeeCylinderByDate: groupByDate(employeeCylinderTransactions, getEmployeeCylinderDateValue),
    dailyRefillsByDate: groupByDate(dailyRefills, (record) => record.date),
    dailyPurchasesByDate: groupByDate(dailyPurchases, (record) => record.date),
    stockAssignmentsByDate: groupByDate(stockAssignments, getEmployeeAssignmentDateValue),
    returnTransactionsByDate: groupByDate(returnTransactions, getEmployeeReturnDateValue),
  }

  await EmployeeDailyStockReport.deleteMany({
    employeeId,
    date: { $gte: startDate },
  })

  let updated = 0
  const bulkOperations = []

  for (const date of dateList) {
    const dailyAggregation = buildEmployeeDailyAggregation(date, groupedData, relevantProductNames)

    for (const itemName of relevantProductNames) {
      const key = normalizeName(itemName)
      const openingFull = previousClosings[key]?.closingFull || 0
      const openingEmpty = previousClosings[key]?.closingEmpty || 0

      const fullPurchase = dailyAggregation.fullPurchase[key] || 0
      const emptyPurchase = dailyAggregation.emptyPurchase[key] || 0
      const refilled = dailyAggregation.refilled[key] || 0
      const fullCylinderSales = dailyAggregation.fullCylinderSales[key] || 0
      const emptyCylinderSales = dailyAggregation.emptyCylinderSales[key] || 0
      const gasSales = dailyAggregation.gasSales[key] || 0
      const deposits = dailyAggregation.deposits[key] || 0
      const returns = dailyAggregation.returns[key] || 0
      const transferGas = dailyAggregation.transferGas[key] || 0
      const transferEmpty = dailyAggregation.transferEmpty[key] || 0
      const receivedGas = dailyAggregation.receivedGas[key] || 0
      const receivedEmpty = dailyAggregation.receivedEmpty[key] || 0

      const calculatedClosingFull = Math.max(
        0,
        openingFull + fullPurchase + refilled - fullCylinderSales - gasSales - transferGas + receivedGas
      )
      const calculatedClosingEmpty = Math.max(
        0,
        openingFull +
          openingEmpty +
          fullPurchase +
          emptyPurchase -
          fullCylinderSales -
          emptyCylinderSales -
          deposits +
          returns -
          transferEmpty +
          receivedEmpty -
          calculatedClosingFull
      )

      const currentInventory = date === today ? currentInventoryByName[key] : null
      const closingFull = currentInventory ? currentInventory.availableFull : calculatedClosingFull
      const closingEmpty = currentInventory ? currentInventory.availableEmpty : calculatedClosingEmpty

      bulkOperations.push({
        updateOne: {
          filter: { employeeId, itemName, date },
          update: {
            $set: {
              employeeId,
              itemName,
              date,
              openingFull,
              openingEmpty,
              emptyPurchase,
              fullPurchase,
              refilled,
              fullCylinderSales,
              emptyCylinderSales,
              cylinderSales: fullCylinderSales + emptyCylinderSales,
              gasSales,
              deposits,
              returns,
              transferGas,
              transferEmpty,
              receivedGas,
              receivedEmpty,
              closingFull,
              closingEmpty,
            },
          },
          upsert: true,
        },
      })

      previousClosings[key] = { closingFull, closingEmpty, date }
      updated += 1

      if (bulkOperations.length >= EMPLOYEE_DSR_BULK_BATCH_SIZE) {
        await EmployeeDailyStockReport.bulkWrite(bulkOperations, { ordered: false })
        bulkOperations.length = 0
      }
    }
  }

  if (bulkOperations.length > 0) {
    await EmployeeDailyStockReport.bulkWrite(bulkOperations, { ordered: false })
  }

  return {
    success: true,
    updated,
    startDate,
    endDate: today,
    employeeId: String(employeeId),
    impactedProducts: relevantProductNames,
    sources: {
      sales: employeeSales.length,
      cylinderTransactions: employeeCylinderTransactions.length,
      refills: dailyRefills.length,
      purchases: dailyPurchases.length,
      assignments: stockAssignments.length,
      returnTransactions: returnTransactions.length,
    },
  }
}
