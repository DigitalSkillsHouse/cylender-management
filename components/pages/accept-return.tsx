"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Loader2, PackagePlus, Pencil, RefreshCw, RotateCcw, Trash2 } from "lucide-react"

type AdminUser = { id: string; role: "admin" | "employee"; name: string; email: string }

type Employee = { _id: string; name: string; email: string }
type Product = { _id: string; name: string; category: "gas" | "cylinder"; leastPrice?: number }

type InventoryAvailability = Record<string, { currentStock: number; availableEmpty: number; availableFull: number }>

type AssignItem = {
  key: string
  category: "gas" | "cylinder"
  cylinderStatus: "empty" | "full"
  productId: string
  gasProductId?: string
  cylinderProductId?: string
  quantity: string
  notes?: string
}

type DraftAssignItem = Omit<AssignItem, "key">

type PendingReturn = {
  id: string
  batchId?: string | null
  employeeName: string
  employeeId: string
  productName: string
  productId: string
  stockType: "gas" | "empty" | string
  quantity: number
  returnDate: string
  notes?: string
}

const normalizeLinkedStockName = (value: string) =>
  value
    .toLowerCase()
    .replace(/\b(gas|cylinder|cylinders|empty|full)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")

export function AcceptReturn({ user }: { user: AdminUser }) {
  const createEmptyDraftItem = (): DraftAssignItem => ({
    category: "cylinder",
    cylinderStatus: "empty",
    productId: "",
    quantity: "1",
    notes: "",
  })

  const [activeTab, setActiveTab] = useState<"assign" | "return">("assign")
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string>("")

  const [employees, setEmployees] = useState<Employee[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [inventoryAvailability, setInventoryAvailability] = useState<InventoryAvailability>({})

  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("")
  const [draftItem, setDraftItem] = useState<DraftAssignItem>(createEmptyDraftItem())
  const [items, setItems] = useState<AssignItem[]>([])
  const [editingItemKey, setEditingItemKey] = useState<string | null>(null)

  const [pendingReturns, setPendingReturns] = useState<PendingReturn[]>([])
  const [processingReturns, setProcessingReturns] = useState<Record<string, boolean>>({})
  const [selectedEmptyCylinderByReturnId, setSelectedEmptyCylinderByReturnId] = useState<Record<string, string>>({})

  const fetchInventoryAvailability = async () => {
    const invRes = await fetch("/api/inventory-items", { cache: "no-store" })
    const invJson = await invRes.json().catch(() => ({}))
    const invArr = Array.isArray(invJson?.data) ? invJson.data : []
    const map: InventoryAvailability = {}
    for (const ii of invArr) {
      if (ii?.productId) {
        map[ii.productId] = {
          currentStock: Number(ii.currentStock || 0),
          availableEmpty: Number(ii.availableEmpty || 0),
          availableFull: Number(ii.availableFull || 0),
        }
      }
    }
    setInventoryAvailability(map)
  }

  const fetchData = async () => {
    try {
      setLoading(true)
      setError("")
      const [empRes, prodRes] = await Promise.all([
        fetch("/api/employees", { cache: "no-store" }),
        fetch("/api/products", { cache: "no-store" }),
      ])
      const empJson = await empRes.json().catch(() => ({}))
      const prodJson = await prodRes.json().catch(() => ({}))
      setEmployees(Array.isArray(empJson?.data) ? empJson.data : Array.isArray(empJson) ? empJson : [])
      setProducts(Array.isArray(prodJson?.data) ? prodJson.data : Array.isArray(prodJson) ? prodJson : [])
      await fetchInventoryAvailability()
      await fetchPendingReturns()
    } catch (e: any) {
      setError(e?.message || "Failed to load data")
    } finally {
      setLoading(false)
    }
  }

  const fetchPendingReturns = async () => {
    const res = await fetch(`/api/admin/pending-returns?t=${Date.now()}`, { cache: "no-store" })
    const json = await res.json().catch(() => ({}))
    const list = Array.isArray(json?.pendingReturns) ? json.pendingReturns : []
    setPendingReturns(list)
  }

  useEffect(() => {
    fetchData()
    try {
      const prefill = new URLSearchParams(window.location.search).get("employee")
      if (prefill) {
        setSelectedEmployeeId(prefill)
        setActiveTab("assign")
      }
    } catch (_) {}
  }, [])

  const resetDraftItem = () => {
    setDraftItem(createEmptyDraftItem())
    setEditingItemKey(null)
  }

  const saveDraftItem = () => {
    const qty = Number(draftItem.quantity)
    if (!draftItem.productId) throw new Error("Please select a product")
    if (!qty || qty < 1) throw new Error("Invalid quantity")
    if (draftItem.category === "cylinder" && draftItem.cylinderStatus === "full" && !draftItem.gasProductId) {
      throw new Error("Gas product is required for full cylinder assignments")
    }

    if (editingItemKey) {
      setItems((prev) => prev.map((item) => (item.key === editingItemKey ? { key: editingItemKey, ...draftItem } : item)))
    } else {
      setItems((prev) => [...prev, { key: `row-${Date.now()}-${prev.length + 1}`, ...draftItem }])
    }

    resetDraftItem()
  }

  const editRow = (key: string) => {
    const selectedItem = items.find((item) => item.key === key)
    if (!selectedItem) return

    const { key: _discardedKey, ...itemWithoutKey } = selectedItem
    setDraftItem(itemWithoutKey)
    setEditingItemKey(key)
  }

  const removeRow = (key: string) => {
    setItems((prev) => prev.filter((r) => r.key !== key))
    if (editingItemKey === key) {
      resetDraftItem()
    }
  }

  const updateDraftItem = (patch: Partial<DraftAssignItem>) => {
    setDraftItem((prev) => ({ ...prev, ...patch }))
  }

  const productsByCategory = useMemo(() => {
    const gas = products.filter((p) => p.category === "gas")
    const cyl = products.filter((p) => p.category === "cylinder")
    return { gas, cylinder: cyl }
  }, [products])

  const employeeOptions = useMemo(
    () =>
      employees.map((employee) => ({
        value: employee._id,
        label: `${employee.name} (${employee.email})`,
        keywords: `${employee.name} ${employee.email}`,
      })),
    [employees]
  )

  const assignProductOptions = useMemo(
    () =>
      (draftItem.category === "gas" ? productsByCategory.gas : productsByCategory.cylinder).map((product) => ({
        value: product._id,
        label: product.name,
        keywords: `${product.name} ${product.category}`,
      })),
    [draftItem.category, productsByCategory]
  )

  const gasProductOptions = useMemo(
    () =>
      productsByCategory.gas.map((product) => ({
        value: product._id,
        label: product.name,
        keywords: `${product.name} gas`,
      })),
    [productsByCategory]
  )

  const linkedCylinderOptions = useMemo(
    () =>
      productsByCategory.cylinder.map((product) => ({
        value: product._id,
        label: product.name,
        keywords: `${product.name} cylinder`,
      })),
    [productsByCategory]
  )

  const findBestCylinderProductIdForGas = (gasProductId?: string) => {
    if (!gasProductId) return ""
    const gasProduct = products.find((product) => product._id === gasProductId)
    const normalizedGasName = normalizeLinkedStockName(gasProduct?.name || "")
    if (!normalizedGasName) return ""

    const exactMatch = productsByCategory.cylinder.find(
      (product) => normalizeLinkedStockName(product.name) === normalizedGasName
    )
    if (exactMatch?._id) return exactMatch._id

    const partialMatch = productsByCategory.cylinder.find((product) => {
      const normalizedCylinderName = normalizeLinkedStockName(product.name)
      return (
        !!normalizedCylinderName &&
        (normalizedCylinderName.includes(normalizedGasName) || normalizedGasName.includes(normalizedCylinderName))
      )
    })

    return partialMatch?._id || ""
  }

  const groupedPendingReturns = useMemo(() => {
    const groups: Record<string, PendingReturn[]> = {}
    for (const item of pendingReturns) {
      const key = item.employeeId || item.batchId || item.id
      if (!groups[key]) groups[key] = []
      groups[key].push(item)
    }
    return Object.entries(groups).map(([groupKey, rows]) => ({ groupKey, rows }))
  }, [pendingReturns])

  useEffect(() => {
    if (draftItem.category !== "gas" || !draftItem.productId) return

    const matchedCylinderProductId = findBestCylinderProductIdForGas(draftItem.productId)
    setDraftItem((prev) => {
      if (prev.category !== "gas" || prev.productId !== draftItem.productId) return prev
      const nextCylinderProductId = matchedCylinderProductId || undefined
      if ((prev.cylinderProductId || undefined) === nextCylinderProductId) return prev
      return { ...prev, cylinderProductId: nextCylinderProductId }
    })
  }, [draftItem.category, draftItem.productId, products, productsByCategory.cylinder])

  const submitBatch = async () => {
    setSubmitting(true)
    setError("")
    try {
      if (!selectedEmployeeId) throw new Error("Please select an employee")
      if (editingItemKey) throw new Error("Please update the item you are editing before sending stock")
      if (items.length === 0) throw new Error("Please add at least one item")
      const payloadItems = items.map((r) => {
        const qty = Number(r.quantity)
        if (!r.productId) throw new Error("Please select product for all rows")
        if (!qty || qty < 1) throw new Error("Invalid quantity")
        if (r.category === "cylinder" && r.cylinderStatus === "full" && !r.gasProductId) {
          throw new Error("Gas product is required for full cylinder assignments")
        }
        return {
          category: r.category,
          productId: r.productId,
          quantity: qty,
          cylinderStatus: r.category === "cylinder" ? r.cylinderStatus : undefined,
          gasProductId: r.gasProductId || undefined,
          cylinderProductId: r.cylinderProductId || undefined,
          notes: r.notes || "",
          productName: products.find((p) => p._id === r.productId)?.name || "",
        }
      })

      const res = await fetch("/api/stock-assignments/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: selectedEmployeeId,
          assignedBy: user.id,
          items: payloadItems,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || "Failed to assign stock")

      // Reset
      setItems([])
      resetDraftItem()
      setSelectedEmployeeId("")
      await fetchInventoryAvailability()
      await fetchAdminEmptyCylinderInventory()
    } catch (e: any) {
      setError(e?.message || "Failed to assign stock")
    } finally {
      setSubmitting(false)
    }
  }

  const acceptReturnBatch = async (batchId: string, rows: PendingReturn[]) => {
    setProcessingReturns((p) => ({ ...p, [batchId]: true }))
    setError("")
    try {
      for (const r of rows) {
        const body: any = { returnTransactionId: r.id, adminId: user.id }
        if (r.stockType === "gas") {
          const emptyCylinderInventoryId = selectedEmptyCylinderByReturnId[r.id]
          if (!emptyCylinderInventoryId) throw new Error(`Please select empty cylinder for gas return: ${r.productName}`)
          body.emptyCylinderId = emptyCylinderInventoryId
        }
        const res = await fetch("/api/admin/accept-return", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json?.error || "Failed to accept return")
      }
      await fetchInventoryAvailability()
      await fetchAdminEmptyCylinderInventory()
      await fetchPendingReturns()
    } catch (e: any) {
      setError(e?.message || "Failed to accept return")
    } finally {
      setProcessingReturns((p) => ({ ...p, [batchId]: false }))
    }
  }

  const rejectReturnBatch = async (batchId: string, rows: PendingReturn[]) => {
    setProcessingReturns((p) => ({ ...p, [batchId]: true }))
    setError("")
    try {
      for (const r of rows) {
        const res = await fetch("/api/admin/reject-return", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ returnTransactionId: r.id, adminId: user.id }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json?.error || "Failed to reject return")
      }
      await fetchPendingReturns()
    } catch (e: any) {
      setError(e?.message || "Failed to reject return")
    } finally {
      setProcessingReturns((p) => ({ ...p, [batchId]: false }))
    }
  }

  const [emptyCylinderInventoryList, setEmptyCylinderInventoryList] = useState<Array<{ _id: string; productName: string; availableEmpty: number }>>([])
  const fetchAdminEmptyCylinderInventory = async () => {
    const res = await fetch("/api/inventory-items", { cache: "no-store" })
    const json = await res.json().catch(() => ({}))
    const list = Array.isArray(json?.data) ? json.data : []
    setEmptyCylinderInventoryList(
      list
        .filter((it: any) => Number(it.availableEmpty || 0) > 0)
        .map((it: any) => ({ _id: it._id, productName: it.productName, availableEmpty: Number(it.availableEmpty || 0) }))
    )
  }

  useEffect(() => {
    if (!pendingReturns.length || !emptyCylinderInventoryList.length) return

    setSelectedEmptyCylinderByReturnId((prev) => {
      let changed = false
      const next = { ...prev }

      for (const row of pendingReturns) {
        if (row.stockType !== "gas") continue

        const currentValue = next[row.id]
        const stillValid = currentValue
          ? emptyCylinderInventoryList.some((item) => item._id === currentValue && item.availableEmpty > 0)
          : false

        if (stillValid) continue

        const normalizedGasName = normalizeLinkedStockName(row.productName || "")
        if (!normalizedGasName) continue

        const exactMatch = emptyCylinderInventoryList.find(
          (item) => normalizeLinkedStockName(item.productName) === normalizedGasName
        )
        const partialMatch =
          exactMatch ||
          emptyCylinderInventoryList.find((item) => {
            const normalizedCylinderName = normalizeLinkedStockName(item.productName)
            return (
              !!normalizedCylinderName &&
              (normalizedCylinderName.includes(normalizedGasName) || normalizedGasName.includes(normalizedCylinderName))
            )
          })

        if (partialMatch?._id && partialMatch._id !== currentValue) {
          next[row.id] = partialMatch._id
          changed = true
        }
      }

      return changed ? next : prev
    })
  }, [pendingReturns, emptyCylinderInventoryList])

  useEffect(() => {
    // load cylinders for gas returns selection
    fetchAdminEmptyCylinderInventory().catch(() => {})
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-[#2B3068]" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="pt-6 lg:pt-0 space-y-4 sm:space-y-6">
      <div className="bg-gradient-to-r from-[#2B3068] to-[#1a1f4a] rounded-xl sm:rounded-2xl p-4 sm:p-6 lg:p-8 text-white">
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-2 flex items-center gap-3">
          <RotateCcw className="w-6 h-6 sm:w-8 sm:h-8 lg:w-10 lg:h-10" />
          Assign/Return
        </h1>
        <p className="text-white/80 text-sm sm:text-base lg:text-lg">
          Assign stock to employees and accept/reject returned stock
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
        <TabsList className="grid w-full grid-cols-2 h-auto">
          <TabsTrigger value="assign" className="text-xs sm:text-sm font-medium py-2 sm:py-3">
            Assign Stock
          </TabsTrigger>
          <TabsTrigger value="return" className="text-xs sm:text-sm font-medium py-2 sm:py-3">
            Return Stock
          </TabsTrigger>
        </TabsList>

        <TabsContent value="assign">
          <Card className="border-0 shadow-xl rounded-xl sm:rounded-2xl overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-[#2B3068] to-[#1a1f4a] text-white p-4 sm:p-6">
              <CardTitle className="text-lg sm:text-xl lg:text-2xl font-bold flex items-center gap-2">
                <PackagePlus className="w-5 h-5" />
                Assign Stock (Multiple Items)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 space-y-4">
              <div className="space-y-2">
                <Label>Employee *</Label>
                <SearchableSelect
                  value={selectedEmployeeId}
                  onValueChange={setSelectedEmployeeId}
                  options={employeeOptions}
                  placeholder="Select employee"
                  searchPlaceholder="Search employee..."
                  emptyText="No employee found."
                  triggerClassName="w-full justify-between"
                />
              </div>

              <div className="flex justify-between items-center gap-3">
                <div className="text-sm text-gray-600">Add items, then click Send Stock</div>
                <div className="flex items-center gap-2">
                  {editingItemKey ? (
                    <Button type="button" variant="ghost" onClick={resetDraftItem}>
                      Cancel Edit
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      try {
                        setError("")
                        saveDraftItem()
                      } catch (e: any) {
                        setError(e?.message || "Failed to add item")
                      }
                    }}
                  >
                    {editingItemKey ? "Update Item" : "Add Item"}
                  </Button>
                </div>
              </div>

              <div className="overflow-x-auto border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Category</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Gas (Full)</TableHead>
                      <TableHead>Link Cylinder</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell>
                        <Select
                          value={draftItem.category}
                          onValueChange={(v) =>
                            updateDraftItem({
                              category: v as any,
                              productId: "",
                              gasProductId: undefined,
                              cylinderProductId: undefined,
                              cylinderStatus: v === "gas" ? "empty" : draftItem.cylinderStatus,
                            })
                          }
                        >
                          <SelectTrigger className="w-[140px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="cylinder">Cylinder</SelectItem>
                            <SelectItem value="gas">Gas</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        {draftItem.category === "cylinder" ? (
                          <Select
                            value={draftItem.cylinderStatus}
                            onValueChange={(v) => updateDraftItem({ cylinderStatus: v as any, gasProductId: undefined })}
                          >
                            <SelectTrigger className="w-[120px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="empty">Empty</SelectItem>
                              <SelectItem value="full">Full</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="text-sm text-gray-500">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <SearchableSelect
                          value={draftItem.productId}
                          onValueChange={(v) => updateDraftItem({ productId: v })}
                          options={assignProductOptions}
                          placeholder="Select product"
                          searchPlaceholder="Search product..."
                          emptyText="No product found."
                          triggerClassName="w-[320px] min-h-12 justify-between py-2 [&>span:first-child]:text-xs [&>span:first-child]:leading-snug [&>span:first-child]:text-left [&>span:first-child]:whitespace-normal [&>span:first-child]:break-words"
                        />
                      </TableCell>
                      <TableCell>
                        {draftItem.category === "cylinder" && draftItem.cylinderStatus === "full" ? (
                          <SearchableSelect
                            value={draftItem.gasProductId || ""}
                            onValueChange={(v) => updateDraftItem({ gasProductId: v })}
                            options={gasProductOptions}
                            placeholder="Select gas"
                            searchPlaceholder="Search gas..."
                            emptyText="No gas found."
                            triggerClassName="w-[300px] min-h-12 justify-between py-2 [&>span:first-child]:text-xs [&>span:first-child]:leading-snug [&>span:first-child]:text-left [&>span:first-child]:whitespace-normal [&>span:first-child]:break-words"
                          />
                        ) : (
                          <span className="text-sm text-gray-500">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {draftItem.category === "gas" ? (
                          <SearchableSelect
                            value={draftItem.cylinderProductId || ""}
                            onValueChange={(v) => updateDraftItem({ cylinderProductId: v })}
                            options={linkedCylinderOptions}
                            placeholder="Select cylinder"
                            searchPlaceholder="Search cylinder..."
                            emptyText="No cylinder found."
                            triggerClassName="w-[300px] min-h-12 justify-between py-2 [&>span:first-child]:text-xs [&>span:first-child]:leading-snug [&>span:first-child]:text-left [&>span:first-child]:whitespace-normal [&>span:first-child]:break-words"
                          />
                        ) : (
                          <span className="text-sm text-gray-500">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          className="w-[90px] text-right"
                          value={draftItem.quantity}
                          onChange={(e) => updateDraftItem({ quantity: e.target.value.replace(/[^\d]/g, "") || "" })}
                          inputMode="numeric"
                        />
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>

              {items.length > 0 && (
                <div className="space-y-2">
                  <div className="text-sm font-medium text-gray-700">Added Items</div>
                  <div className="overflow-x-auto border rounded-lg">
                    <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Category</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead>Gas (Full)</TableHead>
                        <TableHead>Link Cylinder</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((r) => (
                        <TableRow key={r.key}>
                          <TableCell className="font-medium capitalize">{r.category}</TableCell>
                          <TableCell>{r.category === "cylinder" ? r.cylinderStatus : "-"}</TableCell>
                          <TableCell>{products.find((p) => p._id === r.productId)?.name || "-"}</TableCell>
                          <TableCell>{products.find((p) => p._id === r.gasProductId)?.name || "-"}</TableCell>
                          <TableCell>{products.find((p) => p._id === r.cylinderProductId)?.name || "-"}</TableCell>
                          <TableCell className="text-right">{r.quantity}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button type="button" size="icon" variant="outline" onClick={() => editRow(r.key)} aria-label="Edit item">
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button
                                type="button"
                                size="icon"
                                variant="outline"
                                className="text-red-600 border-red-200 hover:text-red-700"
                                onClick={() => removeRow(r.key)}
                                aria-label="Delete item"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between">
                <Button type="button" variant="outline" onClick={fetchInventoryAvailability}>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Refresh Stock
                </Button>
                <Button
                  type="button"
                  onClick={submitBatch}
                  disabled={submitting || items.length === 0 || editingItemKey !== null}
                  className="bg-[#2B3068] hover:bg-[#1a1f4a] text-white"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Send Stock
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="return">
          <Card className="border-0 shadow-xl rounded-xl sm:rounded-2xl overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-[#2B3068] to-[#1a1f4a] text-white p-4 sm:p-6">
              <div className="flex items-center justify-between gap-4">
                <CardTitle className="text-lg sm:text-xl lg:text-2xl font-bold">Pending Returns</CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-white/10 hover:bg-white/20 text-white border-white/20"
                  onClick={fetchPendingReturns}
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-6">
              <div className="space-y-4">
                {groupedPendingReturns.map(({ groupKey, rows }) => (
                  <div key={groupKey} className="border rounded-xl overflow-hidden">
                    <div className="flex items-center justify-between gap-4 px-4 py-3 bg-gray-50">
                      <div>
                        <div className="text-sm font-semibold">{rows[0]?.employeeName || "Unknown Employee"}</div>
                        <div className="text-xs text-gray-500">Items: {rows.length}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          className="bg-[#2B3068] hover:bg-[#1a1f4a] text-white"
                          disabled={!!processingReturns[groupKey]}
                          onClick={() => acceptReturnBatch(groupKey, rows)}
                        >
                          {processingReturns[groupKey] ? <Loader2 className="w-4 h-4 animate-spin" /> : "Accept"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!!processingReturns[groupKey]}
                          onClick={() => rejectReturnBatch(groupKey, rows)}
                        >
                          {processingReturns[groupKey] ? <Loader2 className="w-4 h-4 animate-spin" /> : "Reject"}
                        </Button>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Product</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead className="text-right">Qty</TableHead>
                            <TableHead>Empty Cylinder (Gas)</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {rows.map((r) => (
                            <TableRow key={r.id}>
                              <TableCell className="font-medium">{r.productName}</TableCell>
                              <TableCell>{r.stockType}</TableCell>
                              <TableCell className="text-right">{r.quantity}</TableCell>
                              <TableCell>
                                {r.stockType === "gas" ? (
                                  <Select
                                    value={selectedEmptyCylinderByReturnId[r.id] || ""}
                                    onValueChange={(v) =>
                                      setSelectedEmptyCylinderByReturnId((p) => ({ ...p, [r.id]: v }))
                                    }
                                  >
                                    <SelectTrigger className="w-[320px] min-h-12 py-2 [&>span]:text-xs [&>span]:leading-snug [&>span]:whitespace-normal [&>span]:break-words [&>span]:line-clamp-none">
                                      <SelectValue placeholder="Select empty cylinder" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {emptyCylinderInventoryList.map((c) => (
                                        <SelectItem key={c._id} value={c._id}>
                                          {c.productName} (Avail: {c.availableEmpty})
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                ) : (
                                  <span className="text-sm text-gray-500">-</span>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                ))}

                {groupedPendingReturns.length === 0 && (
                  <div className="text-center text-gray-500 py-12">No pending returns</div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
