"use client"

import { useEffect, useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Printer } from 'lucide-react';

// This interface MUST match the 'sale' object structure from ReceiptDialogProps
interface Sale {
  _id: string;
  invoiceNumber: string;
  customer: {
    name: string;
    phone: string;
    address: string;
    trNumber?: string;
  };
  items: Array<{
    product: {
      name: string;
      price: number;
    };
    quantity: number;
    price: number;
    total: number;
    category?: "gas" | "cylinder";
    // Additional fields for collection receipts
    invoiceNumber?: string;
    invoiceDate?: string;
    paymentStatus?: string;
  }>;
  totalAmount: number;
  paymentMethod: string;
  bankName?: string;
  chequeNumber?: string;
  paymentStatus: string;
  createdAt: string;
  customerSignature?: string;
  // Optional: used for cylinder returns to pick the correct header
  type?: 'deposit' | 'refill' | 'return' | 'collection' | string;
}

const ReceiptPrintPage = () => {
  const [sale, setSale] = useState<Sale | null>(null);
  const [loading, setLoading] = useState(true);
  const [adminSignature, setAdminSignature] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    try {
      // Data is passed from the dialog via sessionStorage
      const savedData = sessionStorage.getItem('printReceiptData');
      const savedAdminSig = sessionStorage.getItem('adminSignature');
      if (savedData) {
        const parsedData = JSON.parse(savedData);
        setSale(parsedData);
        setAdminSignature(savedAdminSig);
        // We can clear the data after reading it to prevent it from being used again accidentally.
        // sessionStorage.removeItem('printReceiptData');
      } else {
        setError('Receipt data not found. Please generate the receipt again.');
      }
    } catch (err) {
      setError('Failed to load receipt data. The data format may be incorrect.');
    } finally {
      setLoading(false);
    }
  }, []);

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return <div className="flex justify-center items-center h-screen font-semibold">Loading Receipt...</div>;
  }

  if (error) {
    return <div className="flex justify-center items-center h-screen text-red-600 font-semibold">Error: {error}</div>;
  }

  if (!sale) {
    return <div className="flex justify-center items-center h-screen font-semibold">Sale data is not available.</div>;
  }

  // Calculate totals based on whether it's a collection receipt or cylinder transaction
  let subTotal, vatAmount, grandTotal
  
  // Disable VAT for cylinder transactions (deposit, return, refill) and collections
  // Also check sessionStorage for disableVAT flag
  const disableVATFromStorage = typeof window !== 'undefined' && sessionStorage.getItem('disableVAT') === 'true'
  const isCylinderTransaction = sale?.type === 'deposit' || sale?.type === 'return' || sale?.type === 'refill'
  const shouldDisableVAT = disableVATFromStorage || isCylinderTransaction
  
  if (sale?.type === 'collection' || shouldDisableVAT) {
    // For collections and cylinder transactions, use the totalAmount directly without VAT calculation
    grandTotal = Number(sale?.totalAmount || 0)
    subTotal = grandTotal
    vatAmount = 0
  } else {
    // Totals breakdown: Subtotal (price*qty), VAT (5% of subtotal), Grand Total (subtotal + VAT)
    subTotal = sale.items.reduce((sum, item) => {
      const priceNum = Number(item?.price || 0)
      const qtyNum = Number(item?.quantity || 0)
      const line = (isFinite(priceNum) ? priceNum : 0) * (isFinite(qtyNum) ? qtyNum : 0)
      return sum + line
    }, 0)
    vatAmount = subTotal * 0.05
    grandTotal = subTotal + vatAmount
  }

  // Choose header by transaction type first (Deposit/Return),
  // then allow forcing Receiving header via sessionStorage, else default to Tax header
  const useReceivingHeader = (typeof window !== 'undefined' && sessionStorage.getItem('useReceivingHeader') === 'true')
  const headerSrc = (() => {
    const t = (sale?.type || '').toString().toLowerCase()
    if (t === 'deposit') return '/images/Header-deposit-invoice.jpg'
    if (t === 'return') return '/images/Header-Return-invoice.jpg'
    if (t === 'collection') return '/images/Header-Receiving-invoice.jpg'
    if (t === 'rental') return '/images/rental_Invoice_page.jpg'
    if (useReceivingHeader) return '/images/Header-Receiving-invoice.jpg'
    return '/images/Header-Tax-invoice.jpg'
  })()

  return (
    <div className="bg-gray-100 min-h-screen print:bg-white">
      {/* This is the non-printable header with the print button */}
      <header className="p-4 bg-white shadow-md no-print flex justify-between items-center sticky top-0 z-10">
        <h1 className="text-xl font-bold text-gray-800">Print Preview</h1>
        <Button onClick={handlePrint}>
          <Printer className="mr-2 h-5 w-5" />
          Print Receipt
        </Button>
      </header>

      {/* This is the printable receipt area */}
      <main className="printable-area max-w-3xl mx-auto p-8 bg-white">
        <div className="text-center">
          <img 
            src={headerSrc}
            alt="Company Header"
            className="mx-auto max-w-full h-auto"
          />
        </div>

        <section className="grid grid-cols-2 gap-8 my-8">
          <div>
            <div className="space-y-1 text-sm text-gray-700">
              <div><strong>Name:</strong> {sale.customer.name}</div>
              <div><strong>TR Number:</strong> {sale.customer.trNumber || '-'}</div>
              <div><strong>Address:</strong> {sale.customer.address || '-'}</div>
            </div>
          </div>
          <div>
            <div className="space-y-1 text-sm text-gray-700">
              {/* Show RC-NO for collection receipts, regular Invoice # for others */}
              {sale?.type === 'collection' ? (
                <div><strong>RC-NO-{sale?.invoiceNumber || '-'}</strong></div>
              ) : (
                <div><strong>Invoice #:</strong> {sale.invoiceNumber}</div>
              )}
              <div><strong>Date:</strong> {new Date(sale.createdAt).toLocaleDateString()}</div>
              {/* Hide Payment Method for rental receipts */}
              {sale?.type !== 'rental' && (
                <div>
                  <strong>Payment Method:</strong> {(
                    sale?.paymentMethod
                      ? sale.paymentMethod
                          .toString()
                          .replace(/[\-_]/g, ' ')
                          .replace(/\b\w/g, (c) => c.toUpperCase())
                      : '-'
                  )}
                </div>
              )}
              {sale?.paymentMethod?.toLowerCase() === 'cheque' && (
                <>
                  {sale?.bankName && (
                    <div>
                      <strong>Bank Name:</strong> {sale.bankName}
                    </div>
                  )}
                  {sale?.chequeNumber && (
                    <div>
                      <strong>Cheque Number:</strong> {sale.chequeNumber}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </section>

        <section>
          <table className="w-full border-collapse text-[11px] leading-tight">
            <thead>
              <tr className="bg-[#2B3068] text-white">
                {sale?.type === 'collection' ? (
                  <>
                    <th className="text-left p-2 font-semibold border">Invoice</th>
                    <th className="text-center p-2 font-semibold border">Date</th>
                    <th className="text-right p-2 font-semibold border">Type</th>
                    <th className="text-right p-2 font-semibold border">Total</th>
                  </>
                ) : (
                  <>
                    <th className="text-left p-2 font-semibold border">Item</th>
                    <th className="text-center p-2 font-semibold border">Category</th>
                    <th className="text-center p-2 font-semibold border">Qty</th>
                    <th className="text-right p-2 font-semibold border">Price</th>
                    {!shouldDisableVAT && (
                      <th className="text-right p-2 font-semibold border">VAT (5%)</th>
                    )}
                    <th className="text-right p-2 font-semibold border">Total</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {sale.items.map((item, index) => {
                const priceNum = Number(item?.price || 0)
                const qtyNum = Number(item?.quantity || 0)
                
                // For collection receipts and cylinder transactions, use the item total directly without VAT calculation
                let itemTotal
                if (sale?.type === 'collection' || shouldDisableVAT) {
                  itemTotal = Number(item?.total || 0)
                } else {
                  const unitVat = priceNum * 0.05
                  const unitWithVat = priceNum + unitVat
                  itemTotal = (isFinite(unitWithVat) ? unitWithVat : 0) * (isFinite(qtyNum) ? qtyNum : 0)
                }
                
                const unitVat = priceNum * 0.05
                
                // Extract invoice number for collection receipts
                let invoiceNumber = item.invoiceNumber
                // If item doesn't have invoiceNumber, try to extract from product name
                if (!invoiceNumber && item.product.name.includes('Invoice #')) {
                  const parts = item.product.name.split('Invoice #')
                  if (parts.length > 1) {
                    invoiceNumber = parts[1].split(' ')[0].trim()
                  }
                }
                // If still no invoice number, use the sale's invoice number (for collected invoices)
                if (!invoiceNumber && sale?.invoiceNumber) {
                  invoiceNumber = sale.invoiceNumber
                }
                invoiceNumber = invoiceNumber || '-'
                
                return (
                  <tr key={index} className="border-b h-5">
                    {sale?.type === 'collection' ? (
                      <>
                        <td className="p-2 border">{invoiceNumber}</td>
                        <td className="text-center p-2 border">{
                          // Use the invoice date from the item data, or fall back to sale date
                          item.invoiceDate ? new Date(item.invoiceDate).toLocaleDateString() : 
                          (sale?.createdAt ? new Date(sale.createdAt).toLocaleDateString() : '-')
                        }</td>
                        <td className="text-right p-2 border">{item.paymentStatus || 'pending'}</td>
                        <td className="text-right p-2 border font-medium">AED {itemTotal.toFixed(2)}</td>
                      </>
                    ) : (
                      <>
                        <td className="p-2 border">{item.product.name}</td>
                        <td className="text-center p-2 border">
                          {(() => {
                            // For cylinder transactions (deposit/return/refill), show the transaction type with "Empty"
                            if (sale?.type === 'deposit' || sale?.type === 'return' || sale?.type === 'refill') {
                              // Capitalize the transaction type and add "Empty" (e.g., "deposit" -> "Deposit Empty", "return" -> "Return Empty")
                              const typeCapitalized = sale.type.charAt(0).toUpperCase() + sale.type.slice(1)
                              return `${typeCapitalized} Empty`
                            }
                            
                            // For other transactions, show product category
                            const category = item.category || (item.product as any)?.category || '-'
                            return category.charAt(0).toUpperCase() + category.slice(1)
                          })()}
                        </td>
                        <td className="text-center p-2 border">{qtyNum}</td>
                        <td className="text-right p-2 border">AED {priceNum.toFixed(2)}</td>
                        {!shouldDisableVAT && (
                          <td className="text-right p-2 border">AED {unitVat.toFixed(2)}</td>
                        )}
                        <td className="text-right p-2 border font-medium">AED {itemTotal.toFixed(2)}</td>
                      </>
                    )}
                  </tr>
                )
              })}
              {/* No padding rows - show only actual items */}
            </tbody>
          </table>
        </section>

        <section className="flex justify-end mt-8">
          <div className="w-full max-w-sm text-sm">
            <table className="w-full">
              <tbody>
                {/* Hide subtotal and VAT breakdown for collection receipts and cylinder transactions */}
                {sale?.type !== 'collection' && !shouldDisableVAT && (
                  <>
                    <tr>
                      <td className="text-right pr-4 text-base">Subtotal</td>
                      <td className="text-right w-36 text-base">AED {subTotal.toFixed(2)}</td>
                    </tr>
                    <tr>
                      <td className="text-right pr-4 text-base">VAT (5%)</td>
                      <td className="text-right w-36 text-base">AED {vatAmount.toFixed(2)}</td>
                    </tr>
                  </>
                )}
                <tr className="border-t-2 border-black mt-2">
                  <td className="text-right pr-4 pt-2 font-bold text-xl">Total</td>
                  <td className="text-right font-bold text-xl w-36 pt-2">AED {grandTotal.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Removed Payment Method and Status section as requested */}

        {/* Terms & Conditions for Deposit (shown above footer) */}
        {String(sale?.type || '').toLowerCase() === 'deposit' && (
          <section className="mt-4 text-[10px] leading-snug text-gray-700">
            <h3 className="font-semibold mb-2">TERMS & CONDITIONS FOR CYLINDER(S) (ON DEPOSIT) FOR GAS SUPPLY</h3>
            <ol className="list-decimal pl-4 space-y-1">
              <li>
                Syed Tayyab Industrial Gas L.L.C. (herein after referred to as STIG) cylinder(s) (on deposit/loan) for
                gas supply held by the customer is/are the property of STIG and will remain so while in use by customer unless sold.
                The customer has no right to the cylinder(s) and undertakes & agrees to restrict the usage and refilling of cylinder(s)
                regularly Loan/Exchange/Damage from STIG only.
              </li>
              <li>
                If any cylinder(s) is/are kept in customer's custody for a period of more than 30 days without refilling at STIG,
                the same will be considered as cylinder(s) purchased by customer from STIG. The cylinders will not be accepted if
                returned after the above period. In such case the deposit paid or security cheque is not given will not be refunded/returned.
                If the deposit paid or the security cheque is not given, the customer is able to pay the value of cylinder(s) immediately.
                The customer is also liable to pay a rental charge of AED. 10/- per day per cylinder for any delay in paying the value of cylinder (s).
              </li>
              <li>
                STIG will refund the cash deposit paid/return security cheque given (Except for the cases mentioned in point no. 2)
                when the customer return the cylinder in good condition along with original deposit invoice).
              </li>
              <li>
                In the event of either partial or total damage to the cylinder(s) while in the custody of the customer, is liable to
                compensate DEF for the value of partial damage as determined by STIG.
              </li>
            </ol>
          </section>
        )}

        <footer className="text-center pt-8 mt-8 relative">
          {/* The footer image acts as a container */}
          <img 
            src="/images/footer.png" 
            alt="Footer Graphic"
            className="mx-auto max-w-full h-auto"
          />
          {/* The signatures are absolutely positioned on top of the footer image */}
          {sale.customerSignature && (
            <div className="absolute bottom-7 right-16">
              <img 
                src={sale.customerSignature} 
                alt="Customer Signature" 
                className="max-h-12 object-contain opacity-90 mix-blend-multiply"
                style={{ filter: 'drop-shadow(0 0 1px rgba(255,255,255,0.7))' }}
              />
            </div>
          )}
          {adminSignature && (
            <div className="absolute bottom-9 left-16">
              <img 
                src={adminSignature} 
                alt="Admin Signature" 
                className="max-h-12 object-contain opacity-90 mix-blend-multiply"
                style={{ filter: 'drop-shadow(0 0 1px rgba(255,255,255,0.7))' }}
              />
            </div>
          )}
        </footer>
      </main>

      <style jsx global>{`
        @media print {
          .no-print {
            display: none !important;
          }
          body {
            background-color: #fff !important;
            -webkit-print-color-adjust: exact;
          }
          .printable-area {
            margin: 0;
            padding: 0;
            box-shadow: none;
            border: none;
            width: 100%;
            max-width: 100%;
          }
          /* Ensure the page content fits a single page height when <= 15 rows */
          table tr { break-inside: avoid; }
          footer { break-inside: avoid; }
        }
      `}</style>
    </div>
  );
};

export default ReceiptPrintPage;
