"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Package, Loader2, ArrowLeft } from "lucide-react"

interface EmployeeInventoryItem {
  _id: string
  product: {
    _id: string
    name: string
    category: string
    cylinderSize?: string
  }
  quantity: number
  remainingQuantity: number
  leastPrice: number
  status: "assigned" | "received" | "returned"
  assignedBy: {
    name: string
  }
  createdAt: string
  notes?: string
}

interface EmployeeInventoryProps {
  user: { id: string; email: string; role: "admin" | "employee"; name: string }
}

export function EmployeeInventory({ user }: EmployeeInventoryProps) {
  const [inventory, setInventory] = useState<EmployeeInventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>("")
  const [searchTerm, setSearchTerm] = useState("")

  useEffect(() => {
    fetchEmployeeInventory()
  }, [])

  const fetchEmployeeInventory = async () => {
    try {
      setError("")
      const response = await fetch(`/api/stock-assignments?employeeId=${user.id}`)
      const data = await response.json()
      
      if (response.ok) {
        setInventory(data.data || [])
      } else {
        setError("Failed to load inventory")
      }
    } catch (error: any) {
      setError(`Failed to load inventory: ${error.message}`)
      setInventory([])
    } finally {
      setLoading(false)
    }
  }

  // Filter inventory by status
  const assignedItems = inventory.filter(item => item.status === "assigned")
  const receivedItems = inventory.filter(item => item.status === "received")
  const returnedItems = inventory.filter(item => item.status === "returned")

  // Group received items by category for tabs
  const gasItems = receivedItems.filter(item => item.product.category === "gas")
  const cylinderItems = receivedItems.filter(item => item.product.category === "cylinder")

  const norm = (v?: string | number) => (v === undefined || v === null ? "" : String(v)).toLowerCase()
  const matchesQuery = (item: EmployeeInventoryItem, q: string) =>
    norm(item.product.name).includes(q) ||
    norm(item.product.category).includes(q) ||
    norm(item.quantity).includes(q) ||
    norm(item.remainingQuantity).includes(q)

  const q = searchTerm.trim().toLowerCase()

  const renderInventoryTable = (items: EmployeeInventoryItem[], showActions: boolean = false) => (
    <div className="w-full overflow-x-auto">
      <div className="w-full min-w-[800px]">
        <Table className="w-full table-fixed">
          <TableHeader>
            <TableRow className="bg-gray-50 border-b-2 border-gray-200">
              <TableHead className="font-bold text-gray-700 p-4 w-[25%]">Product</TableHead>
              <TableHead className="font-bold text-gray-700 p-4 w-[15%]">Category</TableHead>
              <TableHead className="font-bold text-gray-700 p-4 w-[12%]">Assigned</TableHead>
              <TableHead className="font-bold text-gray-700 p-4 w-[12%]">Remaining</TableHead>
              <TableHead className="font-bold text-gray-700 p-4 w-[12%]">Price (AED)</TableHead>
              <TableHead className="font-bold text-gray-700 p-4 w-[12%]">Status</TableHead>
              <TableHead className="font-bold text-gray-700 p-4 w-[12%]">Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item._id} className="hover:bg-gray-50 transition-colors border-b border-gray-100">
                <TableCell className="p-4">
                  <div>
                    <div className="font-medium">{item.product.name}</div>
                    {item.product.cylinderSize && (
                      <div className="text-sm text-gray-500">Size: {item.product.cylinderSize}</div>
                    )}
                  </div>
                </TableCell>
                <TableCell className="p-4">
                  <Badge variant={item.product.category === "gas" ? "default" : "secondary"}>
                    {item.product.category}
                  </Badge>
                </TableCell>
                <TableCell className="p-4 font-medium">{item.quantity}</TableCell>
                <TableCell className="p-4 font-medium">{item.remainingQuantity}</TableCell>
                <TableCell className="p-4">AED {item.leastPrice.toFixed(2)}</TableCell>
                <TableCell className="p-4">
                  <Badge
                    variant={
                      item.status === "received"
                        ? "default"
                        : item.status === "assigned"
                          ? "secondary"
                          : "outline"
                    }
                    className={
                      item.status === "received"
                        ? "bg-green-100 text-green-800"
                        : item.status === "assigned"
                          ? "bg-blue-100 text-blue-800"
                          : "bg-gray-100 text-gray-800"
                    }
                  >
                    {item.status}
                  </Badge>
                </TableCell>
                <TableCell className="p-4">
                  {new Date(item.createdAt).toLocaleDateString()}
                </TableCell>
              </TableRow>
            ))}
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-gray-500 py-12">
                  <Package className="w-16 h-16 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium">No items found</p>
                  <p className="text-sm">No inventory items match the current filter</p>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-[#2B3068]" />
          <p className="text-gray-600">Loading your inventory...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="pt-16 lg:pt-0 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#2B3068] to-[#1a1f4a] rounded-xl sm:rounded-2xl p-4 sm:p-6 lg:p-8 text-white">
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-2 flex items-center gap-3">
          <Package className="w-6 h-6 sm:w-8 sm:h-8 lg:w-10 lg:h-10" />
          My Inventory
        </h1>
        <p className="text-white/80 text-sm sm:text-base lg:text-lg">Track your assigned stock and inventory</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      <Tabs defaultValue="assigned" className="w-full">
        <TabsList className="grid w-full grid-cols-3 h-auto">
          <TabsTrigger value="assigned" className="text-xs sm:text-sm font-medium py-2 sm:py-3">
            Assigned ({assignedItems.length})
          </TabsTrigger>
          <TabsTrigger value="received" className="text-xs sm:text-sm font-medium py-2 sm:py-3">
            My Stock ({receivedItems.length})
          </TabsTrigger>
          <TabsTrigger value="returned" className="text-xs sm:text-sm font-medium py-2 sm:py-3">
            Returned ({returnedItems.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="assigned">
          <Card className="border-0 shadow-xl rounded-xl sm:rounded-2xl overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-[#2B3068] to-[#1a1f4a] text-white p-4 sm:p-6">
              <div className="flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-6">
                <CardTitle className="text-lg sm:text-xl lg:text-2xl font-bold flex-1">
                  Assigned Stock ({assignedItems.length})
                </CardTitle>
                <div className="bg-white rounded-xl p-2 flex items-center gap-2 w-full lg:w-80">
                  <Input
                    placeholder="Search products..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="h-10 text-gray-800"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {renderInventoryTable(q ? assignedItems.filter(item => matchesQuery(item, q)) : assignedItems)}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="received">
          <Card className="border-0 shadow-xl rounded-xl sm:rounded-2xl overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-[#2B3068] to-[#1a1f4a] text-white p-4 sm:p-6">
              <div className="flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-6">
                <CardTitle className="text-lg sm:text-xl lg:text-2xl font-bold flex-1">
                  My Current Stock ({receivedItems.length})
                </CardTitle>
                <div className="bg-white rounded-xl p-2 flex items-center gap-2 w-full lg:w-80">
                  <Input
                    placeholder="Search products..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="h-10 text-gray-800"
                  />
                </div>
              </div>
            </CardHeader>
            
            {/* My Stock Tabs */}
            <Tabs defaultValue="gas" className="w-full">
              <div className="px-4 sm:px-6 pt-4">
                <TabsList className="grid w-full grid-cols-2 h-auto">
                  <TabsTrigger value="gas" className="text-xs sm:text-sm font-medium py-2">
                    Gas ({gasItems.length})
                  </TabsTrigger>
                  <TabsTrigger value="cylinder" className="text-xs sm:text-sm font-medium py-2">
                    Cylinders ({cylinderItems.length})
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="gas">
                <CardContent className="p-0">
                  {renderInventoryTable(q ? gasItems.filter(item => matchesQuery(item, q)) : gasItems)}
                </CardContent>
              </TabsContent>

              <TabsContent value="cylinder">
                <CardContent className="p-0">
                  {renderInventoryTable(q ? cylinderItems.filter(item => matchesQuery(item, q)) : cylinderItems)}
                </CardContent>
              </TabsContent>
            </Tabs>
          </Card>
        </TabsContent>

        <TabsContent value="returned">
          <Card className="border-0 shadow-xl rounded-xl sm:rounded-2xl overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-[#2B3068] to-[#1a1f4a] text-white p-4 sm:p-6">
              <div className="flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-6">
                <CardTitle className="text-lg sm:text-xl lg:text-2xl font-bold flex-1">
                  Returned Stock ({returnedItems.length})
                </CardTitle>
                <div className="bg-white rounded-xl p-2 flex items-center gap-2 w-full lg:w-80">
                  <Input
                    placeholder="Search products..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="h-10 text-gray-800"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {renderInventoryTable(q ? returnedItems.filter(item => matchesQuery(item, q)) : returnedItems)}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}