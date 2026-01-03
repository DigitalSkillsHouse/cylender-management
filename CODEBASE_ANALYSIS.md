# Complete Codebase Analysis - Cylinder Management System

## 📋 Executive Summary

This is a **comprehensive Gas & Cylinder Management System** built for **SYED TAYYAB INDUSTRIAL**. It's a full-stack Next.js 14 application that manages gas sales, cylinder transactions, inventory, employee operations, purchase orders, and financial reporting with separate workflows for admin and employee users.

---

## 🏗️ Architecture Overview

### Technology Stack

**Frontend:**
- **Framework**: Next.js 14 (App Router) with React 18
- **Language**: TypeScript + JavaScript
- **UI Library**: Radix UI + shadcn/ui components
- **Styling**: Tailwind CSS
- **State Management**: React Hooks (useState, useEffect)
- **Forms**: React Hook Form + Zod validation
- **Charts**: Recharts for data visualization
- **PDF Generation**: jsPDF + html2canvas
- **Icons**: Lucide React
- **PWA**: Service Worker support for offline capability

**Backend:**
- **Runtime**: Node.js
- **API**: Next.js API Routes (Serverless functions)
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: JWT (JSON Web Tokens) with HTTP-only cookies
- **Password Security**: bcryptjs (12 rounds)
- **Date Handling**: date-fns

**Key Libraries:**
- `mongoose` - MongoDB ODM
- `jsonwebtoken` - JWT authentication
- `bcryptjs` - Password hashing
- `react-signature-canvas` - Digital signature capture
- `xlsx` - Excel file import/export
- `axios` - HTTP client

---

## 🗄️ Database Architecture

### Core Models (30+ Models)

#### 1. **User Model** (`models/User.js`)
- **Purpose**: Admin and Employee accounts
- **Key Fields**:
  - `name`, `email`, `password` (hashed with bcrypt)
  - `role`: `"admin"` | `"employee"`
  - `status`: `"active"` | `"inactive"`
  - `debitAmount`, `creditAmount` - Financial tracking
  - `phone`, `address`, `position`, `salary`, `hireDate`
- **Methods**: `comparePassword()` - Password verification
- **Indexes**: email (unique)

#### 2. **Product Model** (`models/Product.js`)
- **Purpose**: Gas and Cylinder products catalog
- **Key Fields**:
  - `name`, `productCode` (unique, auto-generated: `CY-001`, `GA-001`)
  - `category`: `"gas"` | `"cylinder"`
  - `costPrice`, `leastPrice` - Pricing
  - `currentStock` - General stock (backward compatibility)
  - `availableEmpty`, `availableFull` - Cylinder-specific stock
  - `cylinderSize`: `"large"` | `"small"`
  - `cylinderStatus`: `"empty"` | `"full"`
- **Auto-generation**: Product codes follow pattern `INITIALS-XXX`

#### 3. **Customer Model** (`models/Customer.js`)
- **Purpose**: Customer master data
- **Key Fields**:
  - `name`, `serialNumber` (unique, auto: `CU-0001`)
  - `trNumber`, `phone`, `email`, `address`
  - `totalDebit`, `totalCredit`, `balance` (calculated) - Ledger tracking
- **Indexes**: serialNumber (unique)

#### 4. **Supplier Model** (`models/Supplier.js`)
- **Purpose**: Supplier/vendor management
- **Key Fields**: `companyName`, `contactPerson`, `phone`, `email`, `address`, `trNumber`, `invoiceNumber`
- **Status**: `"active"` | `"inactive"`

#### 5. **Sale Model** (`models/Sale.js`) - Admin Sales
- **Purpose**: Admin gas/cylinder sales transactions
- **Key Fields**:
  - `invoiceNumber` (unique, sequential, 4-digit padded)
  - `customer` (ref: Customer)
  - `items[]` - Array of sale items:
    - `product`, `category`, `quantity`, `price`, `total`
    - `cylinderSize`, `cylinderStatus` (for cylinders)
    - `cylinderProductId`, `gasProductId` - Gas-cylinder linking for DSR
  - `totalAmount`, `paymentMethod`, `paymentStatus`
  - `receivedAmount`, `customerSignature` (base64 image)
  - `notes`
- **Payment Methods**: `cash`, `card`, `bank_transfer`, `credit`, `debit`, `delivery_note`
- **Indexes**: customer, invoiceNumber (unique), paymentStatus

#### 6. **EmployeeSale Model** (`models/EmployeeSale.js`)
- **Purpose**: Employee gas/cylinder sales (separate from admin sales)
- **Key Fields**: Similar to Sale, but includes `employee` reference
- **Indexes**: employee, customer, invoiceNumber, paymentStatus

#### 7. **CylinderTransaction Model** (`models/Cylinder.js`)
- **Purpose**: Admin cylinder deposits, refills, returns
- **Key Fields**:
  - `invoiceNumber` (unique, sparse)
  - `type`: `"deposit"` | `"refill"` | `"return"`
  - `customer` (for deposit/return), `supplier` (for refill)
  - `product`, `items[]` - Multi-item support
  - `quantity`, `amount`, `depositAmount`, `refillAmount`, `returnAmount`
  - `paymentMethod`: `"cash"` | `"cheque"`
  - `status`: `"pending"` | `"cleared"` | `"overdue"`
  - `linkedDeposit` - For return transactions (links to original deposit)
- **Indexes**: invoiceNumber (unique, sparse), customer, supplier, type

