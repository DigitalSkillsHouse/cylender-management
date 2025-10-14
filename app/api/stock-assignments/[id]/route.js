import dbConnect from "@/lib/mongodb";
import StockAssignment from "@/models/StockAssignment";
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
      
      // Create main product inventory with proper display category
      const displayCategory = assignment.displayCategory || 
        (assignment.category === 'cylinder' 
          ? (assignment.cylinderStatus === 'empty' ? 'Empty Cylinder' : 'Full Cylinder')
          : assignment.category === 'gas' ? 'Gas' : assignment.category);
      
      // Check for existing inventory record by product to prevent duplicates
      const existingInventory = await EmployeeInventory.findOne({
        employee: assignment.employee,
        product: assignment.product._id
      }).populate('product', 'name productCode');
      
      // Also check by product name and code as fallback
      let duplicateByNameCode = null;
      if (!existingInventory && assignment.product.name && assignment.product.productCode) {
        const allEmployeeInventory = await EmployeeInventory.find({
          employee: assignment.employee
        }).populate('product', 'name productCode');
        
        duplicateByNameCode = allEmployeeInventory.find(inv => 
          inv.product?.name === assignment.product.name && 
          inv.product?.productCode === assignment.product.productCode
        );
      }
      
      const targetInventory = existingInventory || duplicateByNameCode;
      
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
          category: displayCategory,
          cylinderStatus: assignment.cylinderStatus,
          leastPrice: assignment.leastPrice,
          status: 'received',
          $push: {
            transactions: {
              type: 'assignment',
              quantity: assignment.quantity,
              date: new Date(),
              notes: `Additional stock assignment accepted - ${displayCategory}`
            }
          }
        });
      } else {
        // Create new record
        await EmployeeInventory.create({
          employee: assignment.employee,
          product: assignment.product._id,
          category: displayCategory,
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
          leastPrice: assignment.leastPrice,
          status: 'received',
          transactions: [{
            type: 'assignment',
            quantity: assignment.quantity,
            date: new Date(),
            notes: `Stock assignment accepted - ${displayCategory}`
          }]
        });
      }
      
      // For gas assignments, also create/update cylinder inventory
      if (assignment.category === 'gas' && assignment.cylinderProductId) {
        const existingCylinderInventory = await EmployeeInventory.findOne({
          employee: assignment.employee,
          product: assignment.cylinderProductId
        }).populate('product', 'name productCode');
        
        // Check by name+code for cylinder
        let cylinderDuplicateByNameCode = null;
        if (!existingCylinderInventory) {
          const cylinderProduct = await Product.findById(assignment.cylinderProductId);
          if (cylinderProduct?.name && cylinderProduct?.productCode) {
            const allEmployeeInventory = await EmployeeInventory.find({
              employee: assignment.employee
            }).populate('product', 'name productCode');
            
            cylinderDuplicateByNameCode = allEmployeeInventory.find(inv => 
              inv.product?.name === cylinderProduct.name && 
              inv.product?.productCode === cylinderProduct.productCode
            );
          }
        }
        
        const targetCylinderInventory = existingCylinderInventory || cylinderDuplicateByNameCode;
        
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
            category: 'Empty Cylinder',
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
        const existingGasInventory = await EmployeeInventory.findOne({
          employee: assignment.employee,
          product: assignment.gasProductId
        }).populate('product', 'name productCode');
        
        // Check by name+code for gas
        let gasDuplicateByNameCode = null;
        if (!existingGasInventory) {
          const gasProduct = await Product.findById(assignment.gasProductId);
          if (gasProduct?.name && gasProduct?.productCode) {
            const allEmployeeInventory = await EmployeeInventory.find({
              employee: assignment.employee
            }).populate('product', 'name productCode');
            
            gasDuplicateByNameCode = allEmployeeInventory.find(inv => 
              inv.product?.name === gasProduct.name && 
              inv.product?.productCode === gasProduct.productCode
            );
          }
        }
        
        const targetGasInventory = existingGasInventory || gasDuplicateByNameCode;
        
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
            category: 'Gas',
            assignedQuantity: assignment.quantity,
            currentStock: assignment.quantity,
            leastPrice: assignment.leastPrice,
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