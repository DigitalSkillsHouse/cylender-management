# Complete Project Analysis - Gas & Cylinder Management System

## Project Overview
This is a comprehensive **Gas and Cylinder Management System** built with Next.js 14, React, MongoDB, and TypeScript. It manages gas sales, cylinder transactions, inventory, employee operations, and financial reporting for an industrial gas business.

---

## Technology Stack

### Frontend
- **Framework**: Next.js 14 (App Router)
- **UI Library**: React 18 with TypeScript
- **UI Components**: Radix UI + shadcn/ui
- **Styling**: Tailwind CSS
- **State Management**: React Hooks (useState, useEffect)
- **Forms**: React Hook Form + Zod validation
- **Icons**: Lucide React
- **Charts**: Recharts
- **PDF Generation**: jsPDF + html2canvas

### Backend
- **Runtime**: Node.js
- **Framework**: Next.js API Routes
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: JWT (JSON Web Tokens) with HTTP-only cookies
- **Password Hashing**: bcryptjs

### Key Libraries
- `mongoose` - MongoDB ODM
- `jsonwebtoken` - JWT authentication
- `bcryptjs` - Password hashing
- `date-fns` - Date manipulation
- `react-signature-canvas` - Digital signatures

---

## Database Models & Schema

### Core Models

#### 1. **User** (`models/User.js`)
- **Purpose**: Admin and Employee accounts
- **Fields**:
  - `name`, `email`, `password` (hashed)
  - `role`: "admin" | "employee"
  - `status`: "active" | "inactive"
  - `debitAmount`, `creditAmount` - Financial tracking
  - `phone`, `address`, `position`, `salary`, `hireDate`
- **Methods**: `comparePassword()` - Password verification

#### 2. **Customer** (`models/Customer.js`)
- **Purpose**: Customer master data
- **Fields**:
  - `name`, `serialNumber` (unique), `trNumber`
  - `phone`, `email`, `address`
  - `totalDebit`, `totalCredit`, `balance` - Ledger tracking

#### 3. **Product** (`models/Product.js`)
- **Purpose**: Gas and Cylinder products catalog
- **Fields**:
  - `name`, `productCode` (unique, sparse)
  - `category`: "gas" | "cylinder"
  - `costPrice`, `leastPrice` - Pricing
  - `currentStock` - General stock
  - `availableEmpty`, `availableFull` - Cylinder-specific
  - `cylinderSize`: "large" | "small"
  - `cylinderStatus`: "empty" | "full"

#### 4. **Sale** (`models/Sale.js`)
- **Purpose**: Admin gas/cylinder sales
- **Fields**:
  - `invoiceNumber` (unique, sequential)
  - `customer` (ref: Customer)
  - `items[]` - Array of sale items:
    - `product`, `category`, `quantity`, `price`, `total`
    - `cylinderSize`, `cylinderStatus` (for cylinders)
    - `cylinderProductId`, `gasProductId` - Linking
  - `totalAmount`, `paymentMethod`, `paymentStatus`
  - `receivedAmount`, `customerSignature`
- **Indexes**: customer, invoiceNumber, paymentStatus

#### 5. **EmployeeSale** (`models/EmployeeSale.js`)
- **Purpose**: Employee gas/cylinder sales
- **Fields**: Similar to Sale, but includes `employee` reference
- **Indexes**: employee, customer, invoiceNumber, paymentStatus

#### 6. **CylinderTransaction** (`models/Cylinder.js`)
- **Purpose**: Admin cylinder deposits, refills, returns
- **Fields**:
  - `invoiceNumber` (unique, sparse)
  - `type`: "deposit" | "refill" | "return"
  - `customer` (for deposit/return), `supplier` (for refill)
  - `product`, `items[]` - Multi-item support
  - `quantity`, `amount`
  - `depositAmount`, `refillAmount`, `returnAmount`
  - `paymentMethod`: "cash" | "cheque"
  - `status`: "pending" | "cleared" | "overdue"
  - `linkedDeposit` - For return transactions