#### 8. **EmployeeCylinderTransaction Model** (`models/EmployeeCylinderTransaction.js`)
- **Purpose**: Employee cylinder transactions
- **Key Fields**: Similar to CylinderTransaction, includes `employee` reference

#### 9. **StockAssignment Model** (`models/StockAssignment.js`)
- **Purpose**: Admin-to-Employee stock assignments
- **Key Fields**:
  - `employee`, `product`, `quantity`, `remainingQuantity`
  - `assignedBy`, `status`: `"assigned"` | `"received"` | `"returned"` | `"rejected"`
  - `assignedDate`, `receivedDate`, `returnedDate`, `rejectedDate`
  - `leastPrice`, `category`, `cylinderStatus`, `displayCategory`
  - `gasProductId`, `cylinderProductId` - For full cylinders with gas
- **Workflow**: Admin assigns → Employee accepts → Inventory updated

#### 10. **InventoryItem Model** (`models/InventoryItem.js`) - Admin Inventory
- **Purpose**: Centralized admin inventory tracking (source of truth)
- **Key Fields**:
  - `product` (unique, ref: Product)
  - `category`: `"gas"` | `"cylinder"`
  - `currentStock` - For gas products
  - `availableEmpty`, `availableFull` - For cylinders
  - `cylinderSize`, `gasType` - Metadata
  - `lastUpdatedAt` - Audit trail
- **Purpose**: Separate from Product model for better inventory management

#### 11. **EmployeeInventoryItem Model** (`models/EmployeeInventoryItem.js`)
- **Purpose**: Per-employee inventory tracking
- **Key Fields**:
  - `employee`, `product` (compound unique index)
  - `category`, `currentStock`, `availableEmpty`, `availableFull`
  - `cylinderSize`, `gasType`
- **Purpose**: Tracks inventory assigned to each employee

#### 12. **PurchaseOrder Model** (`models/PurchaseOrder.js`) - Admin Purchases
- **Purpose**: Admin purchase orders from suppliers
- **Key Fields**:
  - `supplier`, `purchaseDate`, `poNumber` (unique)
  - `items[]` - Array of purchase items:
    - `product`, `purchaseType`: `"gas"` | `"cylinder"`
    - `cylinderStatus`, `gasType`, `emptyCylinderId`
    - `quantity`, `unitPrice`, `itemTotal`
    - `inventoryStatus`: `"pending"` | `"received"`
  - `totalAmount`, `status`, `inventoryStatus`
  - `createdBy` (ref: User)
- **Status Flow**: `pending` → `completed`

#### 13. **EmployeePurchaseOrder Model** (`models/EmployeePurchaseOrder.js`)
- **Purpose**: Employee purchase orders (for inventory requests)
- **Key Fields**:
  - `supplier`, `product`, `employee`
  - `purchaseType`, `cylinderSize`, `cylinderStatus`
  - `quantity`, `unitPrice`, `totalAmount`
  - `status`: `"pending"` | `"assigned"` | `"approved"` | `"completed"` | `"cancelled"`
  - `inventoryStatus`: `"pending"` | `"assigned"` | `"approved"` | `"received"`
  - `emptyCylinderId` - For gas purchases
  - `autoApproved` - Flag for auto-approval
  - `poNumber` - Format `EMP-XXXXX`
- **Workflow**: Create → Approve → Accept → Update inventory

#### 14. **DailySales Model** (`models/DailySales.js`) - Admin DSR
- **Purpose**: Daily sales aggregation for Daily Sales Report (DSR)
- **Key Fields**:
  - `date` (YYYY-MM-DD), `productId`, `productName`, `category`
  - `gasSalesQuantity`, `gasSalesAmount`
  - `fullCylinderSalesQuantity`, `fullCylinderSalesAmount`
  - `emptyCylinderSalesQuantity`, `emptyCylinderSalesAmount`
  - `cylinderSalesQuantity`, `cylinderSalesAmount`
  - `cylinderProductId`, `cylinderName` - Gas-cylinder linking
  - `cylinderRefillsQuantity` - Refill tracking
  - `transferQuantity`, `transferAmount`, `receivedBackQuantity` - Stock transfers
- **Index**: Unique on (date, productId)
- **Purpose**: Pre-aggregated data for fast DSR generation

#### 15. **DailyEmployeeSales Model** (`models/DailyEmployeeSales.js`)
- **Purpose**: Employee daily sales aggregation
- **Key Fields**: Similar to DailySales, includes `employeeId`
- **Index**: Unique on (date, employeeId, productId)

#### 16. **DailyCylinderTransaction Model** (`models/DailyCylinderTransaction.js`)
- **Purpose**: Daily cylinder transaction aggregation
- **Key Fields**:
  - `date`, `cylinderProductId`, `employeeId` (nullable)
  - `depositQuantity`, `depositAmount`
  - `refillQuantity`, `refillAmount`
  - `returnQuantity`, `returnAmount`

#### 17. **DailyStockReport Model** (`models/DailyStockReport.js`) - Admin DSR
- **Purpose**: Daily Stock Report entries
- **Key Fields**:
  - `date`, `itemName`
  - `openingFull`, `openingEmpty`
  - `refilled`, `cylinderSales`, `gasSales`
  - `closingFull`, `closingEmpty` (optional)
- **Index**: Unique on (employeeId, itemName, date)

#### 18. **EmployeeDailyStockReport Model** (`models/EmployeeDailyStockReport.js`)
- **Purpose**: Employee DSR entries
- **Key Fields**: Similar to DailyStockReport, includes `employeeId`

