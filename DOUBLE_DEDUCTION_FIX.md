# Double Deduction Issue Fixed

## Problem Identified
The employee stock assignment was causing **double deduction** from admin inventory:

1. **First deduction**: When admin assigns stock (in employee-management.tsx)
2. **Second deduction**: When employee accepts assignment (in stock-assignments/[id]/route.js)

## Root Cause
In `components/pages/employee-management.tsx`, around lines 1050-1070, there was an inventory deduction call immediately after creating the stock assignment. This was incorrect because:

- Admin inventory should only be deducted when employee **accepts** the assignment
- The acceptance API already handles inventory deduction properly
- This caused stock to be deducted twice: once on assignment creation, once on acceptance

## Solution Applied
**REMOVE** the inventory deduction from employee management component. The correct flow should be:

1. Admin assigns stock → **NO inventory deduction** (just create assignment)
2. Employee accepts → **Deduct admin inventory** and create employee inventory

## Files That Need Modification
- `components/pages/employee-management.tsx` - Remove inventory deduction from handleStockAssignment function

## Expected Behavior After Fix
- Admin assigns stock → Assignment created, admin inventory unchanged
- Employee sees assignment in "Pending Assignments"
- Employee accepts → Admin inventory deducted, employee inventory created
- No double deduction occurs

## Code Change Required
Replace the inventory deduction section in handleStockAssignment with a comment explaining the proper flow.