import mongoose from 'mongoose'

const rentalItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  productName: {
    type: String,
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  days: {
    type: Number,
    required: true,
    min: 1
  },
  amountPerDay: {
    type: Number,
    required: true,
    min: 0
  },
  subtotal: {
    type: Number,
    required: true
  },
  vat: {
    type: Number,
    required: true
  },
  total: {
    type: Number,
    required: true
  }
})

const rentalSchema = new mongoose.Schema({
  rentalNumber: {
    type: String,
    required: false,
    unique: true,
    sparse: true
  },
  date: {
    type: Date,
    required: true
  },
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: true
  },
  customerName: {
    type: String,
    required: true
  },
  items: [rentalItemSchema],
  subtotal: {
    type: Number,
    required: true
  },
  totalVat: {
    type: Number,
    required: true
  },
  finalTotal: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'returned', 'overdue'],
    default: 'active'
  },
  notes: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
})

// Generate rental number before saving
rentalSchema.pre('save', async function(next) {
  if (this.isNew && !this.rentalNumber) {
    try {
      const year = new Date().getFullYear()
      const count = await this.constructor.countDocuments({
        rentalNumber: { $regex: `^RNT-${year}-` }
      })
      this.rentalNumber = `RNT-${year}-${String(count + 1).padStart(4, '0')}`
      console.log('Generated rental number:', this.rentalNumber)
    } catch (error) {
      console.error('Error generating rental number:', error)
      return next(error)
    }
  }
  next()
})

export default mongoose.models.Rental || mongoose.model('Rental', rentalSchema)
