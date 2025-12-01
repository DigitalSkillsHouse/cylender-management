# Cylinder Management System - Comprehensive Project Analysis

## 📋 Project Overview

This is a **Gas & Cylinder Management System** built for **SYED TAYYAB INDUSTRIAL** using Next.js 14, MongoDB, and TypeScript. The system manages gas sales, cylinder transactions, inventory, employee assignments, purchase orders, and comprehensive reporting for both admin and employee users.

---

## 🛠️ Technology Stack

### Frontend
- **Next.js 14** (App Router)
- **React 18** with TypeScript
- **Tailwind CSS** for styling
- **Radix UI** components
- **Lucide React** for icons
- **Recharts** for data visualization
- **React Hook Form** + **Zod** for form validation
- **Axios** for API calls
- **PWA Support** (Service Worker, Install Prompt)

### Backend
- **Next.js API Routes** (Serverless functions)
- **MongoDB** with **Mongoose** ODM
- **JWT** authentication (HTTP-only cookies)
- **bcryptjs** for password hashing

### Key Libraries
- **jsonwebtoken** - JWT token management
- **date-fns** - Date manipulation
- **html2canvas** + **jspdf** - PDF generation
- **react-signature-canvas** - Digital signatures

---

## 🗄️ Database Models & Schema

### Core Models

#### 1. **User** (`models/User.js`)
- **Fields**: name, email, password (hashed), phone, address, position, salary, hireDate
- **Roles**: `admin` | `employee`
- **Status**: `active` | `inactive`
- **Financial**: debitAmount, creditAmount
- **Auth**: isActive flag
- **Methods**: comparePassword() for authentication

#### 2. **Product** (`models/Product.js`)
- **Fields**: name, productCode (auto-generated), category (`gas` | `cylinder`), costPrice, leastPrice
- **Stock**: currentStock, availableEmpty, availableFull
- **Cylinder**: cylinderSize (`large` | `small`), cylinderStatus (`empty` | `full`)
- **Auto-generated product codes**: Format `INITIALS-XXX` (e.g., `CY-001`, `GA-001`)

#### 3. **Customer** (`models/Customer.js`)
- **Fields**: name, serialNumber (auto: `CU-0001`), trNumber, phone, email, address
- **Financial**: totalDebit, totalCredit, balance (calculated)

#### 4. **Supplier** (`models/Supplier.js`)
- **Fields**: companyName, contactPerson, phone, email, address, trNumber, invoiceNumber
- **Status**: `active` | `inactive`

#### 5. **Sale** (`models/Sale.js`) - Admin Sales
- **Fields**: invoiceNumber (unique, sequential), customer, items[], totalAmount
- **Items**: product, category, cylinderSize, cylinderStatus, quantity, price, total
- **Payment**: paymentMethod, paymentStatus, receivedAmount
- **Tracking**: customerSignature, notes
- **Gas-Cylinder Linking**: cylinderProductId, gasProductId (for DSR tracking)

#### 6. **EmployeeSale** (`models/EmployeeSale.js`) - Employee Sales
- **Fields**: Similar to Sale but includes `employee` reference
- **Purpose**: Track sales made by employees separately
- **Uses**: Employee inventory deduction, DSR tracking

#### 7. **CylinderTransaction** (`models/Cylinder.js`)
- **Types**: `deposit` | `refill` | `return`
- **Fields**: invoiceNumber, customer/supplier, product, quantity, amount
- **Multi-item**: items[] array for complex transactions
- **Payment**: paymentMethod (`cash` | `cheque`), cashAmount, bankName, checkNumber
- **Status**: `pending` | `cleared` | `overdue`
- **Linking**: linkedDeposit (for return transactions)

#### 8. **PurchaseOrder** (`models/PurchaseOrder.js`) - Admin Purchases
- **Fields**: supplier, purchaseDate, items[], totalAmount, poNumber (unique)
- **Items**: product, purchaseType (`gas` | `cylinder`), cylinderStatus, gasType, emptyCylinderId
- **Status**: `pending` | `completed` | `cancelled`
- **Inventory**: inventoryStatus (`pending` | `received`)
- **Created By**: createdBy (User reference)

