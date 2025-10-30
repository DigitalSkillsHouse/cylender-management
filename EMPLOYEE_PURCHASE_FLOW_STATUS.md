# Employee Purchase Flow Status

## Current Implementation

### Employee Purchase Management Page
- **Location**: `components/pages/purchase-emp-management.tsx`
- **Creates**: `EmployeePurchaseOrder` with `status: 'approved'` and `inventoryStatus: 'approved'`
- **Gas Purchase Flow**: 
  - Employee selects gas product
  - Employee selects empty cylinder from their inventory
  - Creates purchase order with `emptyCylinderId`

### Expected Flow
1. **Employee creates purchase** → `EmployeePurchaseOrder` with `inventoryStatus: 'approved'`
2. **Shows in "Pending Purchase (X)"** → API: `/api/employee-inventory-new/pending`
3. **Employee accepts** → API: `/api/employee-inventory-new/accept`
4. **Updates inventory** → Uses `EmployeeInventoryItem` model
5. **Shows in "My Stock"** → API: `/api/employee-inventory-new/received`

## Fixed Issues

### ✅ Model Consistency
- **Problem**: Received inventory API was using `EmployeeInventory` but accept API uses `EmployeeInventoryItem`
- **Fix**: Changed received API back to `EmployeeInventoryItem`

## Current Status - Should Work

### 1. Employee Purchase Creation ✅
- Employee Purchase Management creates orders with correct status
- Orders should appear in "Pending Purchase (0)" section

### 2. Gas Purchase with Empty Cylinders ✅
- Employee selects empty cylinder from their inventory
- Accept API handles gas + cylinder inventory correctly:
  - Creates/updates gas inventory (`currentStock`)
  - Creates/updates full cylinder inventory (`availableFull`)
  - Reduces empty cylinder inventory (`availableEmpty`)

### 3. Inventory Display ✅
- Received API uses correct `EmployeeInventoryItem` model
- Should show updated inventory in "My Stock" section

## Testing Checklist

### Test 1: Basic Employee Purchase
1. Go to Employee Purchase Management
2. Create new purchase order (gas product)
3. Select empty cylinder from dropdown
4. Submit order
5. **Expected**: Order appears in "Pending Purchase (X)" in Employee Inventory

### Test 2: Accept Purchase Order
1. Go to Employee Inventory → Pending → Pending Purchase
2. Click "Accept & Add to Stock" on the order
3. **Expected**: 
   - Order disappears from pending
   - Gas appears in "My Stock" → Gas Stock tab
   - Full cylinder appears in "My Stock" → Full Cylinders tab
   - Empty cylinder quantity reduced in "My Stock" → Empty Cylinders tab

### Test 3: Inventory Quantities
1. Before purchase: Note empty cylinder quantity
2. After acceptance: 
   - **Gas stock**: Should increase by purchase quantity
   - **Full cylinders**: Should increase by purchase quantity  
   - **Empty cylinders**: Should decrease by purchase quantity

## Potential Issues to Check

1. **Empty Cylinder Selection**: Verify dropdown shows employee's actual empty cylinders
2. **Quantity Validation**: Ensure can't purchase more than available empty cylinders
3. **Inventory Updates**: Verify all three inventory types update correctly
4. **Daily Refill Tracking**: Check if daily refill records are created

## Files Involved
- `components/pages/purchase-emp-management.tsx` - Employee purchase creation
- `app/api/employee-purchase-orders/route.js` - Creates purchase orders
- `app/api/employee-inventory-new/pending/route.js` - Shows pending purchases
- `app/api/employee-inventory-new/accept/route.js` - Accepts and processes inventory
- `app/api/employee-inventory-new/received/route.js` - Shows employee inventory
- `models/EmployeeInventoryItem.js` - Employee inventory model