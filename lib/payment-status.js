const roundToTwo = (value) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return 0
  }

  return Math.trunc(Number(value) * 100) / 100
}

export const PAYMENT_CLEAR_TOLERANCE = 0.05

export function normalizeSalePaymentState(input = {}) {
  const totalAmount = roundToTwo(input.totalAmount || 0)
  const rawReceivedAmount = Math.max(0, roundToTwo(input.receivedAmount || 0))
  const rawStatus = String(input.paymentStatus || "").toLowerCase()

  if (totalAmount <= 0) {
    return {
      totalAmount,
      receivedAmount: rawReceivedAmount,
      balance: 0,
      paymentStatus: "cleared",
      isPending: false,
      isCleared: true,
    }
  }

  let receivedAmount = Math.min(rawReceivedAmount, totalAmount)
  let balance = roundToTwo(Math.max(0, totalAmount - receivedAmount))

  if (balance <= PAYMENT_CLEAR_TOLERANCE) {
    receivedAmount = totalAmount
    balance = 0
  }

  const paymentStatus = balance === 0 ? "cleared" : rawStatus === "overdue" ? "overdue" : "pending"

  return {
    totalAmount,
    receivedAmount,
    balance,
    paymentStatus,
    isPending: paymentStatus !== "cleared",
    isCleared: paymentStatus === "cleared",
  }
}
