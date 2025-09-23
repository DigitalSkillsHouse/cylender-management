"use client"

import { useState } from "react"
import { Bell, X, User, Phone, Mail, Calendar, Eye, CheckCircle, Check } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { inactiveCustomersAPI } from "@/lib/api"

interface Customer {
  _id: string
  name: string
  email: string
  phone: string
}

interface InactiveCustomersNotificationProps {
  inactiveCustomers: Customer[]
  inactiveCustomersCount: number
  onMarkAsViewed?: () => void
}

export function InactiveCustomersNotification({ 
  inactiveCustomers, 
  inactiveCustomersCount,
  onMarkAsViewed 
}: InactiveCustomersNotificationProps) {
  const [showModal, setShowModal] = useState(false)
  const [isMarkingAsViewed, setIsMarkingAsViewed] = useState(false)
  const [showSuccessMessage, setShowSuccessMessage] = useState(false)
  const [markedCustomers, setMarkedCustomers] = useState<Set<string>>(new Set())
  const [isMarkingIndividual, setIsMarkingIndividual] = useState<string | null>(null)

  const handleMarkAsViewed = async () => {
    try {
      setIsMarkingAsViewed(true)
      
      // Get all customer IDs
      const customerIds = inactiveCustomers.map(customer => customer._id)
      
      // Mark customers as viewed
      await inactiveCustomersAPI.markAsViewed(customerIds)
      
      // Show success message
      setShowSuccessMessage(true)
      
      // Auto-hide success message after 2 seconds and refresh data
      setTimeout(() => {
        setShowSuccessMessage(false)
        setShowModal(false)
        
        // Refresh dashboard data if callback provided
        if (onMarkAsViewed) {
          onMarkAsViewed()
        }
      }, 2000)
      
    } catch (error) {
      console.error("Error marking customers as viewed:", error)
      // You could add error handling here
    } finally {
      setIsMarkingAsViewed(false)
    }
  }

  const handleMarkIndividualAsViewed = async (customerId: string) => {
    try {
      setIsMarkingIndividual(customerId)
      
      // Mark single customer as viewed
      await inactiveCustomersAPI.markAsViewed([customerId])
      
      // Add to marked customers set (this will hide the customer from the list)
      setMarkedCustomers(prev => new Set(prev).add(customerId))
      
      // Check if all customers are now marked
      const newMarkedSet = new Set(markedCustomers).add(customerId)
      const remainingCustomers = inactiveCustomers.filter(customer => !newMarkedSet.has(customer._id))
      
      // If no customers left, close modal and refresh dashboard
      if (remainingCustomers.length === 0) {
        setTimeout(() => {
          setShowModal(false)
          if (onMarkAsViewed) {
            onMarkAsViewed()
          }
        }, 1000)
      }
      
    } catch (error) {
      console.error("Error marking individual customer as viewed:", error)
    } finally {
      setIsMarkingIndividual(null)
    }
  }

  if (inactiveCustomersCount === 0) {
    return null
  }

  return (
    <>
      {/* Notification Icon */}
      <div className="relative flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto">
        <Button
          onClick={() => setShowModal(true)}
          variant="outline"
          size="sm"
          className="relative bg-orange-50 border-orange-200 hover:bg-orange-100 text-orange-700 transition-all duration-200 w-full sm:w-auto min-h-[44px] text-xs sm:text-sm"
        >
          <Bell className="h-4 w-4 mr-1 sm:mr-2 flex-shrink-0" />
          <span className="hidden sm:inline">Inactive Customers</span>
          <span className="sm:hidden">Inactive</span>
          {inactiveCustomersCount > 0 && (
            <Badge 
              variant="destructive" 
              className="ml-1 sm:ml-2 bg-red-500 text-white text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full flex-shrink-0"
            >
              {inactiveCustomersCount}
            </Badge>
          )}
        </Button>
        
        {/* Mark as Read Icon Button */}
        {inactiveCustomersCount > 0 && (
          <Button
            onClick={(e) => {
              e.stopPropagation()
              handleMarkAsViewed()
            }}
            variant="outline"
            size="sm"
            disabled={isMarkingAsViewed}
            className="bg-blue-50 border-blue-200 hover:bg-blue-100 text-blue-700 transition-all duration-200 p-2 min-h-[44px] w-full sm:w-auto"
            title="Mark as Read"
          >
            {isMarkingAsViewed ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </Button>
        )}
        
        {/* Pulsing notification indicator */}
        {inactiveCustomersCount > 0 && (
          <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
        )}
      </div>

      {/* Floating Success Notification */}
      {showSuccessMessage && (
        <div className="fixed top-4 left-4 right-4 sm:top-4 sm:right-4 sm:left-auto z-50 bg-green-500 text-white px-4 sm:px-6 py-3 rounded-lg shadow-lg flex items-center gap-2 animate-in fade-in-0 slide-in-from-top-2 max-w-sm sm:max-w-none mx-auto sm:mx-0">
          <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0" />
          <span className="font-medium text-sm sm:text-base">
            {inactiveCustomersCount} customer{inactiveCustomersCount > 1 ? 's' : ''} marked as read!
          </span>
        </div>
      )}

      {/* Modal Dialog */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="w-[95vw] max-w-4xl max-h-[90vh] sm:max-h-[80vh] overflow-hidden">
          <DialogHeader className="bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-t-lg p-4 sm:p-6 -m-4 sm:-m-6 mb-4">
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2 sm:gap-3 text-lg sm:text-xl font-bold">
                <div className="p-1.5 sm:p-2 bg-white/20 rounded-lg">
                  <Bell className="h-5 w-5 sm:h-6 sm:w-6" />
                </div>
                <span className="hidden sm:inline">Inactive Customers Alert</span>
                <span className="sm:hidden">Inactive Alert</span>
              </DialogTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowModal(false)}
                className="text-white hover:bg-white/20 rounded-full p-2 min-h-[44px]"
              >
                <X className="h-4 w-4 sm:h-5 sm:w-5" />
              </Button>
            </div>
            <p className="text-white/90 mt-2">
              {inactiveCustomersCount} customer{inactiveCustomersCount > 1 ? 's' : ''} haven't made any transactions in the last 30 days
            </p>
          </DialogHeader>

          <div className="space-y-4 pb-4">
            {/* Summary Card */}
            <div className="bg-gradient-to-r from-orange-50 to-red-50 border border-orange-200 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-100 rounded-lg">
                  <Calendar className="h-5 w-5 text-orange-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-800">Customer Inactivity Alert</h3>
                  <p className="text-sm text-gray-600">
                    These customers haven't made any gas sales or cylinder transactions since{' '}
                    <span className="font-medium">
                      {new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toLocaleDateString()}
                    </span>
                  </p>
                </div>
              </div>
            </div>

            {/* Customer List */}
            <div className="max-h-96 overflow-y-auto">
              <div className="grid gap-3 pb-4 sm:pb-6">
                {inactiveCustomers.filter(customer => !markedCustomers.has(customer._id)).length === 0 ? (
                  <div className="text-center py-8">
                    <div className="flex flex-col items-center gap-3">
                      <div className="p-3 bg-green-100 rounded-full">
                        <CheckCircle className="h-8 w-8 text-green-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-800">All Customers Marked as Read!</h3>
                        <p className="text-sm text-gray-600 mt-1">
                          All inactive customers have been acknowledged. The modal will close automatically.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  inactiveCustomers
                    .filter(customer => !markedCustomers.has(customer._id)) // Hide marked customers
                    .map((customer, index) => {
                  const isLoading = isMarkingIndividual === customer._id
                  
                  return (
                    <div
                      key={customer._id}
                      className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-3 sm:p-4 border rounded-lg transition-all duration-200 bg-white border-gray-200 hover:shadow-md"
                    >
                      {/* Mobile: Top row with checkmark, avatar, name, and badge */}
                      <div className="flex items-center gap-3 w-full sm:flex-1">
                        {/* Mark as Read Checkmark Icon */}
                        <div className="flex-shrink-0">
                          <Button
                            onClick={() => handleMarkIndividualAsViewed(customer._id)}
                            disabled={isLoading}
                            variant="outline"
                            size="sm"
                            className="w-8 h-8 sm:w-8 sm:h-8 p-0 rounded-full transition-all duration-200 bg-blue-50 border-blue-200 hover:bg-blue-100 text-blue-700 min-h-[32px]"
                            title="Mark as Read"
                          >
                            {isLoading ? (
                              <div className="animate-spin rounded-full h-3 w-3 sm:h-4 sm:w-4 border-b-2 border-blue-600"></div>
                            ) : (
                              "✓"
                            )}
                          </Button>
                        </div>

                        <div className="flex-shrink-0">
                          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-gray-100 to-gray-200 rounded-full flex items-center justify-center">
                            <User className="h-5 w-5 sm:h-6 sm:w-6 text-gray-500" />
                          </div>
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                            <h4 className="font-medium truncate text-gray-900 text-sm sm:text-base">
                              {customer.name}
                            </h4>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs bg-orange-50 text-orange-700 border-orange-200 flex-shrink-0">
                                #{index + 1}
                              </Badge>
                              <Badge variant="secondary" className="bg-red-50 text-red-700 border-red-200 text-xs sm:hidden flex-shrink-0">
                                30+ days
                              </Badge>
                            </div>
                          </div>
                        </div>

                        {/* Desktop: 30+ days badge */}
                        <div className="hidden sm:flex flex-shrink-0">
                          <Badge variant="secondary" className="bg-red-50 text-red-700 border-red-200">
                            30+ days
                          </Badge>
                        </div>
                      </div>

                      {/* Mobile: Bottom row with contact info */}
                      <div className="flex flex-col gap-1 w-full sm:hidden pl-11">
                        {customer.email && (
                          <div className="flex items-center gap-1 text-xs text-gray-500">
                            <Mail className="h-3 w-3 flex-shrink-0" />
                            <span className="truncate">{customer.email}</span>
                          </div>
                        )}
                        {customer.phone && (
                          <div className="flex items-center gap-1 text-xs text-gray-500">
                            <Phone className="h-3 w-3 flex-shrink-0" />
                            <span className="truncate">{customer.phone}</span>
                          </div>
                        )}
                      </div>

                      {/* Desktop: Contact info in same row */}
                      <div className="hidden sm:flex flex-col gap-1 text-sm text-gray-500 min-w-0">
                        {customer.email && (
                          <div className="flex items-center gap-1">
                            <Mail className="h-3 w-3 flex-shrink-0" />
                            <span className="truncate">{customer.email}</span>
                          </div>
                        )}
                        {customer.phone && (
                          <div className="flex items-center gap-1">
                            <Phone className="h-3 w-3 flex-shrink-0" />
                            <span className="truncate">{customer.phone}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                }))}
              </div>
            </div>

            {/* Success Message */}
            {showSuccessMessage && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-green-800">Marked as Viewed!</h3>
                    <p className="text-sm text-green-600">
                      {inactiveCustomersCount} customer{inactiveCustomersCount > 1 ? 's' : ''} marked as viewed. 
                      They won't appear again until another month passes without transactions.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="grid grid-cols-2 sm:flex sm:flex-row sm:justify-end gap-3 pt-4 mt-4 sm:mt-6 border-t">
              <Button
                variant="outline"
                onClick={() => setShowModal(false)}
                className="px-3 sm:px-6 min-h-[44px] w-full sm:w-auto text-sm sm:text-base"
                disabled={isMarkingAsViewed}
              >
                Close
              </Button>
              
              <Button
                onClick={handleMarkAsViewed}
                disabled={isMarkingAsViewed || showSuccessMessage}
                className="px-3 sm:px-6 min-h-[44px] w-full sm:w-auto bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 disabled:opacity-50 text-sm sm:text-base"
              >
                {isMarkingAsViewed ? (
                  <>
                    <div className="animate-spin rounded-full h-3 w-3 sm:h-4 sm:w-4 border-b-2 border-white mr-1 sm:mr-2"></div>
                    <span className="hidden sm:inline">Marking as Viewed...</span>
                    <span className="sm:hidden">Marking...</span>
                  </>
                ) : (
                  <>
                    <Eye className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                    <span className="hidden sm:inline">Mark as Viewed</span>
                    <span className="sm:hidden">Mark Read</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
