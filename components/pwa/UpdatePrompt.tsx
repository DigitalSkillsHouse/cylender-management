"use client"

import { useState, useEffect } from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { AlertCircle, RefreshCw, X } from "lucide-react"

interface UpdatePromptProps {
  onUpdate: () => void
  onDismiss: () => void
}

export function UpdatePrompt({ onUpdate, onDismiss }: UpdatePromptProps) {
  return (
    <div className="fixed bottom-4 right-4 z-[9999] max-w-md animate-in slide-in-from-bottom-5">
      <Alert className="border-blue-500 bg-blue-50 shadow-lg">
        <AlertCircle className="h-5 w-5 text-blue-600" />
        <AlertTitle className="text-base font-semibold text-blue-900">
          New Version Available
        </AlertTitle>
        <AlertDescription className="mt-2 text-sm text-blue-800">
          A new version of the app is available. Please update to see the latest changes and features.
        </AlertDescription>
        <div className="mt-4 flex gap-2">
          <Button
            onClick={onUpdate}
            className="bg-blue-600 hover:bg-blue-700 text-white"
            size="sm"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Update Now
          </Button>
          <Button
            onClick={onDismiss}
            variant="outline"
            size="sm"
            className="border-blue-300 text-blue-700 hover:bg-blue-100"
          >
            <X className="w-4 h-4 mr-2" />
            Later
          </Button>
        </div>
      </Alert>
    </div>
  )
}