#### 9. **EmployeePurchaseOrder** (`models/EmployeePurchaseOrder.js`) - Employee Purchases
- **Fields**: supplier (optional), product, employee, purchaseDate, purchaseType
- **Cylinder**: cylinderSize, cylinderStatus, emptyCylinderId
- **Status**: `pending` | `assigned` | `approved` | `completed` | `cancelled`
- **Inventory**: inventoryStatus (`pending` | `assigned` | `approved` | `received`)
- **Auto-approval**: autoApproved flag
- **PO Number**: Format `EMP-XXXXX`

#### 10. **StockAssignment** (`models/StockAssignment.js`)
- **Fields**: employee, product, quantity, remainingQuantity
- **Status**: `assigned` | `received` | `returned` | `rejected`
- **Dates**: assignedDate, receivedDate, returnedDate, rejectedDate
- **Metadata**: assignedBy, leastPrice, category, cylinderStatus, displayCategory
- **Linking**: gasProductId, cylinderProductId (for full cylinders with gas)

#### 11. **InventoryItem** (`models/InventoryItem.js`) - Admin Inventory
- **Fields**: product (unique), category, currentStock, availableEmpty, availableFull
- **Purpose**: Centralized admin inventory tracking
- **Sync**: Last updated timestamp

#### 12. **EmployeeInventory** (`models/EmployeeInventory.js`) - Employee Inventory (Legacy)
- **Fields**: employee, product, category, assignedQuantity, currentStock
- **Cylinder**: availableEmpty, availableFull, cylinderSize, cylinderStatus
- **Status**: `assigned` | `received` | `active` | `returned`
- **Transactions**: Array of transaction history
- **Pricing**: leastPrice

#### 13. **EmployeeInventoryItem** (`models/EmployeeInventoryItem.js`) - Employee Inventory (New System)
- **Fields**: employee, product (compound unique index), category
- **Stock**: currentStock, availableEmpty, availableFull
- **Metadata**: cylinderSize, gasType
- **Purpose**: Simplified employee inventory tracking

#### 14. **DailySales** (`models/DailySales.js`) - Admin DSR Tracking
- **Fields**: date (YYYY-MM-DD), productId, productName, category
- **Gas Sales**: gasSalesQuantity, gasSalesAmount
- **Cylinder Sales**: cylinderSalesQuantity, cylinderSalesAmount
- **Breakdown**: fullCylinderSalesQuantity, emptyCylinderSalesQuantity
- **Refills**: cylinderRefillsQuantity
- **Transfers**: transferQuantity, transferAmount, receivedBackQuantity
- **Index**: Unique on (date, productId)

#### 15. **DailyEmployeeSales** (`models/DailyEmployeeSales.js`) - Employee DSR Tracking
- **Fields**: Similar to DailySales but includes `employeeId`
- **Index**: Unique on (date, employeeId, productId)

#### 16. **DailyStockReport** (`models/DailyStockReport.js`) - Admin DSR
- **Fields**: date, itemName, openingFull, openingEmpty, refilled, cylinderSales, gasSales
- **Closing**: closingFull, closingEmpty (optional)
- **Index**: Unique on (employeeId, itemName, date)

#### 17. **EmployeeDailyStockReport** (`models/EmployeeDailyStockReport.js`) - Employee DSR
- **Fields**: employeeId, itemName, date, openingFull, openingEmpty, refilled, cylinderSales, gasSales, closingFull, closingEmpty
- **Index**: Unique on (employeeId, itemName, date)

#### 18. **Expense** (`models/Expense.js`)
- **Fields**: invoiceNumber, expense, description, vatAmount, totalAmount

#### 19. **Rental** (`models/Rental.js`)
- **Fields**: rentalNumber, date, customer, items[], subtotal, totalVat, finalTotal
- **Status**: `active` | `returned` | `overdue`
- **Items**: product, quantity, days, amountPerDay, subtotal, vat, total

#### 20. **Notification** (`models/Notification.js`)
- **Fields**: recipient, sender, type, title, message, relatedId, isRead
- **Types**: `stock_assignment` | `stock_received` | `stock_returned` | `payment_due` | `general`

