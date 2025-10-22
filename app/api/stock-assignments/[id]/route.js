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
    
    // Now update the assignment status
    const assignment = await StockAssignment.findByIdAndUpdate(
      id,
      { status: data.status },
      { new: true }
    ).populate("product", "name category cylinderSize productCode");
    
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
          const EmployeeInventory = (await import("@/models/EmployeeInventory")).default;
          const Product = (await import("@/models/Product")).default;
          const gasProduct = await Product.findById(assignment.gasProductId);
          
          if (gasProduct) {
            const existingGasInventory = await EmployeeInventory.findOne({
              employee: assignment.employee,
              product: assignment.gasProductId
            });
            
            if (existingGasInventory) {
              // Update existing gas inventory
              await EmployeeInventory.findByIdAndUpdate(existingGasInventory._id, {
                $inc: {
                  assignedQuantity: assignment.quantity,
                  currentStock: assignment.quantity
                },
                $push: {
                  transactions: {
                    type: 'assignment',
                    quantity: assignment.quantity,
                    date: new Date(),
                    notes: `Gas from full cylinder acceptance`
                  }
                }
              });
              console.log('✅ Updated existing gas inventory:', existingGasInventory._id);
            } else {
              // Create new gas inventory
              const newGasInventory = new EmployeeInventory({
                employee: assignment.employee,
                product: assignment.gasProductId,
                assignedQuantity: assignment.quantity,
                currentStock: assignment.quantity,
                category: 'gas',
                leastPrice: assignment.leastPrice || 0,
                status: 'received',
                transactions: [{
                  type: 'assignment',
                  quantity: assignment.quantity,
                  date: new Date(),
                  notes: `Gas from full cylinder acceptance`
                }]
              });
              await newGasInventory.save();
              console.log('✅ Created new gas inventory:', newGasInventory._id);
            }
          }
          
          // Also create/update cylinder inventory for the full cylinder itself
          console.log('🔄 Creating/updating employee cylinder inventory for the full cylinder');
          // EmployeeInventory is already imported above
          const existingCylinderInventory = await EmployeeInventory.findOne({
            employee: assignment.employee,
            product: assignment.product._id
          });
          
          if (existingCylinderInventory) {
            // Update existing cylinder inventory
            await EmployeeInventory.findByIdAndUpdate(existingCylinderInventory._id, {
              $inc: {
                assignedQuantity: assignment.quantity,
                currentStock: assignment.quantity,
                availableFull: assignment.quantity
              },
              category: 'cylinder',
              cylinderStatus: 'full',
              $push: {
                transactions: {
                  type: 'assignment',
                  quantity: assignment.quantity,
                  date: new Date(),
                  notes: `Full cylinder assignment accepted`
                }
              }
            });
            console.log('✅ Updated existing cylinder inventory:', existingCylinderInventory._id);
          } else {
            // Create new cylinder inventory
            const newCylinderInventory = new EmployeeInventory({
              employee: assignment.employee,
              product: assignment.product._id,
              assignedQuantity: assignment.quantity,
              currentStock: assignment.quantity,
              availableFull: assignment.quantity,
              category: 'cylinder',
              cylinderStatus: 'full',
              leastPrice: assignment.leastPrice || 0,
              status: 'received',
              transactions: [{
                type: 'assignment',
                quantity: assignment.quantity,
                date: new Date(),
                notes: `Full cylinder assignment accepted`
              }]
            });
            await newCylinderInventory.save();
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
        const EmployeeInventory = (await import("@/models/EmployeeInventory")).default;
        
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
      
      // Check for existing inventory by product ID, name, and code (comprehensive check)
      const allEmployeeInventory = await EmployeeInventory.find({
        employee: assignment.employee
      }).populate('product', 'name productCode');
      
      const targetInventory = allEmployeeInventory.find(inv => {
        // For cylinders, must match both product AND cylinderStatus to avoid converting empty to full
        if (dbCategory === 'cylinder') {
          const productMatch = inv.product?._id?.toString() === assignment.product._id.toString();
          const statusMatch = inv.cylinderStatus === cylinderStatus;
          console.log('🔍 Cylinder duplicate check:', {
            productMatch,
            statusMatch,
            invCylinderStatus: inv.cylinderStatus,
            assignmentCylinderStatus: cylinderStatus,
            productId: assignment.product._id.toString()
          });
          return productMatch && statusMatch;
        }
        
        // For gas, just match product ID
        if (dbCategory === 'gas') {
          const productMatch = inv.product?._id?.toString() === assignment.product._id.toString();
          console.log('🔍 Gas duplicate check:', {
            productMatch,
            productId: assignment.product._id.toString()
          });
          return productMatch;
        }
        
        return false;
      });
      
      console.log('🔍 Duplicate check result:', {
        assignmentId: assignment._id,
        assignmentProduct: {
          id: assignment.product._id,
          name: assignment.product.name,
          code: assignment.product.productCode
        },
        category: dbCategory,
        cylinderStatus: cylinderStatus,
        quantity: assignment.quantity,
        existingInventory: allEmployeeInventory.map(inv => ({
          id: inv.product?._id,
          name: inv.product?.name,
          code: inv.product?.productCode,
          category: inv.category,
          cylinderStatus: inv.cylinderStatus,
          currentStock: inv.currentStock
        })),
        foundMatch: !!targetInventory,
        matchedItem: targetInventory ? {
          id: targetInventory.product?._id,
          name: targetInventory.product?.name,
          code: targetInventory.product?.productCode,
          category: targetInventory.category,
          cylinderStatus: targetInventory.cylinderStatus,
          currentStock: targetInventory.currentStock
        } : null
      });
      
      if (targetInventory) {
        // Update existing record
        console.log('✅ Updating existing inventory record:', {
          inventoryId: targetInventory._id,
          productName: targetInventory.product?.name,
          currentStock: targetInventory.currentStock,
          addingQuantity: assignment.quantity
        });
        
        const updateData = {
          $inc: {
            assignedQuantity: assignment.quantity,
            currentStock: assignment.quantity,
            ...(dbCategory === 'cylinder' && cylinderStatus === 'empty' && {
              availableEmpty: assignment.quantity
            }),
            ...(dbCategory === 'cylinder' && cylinderStatus === 'full' && {
              availableFull: assignment.quantity
            })
          },
          category: dbCategory,
          leastPrice: assignment.leastPrice,
          status: 'received',
          $push: {
            transactions: {
              type: 'assignment',
              quantity: assignment.quantity,
              date: new Date(),
              notes: `Additional stock assignment accepted - ${dbCategory} ${cylinderStatus || ''}`
            }
          }
        };
        
        // Only set cylinderStatus if it's defined
        if (cylinderStatus) {
          updateData.cylinderStatus = cylinderStatus;
        }
        
        await EmployeeInventory.findByIdAndUpdate(targetInventory._id, updateData);
      } else {
        // Create new record with valid enum category
        console.log('💾 Creating new EmployeeInventory record (no existing match found):', {
          productId: assignment.product._id,
          productName: assignment.product.name,
          productCode: assignment.product.productCode,
          category: dbCategory,
          cylinderStatus: assignment.cylinderStatus,
          quantity: assignment.quantity,
          employeeId: assignment.employee,
          leastPrice: assignment.leastPrice
        });
        
        const newInventoryData = {
          employee: assignment.employee,
          product: assignment.product._id,
          category: dbCategory,
          assignedQuantity: assignment.quantity,
          currentStock: assignment.quantity,
          ...(dbCategory === 'cylinder' && cylinderStatus === 'empty' && {
            availableEmpty: assignment.quantity
          }),
          ...(dbCategory === 'cylinder' && cylinderStatus === 'full' && {
            availableFull: assignment.quantity
          }),
          cylinderSize: assignment.cylinderSize,
          leastPrice: assignment.leastPrice || 0,
          status: 'received',
          transactions: [{
            type: 'assignment',
            quantity: assignment.quantity,
            date: new Date(),
            notes: `Stock assignment accepted - ${dbCategory} ${cylinderStatus || ''}`
          }]
        };
        
        // Only set cylinderStatus if it's defined
        if (cylinderStatus) {
          newInventoryData.cylinderStatus = cylinderStatus;
        }
        
        const createdInventory = await EmployeeInventory.create(newInventoryData);
        console.log('✅ EmployeeInventory record created successfully:', {
          inventoryId: createdInventory._id,
          productName: assignment.product.name,
          category: dbCategory,
          currentStock: createdInventory.currentStock,
          assignedQuantity: createdInventory.assignedQuantity,
          cylinderStatus: createdInventory.cylinderStatus
        });
      }
      
      // For gas assignments, also create/update cylinder inventory
      if (assignment.category === 'gas' && assignment.cylinderProductId) {
        const cylinderProduct = await Product.findById(assignment.cylinderProductId);
        const targetCylinderInventory = allEmployeeInventory.find(inv => {
          // Primary check: exact product ID match
          if (inv.product?._id?.toString() === assignment.cylinderProductId.toString()) {
            return true;
          }
          
          // Secondary check: name and product code match
          if (cylinderProduct && inv.product?.name === cylinderProduct.name && 
              inv.product?.productCode === cylinderProduct.productCode) {
            return true;
          }
          
          // Tertiary check: name match only (fallback)
          if (cylinderProduct && inv.product?.name === cylinderProduct.name && 
              !inv.product?.productCode && !cylinderProduct.productCode) {
            return true;
          }
          
          return false;
        });
        
        if (targetCylinderInventory) {
          await EmployeeInventory.findByIdAndUpdate(targetCylinderInventory._id, {
            $inc: {
              assignedQuantity: assignment.quantity,
              currentStock: assignment.quantity,
              availableEmpty: assignment.quantity
            },
            $push: {
              transactions: {
                type: 'assignment',
                quantity: assignment.quantity,
                date: new Date(),
                notes: `Additional empty cylinders from gas assignment`
              }
            }
          });
        } else {
          await EmployeeInventory.create({
            employee: assignment.employee,
            product: assignment.cylinderProductId,
            category: 'cylinder',
            assignedQuantity: assignment.quantity,
            currentStock: assignment.quantity,
            availableEmpty: assignment.quantity,
            leastPrice: 0,
            status: 'received',
            transactions: [{
              type: 'assignment',
              quantity: assignment.quantity,
              date: new Date(),
              notes: `Empty cylinders from gas assignment`
            }]
          });
        }
      }
      
      // For full cylinder assignments, also create/update gas inventory
      if (dbCategory === 'cylinder' && cylinderStatus === 'full' && assignment.gasProductId) {
        const gasProduct = await Product.findById(assignment.gasProductId);
        const targetGasInventory = allEmployeeInventory.find(inv => {
          // Primary check: exact product ID match
          if (inv.product?._id?.toString() === assignment.gasProductId.toString()) {
            return true;
          }
          
          // Secondary check: name and product code match
          if (gasProduct && inv.product?.name === gasProduct.name && 
              inv.product?.productCode === gasProduct.productCode) {
            return true;
          }
          
          // Tertiary check: name match only (fallback)
          if (gasProduct && inv.product?.name === gasProduct.name && 
              !inv.product?.productCode && !gasProduct.productCode) {
            return true;
          }
          
          return false;
        });
        
        if (targetGasInventory) {
          await EmployeeInventory.findByIdAndUpdate(targetGasInventory._id, {
            $inc: {
              assignedQuantity: assignment.quantity,
              currentStock: assignment.quantity
            },
            $push: {
              transactions: {
                type: 'assignment',
                quantity: assignment.quantity,
                date: new Date(),
                notes: `Additional gas from full cylinder assignment`
              }
            }
          });
        } else {
          await EmployeeInventory.create({
            employee: assignment.employee,
            product: assignment.gasProductId,
            category: 'gas',
            assignedQuantity: assignment.quantity,
            currentStock: assignment.quantity,
            leastPrice: assignment.leastPrice || 0,
            status: 'received',
            transactions: [{
              type: 'assignment',
              quantity: assignment.quantity,
              date: new Date(),
              notes: `Gas from full cylinder assignment`
            }]
          });
        }
      }
      } // Close the else block for regular inventory creation
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
    
    return NextResponse.json({ success: true, data: assignment });
  } catch (error) {
    console.error("Stock assignment PATCH error:", error);
    return NextResponse.json(
      { error: "Failed to update assignment", details: error.message },
      { status: 500 }
    );
  }
}