#### 7. **EmployeeCylinderTransaction** (`models/EmployeeCylinderTransaction.js`)
- **Purpose**: Employee cylinder transactions
- **Fields**: Similar to CylinderTransaction, includes `employee` reference

#### 8. **StockAssignment** (`models/StockAssignment.js`)
- **Purpose**: Admin-to-Employee stock assignments
- **Fields**:
  - `employee`, `product`, `quantity`, `remainingQuantity`
  - `assignedBy`, `status`: "assigned" | "received" | "returned" | "rejected"
  - `leastPrice`, `category`, `cylinderStatus`
  - `gasProductId`, `cylinderProductId` - For full cylinders

#### 9. **InventoryItem** (`models/InventoryItem.js`)
- **Purpose**: Centralized inventory tracking (separate from Product)
- **Fields**:
  - `product` (unique, ref: Product)
  - `category`: "gas" | "cylinder"
  - `currentStock` - For gas products
  - `availableEmpty`, `availableFull` - For cylinders
  - `lastUpdatedAt` - Audit trail

#### 10. **PurchaseOrder** (`models/PurchaseOrder.js`)
- **Purpose**: Admin purchase orders from suppliers
- **Fields**:
  - `supplier`, `purchaseDate`, `poNumber` (unique)
  - `items[]` - Array of purchase items:
    - `product`, `purchaseType`: "gas" | "cylinder"
    - `cylinderStatus`, `gasType`, `emptyCylinderId`
    - `quantity`, `unitPrice`, `itemTotal`
    - `inventoryStatus`: "pending" | "received"
  - `totalAmount`, `status`, `inventoryStatus`
  - `createdBy` (ref: User)

#### 11. **EmployeePurchaseOrder** (`models/EmployeePurchaseOrder.js`)
- **Purpose**: Employee purchase orders (for inventory)
- **Fields**:
  - `supplier`, `product`, `employee`
  - `purchaseType`, `cylinderSize`, `cylinderStatus`
  - `quantity`, `unitPrice`, `totalAmount`
  - `status`: "pending" | "assigned" | "approved" | "completed" | "cancelled"
  - `inventoryStatus`: "pending" | "assigned" | "approved" | "received"
  - `emptyCylinderId` - For gas purchases
  - `autoApproved` - Flag for auto-approval

#### 12. **EmployeeInventoryItem** (`models/EmployeeInventoryItem.js`)
- **Purpose**: Employee inventory tracking
- **Fields**:
  - `employee`, `product`, `category`
  - `currentStock`, `availableEmpty`, `availableFull`
  - Similar structure to InventoryItem but per-employee

#### 13. **DailySales** (`models/DailySales.js`)
- **Purpose**: Daily sales aggregation for DSR (Daily Sales Report)
- **Fields**:
  - `date`, `productId`, `productName`, `category`
  - `gasSalesQuantity`, `gasSalesAmount`
  - `fullCylinderSalesQuantity`, `fullCylinderSalesAmount`
  - `emptyCylinderSalesQuantity`, `emptyCylinderSalesAmount`
  - `cylinderSalesQuantity`, `cylinderSalesAmount`
  - `cylinderProductId`, `cylinderName` - Linking

#### 14. **DailyCylinderTransaction** (`models/DailyCylinderTransaction.js`)
- **Purpose**: Daily cylinder transaction aggregation
- **Fields**:
  - `date`, `cylinderProductId`, `employeeId` (nullable)
  - `depositQuantity`, `depositAmount`
  - `refillQuantity`, `refillAmount`
  - `returnQuantity`, `returnAmount`

#### 15. **Counter** (`models/Counter.js`)
- **Purpose**: Sequential invoice number generation
- **Fields**:
  - `key`: "unified_invoice_counter"
  - `year`, `seq` - Sequential number