#### 21. **Counter** (`models/Counter.js`)
- **Purpose**: Sequential invoice number generation
- **Fields**: key, year, seq
- **Usage**: Unified invoice counter for all transaction types

---

## 🔐 Authentication & Authorization

### Authentication Flow
1. **Login** (`/api/auth/login`):
   - Validates email/password
   - Checks user role (admin/employee)
   - Validates user type selection matches actual role
   - Creates JWT token (24h expiry)
   - Sets HTTP-only cookie
   - Returns user data (without password)

2. **Token Verification** (`lib/auth.js`):
   - Extracts token from HTTP-only cookie
   - Verifies JWT signature
   - Checks user exists and is active
   - Returns user data

3. **Session Validation** (`/api/auth/validate`):
   - Validates token on page refresh
   - Returns current user data

4. **Logout** (`/api/auth/logout`):
   - Clears HTTP-only cookie

### Middleware (`middleware.js`)
- Protects all `/api/*` routes (except `/api/auth/*`)
- Validates token presence
- Simple token validation (length check)

### Role-Based Access
- **Admin**: Full system access
- **Employee**: Limited to own data and assigned inventory

---

## 👨‍💼 Admin Panel Features

### 1. **Dashboard** (`/api/dashboard/stats`)
- Total Revenue (gas + cylinder + sales)
- Gas Sales Revenue
- Cylinder Revenue (deposits, refills, returns)
- Total Due (outstanding payments)
- Total Customers
- Total Employees
- Products Sold
- Inactive Customers Alert

### 2. **Product Management** (`/api/products`)
- **GET**: List all products
- **POST**: Create product (auto-generates productCode, prevents duplicates)
- **PUT**: Update product
- **DELETE**: Delete product
- **Features**: 
  - Auto product code generation (INITIALS-XXX format)
  - Duplicate prevention (name + category)
  - Stock tracking (currentStock, availableEmpty, availableFull)

### 3. **Supplier Management** (`/api/suppliers`)
- CRUD operations for suppliers
- Track company details, contact info, TR number

### 4. **Purchase Management** (`/api/purchase-orders`)
- **GET**: List all purchase orders
- **POST**: Create purchase order
  - Multi-item support
  - Gas purchases (requires emptyCylinderId)
  - Cylinder purchases (empty/full with gasType)
  - Validates product existence (no auto-creation)
  - Updates inventory when status = "received"
- **Status Flow**: pending → completed
- **Inventory Flow**: pending → received

### 5. **Inventory** (`/api/inventory`)
- **GET**: List inventory items from purchase orders
- **PATCH** (`/api/inventory/[id]`): Update inventory status
- **PATCH** (`/api/inventory/item/[orderId]/[itemIndex]`): Update individual item status
- **Features**:
  - Track received inventory from purchase orders
  - Update stock when items received
  - Sync with Product model

### 6. **Gas Sales** (`/api/sales`)
- **GET**: List all sales
- **POST**: Create sale
  - Multi-item support
  - Stock validation (checks InventoryItem)
  - Auto invoice number generation
  - Updates inventory (gas/cylinder conversion)
  - Daily sales tracking for DSR
  - Gas sales: Deducts gas, converts full→empty cylinders
  - Full cylinder sales: Deducts cylinder + gas
  - Empty cylinder sales: Deducts empty cylinders only
- **Payment Methods**: cash, card, bank_transfer, credit, debit, delivery_note

### 7. **Cylinder Management** (`/api/cylinders`)
- **Deposit** (`/api/cylinders/deposit`):
  - Customer deposits cylinders (with gas)
  - Deducts empty cylinders + gas from inventory
  - Updates DailyCylinderTransaction
  - Multi-item support
  
- **Refill** (`/api/cylinders/refill`):
  - Refills empty cylinders with gas
  - Updates DailyRefill tracking
  - Deducts gas stock
  
- **Return** (`/api/cylinders/return`):
  - Customer returns empty cylinders
  - Adds to availableEmpty inventory
  - Updates DailyCylinderTransaction
  - Links to deposits (updates deposit status to "cleared")
  - Multi-item support