#### 19. **Counter Model** (`models/Counter.js`)
- **Purpose**: Sequential number generation
- **Key Fields**:
  - `key`: `"unified_invoice_counter"` | `"rc_no_counter"` | `"invoice_start"`
  - `year`, `seq` - Sequential number
- **Usage**: Atomic operations for invoice number generation

#### 20. **Notification Model** (`models/Notification.js`)
- **Purpose**: System notifications
- **Key Fields**:
  - `recipient` (ref: User), `sender` (ref: User)
  - `type`: `"stock_assignment"` | `"stock_received"` | `"stock_returned"` | `"payment_due"` | `"general"`
  - `title`, `message`, `relatedId`
  - `isRead`, `readAt`
- **Purpose**: Real-time notifications for employees

#### 21. **Rental Model** (`models/Rental.js`)
- **Purpose**: Rental collection invoices
- **Key Fields**:
  - `customer`, `rentalNumber`, `date`
  - `items[]`, `subtotal`, `totalVat`, `finalTotal`
  - `status`: `"active"` | `"returned"` | `"overdue"`

#### 22. **Expense Model** (`models/Expense.js`)
- **Purpose**: Expense tracking
- **Key Fields**: `invoiceNumber`, `expense`, `description`, `vatAmount`, `totalAmount`

#### 23. **Additional Models**:
- `AdminSignature` - Admin signature storage
- `EmployeeSignature` - Employee signature storage
- `ReturnTransaction` - Return transaction tracking
- `InactiveCustomerView` - View for inactive customers
- `EmpGasSales` - Legacy employee gas sales tracking
- `EmpStockEmp` - Legacy stock tracking
- `DailyRefill` - Daily refill aggregation
- `DailyEmployeeSalesAggregation` - Employee sales aggregation
- `DailyEmployeeCylinderAggregation` - Employee cylinder aggregation

---

## 🔐 Authentication & Security

### Authentication Flow

1. **Login** (`/api/auth/login`):
   - Validates email, password, and userType (admin/employee)
   - Checks user exists and password matches (bcrypt comparison)
   - Validates userType matches actual role
   - Creates JWT token (24h expiry)
   - Sets HTTP-only cookie (prevents XSS attacks)
   - Returns user data (without password)

2. **Token Verification** (`lib/auth.js`):
   - Extracts token from HTTP-only cookie
   - Verifies JWT signature using `JWT_SECRET`
   - Checks user exists and is active (`isActive` flag)
   - Returns user data

3. **Session Validation** (`/api/auth/validate`):
   - Validates token on page refresh
   - Returns current user data
   - Used for client-side session persistence

4. **Logout** (`/api/auth/logout`):
   - Clears HTTP-only cookie
   - No client-side storage cleanup needed

### Middleware (`middleware.js`)

- **Protection**: All `/api/*` routes (except `/api/auth/*`)
- **Validation**: Checks for token presence in cookies
- **Simple Validation**: Token length check (basic validation)
- **Note**: Full JWT verification happens in individual API routes via `verifyToken()`

### Security Features

1. **Password Security**: bcryptjs with 12 salt rounds
2. **JWT Tokens**: HTTP-only cookies (prevents XSS)
3. **Token Expiry**: 24-hour expiration
4. **Role-Based Access**: Admin vs Employee permissions
5. **User Status Check**: Active/inactive validation
6. **Stock Validation**: Prevents overselling
7. **Data Isolation**: Employees can only access their own data

---

## 🔄 Core Business Logic

### 1. Invoice Number Generation (`lib/invoice-generator.js`)

**System**: Centralized Counter System
- **Model**: Counter with key `"unified_invoice_counter"`
- **Format**: 4-digit padded (e.g., "10000", "10001")
- **Uniqueness**: Atomic MongoDB operations prevent duplicates
- **Initialization**: Auto-initializes from highest existing invoice OR configured starting number
- **Retry Logic**: `getNextInvoiceNumberWithRetry()` with uniqueness verification
- **Usage**: All sales and transactions use same counter
- **Collections Checked**: Sale, EmployeeSale, CylinderTransaction
- **RC-NO Generation**: Separate counter for receipt collection numbers

**Key Functions**:
- `getNextInvoiceNumber()` - Generate next invoice number
- `verifyInvoiceUniqueness()` - Verify no duplicates exist
- `initializeInvoiceCounter()` - Initialize counter on first use
- `getNextRcNo()` - Generate receipt collection number

### 2. Stock Management (`lib/stock-manager.js`)

**System**: Centralized Stock Calculation
- **Purpose**: Recalculates stock from all transactions for accuracy
- **Formula**: 
  ```
  Stock = Total Received + Cylinder Returns - Regular Sales - Employee Sales - Cylinder Deposits/Refills
  ```
- **Validation**: Checks stock availability before operations
- **Sync**: Synchronizes Product.currentStock with calculated value
- **Breakdown**: Provides detailed stock breakdown for debugging

**Key Functions**:
- `calculateCurrentStock(productId)` - Calculate stock from transactions
- `syncProductStock(productId)` - Sync single product
- `syncAllProductsStock()` - Sync all products
- `validateStockOperation()` - Validate if operation is feasible
- `getStockBreakdown()` - Get detailed breakdown

### 3. Inventory System

**Dual Inventory System**:

1. **Admin Inventory** (`InventoryItem`):
   - Source of truth for admin stock
   - Tracks: `currentStock` (gas), `availableEmpty`, `availableFull` (cylinders)
   - Updated on:
     - Purchase orders (when received)
     - Sales (when sold)
     - Stock assignments (when employee receives/returns)
     - Cylinder transactions

2. **Employee Inventory** (`EmployeeInventoryItem`):
   - Per-employee inventory tracking
   - Tracks: `currentStock`, `availableEmpty`, `availableFull`
   - Updated on:
     - Stock assignments (when employee accepts)
     - Employee sales (when sold)
     - Employee purchase orders (when accepted)

3. **Product Model** (`Product`):
   - Backward compatibility layer
   - `currentStock` synced from InventoryItem
   - Used for product catalog display

### 4. Gas-Cylinder Conversion Logic

**Complex Conversion System**:

1. **Gas Sale**:
   - Deducts gas stock (`InventoryItem.currentStock--`)
   - Converts full cylinders → empty cylinders (`availableFull--`, `availableEmpty++`)
   - Tracks in DailySales (gas sales + cylinder usage)
   - Links `gasProductId` and `cylinderProductId` for DSR

2. **Full Cylinder Sale**:
   - Deducts full cylinder stock (`availableFull--`)
   - Deducts gas stock (if `gasProductId` provided)
   - Tracks in DailySales (cylinder sales + gas sales)
   - Creates empty cylinder (`availableEmpty++`)

3. **Empty Cylinder Sale**:
   - Deducts empty cylinder stock only (`availableEmpty--`)
   - No gas deduction

### 5. Daily Sales Tracking (DSR)

**Pre-Aggregation System**:

1. **Admin DSR** (`DailySales`):
   - Tracks gas sales, cylinder sales (full/empty), refills
   - Per product, per date
   - Used for Daily Stock Reports
   - Auto-updated on every sale

2. **Employee DSR** (`DailyEmployeeSales`):
   - Similar to admin but per employee
   - Tracks employee-specific sales
   - Auto-updated on employee sales

3. **Cylinder DSR** (`DailyCylinderTransaction`):
   - Tracks deposits, refills, returns
   - Per cylinder product, per date

### 6. Stock Assignment Flow

**Two-Phase Commit System**:

1. **Admin Creates Assignment**:
   - Validates stock availability (`InventoryItem`)
   - Creates `StockAssignment` (status: `"assigned"`)
   - Creates `Notification` for employee
   - **Does NOT deduct inventory yet**

2. **Employee Accepts**:
   - Employee calls `/api/stock-assignments/[id]/receive`
   - Deducts from admin `InventoryItem`
   - Adds to employee `EmployeeInventoryItem`
   - Updates assignment status to `"received"`
   - Updates `Product.currentStock`

3. **Employee Returns**:
   - Employee calls `/api/stock-assignments/[id]/return`
   - Adds back to admin `InventoryItem`
   - Deducts from employee `EmployeeInventoryItem`
   - Updates assignment status to `"returned"`

4. **Employee Rejects**:
   - Updates status to `"rejected"`
   - No inventory changes

### 7. Purchase Order Flow

**Admin Purchase Order**:
1. Create PO with items (status: `"pending"`)
2. Inventory status: `"pending"`
3. When received: Update `InventoryItem`, update `Product.currentStock`
4. Status: `"completed"`

**Employee Purchase Order**:
1. Create PO (by employee or admin assignment)
2. Status: `"pending"` → `"approved"` → `"completed"`
3. Inventory status: `"pending"` → `"assigned"` → `"approved"` → `"received"`
4. For gas purchases: Creates stock assignment automatically
5. Employee must accept from inventory (`/api/employee-inventory-new/accept`)

### 8. Cylinder Transaction Flow

**Deposit**:
- Customer deposits cylinder with gas
- Deducts empty cylinder + gas from inventory
- Status: `"pending"` (until return)
- Updates `DailyCylinderTransaction`

**Refill**:
- Supplier refills empty cylinder
- Deducts gas, converts empty→full
- Updates `DailyCylinderTransaction`

**Return**:
- Customer returns empty cylinder
- Adds to `availableEmpty`
- Links to deposit (`linkedDeposit`)
- Updates deposit status to `"cleared"`
- Updates `DailyCylinderTransaction`

---

## 🛣️ API Routes Architecture

### Authentication Routes (`/api/auth/`)

- `POST /api/auth/login` - User login
- `GET /api/auth/validate` - Validate session
- `POST /api/auth/logout` - User logout
- `GET /api/auth/init` - Initialize admin user

### Sales Routes (`/api/sales/`)

- `GET /api/sales` - List all admin sales
- `POST /api/sales` - Create admin sale
  - Validates inventory availability
  - Generates invoice number
  - Updates inventory (gas/cylinder conversion)
  - Updates DailySales for DSR
- `GET /api/sales/[id]` - Get single sale
- `PUT /api/sales/[id]` - Update sale
- `DELETE /api/sales/[id]` - Delete sale

### Employee Sales Routes (`/api/employee-sales/`)

- `GET /api/employee-sales` - List employee sales (filterable by employeeId)
- `POST /api/employee-sales` - Create employee sale
  - Validates employee inventory
  - Uses leastPrice from inventory
  - Updates employee inventory
  - Updates DailyEmployeeSales
- `GET /api/employee-sales/[id]` - Get single employee sale
- `PUT /api/employee-sales/[id]` - Update employee sale
- `DELETE /api/employee-sales/[id]` - Delete employee sale