#### 16. **Rental** (`models/Rental.js`)
- **Purpose**: Rental collection invoices
- **Fields**:
  - `customer`, `rentalNumber`, `date`
  - `items[]`, `subtotal`, `totalVat`, `finalTotal`

#### 17. **Notification** (`models/Notification.js`)
- **Purpose**: System notifications
- **Fields**:
  - `user` (ref: User), `type`, `message`
  - `read`, `readAt`

---

## API Routes Architecture

### Authentication (`/api/auth/`)

#### `POST /api/auth/login`
- **Purpose**: User authentication
- **Flow**:
  1. Validates email, password, userType
  2. Checks user exists and password matches
  3. Validates userType matches role (admin/employee)
  4. Generates JWT token
  5. Sets HTTP-only cookie
  6. Returns user data (without password)
- **Security**: Password hashing with bcrypt, JWT with 24h expiry

#### `GET /api/auth/validate`
- **Purpose**: Validate existing session
- **Flow**: Verifies JWT token from cookie, returns user data

#### `POST /api/auth/logout`
- **Purpose**: Clear session
- **Flow**: Clears token cookie

#### `GET /api/auth/init`
- **Purpose**: Initialize system (create admin user if none exists)

---

### Sales APIs (`/api/sales/`)

#### `GET /api/sales`
- **Returns**: All admin sales with populated customer and product data

#### `POST /api/sales`
- **Purpose**: Create new admin sale
- **Complex Flow**:
  1. Validates customer and products exist
  2. Checks inventory availability (InventoryItem model)
  3. Generates sequential invoice number (via Counter)
  4. Enriches items with category, cylinderSize, linking
  5. Creates Sale record
  6. **Daily Sales Tracking**: Updates DailySales aggregation
  7. **Inventory Updates**:
     - **Gas Sales**: Deducts gas stock, converts full→empty cylinders
     - **Cylinder Sales**: Updates availableEmpty/availableFull
     - **Full Cylinder Sales**: Also deducts gas stock
  8. Updates Product.currentStock for backward compatibility
- **Key Logic**: Gas sales trigger cylinder conversion (full→empty)

#### `GET /api/sales/[id]`
- **Returns**: Single sale with full details

---

### Employee Sales (`/api/employee-sales/`)

#### `POST /api/employee-sales`
- **Similar to admin sales but**:
  - Creates EmployeeSale record
  - Tracks employee ID
  - Uses employee inventory (EmployeeInventoryItem)
  - Updates DailyEmployeeSales aggregation

---

### Cylinder Transactions (`/api/cylinders/`)

#### `POST /api/cylinders/deposit`
- **Purpose**: Customer deposits empty cylinders
- **Flow**:
  1. Validates customer and cylinder product
  2. Generates invoice number
  3. Creates CylinderTransaction (type: "deposit")
  4. Updates DailyCylinderTransaction
  5. **Inventory**: Deducts empty cylinders, deducts gas if provided
  6. Updates customer balance

#### `POST /api/cylinders/refill`
- **Purpose**: Refill cylinders from supplier
- **Flow**:
  1. Validates supplier and cylinder product
  2. Creates transaction (type: "refill")
  3. Updates inventory: Increases full cylinders, decreases empty
  4. Updates DailyCylinderTransaction

#### `POST /api/cylinders/return`
- **Purpose**: Customer returns cylinders (clears deposit)
- **Flow**:
  1. Links to original deposit (linkedDeposit)
  2. Creates transaction (type: "return")
  3. Updates inventory: Increases empty cylinders
  4. Updates customer balance (refund)

#### `GET /api/cylinders`
- **Returns**: All cylinder transactions

---

### Stock Assignments (`/api/stock-assignments/`)

#### `POST /api/stock-assignments`
- **Purpose**: Admin assigns stock to employees
- **Flow**:
  1. Validates product and inventory availability
  2. Checks stock (InventoryItem)
  3. Creates StockAssignment record
  4. Creates Notification for employee
  5. **Does NOT deduct from admin inventory** (until employee receives)

