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
import { Loader2, Package, Pencil, Send, Trash2 } from "lucide-react"

type User = { id: string; role: "admin" | "employee"; name: string; email: string }

type StockAssignmentRow = {
  _id: string
  batchId?: string | null
  product?: { name?: string; category?: string }
  productName?: string
  category?: string
  cylinderStatus?: string
  cylinderProductId?: string | { _id?: string; name?: string; category?: string } | null
  quantity?: number
  assignedDate?: string
  createdAt?: string
}

type EmployeeInventoryRow = {
  _id: string
  product?: { _id: string; name: string; category: string }
  productId?: string | null
  productName?: string
  category: string
  currentStock?: number
  availableEmpty?: number
  availableFull?: number
}

type ReturnItemRow = {
  key: string
  stockType: "gas" | "empty"
  itemId: string
  cylinderProductId?: string
  quantity: string
}

type DraftReturnItemRow = Omit<ReturnItemRow, "key">

export function EmployeeStock({ user }: { user: User }) {
  const createEmptyReturnDraft = (): DraftReturnItemRow => ({
    stockType: "empty",
    itemId: "",
    quantity: "1",
  })

  const [activeTab, setActiveTab] = useState<"assigned" | "return">("assigned")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>("")

  const [pendingAssignments, setPendingAssignments] = useState<StockAssignmentRow[]>([])
  const [processingBatch, setProcessingBatch] = useState<Record<string, boolean>>({})
  const [selectedEmptyCylinderByAssignmentId, setSelectedEmptyCylinderByAssignmentId] = useState<Record<string, string>>({})

  const [inventory, setInventory] = useState<EmployeeInventoryRow[]>([])
  const [draftReturnItem, setDraftReturnItem] = useState<DraftReturnItemRow>(createEmptyReturnDraft())
  const [returnItems, setReturnItems] = useState<ReturnItemRow[]>([])
  const [editingReturnItemKey, setEditingReturnItemKey] = useState<string | null>(null)
  const [sendingReturn, setSendingReturn] = useState(false)

  const fetchAssignments = async () => {
    const res = await fetch(`/api/stock-assignments?employeeId=${user.id}&status=assigned&t=${Date.now()}`, {
      cache: "no-store",
    })
    const json = await res.json().catch(() => ({}))
    const list = Array.isArray(json?.data) ? json.data : []
    setPendingAssignments(list)
  }

  const fetchInventory = async () => {
    const res = await fetch(`/api/employee-inventory-new/received?employeeId=${user.id}&t=${Date.now()}`, { cache: "no-store" })
    const json = await res.json().catch(() => ({}))
    const list = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : []
    setInventory(list)
  }

  const fetchData = async () => {
    try {
      setLoading(true)
      setError("")
      await Promise.all([fetchAssignments(), fetchInventory()])
    } catch (e: any) {
      setError(e?.message || "Failed to load data")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const groupedAssignments = useMemo(() => {
    const groups: Record<string, StockAssignmentRow[]> = {}
    for (const a of pendingAssignments) {
      const key = (a.batchId || a._id || "single").toString()
      if (!groups[key]) groups[key] = []
      groups[key].push(a)
    }
    return Object.entries(groups).map(([batchId, rows]) => ({ batchId, rows }))
  }, [pendingAssignments])

  const acceptBatch = async (batchId: string, rows: StockAssignmentRow[]) => {
    setProcessingBatch((p) => ({ ...p, [batchId]: true }))
    setError("")
    try {
      for (const a of rows) {
        const emptyCylinderId = isGasAssignment(a) ? selectedEmptyCylinderByAssignmentId[String(a._id)] : undefined
        if (isGasAssignment(a) && !emptyCylinderId) {
          throw new Error(`Please verify/select empty cylinder for gas item: ${getAssignmentProductName(a)}`)
        }

        const res = await fetch(`/api/stock-assignments/${a._id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: "received",
            createEmployeeInventory: true,
            employeeId: user.id,
            emptyCylinderId,
          }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json?.error || "Failed to accept assignment")
      }
      await fetchData()
      // Refresh notifications badge
      window.dispatchEvent(new Event("notification-refresh"))
      window.dispatchEvent(new Event("employee-dsr-refresh"))
    } catch (e: any) {
      setError(e?.message || "Failed to accept batch")
    } finally {
      setProcessingBatch((p) => ({ ...p, [batchId]: false }))
    }
  }

  const rejectBatch = async (batchId: string, rows: StockAssignmentRow[]) => {
    setProcessingBatch((p) => ({ ...p, [batchId]: true }))
    setError("")
    try {
      for (const a of rows) {
        const res = await fetch(`/api/stock-assignments/${a._id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "rejected", employeeId: user.id }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json?.error || "Failed to reject assignment")
      }
      await fetchData()
      window.dispatchEvent(new Event("notification-refresh"))
    } catch (e: any) {
      setError(e?.message || "Failed to reject batch")
    } finally {
      setProcessingBatch((p) => ({ ...p, [batchId]: false }))
    }
  }

  const gasInventory = useMemo(() => inventory.filter((i) => i.category === "gas" && (i.currentStock || 0) > 0), [inventory])
  const cylinderInventory = useMemo(() => inventory.filter((i) => i.category === "cylinder"), [inventory])
  const emptyCylinderItems = useMemo(() => cylinderInventory.filter((i) => (i.availableEmpty || 0) > 0), [cylinderInventory])
  const fullCylinderItems = useMemo(() => cylinderInventory.filter((i) => (i.availableFull || 0) > 0), [cylinderInventory])
  const fullCylinderSelectOptions = useMemo(
    () => fullCylinderItems.filter((item) => !!(item.product?._id || item.productId)),
    [fullCylinderItems]
  )
  const availableReturnInventory = draftReturnItem.stockType === "gas" ? gasInventory : emptyCylinderItems
  const selectedReturnItemValue = availableReturnInventory.some((item) => item._id === draftReturnItem.itemId) ? draftReturnItem.itemId : ""
  const selectedFullCylinderValue = fullCylinderSelectOptions.some((item) => (item.product?._id || item.productId) === draftReturnItem.cylinderProductId)
    ? draftReturnItem.cylinderProductId || ""
    : ""

  const getInventoryItemName = (item?: EmployeeInventoryRow | null) => item?.product?.name || item?.productName || "-"
  const getAssignmentProductName = (assignment?: StockAssignmentRow | null) => assignment?.product?.name || assignment?.productName || "-"

  const getAssignmentCylinderProductId = (assignment?: StockAssignmentRow | null) => {
    const raw = assignment?.cylinderProductId
    if (!raw) return ""
    if (typeof raw === "string") return raw
    return raw._id || ""
  }

  const isGasAssignment = (assignment?: StockAssignmentRow | null) =>
    (assignment?.category || assignment?.product?.category || "").toLowerCase() === "gas"

  const emptyCylinderOptions = useMemo(
    () =>
      emptyCylinderItems.map((item) => ({
        value: item._id,
        label: `${getInventoryItemName(item)} (Empty: ${Number(item.availableEmpty || 0)})`,
        keywords: `${getInventoryItemName(item)} empty cylinder ${item.product?.name || ""} ${item.productName || ""}`,
      })),
    [emptyCylinderItems]
  )

  const returnItemOptions = useMemo(
    () =>
      availableReturnInventory.map((item) => ({
        value: item._id,
        label: `${getInventoryItemName(item)} ${
          draftReturnItem.stockType === "gas"
            ? `(Gas: ${Number(item.currentStock || 0)})`
            : `(Empty: ${Number(item.availableEmpty || 0)})`
        }`,
        keywords: `${getInventoryItemName(item)} ${item.category} ${item.product?.name || ""} ${item.productName || ""}`,
      })),
    [availableReturnInventory, draftReturnItem.stockType]
  )

  const fullCylinderOptions = useMemo(
    () =>
      fullCylinderSelectOptions.map((item) => ({
        value: item.product?._id || item.productId || item._id || "",
        label: `${getInventoryItemName(item)} (Full: ${Number(item.availableFull || 0)})`,
        keywords: `${getInventoryItemName(item)} cylinder full ${item.product?.name || ""} ${item.productName || ""}`,
      })),
    [fullCylinderSelectOptions]
  )

  const normalizeName = (value?: string | null) => (value || "").toLowerCase().replace(/\s+/g, " ").trim()

  const removeFirstWord = (value?: string | null) => {
    const words = (value || "").trim().split(/\s+/).filter(Boolean)
    return words.length > 1 ? words.slice(1).join(" ") : words[0] || ""
  }

  const findMatchingEmptyCylinderInventoryId = (assignment?: StockAssignmentRow | null) => {
    if (!assignment || !isGasAssignment(assignment)) return ""

    const linkedCylinderProductId = getAssignmentCylinderProductId(assignment)
    if (linkedCylinderProductId) {
      const exactInventoryMatch = emptyCylinderItems.find(
        (item) => (item.product?._id || item.productId || "") === linkedCylinderProductId
      )
      if (exactInventoryMatch?._id) return exactInventoryMatch._id
    }

    const assignmentBaseName = normalizeName(removeFirstWord(getAssignmentProductName(assignment)))
    if (!assignmentBaseName) return ""

    const exactNameMatch = emptyCylinderItems.find(
      (item) => normalizeName(removeFirstWord(getInventoryItemName(item))) === assignmentBaseName
    )
    if (exactNameMatch?._id) return exactNameMatch._id

    const partialNameMatch = emptyCylinderItems.find((item) => {
      const cylinderBaseName = normalizeName(removeFirstWord(getInventoryItemName(item)))
      return !!cylinderBaseName && (
        cylinderBaseName.includes(assignmentBaseName) || assignmentBaseName.includes(cylinderBaseName)
      )
    })

    return partialNameMatch?._id || ""
  }

  useEffect(() => {
    if (!pendingAssignments.length || !emptyCylinderItems.length) return

    setSelectedEmptyCylinderByAssignmentId((prev) => {
      let changed = false
      const next = { ...prev }

      for (const assignment of pendingAssignments) {
        if (!isGasAssignment(assignment)) continue

        const assignmentId = String(assignment._id)
        const currentValue = next[assignmentId]
        const isStillValid = currentValue
          ? emptyCylinderItems.some((item) => item._id === currentValue && Number(item.availableEmpty || 0) > 0)
          : false

        if (isStillValid) continue

        const autoSelectedId = findMatchingEmptyCylinderInventoryId(assignment)
        if (autoSelectedId && autoSelectedId !== currentValue) {
          next[assignmentId] = autoSelectedId
          changed = true
        }
      }

      return changed ? next : prev
    })
  }, [pendingAssignments, emptyCylinderItems])

  const findRelatedCylinderProductId = (gasInventoryItemId: string) => {
    const selectedGasItem = gasInventory.find((item) => item._id === gasInventoryItemId)
    if (!selectedGasItem) return undefined

    const gasBaseName = normalizeName(removeFirstWord(getInventoryItemName(selectedGasItem)))
    if (!gasBaseName) return undefined

    const exactCylinder = fullCylinderSelectOptions.find((item) => normalizeName(removeFirstWord(getInventoryItemName(item))) === gasBaseName)
    if (exactCylinder) return exactCylinder.product?._id || exactCylinder.productId || undefined

    const partialCylinder = fullCylinderSelectOptions.find((item) => {
      const cylinderBaseName = normalizeName(removeFirstWord(getInventoryItemName(item)))
      return cylinderBaseName.includes(gasBaseName) || gasBaseName.includes(cylinderBaseName)
    })

    return partialCylinder?.product?._id || partialCylinder?.productId || undefined
  }

  const resetReturnDraft = () => {
    setDraftReturnItem(createEmptyReturnDraft())
    setEditingReturnItemKey(null)
  }

  const saveReturnDraft = () => {
    const qty = Number(draftReturnItem.quantity)
    if (!draftReturnItem.itemId) throw new Error("Select an inventory item")
    if (!qty || qty < 1) throw new Error("Invalid quantity")
    if (draftReturnItem.stockType === "gas" && !draftReturnItem.cylinderProductId) {
      throw new Error("Select cylinder for gas return")
    }

    if (editingReturnItemKey) {
      setReturnItems((prev) =>
        prev.map((item) => (item.key === editingReturnItemKey ? { key: editingReturnItemKey, ...draftReturnItem } : item))
      )
    } else {
      setReturnItems((prev) => [...prev, { key: `r-${Date.now()}-${prev.length + 1}`, ...draftReturnItem }])
    }

    resetReturnDraft()
  }

  const editReturnRow = (key: string) => {
    const selectedItem = returnItems.find((item) => item.key === key)
    if (!selectedItem) return

    const { key: _discardedKey, ...itemWithoutKey } = selectedItem
    setDraftReturnItem(itemWithoutKey)
    setEditingReturnItemKey(key)
  }

  const removeReturnRow = (key: string) => {
    setReturnItems((prev) => prev.filter((r) => r.key !== key))
    if (editingReturnItemKey === key) {
      resetReturnDraft()
    }
  }

  const updateReturnDraft = (patch: Partial<DraftReturnItemRow>) => {
    setDraftReturnItem((prev) => ({ ...prev, ...patch }))
  }

  const sendReturnBatch = async () => {
    setSendingReturn(true)
    setError("")
    try {
      if (editingReturnItemKey) throw new Error("Please update the item you are editing before sending return")
      if (returnItems.length === 0) throw new Error("Please add at least one item")
      const payloadItems = returnItems.map((r) => {
        const qty = Number(r.quantity)
        if (!r.itemId) throw new Error("Select inventory item for all rows")
        if (!qty || qty < 1) throw new Error("Invalid quantity")
        if (r.stockType === "gas" && !r.cylinderProductId) throw new Error("Select cylinder for gas return")
        return { itemId: r.itemId, stockType: r.stockType, quantity: qty, cylinderProductId: r.cylinderProductId }
      })

      const res = await fetch("/api/employee-inventory-new/send-back-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId: user.id, items: payloadItems }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || "Failed to send return")

      setReturnItems([])
      resetReturnDraft()
      await fetchData()
      window.dispatchEvent(new Event("notification-refresh"))
      window.dispatchEvent(new Event("pendingReturnsRefresh"))
      window.dispatchEvent(new Event("employee-dsr-refresh"))
    } catch (e: any) {
      setError(e?.message || "Failed to send return")
    } finally {
      setSendingReturn(false)
    }
  }

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
          <Package className="w-6 h-6 sm:w-8 sm:h-8 lg:w-10 lg:h-10" />
          Assigned/Return
        </h1>
        <p className="text-white/80 text-sm sm:text-base lg:text-lg">Accept/Reject assigned stock and return stock to admin</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
        <TabsList className="grid w-full grid-cols-2 h-auto">
          <TabsTrigger value="assigned" className="text-xs sm:text-sm font-medium py-2 sm:py-3">
            Assigned Stock
          </TabsTrigger>
          <TabsTrigger value="return" className="text-xs sm:text-sm font-medium py-2 sm:py-3">
            Return Stock
          </TabsTrigger>
        </TabsList>

        <TabsContent value="assigned">
          <Card className="border-0 shadow-xl rounded-xl sm:rounded-2xl overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-[#2B3068] to-[#1a1f4a] text-white p-4 sm:p-6">
              <CardTitle className="text-lg sm:text-xl lg:text-2xl font-bold">Pending Assignments</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="p-4 sm:p-6 space-y-4">
                {groupedAssignments.length === 0 ? (
                  <div className="text-center text-gray-500 py-10">No pending assignments</div>
                ) : (
                  groupedAssignments.map(({ batchId, rows }) => (
                    <div key={batchId} className="border rounded-xl overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-3 bg-gray-50">
                        <div className="text-sm font-semibold">Batch: {batchId}</div>
                        <div className="space-x-2">
                          <Button
                            size="sm"
                            className="bg-[#2B3068] hover:bg-[#1a1f4a] text-white"
                            disabled={!!processingBatch[batchId]}
                            onClick={() => acceptBatch(batchId, rows)}
                          >
                            {processingBatch[batchId] ? <Loader2 className="w-4 h-4 animate-spin" /> : "Accept"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!!processingBatch[batchId]}
                            onClick={() => rejectBatch(batchId, rows)}
                          >
                            {processingBatch[batchId] ? <Loader2 className="w-4 h-4 animate-spin" /> : "Reject"}
                          </Button>
                        </div>
                      </div>
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Item</TableHead>
                              <TableHead>Category</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead className="text-right">Qty</TableHead>
                              <TableHead>Empty Cylinder (Gas)</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {rows.map((a) => (
                              <TableRow key={a._id}>
                                <TableCell className="font-medium">{a.product?.name || a.productName || "-"}</TableCell>
                                <TableCell>{a.category || a.product?.category || "-"}</TableCell>
                                <TableCell>{a.cylinderStatus || "-"}</TableCell>
                                <TableCell className="text-right">{Number(a.quantity || 0)}</TableCell>
                                <TableCell>
                                  {isGasAssignment(a) ? (
                                    <SearchableSelect
                                      value={selectedEmptyCylinderByAssignmentId[String(a._id)] || ""}
                                      onValueChange={(value) =>
                                        setSelectedEmptyCylinderByAssignmentId((prev) => ({
                                          ...prev,
                                          [String(a._id)]: value,
                                        }))
                                      }
                                      options={emptyCylinderOptions}
                                      placeholder="Select matching empty cylinder"
                                      searchPlaceholder="Search empty cylinder..."
                                      emptyText="No empty cylinder found."
                                      triggerClassName="w-[320px] min-h-12 justify-between py-2 [&>span:first-child]:text-xs [&>span:first-child]:leading-snug [&>span:first-child]:text-left [&>span:first-child]:whitespace-normal [&>span:first-child]:break-words"
                                    />
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
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="return">
          <Card className="border-0 shadow-xl rounded-xl sm:rounded-2xl overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-[#2B3068] to-[#1a1f4a] text-white p-4 sm:p-6">
              <CardTitle className="text-lg sm:text-xl lg:text-2xl font-bold">Return Stock to Admin (Multiple)</CardTitle>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm text-gray-600">Add multiple items, then click Send Return</div>
                <div className="flex items-center gap-2">
                  {editingReturnItemKey ? (
                    <Button variant="ghost" onClick={resetReturnDraft} type="button">
                      Cancel Edit
                    </Button>
                  ) : null}
                  <Button
                    variant="outline"
                    type="button"
                    onClick={() => {
                      try {
                        setError("")
                        saveReturnDraft()
                      } catch (e: any) {
                        setError(e?.message || "Failed to add item")
                      }
                    }}
                  >
                    {editingReturnItemKey ? "Update Item" : "Add Item"}
                  </Button>
                </div>
              </div>

              <div className="overflow-x-auto border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead>Cylinder (Gas)</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell>
                        <Select
                          value={draftReturnItem.stockType}
                          onValueChange={(v) =>
                            updateReturnDraft({ stockType: v as any, itemId: "", cylinderProductId: undefined })
                          }
                        >
                          <SelectTrigger className="w-[140px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="empty">Empty</SelectItem>
                            <SelectItem value="gas">Gas</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <SearchableSelect
                          value={selectedReturnItemValue}
                          onValueChange={(v) =>
                            updateReturnDraft({
                              itemId: v,
                              cylinderProductId: draftReturnItem.stockType === "gas" ? findRelatedCylinderProductId(v) : undefined,
                            })
                          }
                          options={returnItemOptions}
                          placeholder="Select item"
                          searchPlaceholder="Search item..."
                          emptyText="No item found."
                          triggerClassName="w-[320px] min-h-12 justify-between py-2 [&>span:first-child]:text-xs [&>span:first-child]:leading-snug [&>span:first-child]:text-left [&>span:first-child]:whitespace-normal [&>span:first-child]:break-words"
                        />
                      </TableCell>
                      <TableCell>
                        {draftReturnItem.stockType === "gas" ? (
                          <SearchableSelect
                            value={selectedFullCylinderValue}
                            onValueChange={(v) => updateReturnDraft({ cylinderProductId: v })}
                            options={fullCylinderOptions}
                            placeholder="Select full cylinder"
                            searchPlaceholder="Search full cylinder..."
                            emptyText="No full cylinder found."
                            triggerClassName="w-[320px] min-h-12 justify-between py-2 [&>span:first-child]:text-xs [&>span:first-child]:leading-snug [&>span:first-child]:text-left [&>span:first-child]:whitespace-normal [&>span:first-child]:break-words"
                          />
                        ) : (
                          <span className="text-sm text-gray-500">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          className="w-[90px] text-right"
                          value={draftReturnItem.quantity}
                          onChange={(e) => updateReturnDraft({ quantity: e.target.value.replace(/[^\d]/g, "") || "" })}
                          inputMode="numeric"
                        />
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>

              {returnItems.length > 0 && (
                <div className="space-y-2">
                  <div className="text-sm font-medium text-gray-700">Added Items</div>
                  <div className="overflow-x-auto border rounded-lg">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Type</TableHead>
                          <TableHead>Item</TableHead>
                          <TableHead>Cylinder (Gas)</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {returnItems.map((r) => (
                          <TableRow key={r.key}>
                            <TableCell className="font-medium uppercase">{r.stockType}</TableCell>
                            <TableCell>
                              {getInventoryItemName(inventory.find((it) => it._id === r.itemId))}
                            </TableCell>
                            <TableCell>
                              {getInventoryItemName(fullCylinderSelectOptions.find((it) => (it.product?._id || it.productId) === r.cylinderProductId))}
                            </TableCell>
                            <TableCell className="text-right">{r.quantity}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-2">
                                <Button type="button" size="icon" variant="outline" onClick={() => editReturnRow(r.key)} aria-label="Edit item">
                                  <Pencil className="w-4 h-4" />
                                </Button>
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="outline"
                                  className="text-red-600 border-red-200 hover:text-red-700"
                                  onClick={() => removeReturnRow(r.key)}
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

              <div className="flex justify-end">
                <Button
                  className="bg-[#2B3068] hover:bg-[#1a1f4a] text-white"
                  onClick={sendReturnBatch}
                  disabled={sendingReturn || returnItems.length === 0 || editingReturnItemKey !== null}
                >
                  {sendingReturn ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
                  Send Return
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
