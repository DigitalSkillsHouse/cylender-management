import dbConnect from "@/lib/mongodb";
import StockAssignment from "@/models/StockAssignment";
import Product from "@/models/Product";
import { NextResponse } from "next/server";

export async function PATCH(request, { params }) {
  try {
    await dbConnect();
    
    const { id } = params;
    const data = await request.json();
    
    const assignment = await StockAssignment.findByIdAndUpdate(
      id,
      { status: data.status },
      { new: true }
    ).populate("product", "name category cylinderSize");
    
    if (!assignment) {
      return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
    }
    
    // If accepting assignment, create EmployeeInventory records
    if (data.status === 'received' && data.createEmployeeInventory) {
      const EmployeeInventory = (await import("@/models/EmployeeInventory")).default;
      
      // Use the base category for database storage (gas/cylinder)
      const dbCategory = assignment.category || (assignment.product?.category === 'gas' ? 'gas' : 'cylinder');
      
      console.log('🔧 Assignment details:', {
        category: assignment.category,
        cylinderStatus: assignment.cylinderStatus,
        dbCategory: dbCategory,
        productName: assignment.product?.name
      });
      
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
        await EmployeeInventory.findByIdAndUpdate(targetInventory._id, {
          $inc: {
            assignedQuantity: assignment.quantity,
            currentStock: assignment.quantity,
            ...(assignment.category === 'cylinder' && assignment.cylinderStatus === 'empty' && {
              availableEmpty: assignment.quantity
            }),
            ...(assignment.category === 'cylinder' && assignment.cylinderStatus === 'full' && {
              availableFull: assignment.quantity
            })
          },
          category: dbCategory,
          cylinderStatus: assignment.cylinderStatus,
          leastPrice: assignment.leastPrice,
          status: 'received',
          $push: {
            transactions: {
              type: 'assignment',
              quantity: assignment.quantity,
              date: new Date(),
              notes: `Additional stock assignment accepted - ${dbCategory} ${assignment.cylinderStatus || ''}`
            }
          }
        });
      } else {
        // Create new record with valid enum category
        console.log('💾 Creating new EmployeeInventory record:', {
          category: dbCategory,
          cylinderStatus: assignment.cylinderStatus,
          quantity: assignment.quantity
        });
        
        await EmployeeInventory.create({
          employee: assignment.employee,
          product: assignment.product._id,
          category: dbCategory,
          cylinderStatus: assignment.cylinderStatus,
          assignedQuantity: assignment.quantity,
          currentStock: assignment.quantity,
          ...(assignment.category === 'cylinder' && assignment.cylinderStatus === 'empty' && {
            availableEmpty: assignment.quantity
          }),
          ...(assignment.category === 'cylinder' && assignment.cylinderStatus === 'full' && {
            availableFull: assignment.quantity
          }),
          cylinderSize: assignment.cylinderSize,
          leastPrice: assignment.leastPrice || 0,
          status: 'received',
          transactions: [{
            type: 'assignment',
            quantity: assignment.quantity,
            date: new Date(),
            notes: `Stock assignment accepted - ${dbCategory} ${assignment.cylinderStatus || ''}`
          }]
        });
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
      if (assignment.category === 'cylinder' && assignment.cylinderStatus === 'full' && assignment.gasProductId) {
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