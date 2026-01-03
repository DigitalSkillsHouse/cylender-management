"use client"

import { useState, useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { customersAPI } from "@/lib/api";
import { Loader2, AlertCircle, Users } from "lucide-react";

interface Customer {
  _id: string;
  name: string;
  phone?: string;
  email?: string;
  trNumber?: string;
}

interface CustomerDropdownProps {
  onSelect: (customerId: string) => void;
  selectedCustomerId: string;
  placeholder?: string;
  showDetails?: boolean;
  disabled?: boolean;
}

export const CustomerDropdown = ({ 
  onSelect, 
  selectedCustomerId, 
  placeholder = "Select a customer",
  showDetails = true,
  disabled = false 
}: CustomerDropdownProps) => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    async function fetchCustomers() {
      try {
        setLoading(true);
        setError("");
        
        const response = await customersAPI.getAll();
        
        // Handle nested data structure: response.data.data
        const customerData = Array.isArray(response?.data?.data) 
          ? response.data.data 
          : Array.isArray(response?.data) 
            ? response.data 
            : Array.isArray(response) 
              ? response 
              : [];
            
        setCustomers(customerData);
        
      } catch (error) {
        console.error("Failed to fetch customers:", error);
        setError("Failed to load customers");
        setCustomers([]);
      } finally {
        setLoading(false);
      }
    }

    fetchCustomers();
  }, []);

  const getPlaceholderText = () => {
    if (loading) return "Loading customers...";
    if (error) return "Error loading customers";
    if (customers.length === 0) return "No customers available";
    return placeholder;
  };

  const formatCustomerDisplay = (customer: Customer) => {
    if (showDetails && customer.phone) {
      return `${customer.name} - ${customer.phone}`;
    }
    return customer.name;
  };

  return (
    <Select 
      value={selectedCustomerId} 
      onValueChange={onSelect} 
      disabled={disabled || loading}
    >
      <SelectTrigger className="h-12">
        <div className="flex items-center gap-2 w-full">
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : error ? (
            <AlertCircle className="w-4 h-4 text-red-500" />
          ) : (
            <Users className="w-4 h-4 text-gray-500" />
          )}
          <SelectValue placeholder={getPlaceholderText()} />
        </div>
      </SelectTrigger>
      <SelectContent>
        {customers.length > 0 ? (
          customers.map((customer) => (
            <SelectItem key={customer._id} value={customer._id}>
              {customer.name}
            </SelectItem>
          ))
        ) : (
          !loading && (
            <SelectItem value="no-customers" disabled>
              {error ? "Error loading customers" : "No customers found"}
            </SelectItem>
          )
        )}
      </SelectContent>
    </Select>
  );
}
