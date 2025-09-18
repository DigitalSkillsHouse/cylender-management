import axios from "axios"

const api = axios.create({
  baseURL: "/api",
  headers: {
    "Content-Type": "application/json",
  },
})

// Auth API
export const authAPI = {
  login: (email: string, password: string) => api.post("/auth/login", { email, password }),
  logout: () => api.post("/auth/logout"),
  initAdmin: () => api.post("/auth/init"),
}

// Products API
export const productsAPI = {
  getAll: () => api.get("/products"),
  getById: (id: string) => api.get(`/products/${id}`),
  create: (data: any) => api.post("/products", data),
  update: (id: string, data: any) => api.put(`/products/${id}`, data),
  delete: (id: string) => api.delete(`/products/${id}`),
}

// Customers API
export const customersAPI = {
  getAll: () => api.get("/customers"),
  getById: (id: string) => api.get(`/customers/${id}`),
  create: (data: any) => api.post("/customers", data),
  update: (id: string, data: any) => api.put(`/customers/${id}`, data),
  delete: (id: string) => api.delete(`/customers/${id}`),
}

// Suppliers API
export const suppliersAPI = {
  getAll: () => api.get("/suppliers"),
  getById: (id: string) => api.get(`/suppliers/${id}`),
  create: (data: any) => api.post("/suppliers", data),
  update: (id: string, data: any) => api.put(`/suppliers/${id}`, data),
  delete: (id: string) => api.delete(`/suppliers/${id}`),
}

// Sales API
export const salesAPI = {
  getAll: () => api.get("/sales"),
  getById: (id: string) => api.get(`/sales/${id}`),
  create: (data: any) => api.post("/sales", data),
  update: (id: string, data: any) => api.put(`/sales/${id}`, data),
  patch: (id: string, data: any) => api.patch(`/sales/${id}`, data),
  delete: (id: string) => api.delete(`/sales/${id}`),
}

// Employee Sales API
export const employeeSalesAPI = {
  getAll: () => api.get("/employee-sales"),
  getByEmployeeId: (employeeId: string) => api.get(`/employee-sales?employeeId=${employeeId}`),
  getById: (id: string) => api.get(`/employee-sales/${id}`),
  create: (data: any) => api.post("/employee-sales", data),
  update: (id: string, data: any) => api.put(`/employee-sales/${id}`, data),
  delete: (id: string) => api.delete(`/employee-sales/${id}`),
}

// Employees API
export const employeesAPI = {
  getAll: () => api.get("/employees"),
  getById: (id: string) => api.get(`/employees/${id}`),
  create: (data: any) => api.post("/employees", data),
  update: (id: string, data: any) => api.put(`/employees/${id}`, data),
  delete: (id: string) => api.delete(`/employees/${id}`),
}

// Stock Assignments API (renamed from stockAPI to stockAssignmentsAPI for consistency)
export const stockAPI = {
  getAll: () => api.get("/stock-assignments"),
  getById: (id: string) => api.get(`/stock-assignments/${id}`),
  create: (data: any) => api.post("/stock-assignments", data),
  update: (id: string, data: any) => api.put(`/stock-assignments/${id}`, data),
  delete: (id: string) => api.delete(`/stock-assignments/${id}`),
  receive: (id: string) => api.put(`/stock-assignments/${id}/receive`),
  returnStock: (id: string) => api.put(`/stock-assignments/${id}/return`),
  reject: (id: string) => api.put(`/stock-assignments/${id}/reject`),
}

// Alternative export for consistency
export const stockAssignmentsAPI = stockAPI

// Notifications API
export const notificationsAPI = {
  getAll: (userId: string) => api.get(`/notifications?userId=${userId}`),
  markAsRead: (id: string) => api.put(`/notifications/${id}/read`),
  delete: (id: string) => api.delete(`/notifications/${id}`),
}



// Purchase Orders API
export const purchaseOrdersAPI = {
  getAll: () => api.get("/purchase-orders"),
  getById: (id: string) => api.get(`/purchase-orders/${id}`),
  create: (data: any) => api.post("/purchase-orders", data),
  update: (id: string, data: any) => api.put(`/purchase-orders/${id}`, data),
  delete: (id: string) => api.delete(`/purchase-orders/${id}`),
}

// Inventory API
export const inventoryAPI = {
  getAll: () => api.get("/inventory"),
  getById: (id: string) => api.get(`/inventory/${id}`),
  create: (data: any) => api.post("/inventory", data),
  update: (id: string, data: any) => api.put(`/inventory/${id}`, data),
  delete: (id: string) => api.delete(`/inventory/${id}`),
  updateStatus: (id: string, status: string) => api.patch(`/inventory/${id}`, { status }),
  updateItem: (id: string, data: any) => api.patch(`/inventory/${id}`, data),
  receiveInventory: (id: string) => api.patch(`/inventory/${id}`, { status: "received" }),
}

// Employee Cylinders API
export const employeeCylindersAPI = {
  getAll: (params?: any) => api.get("/employee-cylinders", { params }),
  create: (data: any) => api.post("/employee-cylinders", data),
  update: (id: string, data: any) => api.put(`/employee-cylinders/${id}`, data),
  delete: (id: string) => api.delete(`/employee-cylinders/${id}`),
}

// Cylinders API
export const cylindersAPI = {
  getAll: (params?: any) => api.get("/cylinders", { params }),
  getById: (id: string) => api.get(`/cylinders/${id}`),
  create: (data: any) => api.post("/cylinders", data),
  update: (id: string, data: any) => api.put(`/cylinders/${id}`, data),
  delete: (id: string) => api.delete(`/cylinders/${id}`),
  deposit: (data: any) => api.post("/cylinders/deposit", data),
  refill: (data: any) => api.post("/cylinders/refill", data),
  return: (data: any) => api.post("/cylinders/return", data),
}

// Dashboard API
export const dashboardAPI = {
  getStats: () => api.get("/dashboard/stats"),
}

// Reports API
export const reportsAPI = {
  getRevenue: (params?: any) => api.get("/reports/revenue", { params }),
  getLedger: (params?: any) => api.get("/reports/ledger", { params }),
  getStats: () => api.get("/reports/stats"),
}

export default api
