import axios from "axios"

const API_URL = process.env.NEXT_PUBLIC_API_URL || ""

const employeePurchaseOrdersAPI = {
  // Get all employee purchase orders (admin sees all, employees see their own)
  getAll: async (options = {}) => {
    const { meOnly = false } = options
    const query = meOnly ? '?me=true' : ''
    const response = await axios.get(`${API_URL}/api/employee-purchase-orders${query}` , { withCredentials: true })
    return response
  },

  // Get single employee purchase order
  getById: async (id) => {
    const response = await axios.get(`${API_URL}/api/employee-purchase-orders/${id}`, { withCredentials: true })
    return response
  },

  // Create new employee purchase order
  create: async (data) => {
    const response = await axios.post(`${API_URL}/api/employee-purchase-orders`, data, { withCredentials: true })
    return response
  },

  // Update employee purchase order
  update: async (id, data) => {
    const response = await axios.put(`${API_URL}/api/employee-purchase-orders/${id}`, data, { withCredentials: true })
    return response
  },

  // Delete employee purchase order
  delete: async (id) => {
    const response = await axios.delete(`${API_URL}/api/employee-purchase-orders/${id}`, { withCredentials: true })
    return response
  }
}

export default employeePurchaseOrdersAPI
