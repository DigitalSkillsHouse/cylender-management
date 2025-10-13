// Helper function to update inventory for deposit transactions
async function updateInventoryForDeposit(cylinderProductId, quantity, gasProductId) {
  console.log(`[Deposit] Processing stock deduction - Cylinder: ${cylinderProductId}, Quantity: ${quantity}, Gas: ${gasProductId}`);
  
  // 1. Simply deduct empty cylinders from inventory
  const cylinderInventory = await InventoryItem.findOne({ product: cylinderProductId });
  if (cylinderInventory) {
    cylinderInventory.availableEmpty = Math.max(0, (cylinderInventory.availableEmpty || 0) - quantity);
    cylinderInventory.currentStock = (cylinderInventory.availableFull || 0) + (cylinderInventory.availableEmpty || 0);
    await cylinderInventory.save();
    console.log(`[Deposit] Updated cylinder inventory - Empty: ${cylinderInventory.availableEmpty}, Total: ${cylinderInventory.currentStock}`);
  }
  
  // 2. Deduct gas stock if gasProductId is provided
  if (gasProductId) {
    const gasProduct = await Product.findById(gasProductId);
    if (gasProduct) {
      gasProduct.currentStock = Math.max(0, (gasProduct.currentStock || 0) - quantity);
      await gasProduct.save();
      console.log(`[Deposit] Updated gas product ${gasProduct.name} stock: ${gasProduct.currentStock}`);
    }
  }
  
  // 3. Sync cylinder product stock with inventory total
  const cylinderProduct = await Product.findById(cylinderProductId);
  if (cylinderProduct && cylinderInventory) {
    cylinderProduct.currentStock = cylinderInventory.currentStock;
    await cylinderProduct.save();
    console.log(`[Deposit] Synced cylinder product ${cylinderProduct.name} stock: ${cylinderProduct.currentStock}`);
  }
}