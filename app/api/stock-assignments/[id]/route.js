import dbConnect from "@/lib/mongodb";
import StockAssignment from "@/models/StockAssignment";
import Product from "@/models/Product";
import { NextResponse } from "next/server";

export async function PATCH(request, { params }) {
  try {
    await dbConnect();
    
    const { id } = params;
    const data = await request.json();
    
    console.log('📝 PATCH request data:', { id, data });
    
    // First get the assignment to check its current status
    const originalAssignment = await StockAssignment.findById(id).populate("product", "name category cylinderSize productCode");
    
    if (!originalAssignment) {
      console.error('❌ Assignment not found:', id);
      return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
    }
    
    console.log('📋 Original assignment status:', {
      id: originalAssignment._id,
      product: originalAssignment.product?.name,
      currentStatus: originalAssignment.status,
      requestedStatus: data.status
    });
    
    // Now update the assignment status
    const assignment = await StockAssignment.findByIdAndUpdate(
      id,
      { status: data.status },
      { new: true }
    ).populate("product", "name category cylinderSize productCode");
    
    // Variable to track actual quantity filled (for partial acceptance)
    let quantityToFill = assignment.quantity;
    
    // If accepting assignment, create EmployeeInventory records
    if ((data.status === 'received' || data.status === 'active') && data.createEmployeeInventory) {
      console.log('🔄 Processing assignment acceptance:', {
        assignmentId: originalAssignment._id,
        productName: originalAssignment.product?.name,
        currentStatus: originalAssignment.status,
        requestedStatus: data.status,
        createEmployeeInventory: data.createEmployeeInventory
      });
      
      // Check if this assignment was already processed to prevent duplicates
      if (originalAssignment.status === 'received' || originalAssignment.status === 'active') {
        console.log('⚠️ Assignment already processed, skipping inventory creation:', {
          assignmentId: originalAssignment._id,
          productName: originalAssignment.product?.name,
          currentStatus: originalAssignment.status
        });
        return NextResponse.json({ success: true, data: originalAssignment, message: "Assignment already processed" });
      }
    }
    
    console.log('✅ Assignment updated:', {
      id: assignment._id,
      product: assignment.product?.name,
      category: assignment.category,
      cylinderStatus: assignment.cylinderStatus,
      oldStatus: originalAssignment.status,
      newStatus: assignment.status
    });
    
    // Process inventory deduction and creation only if status changed to received or active
    if ((data.status === 'received' || data.status === 'active') && data.createEmployeeInventory && 
        originalAssignment.status !== 'received' && originalAssignment.status !== 'active') {
      
      // FIRST: Deduct from admin inventory when employee accepts assignment
      const InventoryItem = (await import("@/models/InventoryItem")).default;
      
      console.log('🔄 Deducting admin inventory for accepted assignment:', {
        category: assignment.category,
        cylinderStatus: assignment.cylinderStatus,
        product: assignment.product._id,
        quantity: assignment.quantity,
        cylinderProductId: assignment.cylinderProductId,
        gasProductId: assignment.gasProductId
      });
      
      if (assignment.category === 'gas' && assignment.cylinderProductId) {
        // Gas assignment: deduct gas stock and convert full cylinder to empty
        const gasUpdate = await InventoryItem.findOneAndUpdate(
          { product: assignment.product._id },
          { $inc: { currentStock: -assignment.quantity } },
          { new: true }
        );
        console.log('✅ Gas stock deducted:', gasUpdate?.currentStock);
        
        const cylinderUpdate = await InventoryItem.findOneAndUpdate(
          { product: assignment.cylinderProductId },
          { 
            $inc: { 
              availableFull: -assignment.quantity,
              availableEmpty: assignment.quantity 
            }
          },
          { new: true }
        );
        console.log('✅ Cylinder converted full->empty:', cylinderUpdate?.availableFull, '->', cylinderUpdate?.availableEmpty);
      } else if (assignment.category === 'cylinder' && assignment.cylinderStatus === 'full' && assignment.gasProductId) {
        try {
          // Full cylinder assignment: deduct full cylinders and gas stock
          const cylinderUpdate = await InventoryItem.findOneAndUpdate(
            { product: assignment.product._id },
            { $inc: { availableFull: -assignment.quantity } },
            { new: true }
          );
          console.log('✅ Full cylinders deducted:', cylinderUpdate?.availableFull);
          
          const gasUpdate = await InventoryItem.findOneAndUpdate(
            { product: assignment.gasProductId },
            { $inc: { currentStock: -assignment.quantity } },
            { new: true }
          );
          console.log('✅ Gas stock deducted:', gasUpdate?.currentStock);
          
          // Also create/update employee gas inventory for the gas inside the cylinder
          console.log('🔄 Creating/updating employee gas inventory for gas inside full cylinder');
          const EmployeeInventoryItem = (await import("@/models/EmployeeInventoryItem")).default;
          const Product = (await import("@/models/Product")).default;
          const gasProduct = await Product.findById(assignment.gasProductId);
          
          if (gasProduct) {
            const existingGasInventory = await EmployeeInventoryItem.findOne({
              employee: assignment.employee,
              product: assignment.gasProductId
            });
            
            if (existingGasInventory) {
              // Update existing gas inventory
              existingGasInventory.currentStock += assignment.quantity;
              existingGasInventory.lastUpdatedAt = new Date();
              await existingGasInventory.save();
              console.log('✅ Updated existing gas inventory:', existingGasInventory._id);
            } else {
              // Create new gas inventory
              const newGasInventory = await EmployeeInventoryItem.create({
                employee: assignment.employee,
                product: assignment.gasProductId,
                category: 'gas',
                currentStock: assignment.quantity,
                availableEmpty: 0,
                availableFull: 0,
                lastUpdatedAt: new Date()
              });
              console.log('✅ Created new gas inventory:', newGasInventory._id);
            }
          }
          
          // Also create/update cylinder inventory for the full cylinder itself
          console.log('🔄 Creating/updating employee cylinder inventory for the full cylinder');
          const existingCylinderInventory = await EmployeeInventoryItem.findOne({
            employee: assignment.employee,
            product: assignment.product._id
          });
          
          if (existingCylinderInventory) {
            // Update existing cylinder inventory
            existingCylinderInventory.availableFull += assignment.quantity;
            existingCylinderInventory.lastUpdatedAt = new Date();
            await existingCylinderInventory.save();
            console.log('✅ Updated existing cylinder inventory:', existingCylinderInventory._id);
          } else {
            // Create new cylinder inventory
            const newCylinderInventory = await EmployeeInventoryItem.create({
              employee: assignment.employee,
              product: assignment.product._id,
              category: 'cylinder',
              currentStock: 0,
              availableEmpty: 0,
              availableFull: assignment.quantity,
              lastUpdatedAt: new Date()
            });
            console.log('✅ Created new cylinder inventory:', newCylinderInventory._id);
          }
        } catch (fullCylinderError) {
          console.error('❌ Error in full cylinder with gas processing:', fullCylinderError);
          throw fullCylinderError; // Re-throw to be caught by main error handler
        }
      } else if (assignment.category === 'cylinder' && assignment.cylinderStatus === 'empty') {
        // Empty cylinder assignment: deduct empty cylinders
        const cylinderUpdate = await InventoryItem.findOneAndUpdate(
          { product: assignment.product._id },
          { $inc: { availableEmpty: -assignment.quantity } },
          { new: true }
        );
        console.log('✅ Empty cylinders deducted:', cylinderUpdate?.availableEmpty);
      } else if (assignment.category === 'cylinder' && assignment.cylinderStatus === 'full') {
        // Full cylinder only assignment (no gas product)
        const cylinderUpdate = await InventoryItem.findOneAndUpdate(
          { product: assignment.product._id },
          { $inc: { availableFull: -assignment.quantity } },
          { new: true }
        );
        console.log('✅ Full cylinders deducted (no gas):', cylinderUpdate?.availableFull);
      } else if (assignment.category === 'gas') {
        // Gas only assignment (no cylinder product)
        const gasUpdate = await InventoryItem.findOneAndUpdate(
          { product: assignment.product._id },
          { $inc: { currentStock: -assignment.quantity } },
          { new: true }
        );
        console.log('✅ Gas stock deducted:', gasUpdate?.currentStock);
      }
      
      // SECOND: Create employee inventory records
      // Skip this for full cylinders with gas - already handled above
      if (assignment.category === 'cylinder' && assignment.cylinderStatus === 'full' && assignment.gasProductId) {
        console.log('⏭️ Skipping regular inventory creation - already handled for full cylinder with gas');
        // Continue to purchase order status update
      } else {
        const EmployeeInventoryItem = (await import("@/models/EmployeeInventoryItem")).default;
        
        // Use the base category for database storage (gas/cylinder)
        const dbCategory = assignment.category || (assignment.product?.category === 'gas' ? 'gas' : 'cylinder');
      
      // Handle undefined cylinderStatus for cylinder products
      const cylinderStatus = assignment.cylinderStatus || (assignment.product?.category === 'cylinder' ? 'empty' : undefined);
      
      console.log('🔧 Assignment details:', {
        category: assignment.category,
        cylinderStatus: assignment.cylinderStatus,
        resolvedCylinderStatus: cylinderStatus,
        dbCategory: dbCategory,
        productName: assignment.product?.name
      });
      
      // Validate required data
      if (!assignment.product || !assignment.product._id) {
        console.error('❌ Missing product data in assignment');
        return NextResponse.json({ error: "Invalid assignment: missing product data" }, { status: 400 });
      }
      
      if (!dbCategory || !['gas', 'cylinder'].includes(dbCategory)) {
        console.error('❌ Invalid category:', dbCategory);
        return NextResponse.json({ error: "Invalid assignment: invalid category" }, { status: 400 });
      }
      
      // Check for existing inventory by product ID
      const existingInventory = await EmployeeInventoryItem.findOne({
        employee: assignment.employee,
        product: assignment.product._id
      });
      
      if (existingInventory) {
        // Update existing record
        console.log('✅ Updating existing inventory record:', {
          inventoryId: existingInventory._id,
          currentStock: existingInventory.currentStock,
          addingQuantity: assignment.quantity
        });
        
        // Use quantityToFill for gas assignments with cylinder selection, otherwise use assignment.quantity
        const actualQuantity = (assignment.category === 'gas' && data.emptyCylinderId) ? quantityToFill : assignment.quantity;
        
        if (dbCategory === 'gas') {
          existingInventory.currentStock += actualQuantity;
        } else if (dbCategory === 'cylinder') {
          if (cylinderStatus === 'empty') {
            existingInventory.availableEmpty += actualQuantity;
          } else if (cylinderStatus === 'full') {
            existingInventory.availableFull += actualQuantity;
          }
        }
        
        existingInventory.lastUpdatedAt = new Date();
        await existingInventory.save();
      } else {
        // Create new record
        console.log('💾 Creating new EmployeeInventoryItem record:', {
          productId: assignment.product._id,
          productName: assignment.product.name,
          category: dbCategory,
          quantity: assignment.quantity
        });
        
        const newInventoryData = {
          employee: assignment.employee,
          product: assignment.product._id,
          category: dbCategory,
          currentStock: 0,
          availableEmpty: 0,
          availableFull: 0,
          lastUpdatedAt: new Date()
        };
        
        // Use quantityToFill for gas assignments with cylinder selection, otherwise use assignment.quantity
        const actualQuantity = (assignment.category === 'gas' && data.emptyCylinderId) ? quantityToFill : assignment.quantity;
        
        if (dbCategory === 'gas') {
          newInventoryData.currentStock = actualQuantity;
        } else if (dbCategory === 'cylinder') {
          if (cylinderStatus === 'empty') {
            newInventoryData.availableEmpty = actualQuantity;
          } else if (cylinderStatus === 'full') {
            newInventoryData.availableFull = actualQuantity;
          }
        }
        
        await EmployeeInventoryItem.create(newInventoryData);
        console.log('✅ EmployeeInventoryItem record created successfully');
      }
      
      // For gas assignments with cylinder selection, handle cylinder conversion
      if (assignment.category === 'gas' && data.emptyCylinderId) {
        console.log('🔄 Gas assignment with cylinder selection - converting empty to full cylinder');
        
        // Find the selected empty cylinder inventory
        const emptyCylinderInventory = await EmployeeInventoryItem.findById(data.emptyCylinderId).populate('product');
        if (emptyCylinderInventory) {
          // Calculate how much can be filled based on available empty cylinders
          const availableEmpty = emptyCylinderInventory.availableEmpty;
          const requestedQuantity = assignment.quantity;
          quantityToFill = Math.min(availableEmpty, requestedQuantity);
          
          console.log('📊 Partial acceptance calculation:', {
            assignmentId: assignment._id,
            totalAssigned: requestedQuantity,
            availableEmpty: availableEmpty,
            quantityToFill: quantityToFill,
            isPartialAcceptance: quantityToFill < requestedQuantity
          });
          
          if (quantityToFill <= 0) {
            throw new Error(`No empty cylinders available. You need empty cylinders to accept this gas assignment.`);
          }
          
          // Reduce empty cylinders and increase full cylinders (only for the quantity we can fill)
          emptyCylinderInventory.availableEmpty -= quantityToFill;
          emptyCylinderInventory.availableFull += quantityToFill;
          emptyCylinderInventory.lastUpdatedAt = new Date();
          await emptyCylinderInventory.save();
          
          console.log('✅ Cylinder conversion completed:', {
            cylinderId: emptyCylinderInventory._id,
            emptyReduced: quantityToFill,
            fullIncreased: quantityToFill,
            newEmptyCount: emptyCylinderInventory.availableEmpty,
            newFullCount: emptyCylinderInventory.availableFull
          });
          
          // Update assignment remaining quantity for partial acceptance
          const remainingQuantity = requestedQuantity - quantityToFill;
          if (remainingQuantity > 0) {
            // Partial acceptance - update assignment with remaining quantity
            assignment.quantity = remainingQuantity;
            assignment.remainingQuantity = remainingQuantity;
            await assignment.save();
            
            console.log('🔄 Partial acceptance - assignment updated:', {
              assignmentId: assignment._id,
              originalQuantity: requestedQuantity,
              filledQuantity: quantityToFill,
              remainingQuantity: remainingQuantity,
              status: 'assigned' // Keep as assigned for remaining quantity
            });
            
            // Don't change status to received - keep it as assigned for remaining quantity
            await StockAssignment.findByIdAndUpdate(
              id,
              { 
                quantity: remainingQuantity,
                remainingQuantity: remainingQuantity,
                status: 'assigned' // Keep as assigned
              },
              { new: true }
            );
          } else {
            // Full acceptance - mark as received
            console.log('✅ Full acceptance - marking assignment as received');
          }
          
          // CREATE DAILY REFILL RECORD - This is when the actual refill happens (employee acceptance)
          try {
            const DailyRefill = (await import('@/models/DailyRefill')).default;
            const { getLocalDateString } = await import('@/lib/date-utils')
            const today = getLocalDateString(); // YYYY-MM-DD format (Dubai timezone)
            const quantity = Number(assignment.quantity) || 0;
            
            if (quantity > 0 && emptyCylinderInventory.product) {
              const cylinderProductId = emptyCylinderInventory.product._id;
              const cylinderName = emptyCylinderInventory.product.name || 'Unknown Cylinder';
              
              console.log(`⛽ [ASSIGNMENT REFILL] Creating daily refill record:`, {
                date: today,
                cylinderProductId: cylinderProductId,
                cylinderName: cylinderName,
                employeeId: assignment.employee,
                quantity: quantityToFill, // Use actual filled quantity
                source: 'admin_assignment'
              });
              
              // Create or update daily refill record for the CYLINDER product
              const refillResult = await DailyRefill.findOneAndUpdate(
                {
                  date: today,
                  cylinderProductId: cylinderProductId,
                  employeeId: assignment.employee
                },
                {
                  $inc: { todayRefill: quantityToFill }, // Use actual filled quantity
                  $set: { cylinderName: cylinderName }
                },
                {
                  upsert: true,
                  new: true
                }
              );
              
              console.log(`✅ [ASSIGNMENT REFILL] Created/Updated daily refill:`, {
                cylinderName,
                cylinderProductId: cylinderProductId.toString(),
                quantity: quantityToFill, // Use actual filled quantity
                employeeId: assignment.employee,
                date: today,
                refillId: refillResult._id
              });
            } else {
              console.warn('⚠️ Skipping daily refill creation:', {
                quantity,
                hasEmptyCylinderProduct: !!emptyCylinderInventory.product
              });
            }
          } catch (refillError) {
            console.error('❌ Failed to create daily refill record for assignment:', refillError.message);
            // Don't fail the entire operation if refill tracking fails
          }
        }
      }
      
      // For full cylinder assignments, also create/update gas inventory
      if (dbCategory === 'cylinder' && cylinderStatus === 'full' && assignment.gasProductId) {
        const gasInventory = await EmployeeInventoryItem.findOne({
          employee: assignment.employee,
          product: assignment.gasProductId
        });
        
        if (gasInventory) {
          gasInventory.currentStock += assignment.quantity;
          gasInventory.lastUpdatedAt = new Date();
          await gasInventory.save();
        } else {
          await EmployeeInventoryItem.create({
            employee: assignment.employee,
            product: assignment.gasProductId,
            category: 'gas',
            currentStock: assignment.quantity,
            availableEmpty: 0,
            availableFull: 0,
            lastUpdatedAt: new Date()
          });
        }
      }
    }
    
    // Check if employee has accepted all assignments from a purchase order and mark it as completed
    if ((data.status === 'received' || data.status === 'active') && data.createEmployeeInventory) {
      try {
        const EmployeePurchaseOrder = (await import("@/models/EmployeePurchaseOrder")).default;
        
        // Find any employee purchase order that might be related to this assignment
        const relatedPurchaseOrders = await EmployeePurchaseOrder.find({
          employee: assignment.employee,
          status: { $ne: "completed" }
        });
        
        for (const purchaseOrder of relatedPurchaseOrders) {
          // Check if all stock assignments for this employee from this time period are received
          const StockAssignment = (await import("@/models/StockAssignment")).default;
          const allAssignments = await StockAssignment.find({
            employee: assignment.employee,
            createdAt: { 
              $gte: new Date(purchaseOrder.createdAt.getTime() - 60000), // Within 1 minute of purchase order
              $lte: new Date(purchaseOrder.createdAt.getTime() + 60000)
            }
          });
          
          const allAccepted = allAssignments.every(sa => sa.status === 'received' || sa.status === 'active');
          
          if (allAccepted && allAssignments.length > 0) {
            await EmployeePurchaseOrder.findByIdAndUpdate(
              purchaseOrder._id,
              { $set: { 
                status: "completed",
                inventoryStatus: "received"
              } },
              { new: true }
            );
            console.log(`✅ Employee purchase order ${purchaseOrder._id} marked as completed after employee confirmation`);
            console.log(`✅ Inventory status updated to "received"`);
          }
        }
      } catch (purchaseOrderError) {
        console.error("Failed to update purchase order status:", purchaseOrderError);
        // Don't fail the entire operation
      }
    }
    } // Close the main createEmployeeInventory conditional block
    
    // Return success response
    return NextResponse.json({ success: true, data: assignment });
  } catch (error) {
    console.error("Stock assignment PATCH error:", error);
    return NextResponse.json(
      { error: "Failed to update assignment", details: error.message },
      { status: 500 }
    );
  }
}