### Cylinder Routes (`/api/cylinders/`)

- `GET /api/cylinders` - List all cylinder transactions
- `POST /api/cylinders/deposit` - Create deposit
  - Multi-item support
  - Updates inventory
  - Updates DailyCylinderTransaction
- `POST /api/cylinders/refill` - Create refill
  - Updates inventory (empty→full conversion)
  - Updates DailyCylinderTransaction
- `POST /api/cylinders/return` - Create return
  - Links to deposit
  - Updates inventory
  - Updates deposit status to "cleared"
- `GET /api/cylinders/[id]` - Get single transaction
- `PUT /api/cylinders/[id]` - Update transaction
- `DELETE /api/cylinders/[id]` - Delete transaction

### Stock Assignment Routes (`/api/stock-assignments/`)

- `GET /api/stock-assignments` - List assignments (filterable by employeeId, status, date)
- `POST /api/stock-assignments` - Create assignment
  - Validates stock availability
  - Creates notification
  - Does NOT deduct inventory
- `GET /api/stock-assignments/[id]` - Get single assignment
- `PUT /api/stock-assignments/[id]/receive` - Employee accepts assignment
  - Deducts from admin inventory
  - Adds to employee inventory
- `PUT /api/stock-assignments/[id]/return` - Employee returns stock
  - Adds back to admin inventory
  - Deducts from employee inventory
- `PUT /api/stock-assignments/[id]/reject` - Employee rejects assignment

### Purchase Order Routes (`/api/purchase-orders/`)

- `GET /api/purchase-orders` - List all purchase orders
- `POST /api/purchase-orders` - Create purchase order
  - Multi-item support
  - Validates products exist
  - Status: "pending"
- `GET /api/purchase-orders/[id]` - Get single purchase order
- `PUT /api/purchase-orders/[id]` - Update purchase order
  - When received: Updates inventory
- `DELETE /api/purchase-orders/[id]` - Delete purchase order

### Employee Purchase Order Routes (`/api/employee-purchase-orders/`)

- `GET /api/employee-purchase-orders` - List employee purchase orders (filtered by employeeId)
- `POST /api/employee-purchase-orders` - Create employee purchase order
  - Auto-generates PO number (EMP-XXXXX)
  - For gas purchases: Requires emptyCylinderId
  - Creates stock assignment automatically
- `GET /api/employee-purchase-orders/[id]` - Get single employee purchase order
- `PUT /api/employee-purchase-orders/[id]` - Update employee purchase order

### Inventory Routes (`/api/inventory/`)

- `GET /api/inventory` - List all inventory items
- `PATCH /api/inventory/[id]` - Update inventory status
- `PATCH /api/inventory/item/[orderId]/[itemIndex]` - Update individual item status
- `POST /api/inventory/sync-stock` - Sync Product.currentStock with InventoryItem

### Employee Inventory Routes (`/api/employee-inventory-new/`)

- `GET /api/employee-inventory-new/assignments` - Pending stock assignments
- `GET /api/employee-inventory-new/pending` - Pending purchase orders
- `GET /api/employee-inventory-new/received` - Received inventory
- `POST /api/employee-inventory-new/accept` - Accept assignment/purchase
  - Updates employee inventory
  - Deducts from admin inventory (if assignment)
- `POST /api/employee-inventory-new/send-back` - Return stock to admin

### Customer Routes (`/api/customers/`)

- `GET /api/customers` - List all customers
- `POST /api/customers` - Create customer
  - Auto-generates serialNumber (CU-XXXX)
- `GET /api/customers/[id]` - Get single customer
- `PUT /api/customers/[id]` - Update customer
- `DELETE /api/customers/[id]` - Delete customer
- `POST /api/customers/import` - Import customers from Excel

### Product Routes (`/api/products/`)

- `GET /api/products` - List all products
- `POST /api/products` - Create product
  - Auto-generates productCode
  - Prevents duplicates (name + category)
- `GET /api/products/[id]` - Get single product
- `PUT /api/products/[id]` - Update product
- `DELETE /api/products/[id]` - Delete product

### Employee Routes (`/api/employees/`)

- `GET /api/employees` - List all employees
- `POST /api/employees` - Create employee (role: "employee")
- `GET /api/employees/[id]` - Get single employee
- `PUT /api/employees/[id]` - Update employee
- `DELETE /api/employees/[id]` - Delete employee

### Report Routes (`/api/reports/`)

- `GET /api/reports/stats` - Overall statistics
- `GET /api/reports/ledger` - Customer/employee ledger
- `GET /api/reports/cash-paper` - Cash flow report
  - Date range filtering
  - Payment method breakdown
  - Employee-specific filtering

### Daily Stock Report Routes (`/api/daily-stock-reports/`)

- `GET /api/daily-stock-reports` - Get DSR for date
- `POST /api/daily-stock-reports` - Create/update DSR
- `GET /api/daily-stock-reports/previous` - Get previous DSR

### Employee DSR Routes (`/api/employee-daily-stock-reports/`)

- `GET /api/employee-daily-stock-reports` - Get employee DSR
- `POST /api/employee-daily-stock-reports` - Create/update employee DSR
- `GET /api/employee-daily-stock-reports/previous` - Get previous employee DSR

### Notification Routes (`/api/notifications/`)

- `GET /api/notifications` - List notifications (filtered by userId)
- `PUT /api/notifications/[id]/read` - Mark as read
- `DELETE /api/notifications/[id]` - Delete notification

