"use client"

import { useState, useRef } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Upload, FileSpreadsheet, Loader2, CheckCircle2, XCircle, AlertCircle } from "lucide-react"

interface ImportResult {
  success: number
  failed: number
  errors: Array<{ row: number; name: string; error: string }>
  imported: Array<{ name: string; trNumber: string; serialNumber: string }>
}

interface CustomerImportDialogProps {
  isOpen: boolean
  onClose: () => void
  onImportComplete: () => void
}

export const CustomerImportDialog = ({ isOpen, onClose, onImportComplete }: CustomerImportDialogProps) => {
  const [file, setFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      // Check if file is Excel format
      const validExtensions = ['.xlsx', '.xls', '.csv']
      const fileExtension = selectedFile.name.toLowerCase().substring(selectedFile.name.lastIndexOf('.'))
      
      if (!validExtensions.includes(fileExtension)) {
        alert('Please select a valid Excel file (.xlsx, .xls, or .csv)')
        return
      }
      
      setFile(selectedFile)
      setResult(null) // Clear previous results
    }
  }

  const handleImport = async () => {
    if (!file) {
      alert('Please select an Excel file first')
      return
    }

    setImporting(true)
    setResult(null)

    try {
      // Send file to API for parsing and import
      const formData = new FormData()
      formData.append('file', file)
      
      const response = await fetch('/api/customers/import', {
        method: 'POST',
        body: formData,
      })

      // Check if response is JSON before parsing
      const contentType = response.headers.get('content-type')
      if (!contentType || !contentType.includes('application/json')) {
        // Response is not JSON (likely HTML error page)
        const text = await response.text()
        console.error('Non-JSON response received:', text.substring(0, 200))
        throw new Error(`Server error: Received ${response.status} ${response.statusText}. Please check the server logs.`)
      }

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to import customers')
      }

      setResult(data.result)
      
      // If import was successful, refresh customer list
      if (data.result.success > 0) {
        setTimeout(() => {
          onImportComplete()
        }, 2000)
      }
    } catch (error: any) {
      console.error('Import error:', error)
      setResult({
        success: 0,
        failed: 0,
        errors: [{ row: 0, name: '', error: error.message || 'Failed to import customers' }],
        imported: []
      })
    } finally {
      setImporting(false)
    }
  }

  const handleClose = () => {
    setFile(null)
    setResult(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl sm:text-2xl font-bold text-[#2B3068]">
            Import Customers from Excel
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* File Selection */}
          {!result && (
            <div className="space-y-4">
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                <FileSpreadsheet className="w-12 h-12 mx-auto mb-4 text-[#2B3068]" />
                <Label htmlFor="excel-file" className="cursor-pointer">
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-gray-700">
                      Select Excel File (.xlsx, .xls, or .csv)
                    </p>
                    <p className="text-xs text-gray-500">
                      File should have columns: <strong>Name</strong> and <strong>Tr-Number</strong>
                    </p>
                  </div>
                </Label>
                <Input
                  id="excel-file"
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                {file && (
                  <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-sm text-green-700">
                      <CheckCircle2 className="w-4 h-4 inline mr-2" />
                      Selected: {file.name}
                    </p>
                  </div>
                )}
              </div>

              {/* Instructions */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-blue-800">
                    <p className="font-semibold mb-2">Excel File Format:</p>
                    <ul className="list-disc list-inside space-y-1 ml-2">
                      <li>First row should contain headers: <strong>Name</strong> and <strong>Tr-Number</strong></li>
                      <li>Each subsequent row should contain customer data</li>
                      <li>Serial numbers will be automatically generated (CU-0001, CU-0002, etc.)</li>
                      <li>Empty rows will be skipped</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Import Results */}
          {result && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                    <span className="font-semibold text-green-800">Successfully Imported</span>
                  </div>
                  <p className="text-2xl font-bold text-green-700">{result.success}</p>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <XCircle className="w-5 h-5 text-red-600" />
                    <span className="font-semibold text-red-800">Failed</span>
                  </div>
                  <p className="text-2xl font-bold text-red-700">{result.failed}</p>
                </div>
              </div>

              {/* Imported Customers */}
              {result.imported.length > 0 && (
                <div className="border rounded-lg p-4 max-h-60 overflow-y-auto">
                  <h4 className="font-semibold mb-2 text-gray-700">Imported Customers:</h4>
                  <div className="space-y-2">
                    {result.imported.slice(0, 10).map((customer, idx) => (
                      <div key={idx} className="text-sm p-2 bg-gray-50 rounded">
                        <span className="font-medium">{customer.name}</span>
                        {customer.trNumber && <span className="text-gray-600"> - TR: {customer.trNumber}</span>}
                        <span className="text-blue-600 ml-2">({customer.serialNumber})</span>
                      </div>
                    ))}
                    {result.imported.length > 10 && (
                      <p className="text-sm text-gray-500">... and {result.imported.length - 10} more</p>
                    )}
                  </div>
                </div>
              )}

              {/* Errors */}
              {result.errors.length > 0 && (
                <div className="border border-red-200 rounded-lg p-4 max-h-60 overflow-y-auto">
                  <h4 className="font-semibold mb-2 text-red-700">Errors:</h4>
                  <div className="space-y-2">
                    {result.errors.map((error, idx) => (
                      <div key={idx} className="text-sm p-2 bg-red-50 rounded">
                        <span className="font-medium">Row {error.row}:</span> {error.name} - {error.error}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          {!result ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={importing}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleImport}
                disabled={!file || importing}
                className="bg-[#2B3068] hover:bg-[#1a1f4a] text-white"
              >
                {importing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Import Customers
                  </>
                )}
              </Button>
            </>
          ) : (
            <Button
              type="button"
              onClick={handleClose}
              className="bg-[#2B3068] hover:bg-[#1a1f4a] text-white"
            >
              Close
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

