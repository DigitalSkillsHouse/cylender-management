export type CustomerItemRate = {
  product?: string | { _id?: string }
  rate?: number
}

export type CustomerWithItemRates = {
  _id?: string
  itemRates?: CustomerItemRate[]
}

const toId = (value: unknown) => {
  if (typeof value === "string" || typeof value === "number") return String(value)
  if (value && typeof value === "object" && "_id" in value) {
    const id = (value as { _id?: unknown })._id
    return typeof id === "string" || typeof id === "number" ? String(id) : ""
  }
  return ""
}

export const getCustomerItemRate = (
  customer: CustomerWithItemRates | null | undefined,
  productId: string | null | undefined,
) => {
  if (!customer || !productId) return null

  const matchedRate = (customer.itemRates || []).find((itemRate) => toId(itemRate?.product) === String(productId))
  const rate = Number(matchedRate?.rate)

  return Number.isFinite(rate) && rate >= 0 ? rate : null
}

export const getEffectiveProductRate = ({
  customer,
  productId,
  defaultRate,
}: {
  customer?: CustomerWithItemRates | null
  productId?: string | null
  defaultRate?: number | string | null
}) => {
  const customRate = getCustomerItemRate(customer, productId || "")
  if (customRate !== null) return customRate

  const fallbackRate = Number(defaultRate)
  return Number.isFinite(fallbackRate) && fallbackRate >= 0 ? fallbackRate : 0
}