### 8. **Customer Management** (`/api/customers`)
- CRUD operations
- Auto-generates serialNumber (CU-XXXX)
- Tracks financial: totalDebit, totalCredit, balance

### 9. **Employee Management** (`/api/employees`)
- **GET**: List all employees
- **POST**: Create employee (role = "employee")
- **PUT**: Update employee
- **DELETE**: Delete employee
- Tracks: salary, position, hireDate, debitAmount, creditAmount

### 10. **Stock Assignments** (`/api/stock-assignments`)
- **GET**: List assignments (filterable by employeeId, status)
- **POST**: Create assignment
  - Validates stock availability (InventoryItem)
  - Does NOT deduct inventory on creation
  - Creates notification for employee
  - Status: "assigned" (employee must accept)
- **PUT** (`/api/stock-assignments/[id]/receive`):
  - Employee accepts assignment
  - Deducts from admin inventory
  - Adds to employee inventory (EmployeeInventoryItem)
  - Updates assignment status to "received"
- **PUT** (`/api/stock-assignments/[id]/return`):
  - Employee returns stock
  - Adds back to admin inventory
  - Updates assignment status to "returned"
- **PUT** (`/api/stock-assignments/[id]/reject`):
  - Employee rejects assignment
  - Updates status to "rejected"

### 11. **Daily Stock Report (DSR)** (`/api/daily-stock-reports`)
- **GET**: Fetch DSR for date
- **POST**: Create/update DSR
- Tracks: opening stock, refills, sales, closing stock
- Previous day rollover support

### 12. **Reports** (`/api/reports`)
- **Stats** (`/api/reports/stats`): Overall statistics
- **Ledger** (`/api/reports/ledger`): Customer/employee ledger
- **Cash Paper** (`/api/reports/cash-paper`): Cash flow report

### 13. **Profit & Loss** (`/api/profit-loss`)
- Calculates revenue, expenses, profit
- Date range filtering

### 14. **Collection** (`/api/collections`)
- Track customer payments
- Update customer balance

### 15. **Rental Collection** (`/api/rentals`)
- Manage rental transactions
- Track rental items, days, amounts

### 16. **Invoice Settings** (`/api/invoice-settings`)
- Configure starting invoice number
- Stored in Counter model

---

## 👷 Employee Panel Features

### 1. **Employee Dashboard** (`components/pages/employee-dashboard.tsx`)
- Welcome message
- Account summary (Debit/Credit)
- Pending inventory items count
- Quick links to inventory management

### 2. **Gas Sales** (`/api/employee-sales`)
- **GET**: List employee's sales (filtered by employeeId)
- **POST**: Create employee sale
  - Validates employee inventory (EmployeeInventoryItem)
  - Uses leastPrice from inventory
  - Auto invoice number generation
  - Updates employee inventory
  - Daily sales tracking (DailyEmployeeSales)
  - DSR aggregation (DailyEmployeeSalesAggregation)
  - Gas sales: Deducts gas, converts full→empty cylinders
  - Full cylinder sales: Deducts cylinder + gas
  - Empty cylinder sales: Deducts empty cylinders

### 3. **Cylinder Sales** (`/api/employee-cylinders`)
- Similar to admin cylinder management
- Employee-specific transactions

### 4. **My Inventory** (`/api/employee-inventory-new`)
- **GET** (`/api/employee-inventory-new/assignments`): Pending assignments
- **GET** (`/api/employee-inventory-new/pending`): Pending purchase orders
- **GET** (`/api/employee-inventory-new/received`): Received inventory
- **POST** (`/api/employee-inventory-new/accept`): Accept assignment/purchase
  - Deducts from admin inventory
  - Adds to employee inventory (EmployeeInventoryItem)
  - Updates assignment/purchase status
- **POST** (`/api/employee-inventory-new/send-back`): Return stock to admin

