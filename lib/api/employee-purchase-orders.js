import axios from "axios"

const API_URL = process.env.NEXT_PUBLIC_API_URL || ""

const withTimeoutRetry = async (requestFn, retries = 1) => {
  let lastError
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await requestFn()
    } catch (error) {
      lastError = error
      const isTimeout = error?.code === "ECONNABORTED"
      if (!isTimeout || attempt === retries) break
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  }
  throw lastError
}

const employeePurchaseOrdersAPI = {
  // Get all employee purchase orders (admin sees all, employees see their own)
  getAll: async (options = {}) => {
    const { meOnly = false, mode, limit } = options
    const params = new URLSearchParams()
    if (meOnly) params.set('me', 'true')
    if (mode) params.set('mode', String(mode))
    if (limit) params.set('limit', String(limit))
    const query = params.toString() ? `?${params.toString()}` : ''
    const response = await withTimeoutRetry(
      () => axios.get(`${API_URL}/api/employee-purchase-orders${query}` , { withCredentials: true }),
      0,
    )
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