### Collection Routes (`/api/collections/`)

- `GET /api/collections` - List collections
- `POST /api/collections` - Create collection
  - Updates customer balance
- `GET /api/collections/rc-no` - Get next RC-NO

### Rental Routes (`/api/rentals/`)

- `GET /api/rentals` - List rentals
- `POST /api/rentals` - Create rental
  - Calculates VAT
  - Tracks rental items

### Profit & Loss Routes (`/api/profit-loss/`)

- `GET /api/profit-loss` - Get P&L report
  - Date range filtering
  - Revenue, expenses, profit calculation

### Dashboard Routes (`/api/dashboard/stats`)

- `GET /api/dashboard/stats` - Get dashboard statistics
  - Total revenue
  - Gas sales revenue
  - Cylinder revenue
  - Total due
  - Customer/employee counts
  - Products sold
  - Inactive customers alert

### Additional Routes

- `GET /api/suppliers` - Supplier management
- `GET /api/expenses` - Expense tracking
- `GET /api/invoice-settings` - Invoice settings
- `POST /api/invoice-settings` - Update invoice settings
- `GET /api/admin/pending-returns` - Admin pending returns
- `POST /api/admin/accept-return` - Admin accept return

---

## 🎨 Frontend Architecture

### Main Layout (`components/main-layout.tsx`)

- **Routing**: URL-based page parameter (`?page=dashboard`)
- **Sidebar**: Role-based navigation (admin vs employee)
- **State Management**: User data, notifications, unread count
- **Real-time Updates**: Notification polling

### Admin Pages (`components/pages/`)

1. **dashboard.tsx** - Admin dashboard with statistics
2. **product-management.tsx** - Product CRUD operations
3. **supplier-management.tsx** - Supplier CRUD
4. **purchase-management.tsx** - Purchase order management
5. **inventory.tsx** - Inventory management
6. **gas-sales.tsx** - Gas/cylinder sales interface
7. **cylinder-management.tsx** - Cylinder transactions
8. **customer-management.tsx** - Customer CRUD
9. **employee-management.tsx** - Employee management
10. **reports.tsx** - Reports dashboard
11. **daily-stock-report.tsx** - DSR management
12. **profit-loss.tsx** - P&L report
13. **collection.tsx** - Collection management
14. **rental-collection.tsx** - Rental management

### Employee Pages (`components/pages/`)

1. **employee-dashboard.tsx** - Employee overview
2. **emp-gas-sale.tsx** - Employee gas sales
3. **employee-cylinder-sales.tsx** - Employee cylinder transactions
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
- **receipt-dialog.tsx** - Receipt generation (PDF)
- **signature-dialog.tsx** - Digital signature capture
- **notification-popup.tsx** - Real-time notifications
- **invoice-settings-dialog.tsx** - Invoice settings
- **cash-paper-section.tsx** - Cash paper with date range filtering

### UI Components (`components/ui/`)

- Built with Radix UI + shadcn/ui
- Includes: Button, Dialog, Input, Select, Table, Tabs, Toast, etc.
- Fully typed with TypeScript

---

## 🔑 Key Features

### 1. Dual User System
- **Admin**: Full system access, manages employees, inventory, reports
- **Employee**: Limited access, manages own inventory, sales, reports
- **Role-Based UI**: Different navigation and features per role

### 2. Inventory Management
- **Multi-Level**: Admin inventory + Employee inventory
- **Real-Time Updates**: Stock updates on every transaction
- **Stock Validation**: Prevents overselling
- **Stock Sync**: Automatic synchronization between models

### 3. Cylinder Lifecycle
- **Deposit → Refill → Return** tracking
- **Status Management**: Pending, cleared, overdue
- **Linking**: Returns link to original deposits
- **Multi-Item Support**: Handle multiple cylinders per transaction

### 4. Gas-Cylinder Linking
- **Automatic Conversion**: Full→Empty on gas sales
- **DSR Tracking**: Links gas sales to cylinder usage
- **Inventory Updates**: Handles both gas and cylinder stock

### 5. Daily Reports (DSR)
- **Pre-Aggregation**: DailySales model for fast queries
- **Separate Tracking**: Admin and employee DSR
- **Cylinder Tracking**: Separate cylinder transaction aggregation
- **Date Range Filtering**: Flexible reporting

### 6. Stock Assignments
- **Two-Phase Commit**: Assign → Accept workflow
- **No Inventory Deduction**: Until employee accepts
- **Notifications**: Real-time alerts for employees
- **Return/Reject**: Full workflow support

### 7. Purchase Orders
- **Multi-Item Support**: Handle multiple products
- **Status Tracking**: Pending → Completed
- **Inventory Integration**: Auto-updates on receive
- **Employee POs**: Separate workflow for employee purchases

### 8. Customer Ledger
- **Credit/Debit Tracking**: Per customer
- **Balance Calculation**: Automatic
- **Payment Status**: Track outstanding payments
- **Collection Management**: Payment collection tracking

### 9. Invoice Generation
- **Sequential Numbers**: Unified counter system
- **Uniqueness**: Verified across all transaction types
- **Retry Logic**: Handles race conditions
- **RC-NO**: Separate counter for receipt collection

### 10. Notifications
- **Real-Time**: Polling-based updates
- **Types**: Stock assignments, payments, general
- **Unread Count**: Track unread notifications
- **Popup Alerts**: Visual notifications for employees