### 5. **Purchase Management** (`/api/employee-purchase-orders`)
- **GET**: List employee's purchase orders (filtered by employeeId)
- **POST**: Create purchase order
  - Can be created by employee or assigned by admin
  - Auto-generates PO number (EMP-XXXXX)
  - For gas purchases with emptyCylinderId:
    - Reduces empty cylinder stock
    - Creates full cylinder stock assignment
    - Creates notification
  - For regular purchases:
    - Creates stock assignment
    - Creates notification
  - Status: pending → approved → completed
  - Inventory status: pending → assigned → approved → received

### 6. **Employee Reports** (`/api/employee-sales`)
- View own sales history
- Financial summary (debit/credit)

### 7. **Employee DSR** (`/api/employee-dsr`)
- Daily stock report for employee
- Track opening/closing stock, sales, refills

### 8. **Notifications** (`/api/notifications`)
- **GET**: List notifications (filtered by userId)
- **PUT** (`/api/notifications/[id]/read`): Mark as read
- **DELETE**: Delete notification
- Real-time popup for new notifications

### 9. **Collection** (`/api/collections`)
- View and manage customer collections
- Update payment status

---

## 🔄 Key Business Logic

### 1. **Invoice Number Generation** (`lib/invoice-generator.js`)
- **Centralized System**: Single counter for all transaction types
- **Format**: 4-digit padded (0001-9999)
- **Counter**: `unified_invoice_counter` in Counter model
- **Year-based**: Resets per year (optional)
- **Uniqueness**: Verified across Sale, EmployeeSale, CylinderTransaction
- **Retry Logic**: Handles duplicates with retry mechanism
- **Initialization**: Auto-initializes from highest existing invoice

### 2. **Stock Management** (`lib/stock-manager.js`)
- **Centralized Calculation**: Recalculates stock from transactions
- **Formula**: 
  ```
  Stock = Total Received + Cylinder Returns - Regular Sales - Employee Sales - Cylinder Deposits/Refills
  ```
- **Validation**: Checks stock availability before operations
- **Sync**: Synchronizes Product.currentStock with calculated value
- **Breakdown**: Provides detailed stock breakdown for debugging

### 3. **Inventory System**
- **Admin Inventory** (`InventoryItem`):
  - Tracks: currentStock (gas), availableEmpty, availableFull (cylinders)
  - Updated on: Purchase orders (received), Sales, Stock assignments (receive/return)
  
- **Employee Inventory** (`EmployeeInventoryItem`):
  - Per-employee inventory tracking
  - Updated on: Stock assignments (accept), Employee sales, Purchase orders (accept)

### 4. **Gas-Cylinder Conversion Logic**
- **Gas Sale**:
  - Deducts gas stock
  - Converts full cylinders → empty cylinders
  - Tracks in DailySales (gas sales + cylinder usage)
  
- **Full Cylinder Sale**:
  - Deducts full cylinder stock
  - Deducts gas stock (if gasProductId provided)
  - Tracks in DailySales (cylinder sales + gas sales)
  
- **Empty Cylinder Sale**:
  - Deducts empty cylinder stock only
  - No gas deduction

### 5. **Daily Sales Tracking (DSR)**
- **Admin DSR** (`DailySales`):
  - Tracks gas sales, cylinder sales (full/empty), refills
  - Per product, per date
  - Used for Daily Stock Reports
  
- **Employee DSR** (`DailyEmployeeSales`):
  - Similar to admin but per employee
  - Tracks employee-specific sales

### 6. **Stock Assignment Flow**
1. **Admin creates assignment**:
   - Validates stock availability
   - Creates assignment (status: "assigned")
   - Creates notification
   - **Does NOT deduct inventory yet**

2. **Employee accepts**:
   - Deducts from admin inventory
   - Adds to employee inventory
   - Updates assignment status to "received"

3. **Employee returns**:
   - Adds back to admin inventory
   - Deducts from employee inventory
   - Updates assignment status to "returned"

### 7. **Purchase Order Flow**
1. **Admin Purchase Order**:
   - Create PO with items
   - Status: pending
   - Inventory status: pending
   - When received: Update inventory, update stock

2. **Employee Purchase Order**:
   - Create PO (by employee or admin assignment)
   - Status: pending → approved → completed
   - Inventory status: pending → assigned → approved → received
   - For gas purchases: Creates stock assignment automatically
   - Employee must accept from inventory

