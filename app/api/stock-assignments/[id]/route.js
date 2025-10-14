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
    
    const assignment = await StockAssignment.findByIdAndUpdate(
      id,
      { status: data.status },
      { new: true }
    ).populate("product", "name category cylinderSize productCode");
    
    if (!assignment) {
      console.error('❌ Assignment not found:', id);
      return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
    }
    
    console.log('✅ Assignment found:', {
      id: assignment._id,
      product: assignment.product?.name,
      category: assignment.category,
      cylinderStatus: assignment.cylinderStatus,
      status: assignment.status
    });
    
    // If accepting assignment, create EmployeeInventory records
    if (data.status === 'received' && data.createEmployeeInventory) {
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
      
      // Check for existing inventory by product name and code (primary check)
      const allEmployeeInventory = await EmployeeInventory.find({
        employee: assignment.employee
      }).populate('product', 'name productCode');
      
      const targetInventory = allEmployeeInventory.find(inv => 
        inv.product?.name === assignment.product.name && 
        inv.product?.productCode === assignment.product.productCode
      );
      
      if (targetInventory) {
        // Update existing record
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
        console.log('💾 Creating new EmployeeInventory record:', {
          category: dbCategory,
          cylinderStatus: assignment.cylinderStatus,
          quantity: assignment.quantity
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
        
        await EmployeeInventory.create(newInventoryData);
      }
      
      // For gas assignments, also create/update cylinder inventory
      if (assignment.category === 'gas' && assignment.cylinderProductId) {
        const cylinderProduct = await Product.findById(assignment.cylinderProductId);
        const targetCylinderInventory = allEmployeeInventory.find(inv => 
          inv.product?.name === cylinderProduct?.name && 
          inv.product?.productCode === cylinderProduct?.productCode
        );
        
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
        const targetGasInventory = allEmployeeInventory.find(inv => 
          inv.product?.name === gasProduct?.name && 
          inv.product?.productCode === gasProduct?.productCode
        );
        
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