### 11. Digital Signatures
- **Customer Signatures**: Capture on sales
- **Admin Signatures**: For receipts
- **Storage**: Base64 image storage
- **Canvas-Based**: react-signature-canvas

### 12. PDF Generation
- **Receipts**: Sales receipts with signatures
- **Cash Paper**: Cash flow reports
- **Invoice Printing**: Printable invoices
- **Tools**: html2canvas + jsPDF

### 13. PWA Support
- **Service Worker**: Offline capability
- **Install Prompt**: Add to home screen
- **Manifest**: App manifest for installation

### 14. Excel Import/Export
- **Customer Import**: Bulk customer import
- **Data Export**: Export reports to Excel
- **Library**: xlsx

---

## 📊 Data Flow Examples

### Admin Gas Sale Flow

```
1. Admin creates sale via POST /api/sales
2. Validates customer and products exist
3. Checks stock in InventoryItem
4. Generates invoice number (unified counter)
5. Creates Sale record
6. Updates InventoryItem:
   - Deducts gas stock (currentStock--)
   - Converts full→empty cylinders (availableFull--, availableEmpty++)
7. Updates DailySales for DSR
8. Updates Product.currentStock (backward compatibility)
9. Updates customer balance (if credit)
10. Returns sale data
```

### Employee Sale Flow

```
1. Employee creates sale via POST /api/employee-sales
2. Validates customer and products exist
3. Checks stock in EmployeeInventoryItem
4. Generates invoice number (unified counter)
5. Creates EmployeeSale record
6. Updates EmployeeInventoryItem:
   - Deducts gas stock (currentStock--)
   - Converts full→empty cylinders (availableFull--, availableEmpty++)
7. Updates DailyEmployeeSales for DSR
8. Updates customer balance (if credit)
9. Returns sale data
```

### Stock Assignment Flow

```
1. Admin creates assignment via POST /api/stock-assignments
2. Validates stock in InventoryItem
3. Creates StockAssignment (status: "assigned")
4. Creates Notification for employee
5. Employee accepts via PUT /api/stock-assignments/[id]/receive
6. Deducts from admin InventoryItem
7. Creates/updates EmployeeInventoryItem
8. Updates assignment status to "received"
9. Updates Product.currentStock
```

### Purchase Order Flow

```
1. Admin creates PO via POST /api/purchase-orders
2. Creates PurchaseOrder (status: "pending")
3. Admin receives items via PUT /api/purchase-orders/[id]
4. Updates InventoryItem:
   - Gas: Increases currentStock
   - Cylinders: Updates availableEmpty/availableFull
5. Updates Product.currentStock
6. Updates PurchaseOrder status to "completed"
```

### Cylinder Deposit Flow

```
1. Customer deposits cylinder via POST /api/cylinders/deposit
2. Validates customer and cylinder product
3. Generates invoice number
4. Creates CylinderTransaction (type: "deposit")
5. Updates InventoryItem:
   - Deducts empty cylinders (availableEmpty--)
   - Deducts gas stock (if gas provided)
6. Updates DailyCylinderTransaction
7. Updates customer balance (debit)
```

### Cylinder Return Flow

```
1. Customer returns cylinder via POST /api/cylinders/return
2. Links to original deposit (linkedDeposit)
3. Creates CylinderTransaction (type: "return")
4. Updates InventoryItem:
   - Adds empty cylinders (availableEmpty++)
5. Updates deposit status to "cleared"
6. Updates DailyCylinderTransaction
7. Updates customer balance (credit/refund)
```

---

## 🔒 Security Implementation

### Authentication Security

1. **JWT Tokens**: HTTP-only cookies (prevents XSS)
2. **Token Expiry**: 24-hour expiration
3. **Password Hashing**: bcryptjs with 12 salt rounds
4. **Token Verification**: Full JWT signature verification
5. **User Status Check**: Active/inactive validation
6. **Role Validation**: UserType must match role

### Authorization Security

1. **Role-Based Access**: Admin vs Employee permissions
2. **Data Isolation**: Employees can only access their own data
3. **API Protection**: Middleware protects all API routes
4. **Stock Validation**: Prevents overselling
5. **Inventory Validation**: Checks availability before operations

### Data Security

1. **Password Storage**: Never stored in plain text
2. **User Data**: Password excluded from responses
3. **Session Management**: Server-side session validation
4. **Cookie Security**: HTTP-only, secure in production

---

## 🚀 Deployment

### Environment Variables

- `MONGODB_URI` - MongoDB connection string
- `JWT_SECRET` - JWT signing secret
- `ADMIN_EMAIL` - Admin email for login validation (optional)
- `NODE_ENV` - Environment (development/production)
- `PORT` - Server port (default: 3000)

### Server Configuration

- **Custom Server**: `server.js` for production
- **Next.js**: App Router with API routes
- **Database**: MongoDB with connection pooling
- **Static Assets**: Public folder for images, manifest
- **PWA**: Service worker for offline support

### Build & Run

```bash
# Install dependencies
npm install

# Development
npm run dev

# Production build
npm run build

# Production start
npm start
```

---

## 📝 Key Design Decisions

1. **Separate Models for Admin/Employee**: 
   - Sale vs EmployeeSale
   - CylinderTransaction vs EmployeeCylinderTransaction
   - Separate inventory tracking

2. **Dual Inventory System**: 
   - InventoryItem (admin) + EmployeeInventoryItem (employee)
   - Product model for backward compatibility