### 8. **Cylinder Transaction Flow**
- **Deposit**: Customer deposits cylinder with gas
  - Deducts empty cylinder + gas
  - Status: pending (until return)
  
- **Refill**: Supplier refills empty cylinder
  - Deducts gas, converts empty→full
  
- **Return**: Customer returns empty cylinder
  - Adds to availableEmpty
  - Links to deposit (updates deposit status to "cleared")

---

## 🛣️ API Routes Summary

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `GET /api/auth/validate` - Validate session
- `POST /api/auth/init` - Initialize admin

### Products
- `GET /api/products` - List products
- `POST /api/products` - Create product
- `GET /api/products/[id]` - Get product
- `PUT /api/products/[id]` - Update product
- `DELETE /api/products/[id]` - Delete product

### Customers
- `GET /api/customers` - List customers
- `POST /api/customers` - Create customer
- `GET /api/customers/[id]` - Get customer
- `PUT /api/customers/[id]` - Update customer
- `DELETE /api/customers/[id]` - Delete customer

### Suppliers
- `GET /api/suppliers` - List suppliers
- `POST /api/suppliers` - Create supplier
- `GET /api/suppliers/[id]` - Get supplier
- `PUT /api/suppliers/[id]` - Update supplier
- `DELETE /api/suppliers/[id]` - Delete supplier

### Sales (Admin)
- `GET /api/sales` - List sales
- `POST /api/sales` - Create sale
- `GET /api/sales/[id]` - Get sale
- `PUT /api/sales/[id]` - Update sale
- `PATCH /api/sales/[id]` - Partial update sale
- `DELETE /api/sales/[id]` - Delete sale

### Employee Sales
- `GET /api/employee-sales` - List employee sales (filterable by employeeId)
- `POST /api/employee-sales` - Create employee sale
- `GET /api/employee-sales/[id]` - Get employee sale
- `PUT /api/employee-sales/[id]` - Update employee sale
- `DELETE /api/employee-sales/[id]` - Delete employee sale

### Cylinders
- `GET /api/cylinders` - List cylinder transactions
- `POST /api/cylinders/deposit` - Create deposit
- `POST /api/cylinders/refill` - Create refill
- `POST /api/cylinders/return` - Create return
- `GET /api/cylinders/[id]` - Get transaction
- `PUT /api/cylinders/[id]` - Update transaction
- `DELETE /api/cylinders/[id]` - Delete transaction

### Purchase Orders (Admin)
- `GET /api/purchase-orders` - List purchase orders
- `POST /api/purchase-orders` - Create purchase order
- `GET /api/purchase-orders/[id]` - Get purchase order
- `PUT /api/purchase-orders/[id]` - Update purchase order
- `DELETE /api/purchase-orders/[id]` - Delete purchase order

### Employee Purchase Orders
- `GET /api/employee-purchase-orders` - List employee purchase orders (filtered by employeeId)
- `POST /api/employee-purchase-orders` - Create employee purchase order
- `GET /api/employee-purchase-orders/[id]` - Get employee purchase order
- `PUT /api/employee-purchase-orders/[id]` - Update employee purchase order

### Inventory
- `GET /api/inventory` - List inventory items
- `PATCH /api/inventory/[id]` - Update inventory status
- `PATCH /api/inventory/item/[orderId]/[itemIndex]` - Update item status

### Stock Assignments
- `GET /api/stock-assignments` - List assignments (filterable by employeeId, status)
- `POST /api/stock-assignments` - Create assignment
- `GET /api/stock-assignments/[id]` - Get assignment
- `PUT /api/stock-assignments/[id]` - Update assignment
- `PUT /api/stock-assignments/[id]/receive` - Accept assignment
- `PUT /api/stock-assignments/[id]/return` - Return assignment
- `PUT /api/stock-assignments/[id]/reject` - Reject assignment

### Employee Inventory
- `GET /api/employee-inventory-new/assignments` - Pending assignments
- `GET /api/employee-inventory-new/pending` - Pending purchases
- `GET /api/employee-inventory-new/received` - Received inventory
- `POST /api/employee-inventory-new/accept` - Accept assignment/purchase
- `POST /api/employee-inventory-new/send-back` - Return stock