#### `GET /api/stock-assignments`
- **Returns**: Assignments (filterable by employeeId, status, date)

#### `POST /api/stock-assignments/[id]/receive`
- **Purpose**: Employee receives assigned stock
- **Flow**:
  1. Updates StockAssignment status to "received"
  2. Creates/updates EmployeeInventoryItem
  3. **Deducts from admin InventoryItem**
  4. Updates Product.currentStock

#### `POST /api/stock-assignments/[id]/return`
- **Purpose**: Employee returns stock to admin
- **Flow**:
  1. Updates StockAssignment status to "returned"
  2. Deducts from EmployeeInventoryItem
  3. **Adds back to admin InventoryItem**

#### `POST /api/stock-assignments/[id]/reject`
- **Purpose**: Employee rejects assignment
- **Flow**: Updates status to "rejected"

---

### Employee Purchase Orders (`/api/employee-purchase-orders/`)

#### `POST /api/employee-purchase-orders`
- **Purpose**: Employee creates purchase order (for inventory)
- **Flow**:
  1. Validates product and employee
  2. Generates PO number
  3. Creates EmployeePurchaseOrder
  4. Status: "approved" (if autoApproved) or "pending"
  5. inventoryStatus: "approved" or "pending"
  6. For gas purchases: Requires emptyCylinderId

#### `GET /api/employee-purchase-orders`
- **Returns**: Employee purchase orders (filterable by employeeId, status)

---

### Employee Inventory (`/api/employee-inventory-new/`)

#### `GET /api/employee-inventory-new/pending`
- **Returns**: Pending purchase orders (inventoryStatus: "pending" or "approved")

#### `POST /api/employee-inventory-new/accept`
- **Purpose**: Employee accepts purchase order → Updates inventory
- **Complex Flow**:
  1. Updates EmployeePurchaseOrder.inventoryStatus to "received"
  2. Creates/updates EmployeeInventoryItem:
     - **Gas Purchase**: Increases currentStock, creates full cylinder (availableFull), decreases empty (availableEmpty)
     - **Cylinder Purchase**: Updates availableEmpty or availableFull
  3. Updates EmployeeInventory model (legacy)

#### `GET /api/employee-inventory-new/received`
- **Returns**: Received inventory (EmployeeInventoryItem)

#### `GET /api/employee-inventory-new/assignments`
- **Returns**: Stock assignments for employee

---

### Reports (`/api/reports/`)

#### `GET /api/reports/cash-paper`
- **Purpose**: Cash paper report (date range)
- **Parameters**: `fromDate`, `toDate`, `employeeId` (optional)
- **Returns**:
  - Credit sales, Debit sales, Other sales
  - Deposit cylinders, Return cylinders
  - Rental collections
  - Totals and counts
- **Logic**:
  - If employeeId: Uses EmployeeSale, EmployeeCylinderTransaction
  - Else: Uses Sale, CylinderTransaction
  - Queries by date range (createdAt)
  - Groups by payment method

#### `GET /api/reports/ledger`
- **Purpose**: Customer ledger report
- **Returns**: Customer transactions with balances

#### `GET /api/reports/stats`
- **Purpose**: Dashboard statistics
- **Returns**: Revenue, sales counts, customer stats

---

### Purchase Orders (`/api/purchase-orders/`)

#### `POST /api/purchase-orders`
- **Purpose**: Admin creates purchase order from supplier
- **Flow**:
  1. Validates supplier and products
  2. Generates PO number
  3. Creates PurchaseOrder
  4. Items have inventoryStatus: "pending"

#### `POST /api/purchase-orders/[id]` (PUT)
- **Purpose**: Receive purchase order → Update inventory
- **Flow**:
  1. Updates PurchaseOrder.inventoryStatus to "received"
  2. Updates items.inventoryStatus to "received"
  3. Updates InventoryItem:
     - Gas: Increases currentStock
     - Cylinders: Updates availableEmpty/availableFull
  4. Updates Product.currentStock

