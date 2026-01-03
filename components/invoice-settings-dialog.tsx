"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "@/hooks/use-toast"

interface InvoiceSettingsDialogProps {
  isOpen: boolean
  onClose: () => void
}

export const InvoiceSettingsDialog = ({ isOpen, onClose }: InvoiceSettingsDialogProps) => {
  const [startingNumber, setStartingNumber] = useState("0")
  const [loading, setLoading] = useState(false)

  const handleSave = async () => {
    const num = parseInt(startingNumber)
    if (isNaN(num) || num < 0) {
      toast({ title: "Please enter a valid number", variant: "destructive" })
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/invoice-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startingNumber: num })
      })

      if (!res.ok) throw new Error('Failed to save')

      toast({ title: "Invoice settings saved successfully" })
      onClose()
    } catch (error) {
      toast({ title: "Failed to save settings", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Set Starting Invoice Number</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Enter the starting invoice number for your system. All invoices will be generated sequentially from this number.
          </p>
          <div className="space-y-2">
            <Label htmlFor="startingNumber">Starting Invoice Number</Label>
            <Input
              id="startingNumber"
              type="number"
              min="0"
              value={startingNumber}
              onChange={(e) => setStartingNumber(e.target.value)}
              placeholder="0"
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? "Saving..." : "Save & Continue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}