### Employees
- `GET /api/employees` - List employees
- `POST /api/employees` - Create employee
- `GET /api/employees/[id]` - Get employee
- `PUT /api/employees/[id]` - Update employee
- `DELETE /api/employees/[id]` - Delete employee

### Dashboard
- `GET /api/dashboard/stats` - Get dashboard statistics

### Reports
- `GET /api/reports/stats` - Get report statistics
- `GET /api/reports/ledger` - Get ledger report
- `GET /api/reports/cash-paper` - Get cash paper report

### Daily Stock Reports
- `GET /api/daily-stock-reports` - Get DSR for date
- `POST /api/daily-stock-reports` - Create/update DSR
- `GET /api/daily-stock-reports/previous` - Get previous DSR

### Employee DSR
- `GET /api/employee-dsr` - Get employee DSR
- `POST /api/employee-dsr` - Create/update employee DSR

### Notifications
- `GET /api/notifications` - List notifications (filtered by userId)
- `PUT /api/notifications/[id]/read` - Mark as read
- `DELETE /api/notifications/[id]` - Delete notification

### Collections
- `GET /api/collections` - List collections
- `POST /api/collections` - Create collection

### Rentals
- `GET /api/rentals` - List rentals
- `POST /api/rentals` - Create rental

### Profit & Loss
- `GET /api/profit-loss` - Get P&L report

### Expenses
- `GET /api/expenses` - List expenses
- `POST /api/expenses` - Create expense

### Invoice Settings
- `GET /api/invoice-settings` - Get invoice settings
- `POST /api/invoice-settings` - Update invoice settings

---

## 🎨 Frontend Pages & Components

### Admin Pages (`components/pages/`)
1. **dashboard.tsx** - Admin dashboard with stats
2. **product-management.tsx** - Product CRUD
3. **supplier-management.tsx** - Supplier CRUD
4. **purchase-management.tsx** - Purchase order management
5. **inventory.tsx** - Inventory management
6. **gas-sales.tsx** - Gas sales interface
7. **cylinder-management.tsx** - Cylinder transactions
8. **customer-management.tsx** - Customer CRUD
9. **employee-management.tsx** - Employee management
10. **reports.tsx** - Reports dashboard
11. **daily-stock-report.tsx** - DSR management
12. **profit-loss.tsx** - P&L report
13. **collection.tsx** - Collection management
14. **rental-collection.tsx** - Rental management

### Employee Pages (`components/pages/`)
1. **employee-dashboard.tsx** - Employee dashboard
2. **employee-gas-sales.tsx** - Employee gas sales
3. **employee-cylinder-sales.tsx** - Employee cylinder sales
4. **employee-inventory-new.tsx** - Employee inventory management
5. **employee-reports.tsx** - Employee reports
6. **employee-dsr.tsx** - Employee DSR
7. **notifications.tsx** - Notifications list
8. **purchase-emp-management.tsx** - Employee purchase orders
9. **collection.tsx** - Collection (shared)
10. **rental-collection.tsx** - Rental collection (shared)

### Shared Components
- **main-layout.tsx** - Main layout wrapper with sidebar
- **app-sidebar.tsx** - Sidebar navigation (role-based menu)
- **login-form.tsx** - Login form
- **receipt-dialog.tsx** - Receipt generation
- **signature-dialog.tsx** - Digital signature capture
- **notification-popup.tsx** - Real-time notifications
- **invoice-settings-dialog.tsx** - Invoice settings

---

## 🔑 Key Features & Systems

### 1. **Unified Invoice Number System**
- Single counter for all transaction types
- Prevents duplicates across Sale, EmployeeSale, CylinderTransaction
- Auto-initialization from existing invoices
- Retry logic for race conditions

### 2. **Dual Inventory System**
- **Admin Inventory**: Centralized tracking (InventoryItem)
- **Employee Inventory**: Per-employee tracking (EmployeeInventoryItem)
- Stock assignments bridge the two systems