---

### Inventory (`/api/inventory/`)

#### `GET /api/inventory`
- **Returns**: All InventoryItem records with product details

#### `POST /api/inventory/sync-stock`
- **Purpose**: Sync Product.currentStock with InventoryItem
- **Flow**: Updates Product model from InventoryItem

---

### Daily Stock Reports (`/api/daily-stock-reports/`)

#### `GET /api/daily-stock-reports`
- **Purpose**: Daily Stock Report (DSR) for admin
- **Returns**: Aggregated sales data from DailySales model

#### `GET /api/employee-daily-stock-reports`
- **Purpose**: Employee DSR
- **Returns**: Employee-specific DailyEmployeeSales aggregation

---

## Business Logic Flows

### 1. Gas Sale Flow (Admin)

```
Customer Request → Select Gas Product → Select Cylinder
  ↓
Check Inventory (InventoryItem.currentStock for gas)
  ↓
Check Cylinder Inventory (availableFull)
  ↓
Create Sale → Generate Invoice Number
  ↓
Update DailySales (gasSalesQuantity, gasSalesAmount)
  ↓
Inventory Updates:
  - Deduct gas stock (InventoryItem.currentStock--)
  - Convert cylinders: availableFull--, availableEmpty++
  - Update Product.currentStock (backward compatibility)
  ↓
Update Customer Balance (if credit)
```

### 2. Full Cylinder Sale Flow

```
Customer Request → Select Full Cylinder
  ↓
Check Inventory (availableFull)
  ↓
Create Sale → Generate Invoice Number
  ↓
Update DailySales (fullCylinderSalesQuantity, fullCylinderSalesAmount)
  ↓
Inventory Updates:
  - Deduct full cylinders (availableFull--)
  - Find associated gas product (by name/size matching)
  - Deduct gas stock (currentStock--)
  - Update Product.currentStock
  ↓
Update Customer Balance
```

### 3. Employee Stock Assignment Flow

```
Admin → Select Product → Select Employee → Assign Quantity
  ↓
Check Admin Inventory (InventoryItem)
  ↓
Create StockAssignment (status: "assigned")
  ↓
Create Notification for Employee
  ↓
Employee Receives → POST /api/stock-assignments/[id]/receive
  ↓
Update StockAssignment (status: "received")
  ↓
Create/Update EmployeeInventoryItem
  ↓
Deduct from Admin InventoryItem
  ↓
Update Product.currentStock
```

### 4. Employee Purchase Order Flow

```
Employee → Create Purchase Order → Select Product
  ↓
For Gas: Select Empty Cylinder from Employee Inventory
  ↓
Create EmployeePurchaseOrder (status: "approved", inventoryStatus: "approved")
  ↓
Employee Accepts → POST /api/employee-inventory-new/accept
  ↓
Update EmployeePurchaseOrder (inventoryStatus: "received")
  ↓
Update EmployeeInventoryItem:
  - Gas: currentStock++, availableFull++, availableEmpty--
  - Cylinder: availableEmpty++ or availableFull++
```

### 5. Cylinder Deposit Flow

```
Customer → Deposit Empty Cylinder
  ↓
Create CylinderTransaction (type: "deposit")
  ↓
Update DailyCylinderTransaction (depositQuantity, depositAmount)
  ↓
Inventory Updates:
  - Deduct empty cylinders (availableEmpty--)
  - If gas provided: Deduct gas stock
  ↓
Update Customer Balance (debit)
```

### 6. Cylinder Return Flow

```
Customer → Return Cylinder (clears deposit)
  ↓
Link to Original Deposit (linkedDeposit)
  ↓
Create CylinderTransaction (type: "return")
  ↓
Update DailyCylinderTransaction (returnQuantity, returnAmount)
  ↓
Inventory Updates:
  - Add empty cylinders (availableEmpty++)
  ↓
Update Customer Balance (credit/refund)
```

