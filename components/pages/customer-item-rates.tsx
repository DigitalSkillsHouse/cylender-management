"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { customersAPI, productsAPI } from "@/lib/api"

type Customer = {
  _id: string
  name: string
  serialNumber?: string
  phone?: string
  itemRates?: Array<{
    product?: string | { _id?: string }
    rate?: number
  }>
}

type Product = {
  _id: string
  name: string
  category: "gas" | "cylinder"
  leastPrice?: number
}

const getProductId = (value: string | { _id?: string } | undefined) =>
  typeof value === "string" ? value : value?._id || ""

export const CustomerItemRates = () => {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [selectedCustomerId, setSelectedCustomerId] = useState("")
  const [rateMap, setRateMap] = useState<Record<string, string>>({})
  const [searchTerm, setSearchTerm] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")

  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer._id === selectedCustomerId) || null,
    [customers, selectedCustomerId]
  )

  const filteredProducts = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase()
    const sortedProducts = [...products].sort((a, b) => a.name.localeCompare(b.name))

    if (!normalizedSearch) return sortedProducts

    return sortedProducts.filter((product) =>
      product.name.toLowerCase().includes(normalizedSearch)
    )
  }, [products, searchTerm])

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        setError("")

        const [customersResponse, productsResponse] = await Promise.all([
          customersAPI.getAll(),
          productsAPI.getAll(),
        ])

        const customersData = Array.isArray(customersResponse?.data?.data)
          ? customersResponse.data.data
          : Array.isArray(customersResponse?.data)
            ? customersResponse.data
            : []

        const productsData = Array.isArray(productsResponse?.data?.data)
          ? productsResponse.data.data
          : Array.isArray(productsResponse?.data)
            ? productsResponse.data
            : []

        setCustomers(customersData)
        setProducts(productsData.filter((product: Product) => ["gas", "cylinder"].includes(product.category)))

        if (customersData.length > 0) {
          setSelectedCustomerId((current) => current || customersData[0]._id)
        }
      } catch (fetchError: any) {
        setError(fetchError?.response?.data?.error || "Failed to load customer item rates")
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  useEffect(() => {
    if (!selectedCustomer) {
      setRateMap({})
      return
    }

    const nextRateMap: Record<string, string> = {}
    for (const itemRate of selectedCustomer.itemRates || []) {
      const productId = getProductId(itemRate?.product)
      const rate = Number(itemRate?.rate)

      if (!productId || !Number.isFinite(rate) || rate < 0) continue
      nextRateMap[productId] = rate.toString()
    }

    setRateMap(nextRateMap)
    setMessage("")
  }, [selectedCustomer])

  const handleSave = async () => {
    if (!selectedCustomer) return

    try {
      setSaving(true)
      setError("")
      setMessage("")

      const itemRates = Object.entries(rateMap)
        .map(([product, rate]) => ({
          product,
          rate: Number(rate),
        }))
        .filter((itemRate) => Number.isFinite(itemRate.rate) && itemRate.rate >= 0)

      await customersAPI.update(selectedCustomer._id, { itemRates })

      setCustomers((prev) =>
        prev.map((customer) =>
          customer._id === selectedCustomer._id
            ? { ...customer, itemRates }
            : customer
        )
      )

      setMessage("Customer item rates saved successfully.")
    } catch (saveError: any) {
      setError(saveError?.response?.data?.error || "Failed to save customer item rates")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="p-6 text-sm text-gray-500">Loading customer item rates...</div>
  }

  return (
    <div className="space-y-6 p-2 sm:p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Customer Item Rate</h1>
        <p className="text-sm text-muted-foreground">
          Set customer-wise rates. If no custom rate is saved, the system keeps using the default product rate.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Customer Selection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Select Customer</Label>
              <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select customer" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((customer) => (
                    <SelectItem key={customer._id} value={customer._id}>
                      {customer.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Search Item</Label>
              <Input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search product name"
              />
            </div>
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {message ? <p className="text-sm text-green-600">{message}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Item Rates</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b">
                  <th className="px-3 py-2 text-left font-medium">Item</th>
                  <th className="px-3 py-2 text-left font-medium">Category</th>
                  <th className="px-3 py-2 text-left font-medium">Default Rate</th>
                  <th className="px-3 py-2 text-left font-medium">Customer Rate</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((product) => (
                  <tr key={product._id} className="border-b">
                    <td className="px-3 py-2">{product.name}</td>
                    <td className="px-3 py-2 capitalize">{product.category}</td>
                    <td className="px-3 py-2">{Number(product.leastPrice || 0).toFixed(2)}</td>
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={rateMap[product._id] || ""}
                        onChange={(event) =>
                          setRateMap((prev) => ({
                            ...prev,
                            [product._id]: event.target.value,
                          }))
                        }
                        placeholder="Leave blank for default"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setRateMap({})}
              disabled={!selectedCustomer}
            >
              Clear All
            </Button>
            <Button type="button" onClick={handleSave} disabled={!selectedCustomer || saving}>
              {saving ? "Saving..." : "Save Rates"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
