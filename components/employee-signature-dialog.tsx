"use client"

import { useRef, useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { X } from "lucide-react"
import SignatureCanvas from "react-signature-canvas"
import { toast } from "@/hooks/use-toast"

interface EmployeeSignatureDialogProps {
  isOpen: boolean
  onClose: () => void
  onSave?: (signature: string) => void
  employeeId?: string
}

export function EmployeeSignatureDialog({ isOpen, onClose, onSave, employeeId }: EmployeeSignatureDialogProps) {
  const signatureRef = useRef<SignatureCanvas>(null)
  const [saving, setSaving] = useState(false)
  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number }>({ width: 600, height: 220 })

  // Make the signature area comfortably large on mobile and responsive on resize
  useEffect(() => {
    const computeSize = () => {
      try {
        const vw = Math.max(320, Math.min(window.innerWidth || 600, 1000))
        // Leave some padding for dialog content
        const width = Math.max(300, Math.min(vw - 48, 900))
        // Taller canvas on narrow screens for natural finger movement
        const height = vw < 640 ? 320 : 240
        setCanvasSize({ width, height })
      } catch {}
    }
    computeSize()
    window.addEventListener('resize', computeSize)
    return () => window.removeEventListener('resize', computeSize)
  }, [])

  const handleSave = async () => {
    const signatureData = signatureRef.current?.toDataURL()
    if (signatureData) {
      setSaving(true)
      try {
        // Save to database first
        const response = await fetch("/api/employee-signature", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ 
            signature: signatureData,
            employeeId: employeeId 
          }),
        })

        const data = await response.json()

        if (!response.ok || !data.success) {
          throw new Error(data.error || "Failed to save signature to database")
        }

        // Also save to localStorage as fallback
        if (employeeId && typeof window !== "undefined") {
          try {
            localStorage.setItem(`employeeSignature_${employeeId}`, signatureData)
          } catch (e) {
            console.warn("Failed to save employee signature to localStorage", e)
          }
        }

        toast({
          title: "Signature saved",
          description: "Your signature has been saved successfully and will be used on your invoices.",
        })

        onSave?.(signatureData)
        onClose()
      } catch (error: any) {
        console.error("Error saving employee signature:", error)
        toast({
          title: "Failed to save signature",
          description: error.message || "Please try again.",
          variant: "destructive",
        })
      } finally {
        setSaving(false)
      }
    }
  }

  const clearSignature = () => {
    signatureRef.current?.clear()
  }

  const handleCancel = () => {
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl w-[95vw] sm:w-full" aria-describedby="employee-signature-description">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Employee Signature</DialogTitle>
            <Button variant="ghost" size="sm" onClick={handleCancel}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </DialogHeader>

        <div id="employee-signature-description" className="sr-only">
          Please provide your signature. It will be used on your receipts and invoices.
        </div>

        <div className="space-y-4">
          <div className="text-center">
            <p className="text-lg font-medium text-[#2B3068]">Please sign below:</p>
            <p className="text-sm text-gray-600">Use your finger to sign. The area below is optimized for touch.</p>
          </div>

          <div className="border-2 border-[#2B3068] rounded-lg p-3 sm:p-4 bg-gray-50">
            <div className="bg-white border border-gray-300 rounded-lg">
              <SignatureCanvas
                ref={signatureRef}
                canvasProps={{
                  width: canvasSize.width,
                  height: canvasSize.height,
                  className: "signature-canvas w-full touch-manipulation",
                  style: { border: "1px solid #ddd", borderRadius: "6px", width: '100%', height: `${canvasSize.height}px` },
                }}
                backgroundColor="white"
              />
            </div>
            <div className="flex justify-center mt-3">
              <Button variant="outline" size="sm" onClick={clearSignature}>
                Clear Signature
              </Button>
            </div>
          </div>

          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={handleCancel} disabled={saving}>
              Cancel
            </Button>
            <Button 
              onClick={handleSave} 
              className="bg-[#2B3068] hover:bg-[#1a1f4a] text-white"
              disabled={saving}
            >
              {saving ? "Saving..." : "Save Signature"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