---

## Invoice Number Generation

### System: Centralized Counter (`lib/invoice-generator.js`)

- **Model**: Counter with key "unified_invoice_counter"
- **Format**: 4-digit padded (e.g., "10000", "10001")
- **Uniqueness**: Atomic MongoDB operations prevent duplicates
- **Initialization**: Auto-initializes from highest existing invoice
- **Retry Logic**: `getNextInvoiceNumberWithRetry()` with uniqueness verification
- **Usage**: All sales and transactions use same counter

---

## Frontend Architecture

### Main Layout (`components/main-layout.tsx`)

- **Routing**: URL-based page parameter (`?page=dashboard`)
- **Sidebar**: Role-based navigation (admin vs employee)
- **State**: User data, notifications, unread count
- **Pages**:
  - Admin: Dashboard, Products, Customers, Sales, Cylinders, Inventory, Reports, etc.
  - Employee: Employee Dashboard, Gas Sales, Cylinder Sales, Inventory, Reports

### Key Pages

#### Admin Pages:
- `dashboard.tsx` - Statistics and overview
- `gas-sales.tsx` - Gas/cylinder sales interface
- `cylinder-management.tsx` - Cylinder transactions
- `inventory.tsx` - Inventory management
- `reports.tsx` - Reports and cash paper
- `customer-management.tsx` - Customer CRUD
- `product-management.tsx` - Product catalog
- `employee-management.tsx` - Employee management
- `purchase-management.tsx` - Purchase orders
- `daily-stock-report.tsx` - DSR view

#### Employee Pages:
- `employee-dashboard.tsx` - Employee overview
- `emp-gas-sale.tsx` - Employee gas sales
- `employee-cylinder-sales.tsx` - Employee cylinder transactions
- `employee-inventory-new.tsx` - Employee inventory management
- `employee-reports.tsx` - Employee reports
- `employee-dsr.tsx` - Employee DSR

### Components

- `cash-paper-section.tsx` - Cash paper with date range filtering
- `signature-dialog.tsx` - Customer signature capture
- `receipt-dialog.tsx` - Receipt generation
- `notification-popup.tsx` - Real-time notifications
- `app-sidebar.tsx` - Navigation sidebar

---

## Security

### Authentication
- JWT tokens in HTTP-only cookies
- Middleware protection for API routes (`middleware.js`)
- Role-based access control (admin vs employee)
- Password hashing with bcrypt (12 rounds)

### Authorization
- Admin-only routes check role
- Employee routes filter by employeeId
- Token validation on every API request

---

## Data Flow Patterns

### Inventory Management
1. **Primary Source**: `InventoryItem` model (centralized)
2. **Secondary Source**: `Product.currentStock` (backward compatibility)
3. **Employee Inventory**: `EmployeeInventoryItem` (per-employee)
4. **Sync**: Periodic sync between InventoryItem and Product

### Sales Tracking
1. **Transaction Level**: Sale, EmployeeSale models
2. **Daily Aggregation**: DailySales, DailyEmployeeSales
3. **Cylinder Tracking**: DailyCylinderTransaction
4. **Reports**: Aggregated from daily models

### Financial Tracking
1. **Customer Balance**: Customer.totalDebit, totalCredit, balance
2. **Employee Balance**: User.debitAmount, creditAmount
3. **Payment Status**: Sale.paymentStatus, receivedAmount
4. **Cash Paper**: Aggregated from all sales by payment method

---

## Key Features

1. **Dual User System**: Admin and Employee roles with separate workflows
2. **Inventory Management**: Multi-level inventory (admin + employee)
3. **Cylinder Lifecycle**: Deposit → Refill → Return tracking
4. **Gas-Cylinder Linking**: Automatic cylinder conversion on gas sales
5. **Daily Reports**: DSR and cash paper with date range filtering
6. **Stock Assignments**: Admin-to-employee stock transfer
7. **Purchase Orders**: Supplier purchases and employee purchases
8. **Customer Ledger**: Credit/debit tracking per customer
9. **Invoice Generation**: Sequential, unique invoice numbers
10. **Notifications**: Real-time notifications for assignments
11. **Digital Signatures**: Customer signature capture
12. **PDF Generation**: Receipts and cash paper PDFs

