import CylinderTransaction from "@/models/Cylinder"
import DailyStockReport from "@/models/DailyStockReport"
import EmpStockEmp from "@/models/EmpStockEmp"
import Product from "@/models/Product"
import PurchaseOrder from "@/models/PurchaseOrder"
import Sale from "@/models/Sale"
import StockAssignment from "@/models/StockAssignment"
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

export const normalizeAdminEntryDate = (value) => {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return value.trim()
  }
  return getLocalDateString()
}

export const getDocumentDateValue = (doc, fieldName) => {
  const explicitDate = doc?.[fieldName]
  if (typeof explicitDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(explicitDate)) {
    return explicitDate
  }
  return getLocalDateStringFromDate(doc?.createdAt || new Date())
}

export const buildAdminDateRangeQuery = (fieldName, fromDate, toDate, createdAtField = "createdAt") => {
  const normalizedFrom = normalizeAdminEntryDate(fromDate)
  const normalizedTo = normalizeAdminEntryDate(toDate)
  const createdAtRange = {
    $gte: getStartOfDate(normalizedFrom),
    $lte: getEndOfDate(normalizedTo),
  }

  return {
    $or: [
      { [fieldName]: { $gte: normalizedFrom, $lte: normalizedTo } },
      { [fieldName]: { $exists: false }, [createdAtField]: createdAtRange },
      { [fieldName]: null, [createdAtField]: createdAtRange },
      { [fieldName]: "", [createdAtField]: createdAtRange },
    ],
  }
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

const ADMIN_DSR_BULK_BATCH_SIZE = 500

const getSaleDateValue = (sale) => getDocumentDateValue(sale, "saleDate")

const getCylinderTransactionDateValue = (transaction) => getDocumentDateValue(transaction, "transactionDate")

const getAssignmentDateValue = (assignment) => {
  if (assignment?.returnedDate) return getLocalDateStringFromDate(assignment.returnedDate)
  if (assignment?.receivedDate) return getLocalDateStringFromDate(assignment.receivedDate)
  if (assignment?.assignedDate) return getLocalDateStringFromDate(assignment.assignedDate)
  return getLocalDateStringFromDate(assignment?.createdAt || new Date())
}

const buildAdminDailyAggregation = (date, groupedData) => {
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

  const salesList = groupedData.salesByDate.get(date) || []
  for (const sale of salesList) {
    for (const item of sale.items || []) {
      const quantity = Number(item.quantity) || 0
      const category = item.category || item.product?.category || ""

      if (quantity <= 0) continue

      if (category === "gas") {
        const key = normalizeName(item.cylinderName || item.cylinderProductId?.name)
        addToMap(gasSales, key, quantity)
      } else if (category === "cylinder") {
        const key = normalizeName(item.product?.name || item.productName)
        if (item.cylinderStatus === "full" || item.cylinderStatus === "full_to_empty") {
          addToMap(fullCylinderSales, key, quantity)
        } else {
          addToMap(emptyCylinderSales, key, quantity)
        }
      }
    }
  }

  const purchaseList = groupedData.purchaseOrdersByDate.get(date) || []
  for (const order of purchaseList) {
    for (const item of order.items || []) {
      if (item.inventoryStatus !== "received") continue

      const quantity = Number(item.quantity) || 0
      if (quantity <= 0) continue

      if (item.purchaseType === "gas") {
        const key = normalizeName(item.emptyCylinderId?.name)
        addToMap(refilled, key, quantity)
      } else if (item.purchaseType === "cylinder") {
        const key = normalizeName(item.product?.name)
        if (item.cylinderStatus === "full") {
          addToMap(fullPurchase, key, quantity)
        } else {
          addToMap(emptyPurchase, key, quantity)
        }
      }
    }
  }

  const cylinderList = groupedData.cylinderTransactionsByDate.get(date) || []
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

  const returnAssignments = groupedData.empStockEmpByDate.get(date) || []
  for (const record of returnAssignments) {
    const category = record.category || record.product?.category || ""
    const quantity = Number(record.assignedQuantity || record.quantity || 0)
    const cylinderStatus = record.cylinderStatus || ""
    const key =
      category === "gas"
        ? normalizeName(record.relatedCylinderName || "")
        : normalizeName(record.productName || record.product?.name)

    if (!key || quantity <= 0) continue

    if (category === "gas") {
      addToMap(receivedGas, key, quantity)
    } else if (category === "cylinder" && (cylinderStatus === "empty" || !cylinderStatus)) {
      addToMap(receivedEmpty, key, quantity)
    }
  }

  for (const assignment of groupedData.stockAssignments || []) {
    const productName = assignment.product?.name || assignment.productName || ""
    const category = assignment.category || assignment.product?.category || ""
    const cylinderStatus = assignment.cylinderStatus || ""
    const quantity = Number(assignment.quantity || assignment.remainingQuantity || 0)
    const status = assignment.status || ""
    const assignedDate = assignment.assignedDate ? getLocalDateStringFromDate(assignment.assignedDate) : ""
    const receivedDate = assignment.receivedDate ? getLocalDateStringFromDate(assignment.receivedDate) : ""
    const returnedDate = assignment.returnedDate ? getLocalDateStringFromDate(assignment.returnedDate) : ""
    const targetKey =
      category === "gas"
        ? normalizeName(assignment.cylinderProductId?.name || assignment.relatedCylinderName || "")
        : normalizeName(productName)

    if (!targetKey || quantity <= 0) continue

    const isTransferDate =
      (status === "received" || status === "active") &&
      ((receivedDate && receivedDate === date) || (!receivedDate && assignedDate && assignedDate === date))

    if (isTransferDate) {
      if (category === "gas") {
        addToMap(transferGas, targetKey, quantity)
      } else if (category === "cylinder") {
        addToMap(transferEmpty, targetKey, quantity)
      }
    }

    if (status === "returned" && (returnedDate === date || receivedDate === date)) {
      if (category === "gas") {
        addToMap(receivedGas, targetKey, quantity)
      } else if (category === "cylinder" && (cylinderStatus === "empty" || !cylinderStatus)) {
        addToMap(receivedEmpty, targetKey, quantity)
      }
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

export async function findAdminDsrRebuildStartDate() {
  const [oldestSale, oldestPurchase, oldestCylinder, oldestAssignment, oldestReturn, oldestSnapshot] = await Promise.all([
    Sale.findOne({}).sort({ saleDate: 1, createdAt: 1 }).select("saleDate createdAt").lean(),
    PurchaseOrder.findOne({}).sort({ purchaseDate: 1, createdAt: 1 }).select("purchaseDate createdAt").lean(),
    CylinderTransaction.findOne({}).sort({ transactionDate: 1, createdAt: 1 }).select("transactionDate createdAt").lean(),
    StockAssignment.findOne({}).sort({ assignedDate: 1, createdAt: 1 }).select("assignedDate createdAt").lean(),
    EmpStockEmp.findOne({ assignmentMethod: "return_transaction", status: "accepted" })
      .sort({ assignmentDate: 1, createdAt: 1 })
      .select("assignmentDate createdAt")
      .lean(),
    DailyStockReport.findOne({
      $or: [{ employeeId: { $exists: false } }, { employeeId: null }],
    })
      .sort({ date: 1, createdAt: 1 })
      .select("date createdAt")
      .lean(),
  ])

  const candidates = [
    oldestSale ? getSaleDateValue(oldestSale) : "",
    oldestPurchase ? getLocalDateStringFromDate(oldestPurchase.purchaseDate || oldestPurchase.createdAt) : "",
    oldestCylinder ? getCylinderTransactionDateValue(oldestCylinder) : "",
    oldestAssignment ? getAssignmentDateValue(oldestAssignment) : "",
    oldestReturn ? getLocalDateStringFromDate(oldestReturn.assignmentDate || oldestReturn.createdAt) : "",
    oldestSnapshot?.date || "",
  ].filter(Boolean)

  if (!candidates.length) {
    return getLocalDateString()
  }

  return candidates.reduce((earliest, candidate) =>
    compareDates(candidate, earliest) < 0 ? candidate : earliest
  )
}

export async function recalculateAdminDailyStockReportsFrom(startDateInput, options = {}) {
  const startDate = normalizeAdminEntryDate(startDateInput)
  const today = getLocalDateString()

  if (compareDates(startDate, today) > 0) {
    return { success: true, updated: 0, startDate, endDate: today }
  }

  const normalizedFilterNames = Array.isArray(options.productNames)
    ? options.productNames.map(normalizeName).filter(Boolean)
    : []

  const cylinderProducts = await Product.find({ category: "cylinder" }).select("name").lean()
  const filteredProducts =
    normalizedFilterNames.length > 0
      ? cylinderProducts.filter((product) => normalizedFilterNames.includes(normalizeName(product.name)))
      : cylinderProducts

  if (!filteredProducts.length) {
    return { success: true, updated: 0, startDate, endDate: today }
  }

  const productNames = filteredProducts.map((product) => product.name)
  const dateList = buildDateList(startDate, today)

  const [historicalClosings, sales, purchaseOrders, cylinderTransactions, empStockEmpReturns, stockAssignments] =
    await Promise.all([
      DailyStockReport.find({
        itemName: { $in: productNames },
        date: { $lt: startDate },
        $or: [{ employeeId: { $exists: false } }, { employeeId: null }],
      })
        .sort({ date: 1 })
        .lean(),
      Sale.find(buildAdminDateRangeQuery("saleDate", startDate, today))
        .populate("items.product", "name category")
        .populate("items.cylinderProductId", "name")
        .lean(),
      PurchaseOrder.find({
        purchaseDate: {
          $gte: getStartOfDate(startDate),
          $lte: getEndOfDate(today),
        },
      })
        .populate("items.product", "name category")
        .populate("items.emptyCylinderId", "name")
        .lean(),
      CylinderTransaction.find(buildAdminDateRangeQuery("transactionDate", startDate, today))
        .populate("product", "name category")
        .lean(),
      EmpStockEmp.find({
        assignmentMethod: "return_transaction",
        status: "accepted",
        assignmentDate: {
          $gte: getStartOfDate(startDate),
          $lte: getEndOfDate(today),
        },
      }).lean(),
      StockAssignment.find({
        $or: [
          { assignedDate: { $gte: getStartOfDate(startDate), $lte: getEndOfDate(today) } },
          { receivedDate: { $gte: getStartOfDate(startDate), $lte: getEndOfDate(today) } },
          { returnedDate: { $gte: getStartOfDate(startDate), $lte: getEndOfDate(today) } },
          { createdAt: { $gte: getStartOfDate(startDate), $lte: getEndOfDate(today) } },
        ],
      })
        .populate("product", "name category")
        .populate("cylinderProductId", "name")
        .lean(),
    ])

  const previousClosings = {}
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
    salesByDate: groupByDate(sales, getSaleDateValue),
    purchaseOrdersByDate: groupByDate(purchaseOrders, (record) =>
      getLocalDateStringFromDate(record.purchaseDate || record.createdAt)
    ),
    cylinderTransactionsByDate: groupByDate(cylinderTransactions, getCylinderTransactionDateValue),
    empStockEmpByDate: groupByDate(empStockEmpReturns, (record) =>
      record.assignmentDate ? getLocalDateStringFromDate(record.assignmentDate) : ""
    ),
    stockAssignments,
  }

  if (!normalizedFilterNames.length) {
    await DailyStockReport.deleteMany({
      date: { $gte: startDate },
      $or: [{ employeeId: { $exists: false } }, { employeeId: null }],
    })
  }

  let updated = 0
  const bulkOperations = []

  for (const date of dateList) {
    const dailyAggregation = buildAdminDailyAggregation(date, groupedData)

    for (const product of filteredProducts) {
      const itemName = product.name
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

      const closingFull = Math.max(
        0,
        openingFull + fullPurchase + refilled - fullCylinderSales - gasSales - transferGas + receivedGas
      )
      const closingEmpty = Math.max(
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
          closingFull
      )

      bulkOperations.push({
        updateOne: {
          filter: { date, itemName },
          update: {
            $set: {
              date,
              itemName,
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

      if (bulkOperations.length >= ADMIN_DSR_BULK_BATCH_SIZE) {
        await DailyStockReport.bulkWrite(bulkOperations, { ordered: false })
        bulkOperations.length = 0
      }
    }
  }

  if (bulkOperations.length > 0) {
    await DailyStockReport.bulkWrite(bulkOperations, { ordered: false })
  }

  return {
    success: true,
    updated,
    startDate,
    endDate: today,
    impactedProducts: productNames,
    sources: {
      sales: sales.length,
      purchases: purchaseOrders.length,
      cylinderTransactions: cylinderTransactions.length,
      acceptedReturns: empStockEmpReturns.length,
      assignments: stockAssignments.length,
    },
  }
}
