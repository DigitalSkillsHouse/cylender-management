"use client"

import { LogOut, X } from "lucide-react"
import { Button } from "@/components/ui/button"

interface LogoutConfirmationProps {
  isOpen: boolean
  onConfirm: () => void
  onCancel: () => void
  userName: string
}

export const LogoutConfirmation = ({ isOpen, onConfirm, onCancel, userName }: LogoutConfirmationProps) => {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Background blur overlay */}
      <div 
        className="absolute inset-0 bg-black/20 backdrop-blur-sm"
        onClick={onCancel}
      />
      
      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl p-8 mx-4 max-w-md w-full transform transition-all duration-300 scale-100 animate-in fade-in-0 zoom-in-95">
        {/* Close button */}
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Icon */}
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 bg-gradient-to-br from-red-500 to-red-600 rounded-full flex items-center justify-center">
            <LogOut className="w-8 h-8 text-white" />
          </div>
        </div>

        {/* Content */}
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-3">
            Confirm Logout
          </h2>
          <p className="text-gray-600 leading-relaxed">
            Are you sure you want to logout, <span className="font-semibold text-gray-900">{userName}</span>? 
            You'll need to sign in again to access your account.
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={onCancel}
            className="flex-1 h-12 border-2 border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-gray-700 font-medium transition-all duration-200"
          >
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            className="flex-1 h-12 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white font-medium shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-[1.02]"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>
      </div>
    </div>
  )
}