---

## API Endpoint Summary

### Authentication
- `POST /api/auth/login`
- `GET /api/auth/validate`
- `POST /api/auth/logout`
- `GET /api/auth/init`

### Sales
- `GET /api/sales`
- `POST /api/sales`
- `GET /api/sales/[id]`
- `GET /api/employee-sales`
- `POST /api/employee-sales`
- `GET /api/employee-sales/[id]`

### Cylinders
- `GET /api/cylinders`
- `POST /api/cylinders/deposit`
- `POST /api/cylinders/refill`
- `POST /api/cylinders/return`
- `GET /api/cylinders/[id]`
- `GET /api/employee-cylinders`
- `POST /api/employee-cylinders`

### Inventory
- `GET /api/inventory`
- `POST /api/inventory/sync-stock`
- `GET /api/employee-inventory`
- `GET /api/employee-inventory-new/pending`
- `POST /api/employee-inventory-new/accept`
- `GET /api/employee-inventory-new/received`

### Stock Assignments
- `GET /api/stock-assignments`
- `POST /api/stock-assignments`
- `POST /api/stock-assignments/[id]/receive`
- `POST /api/stock-assignments/[id]/return`
- `POST /api/stock-assignments/[id]/reject`

### Purchase Orders
- `GET /api/purchase-orders`
- `POST /api/purchase-orders`
- `GET /api/purchase-orders/[id]`
- `PUT /api/purchase-orders/[id]`
- `GET /api/employee-purchase-orders`
- `POST /api/employee-purchase-orders`

### Reports
- `GET /api/reports/cash-paper`
- `GET /api/reports/ledger`
- `GET /api/reports/stats`
- `GET /api/daily-stock-reports`
- `GET /api/employee-daily-stock-reports`

### Customers, Products, Employees
- `GET /api/customers`
- `POST /api/customers`
- `GET /api/products`
- `POST /api/products`
- `GET /api/employees`
- `POST /api/employees`

---

## Environment Variables

- `MONGODB_URI` - MongoDB connection string
- `JWT_SECRET` - JWT signing secret
- `ADMIN_EMAIL` - Admin email for login validation
- `NODE_ENV` - Environment (development/production)

---

## File Structure

```
/
├── app/
│   ├── api/              # API routes
│   ├── layout.tsx        # Root layout
│   ├── page.tsx          # Home/login page
│   └── print/            # Print routes
├── components/
│   ├── pages/            # Page components
│   ├── ui/               # UI components
│   └── *.tsx             # Shared components
├── models/                # Mongoose models
├── lib/
│   ├── mongodb.js        # DB connection
│   ├── api.ts            # API client
│   ├── invoice-generator.js  # Invoice number generator
│   └── stock-manager.js  # Stock management utilities
├── middleware.js          # Auth middleware
└── package.json
```

---

## Key Design Decisions

1. **Separate Models for Admin/Employee**: Sale vs EmployeeSale, CylinderTransaction vs EmployeeCylinderTransaction
2. **Dual Inventory System**: InventoryItem (admin) + EmployeeInventoryItem (employee)
3. **Daily Aggregation**: Separate models for daily reports (performance)
4. **Centralized Invoice Counter**: Single counter for all transaction types
5. **InventoryItem vs Product**: InventoryItem is source of truth, Product for backward compatibility
6. **Gas-Cylinder Linking**: Automatic conversion tracking for DSR
7. **Stock Assignment Flow**: Admin assigns → Employee receives → Inventory updates

---

This system is designed for a gas distribution business with multiple employees, complex inventory tracking (gas + cylinders), and comprehensive reporting needs.

