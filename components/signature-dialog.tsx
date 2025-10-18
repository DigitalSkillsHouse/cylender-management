"use client"

import { useState, useRef, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { X } from "lucide-react"
import SignatureCanvas from "react-signature-canvas"

interface SignatureDialogProps {
  isOpen: boolean
  onClose: () => void
  onSignatureComplete: (signature: string) => void
  customerName?: string
}

export function SignatureDialog({ isOpen, onClose, onSignatureComplete, customerName }: SignatureDialogProps) {
  const signatureRef = useRef<SignatureCanvas>(null)
  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number }>({ width: 600, height: 220 })
  const [hasSignature, setHasSignature] = useState(false)

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

  // Reset signature state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setHasSignature(false)
    }
  }, [isOpen])

  const handleSave = () => {
    if (!hasSignature) return // Don't proceed if no signature
    
    const signatureData = signatureRef.current?.toDataURL()
    console.log('SignatureDialog - Signature captured:', signatureData)
    console.log('SignatureDialog - Signature length:', signatureData?.length)
    if (signatureData) {
      onSignatureComplete(signatureData)
    }
    onClose()
  }

  const clearSignature = () => {
    signatureRef.current?.clear()
    setHasSignature(false)
  }

  // Check if signature exists when user draws
  const handleSignatureChange = () => {
    if (signatureRef.current) {
      const isEmpty = signatureRef.current.isEmpty()
      setHasSignature(!isEmpty)
    }
  }

  const handleCancel = () => {
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className="max-w-full sm:max-w-2xl w-[95vw] p-4 sm:p-6"
        aria-describedby="signature-description"
      >
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Customer Signature Required</DialogTitle>
            <Button variant="ghost" size="sm" onClick={handleCancel}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </DialogHeader>
        
        {/* Hidden description for accessibility */}
        <div id="signature-description" className="sr-only">
          Customer signature required for receipt generation. Use your finger or mouse to sign in the designated area.
        </div>

        <div className="space-y-4">
          <div className="text-center">
            <p className="text-lg font-medium text-[#2B3068]">
              {customerName ? `${customerName}, please sign below:` : "Please sign below:"}
            </p>
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
                onEnd={handleSignatureChange}
              />
            </div>
            <div className="flex justify-center mt-3">
              <Button variant="outline" size="sm" onClick={clearSignature}>
                Clear Signature
              </Button>
            </div>
          </div>

          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
            <Button 
              onClick={handleSave} 
              disabled={!hasSignature}
              className={`${
                hasSignature 
                  ? "bg-[#2B3068] hover:bg-[#1a1f4a] text-white" 
                  : "bg-gray-300 text-gray-500 cursor-not-allowed"
              }`}
              title={!hasSignature ? "Please provide signature first" : "Continue to receipt"}
            >
              Continue to Receipt
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
