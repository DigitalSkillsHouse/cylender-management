import mongoose from 'mongoose';

const EmpGasSalesSchema = new mongoose.Schema(
  {
    // Employee reference - each employee has their own DSR data
    employeeId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User', 
      required: true, 
      index: true 
    },
    
    // Product information
    productId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'Product', 
      required: true, 
      index: true 
    },
    productName: { 
      type: String, 
      required: true, 
      trim: true,
      index: true 
    },
    category: { 
      type: String, 
      required: true, 
      enum: ['gas', 'cylinder'],
      index: true 
    },
    
    // Date tracking - YYYY-MM-DD format
    date: { 
      type: String, 
      required: true, 
      index: true 
    },
    
    // Opening stock (start of day)
    openingStock: { 
      type: Number, 
      default: 0, 
      min: 0 
    },
    openingFull: { 
      type: Number, 
      default: 0, 
      min: 0 
    },
    openingEmpty: { 
      type: Number, 
      default: 0, 
      min: 0 
    },
    
    // Sales tracking during the day
    gasSalesQuantity: { 
      type: Number, 
      default: 0, 
      min: 0 
    },
    gasSalesAmount: { 
      type: Number, 
      default: 0, 
      min: 0 
    },
    
    // Cylinder sales tracking
    cylinderSalesQuantity: { 
      type: Number, 
      default: 0, 
      min: 0 
    },
    cylinderSalesAmount: { 
      type: Number, 
      default: 0, 
      min: 0 
    },
    
    // Full cylinder sales (separate tracking)
    fullCylinderSalesQuantity: { 
      type: Number, 
      default: 0, 
      min: 0 
    },
    fullCylinderSalesAmount: { 
      type: Number, 
      default: 0, 
      min: 0 
    },
    
    // Empty cylinder sales (separate tracking)
    emptyCylinderSalesQuantity: { 
      type: Number, 
      default: 0, 
      min: 0 
    },
    emptyCylinderSalesAmount: { 
      type: Number, 
      default: 0, 
      min: 0 
    },
    
    // Stock received during the day (from purchases/assignments)
    stockReceived: { 
      type: Number, 
      default: 0, 
      min: 0 
    },
    fullReceived: { 
      type: Number, 
      default: 0, 
      min: 0 
    },
    emptyReceived: { 
      type: Number, 
      default: 0, 
      min: 0 
    },
    
    // Closing stock (end of day) - optional, can be updated later
    closingStock: { 
      type: Number, 
      min: 0 
    },
    closingFull: { 
      type: Number, 
      min: 0 
    },
    closingEmpty: { 
      type: Number, 
      min: 0 
    },
    
    // Additional tracking fields
    cylinderStatus: { 
      type: String, 
      enum: ['full', 'empty', 'full_to_empty'],
      index: true 
    },
    
    // Metadata
    lastUpdated: { 
      type: Date, 
      default: Date.now 
    },
    notes: { 
      type: String, 
      trim: true 
    }
  },
  { 
    timestamps: true,
    // Add indexes for better query performance
    indexes: [
      { employeeId: 1, date: 1 },
      { employeeId: 1, productId: 1, date: 1 },
      { date: 1, category: 1 }
    ]
  }
);

// Ensure uniqueness per employee per product per date
EmpGasSalesSchema.index(
  { employeeId: 1, productId: 1, date: 1 }, 
  { unique: true }
);

// Virtual to calculate total sales quantity
EmpGasSalesSchema.virtual('totalSalesQuantity').get(function() {
  return (this.gasSalesQuantity || 0) + (this.cylinderSalesQuantity || 0);
});

// Virtual to calculate total sales amount
EmpGasSalesSchema.virtual('totalSalesAmount').get(function() {
  return (this.gasSalesAmount || 0) + (this.cylinderSalesAmount || 0);
});

// Virtual to calculate expected closing stock
EmpGasSalesSchema.virtual('expectedClosingStock').get(function() {
  const opening = this.openingStock || 0;
  const received = this.stockReceived || 0;
  const sold = this.totalSalesQuantity || 0;
  return opening + received - sold;
});

// Method to update sales data
EmpGasSalesSchema.methods.addSale = function(saleData) {
  const { category, quantity, amount, cylinderStatus } = saleData;
  
  if (category === 'gas') {
    this.gasSalesQuantity = (this.gasSalesQuantity || 0) + quantity;
    this.gasSalesAmount = (this.gasSalesAmount || 0) + amount;
  } else if (category === 'cylinder') {
    this.cylinderSalesQuantity = (this.cylinderSalesQuantity || 0) + quantity;
    this.cylinderSalesAmount = (this.cylinderSalesAmount || 0) + amount;
    
    // Track full vs empty cylinder sales
    if (cylinderStatus === 'full') {
      this.fullCylinderSalesQuantity = (this.fullCylinderSalesQuantity || 0) + quantity;
      this.fullCylinderSalesAmount = (this.fullCylinderSalesAmount || 0) + amount;
    } else {
      this.emptyCylinderSalesQuantity = (this.emptyCylinderSalesQuantity || 0) + quantity;
      this.emptyCylinderSalesAmount = (this.emptyCylinderSalesAmount || 0) + amount;
    }
  }
  
  this.lastUpdated = new Date();
  return this.save();
};

// Method to update stock received
EmpGasSalesSchema.methods.addStockReceived = function(stockData) {
  const { quantity, category, cylinderStatus } = stockData;
  
  if (category === 'gas') {
    this.stockReceived = (this.stockReceived || 0) + quantity;
  } else if (category === 'cylinder') {
    if (cylinderStatus === 'full') {
      this.fullReceived = (this.fullReceived || 0) + quantity;
    } else {
      this.emptyReceived = (this.emptyReceived || 0) + quantity;
    }
  }
  
  this.lastUpdated = new Date();
  return this.save();
};

export default mongoose.models.EmpGasSales || mongoose.model('EmpGasSales', EmpGasSalesSchema);