3. **Daily Aggregation**: 
   - Separate models for daily reports (performance optimization)
   - Pre-aggregated data for fast queries

4. **Centralized Invoice Counter**: 
   - Single counter for all transaction types
   - Prevents duplicates across collections

5. **InventoryItem vs Product**: 
   - InventoryItem is source of truth
   - Product for backward compatibility and catalog

6. **Gas-Cylinder Linking**: 
   - Automatic conversion tracking for DSR
   - Links gas sales to cylinder usage

7. **Stock Assignment Flow**: 
   - Two-phase commit (assign → accept)
   - No inventory deduction until employee accepts

8. **Notification System**: 
   - Real-time polling-based updates
   - Separate notification model for tracking

---

## 🎯 System Capabilities

### Admin Capabilities

- ✅ Full product management (CRUD)
- ✅ Customer management (CRUD)
- ✅ Employee management (CRUD)
- ✅ Supplier management (CRUD)
- ✅ Purchase order management
- ✅ Inventory management
- ✅ Gas/cylinder sales
- ✅ Cylinder transactions (deposit, refill, return)
- ✅ Stock assignments to employees
- ✅ Daily stock reports (DSR)
- ✅ Financial reports (cash paper, ledger, P&L)
- ✅ Collection management
- ✅ Rental management
- ✅ Expense tracking
- ✅ Invoice settings
- ✅ Dashboard with statistics

### Employee Capabilities

- ✅ View own dashboard
- ✅ Gas/cylinder sales
- ✅ Cylinder transactions
- ✅ View assigned inventory
- ✅ Accept stock assignments
- ✅ Return stock to admin
- ✅ Create purchase orders
- ✅ Accept purchase orders
- ✅ View own sales history
- ✅ Daily stock reports (DSR)
- ✅ View notifications
- ✅ Collection management
- ✅ Rental collection

---

## 🔍 Code Quality & Best Practices

### Code Organization

- **Separation of Concerns**: Models, API routes, components separated
- **Reusable Utilities**: Invoice generator, stock manager, auth utilities
- **Type Safety**: TypeScript for frontend, JSDoc for backend
- **Error Handling**: Try-catch blocks with proper error messages
- **Logging**: Console logging for debugging and tracking

### Database Design

- **Indexes**: Proper indexes on frequently queried fields
- **References**: Proper MongoDB references with populate
- **Validation**: Schema validation at model level
- **Atomic Operations**: Counter updates use atomic operations
- **Unique Constraints**: Prevent duplicate data

### API Design

- **RESTful**: Follows REST conventions
- **Error Handling**: Consistent error responses
- **Validation**: Input validation before processing
- **Status Codes**: Proper HTTP status codes
- **Response Format**: Consistent JSON response format

---

## 📈 Performance Optimizations

1. **Daily Aggregation**: Pre-aggregated data for fast DSR queries
2. **Indexes**: Database indexes on frequently queried fields
3. **Connection Pooling**: MongoDB connection pooling
4. **Selective Population**: Only populate required fields
5. **Caching**: Disabled for dynamic routes (force-dynamic)
6. **Batch Operations**: Batch updates where possible

---

## 🐛 Known Issues & Considerations

1. **Middleware Validation**: Simple token length check (could be improved)
2. **Stock Calculation**: Complex calculation may be slow for large datasets
3. **Notification Polling**: Polling-based (could use WebSockets)
4. **PWA Offline**: Basic offline support (could be enhanced)
5. **Error Messages**: Some error messages could be more user-friendly
6. **Data Migration**: Migration scripts for existing data

---

## 📚 Documentation Files

The codebase includes several documentation files:
- `PROJECT_COMPREHENSIVE_ANALYSIS.md` - Comprehensive project analysis
- `PROJECT_DEEP_ANALYSIS.md` - Deep technical analysis
- `ADMIN_NOTIFICATIONS_IMPLEMENTATION.md` - Notification system docs
- `ASSIGNMENT_FIX_SUMMARY.md` - Stock assignment fixes
- `DOUBLE_DEDUCTION_FIX.md` - Inventory deduction fixes
- `EMPLOYEE_PURCHASE_FLOW_STATUS.md` - Employee purchase flow
- `INVENTORY_MODEL_FIX.md` - Inventory model fixes
- `NOTIFICATION_OPTIMIZATION.md` - Notification optimizations
- `AUTHENTICATION_DATA_SHARING_ISSUE_ANALYSIS.md` - Auth fixes

---

## 🎓 Conclusion

This is a **comprehensive, production-ready gas and cylinder management system** with:

- ✅ **Robust Architecture**: Well-structured codebase with clear separation of concerns
- ✅ **Dual User System**: Separate workflows for admin and employees
- ✅ **Complex Business Logic**: Handles gas-cylinder conversions, stock assignments, DSR tracking
- ✅ **Security**: JWT authentication, role-based access, password hashing
- ✅ **Scalability**: Pre-aggregated data, indexes, connection pooling
- ✅ **User Experience**: Modern UI, real-time notifications, PWA support
- ✅ **Reporting**: Comprehensive reports (DSR, cash paper, ledger, P&L)
- ✅ **Inventory Management**: Multi-level inventory with stock validation

The system is designed for a gas distribution business with multiple employees, complex inventory tracking (gas + cylinders), and comprehensive reporting needs.

---

**Last Updated**: Based on current codebase analysis
**Version**: 0.1.0
**Framework**: Next.js 14, React 18, MongoDB, TypeScript