### 3. **Daily Sales Tracking (DSR)**
- Automatic tracking on every sale
- Separate tracking for admin and employees
- Tracks gas sales, cylinder sales (full/empty), refills
- Used for Daily Stock Reports

### 4. **Gas-Cylinder Conversion**
- Automatic conversion tracking
- Full cylinders contain gas
- Gas sales convert full→empty
- Full cylinder sales deduct both cylinder and gas

### 5. **Stock Assignment Workflow**
- Admin assigns → Employee accepts → Inventory updated
- No inventory deduction until employee accepts
- Supports return and reject flows

### 6. **Purchase Order Workflow**
- Admin PO: Create → Receive → Update inventory
- Employee PO: Create → Approve → Accept → Update inventory
- Auto-creates stock assignments for gas purchases

### 7. **Notification System**
- Real-time notifications for stock assignments
- Unread count tracking
- Popup notifications for employees

### 8. **Digital Signatures**
- Customer signature capture for sales
- Admin signature for receipts
- Stored as base64 images

### 9. **PWA Support**
- Service worker registration
- Install prompt
- Offline capability (basic)

### 10. **Invoice Generation**
- Sequential invoice numbers
- PDF generation (html2canvas + jspdf)
- Receipt printing

---

## 📊 Data Flow Examples

### Admin Gas Sale Flow
1. Admin creates sale via `/api/sales` POST
2. Validates stock in InventoryItem
3. Generates invoice number
4. Creates Sale record
5. Updates InventoryItem (deducts gas)
6. Converts full→empty cylinders (if applicable)
7. Updates DailySales for DSR
8. Returns sale data

### Employee Sale Flow
1. Employee creates sale via `/api/employee-sales` POST
2. Validates stock in EmployeeInventoryItem
3. Generates invoice number
4. Creates EmployeeSale record
5. Updates EmployeeInventoryItem (deducts stock)
6. Converts full→empty cylinders (if applicable)
7. Updates DailyEmployeeSales for DSR
8. Returns sale data

### Stock Assignment Flow
1. Admin creates assignment via `/api/stock-assignments` POST
2. Validates stock in InventoryItem
3. Creates StockAssignment (status: "assigned")
4. Creates Notification
5. Employee accepts via `/api/stock-assignments/[id]/receive`
6. Deducts from InventoryItem
7. Adds to EmployeeInventoryItem
8. Updates assignment status to "received"

### Purchase Order Flow
1. Admin creates PO via `/api/purchase-orders` POST
2. Creates PurchaseOrder (status: "pending")
3. Admin receives items via `/api/inventory/[id]` PATCH
4. Updates InventoryItem
5. Updates PurchaseOrder status to "completed"

---

## 🔒 Security Features

1. **JWT Authentication**: HTTP-only cookies, 24h expiry
2. **Password Hashing**: bcryptjs with salt rounds
3. **Role-Based Access**: Admin vs Employee permissions
4. **Token Validation**: Middleware protection for API routes
5. **User Status Check**: Active/inactive user validation
6. **Stock Validation**: Prevents overselling

---

## 📝 Notes & Considerations

1. **Invoice Number System**: Unified counter prevents duplicates across all transaction types
2. **Inventory Sync**: StockManager recalculates stock from transactions for accuracy
3. **DSR Tracking**: Automatic daily sales tracking for reporting
4. **Gas-Cylinder Logic**: Complex conversion logic handles full/empty states
5. **Employee Inventory**: Separate system for employee stock tracking
6. **Stock Assignments**: Two-phase commit (assign → accept) prevents inventory issues
7. **Purchase Orders**: Multi-item support with status tracking
8. **Notifications**: Real-time system for employee alerts

---

## 🚀 Deployment Considerations

- **Environment Variables**: MONGODB_URI, JWT_SECRET, ADMIN_EMAIL
- **Database**: MongoDB connection pooling
- **API Routes**: Next.js serverless functions
- **Static Assets**: Public folder for images, manifest
- **PWA**: Service worker for offline support

---

This comprehensive analysis covers all aspects of your Cylinder Management System. The system is well-structured with clear separation between admin and employee functionalities, robust inventory management, and comprehensive reporting capabilities.

