"use client"

import { useEffect, useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Printer } from 'lucide-react';

const chunkArray = <T,>(arr: T[], size: number) => {
  const safe = Array.isArray(arr) ? arr : [];
  const chunkSize = Math.max(1, Math.floor(size || 1));
  const out: T[][] = [];
  for (let i = 0; i < safe.length; i += chunkSize) out.push(safe.slice(i, i + chunkSize));
  return out.length ? out : [[]];
};

const formatPaymentMethodLabel = (paymentMethod: unknown) => {
  const raw = (paymentMethod ?? '').toString().trim();
  if (!raw) return '-';

  const normalized = raw.toLowerCase();

  // Stored value can be `debit`, but invoices should display Cash.
  if (normalized === 'debit') return 'Cash';
  if (normalized === 'cash') return 'Cash';

  return raw.replace(/[\-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
};

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
    cylinderStatus?: "empty" | "full";
    // Additional fields for collection receipts
    invoiceNumber?: string;
    invoiceDate?: string;
    paymentStatus?: string;
  }>;
  totalAmount: number;
  paymentMethod: string;
  bankName?: string;
  chequeNumber?: string;
  lpoNo?: string;
  paymentStatus: string;
  createdAt: string;
  customerSignature?: string;
  // Optional: used for cylinder returns to pick the correct header
  type?: 'deposit' | 'refill' | 'return' | 'collection' | string;
  deliveryCharges?: number;
}

const ReceiptPrintPage = () => {
  const [sale, setSale] = useState<Sale | null>(null);
  const [loading, setLoading] = useState(true);
  const [adminSignature, setAdminSignature] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Set page title to minimal value to reduce browser print header text
    document.title = 'Receipt';
    
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
  } else if (sale?.type === 'rental') {
    // For rentals: calculate subtotal as quantity * days * amountPerDay, then add VAT
    subTotal = sale.items.reduce((sum, item) => {
      const priceNum = Number(item?.price || 0) // amountPerDay
      const qtyNum = Number(item?.quantity || 0)
      const daysNum = Number((item as any)?.days || 0)
      const itemSubtotal = (isFinite(priceNum) ? priceNum : 0) * (isFinite(qtyNum) ? qtyNum : 0) * (isFinite(daysNum) ? daysNum : 0)
      return sum + itemSubtotal
    }, 0)
    vatAmount = Math.trunc((subTotal * 0.05) * 100) / 100
    grandTotal = Math.trunc((subTotal + vatAmount) * 100) / 100
  } else {
    // Totals breakdown: Subtotal (price*qty), Delivery Charges, Total (Subtotal + Delivery Charges), VAT (5% of Total), Grand Total (Total + VAT)
    subTotal = sale.items.reduce((sum, item) => {
      const priceNum = Number(item?.price || 0)
      const qtyNum = Number(item?.quantity || 0)
      const line = (isFinite(priceNum) ? priceNum : 0) * (isFinite(qtyNum) ? qtyNum : 0)
      return sum + line
    }, 0)
    const deliveryCharges = Number(sale?.deliveryCharges || 0)
    const total = Math.trunc((subTotal + deliveryCharges) * 100) / 100
    vatAmount = Math.trunc((total * 0.05) * 100) / 100
    grandTotal = Math.trunc((total + vatAmount) * 100) / 100
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

  const isTaxInvoice = headerSrc === '/images/Header-Tax-invoice.jpg'

  const transactionType = (sale?.type || '').toString().toLowerCase()
  const isCollectionReceipt = transactionType === 'collection'
  const isStandardSaleInvoice =
    !['collection', 'deposit', 'return', 'refill', 'rental'].includes(transactionType) &&
    !String(sale?.invoiceNumber || '').startsWith('STATEMENT-') &&
    String(sale?.paymentMethod || '').toLowerCase() !== 'account statement'
  const hasGasItems =
    Array.isArray(sale?.items) &&
    sale.items.some((it: any) => (it?.category || (it?.product as any)?.category || '').toString().toLowerCase() === 'gas')
  const footerSrc = '/images/footer.png'
  const pageVariantClass = isTaxInvoice ? 'receipt-page-tax' : isCollectionReceipt ? 'receipt-page-collection' : ''

  // Page row limits (layout only):
  // - Collection "Receiving Invoice": denser single-page layout to fit more invoice rows
  // - Gas sales invoice: 10 lines per page
  // - Others: keep 15 as default
  const itemsPerPage = isCollectionReceipt ? 22 : hasGasItems ? 10 : 15

  const collectionRows = (() => {
    if (transactionType !== 'collection') return null

    const groups: Record<string, any[]> = {}
    const safeItems = Array.isArray(sale.items) ? sale.items : []

    safeItems.forEach((item: any) => {
      const name = String(item?.product?.name || '')
      let invoiceNumber = item?.invoiceNumber

      if (!invoiceNumber && name.includes('Invoice #')) {
        const parts = name.split('Invoice #')
        if (parts.length > 1) {
          invoiceNumber = parts[1].split(' ')[0].trim()
        }
      }

      if (!invoiceNumber && sale?.invoiceNumber) invoiceNumber = sale.invoiceNumber

      const key = String(invoiceNumber || 'no-invoice')
      if (!groups[key]) groups[key] = []
      groups[key].push(item)
    })

    return Object.entries(groups).map(([invoiceNumber, groupItems]) => {
      let totalAmount = 0
      let receivedAmount = 0
      let remainingAmount = 0
      let invoiceDate = ''
      let paymentStatus = 'pending'

      groupItems.forEach((item: any) => {
        const itemTotal = Number(item?.total || 0)
        const itemTotalAmount = Number(item?.totalAmount ?? itemTotal)
        const itemReceivedAmount = Number(item?.receivedAmount ?? itemTotal)
        const itemRemainingAmount =
          item?.remainingAmount !== undefined ? Number(item?.remainingAmount) : itemTotalAmount - itemReceivedAmount

        totalAmount += isFinite(itemTotalAmount) ? itemTotalAmount : 0
        receivedAmount += isFinite(itemReceivedAmount) ? itemReceivedAmount : 0
        remainingAmount += isFinite(itemRemainingAmount) ? itemRemainingAmount : 0

        if (!invoiceDate && item?.invoiceDate) invoiceDate = String(item.invoiceDate)
        if (paymentStatus === 'pending' && item?.paymentStatus) paymentStatus = String(item.paymentStatus)
      })

      const dateToShow = invoiceDate
        ? new Date(invoiceDate).toLocaleDateString()
        : sale?.createdAt
          ? new Date(sale.createdAt).toLocaleDateString()
          : '-'

      return {
        invoiceNumber: String(invoiceNumber || '-'),
        date: dateToShow,
        paymentStatus: paymentStatus || 'pending',
        totalAmount,
        receivedAmount,
        remainingAmount,
      }
    })
  })()

  const rowsToRender: any[] = transactionType === 'collection' ? (collectionRows || []) : (sale.items || [])
  const itemPages = chunkArray(rowsToRender, itemsPerPage)

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

      {/* Printable pages (A4) */}
      <main className="w-full">
        <div className="mx-auto w-full max-w-[210mm]">
          {itemPages.map((pageItems, pageIndex) => {
            const isLast = pageIndex === itemPages.length - 1

            return (
              <section
                key={pageIndex}
                className={`receipt-page bg-white shadow-sm border border-gray-200 my-4 print:my-0 print:shadow-none print:border-0 flex flex-col ${pageVariantClass}`}
              >
                <div className="flex flex-col flex-1">
                  <div className="text-center">
                    <img
                      src={headerSrc}
                      alt="Company Header"
                      className="receipt-header-img mx-auto max-w-full h-auto"
                    />
                  </div>

                  {pageIndex === 0 ? (
                    <section className="receipt-meta-grid grid grid-cols-2 gap-4 mt-3 mb-3">
                      <div>
                        <div className="space-y-0.5 text-[11px] leading-snug text-gray-700">
                          <div><strong>Name:</strong> {sale.customer.name}</div>
                          <div><strong>TR Number:</strong> {sale.customer.trNumber || '-'}</div>
                          <div><strong>Address:</strong> {sale.customer.address || '-'}</div>
                        </div>
                      </div>
                      <div>
                        <div className="space-y-0.5 text-[11px] leading-snug text-gray-700">
                          {sale?.type === 'collection' ? (
                            <div><strong>RC-NO-{sale?.invoiceNumber || '-'}</strong></div>
                          ) : (
                            <div><strong>Invoice #:</strong> {sale.invoiceNumber}</div>
                          )}
                          <div><strong>Date:</strong> {new Date(sale.createdAt).toLocaleDateString()}</div>
                          {sale?.type !== 'rental' && (
                            <div>
                              <strong>Payment Method:</strong> {formatPaymentMethodLabel(sale?.paymentMethod)}
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
                          {isStandardSaleInvoice && (
                            <div><strong>LPO No:</strong> {sale?.lpoNo?.trim() || '-'}</div>
                          )}
                        </div>
                      </div>
                    </section>
                  ) : (
                    <section className="receipt-meta-compact flex items-center justify-between mt-2 mb-2 text-[10px] text-gray-600">
                      <div className="font-medium">{sale.customer.name}</div>
                      <div className="font-mono">
                        {sale?.type === 'collection' ? `RC-NO-${sale?.invoiceNumber || '-'}` : `Invoice: ${sale.invoiceNumber}`}
                      </div>
                      <div>{new Date(sale.createdAt).toLocaleDateString()}</div>
                    </section>
                  )}

                  <section>
                    <table className={`w-full border-collapse text-[10px] leading-tight receipt-table ${isCollectionReceipt ? 'receipt-table-collection' : ''}`}>
                      <thead>
                        <tr className="bg-[#2B3068] text-white">
                          {sale?.type === 'collection' ? (
                            <>
                              <th className="text-left p-1 font-semibold border">Invoice</th>
                              <th className="text-center p-1 font-semibold border">Date</th>
                              <th className="text-right p-1 font-semibold border">Type</th>
                              <th className="text-right p-1 font-semibold border">Total</th>
                              <th className="text-right p-1 font-semibold border">Received</th>
                              <th className="text-right p-1 font-semibold border">Remaining</th>
                            </>
                          ) : (
                            <>
                              <th className="text-left p-1 font-semibold border">Item</th>
                              <th className="text-center p-1 font-semibold border">Category</th>
                              <th className="text-center p-1 font-semibold border">Qty</th>
                              <th className="text-right p-1 font-semibold border">Price</th>
                              {!shouldDisableVAT && (
                                <th className="text-right p-1 font-semibold border">VAT (5%)</th>
                              )}
                              <th className="text-right p-1 font-semibold border">Total</th>
                            </>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {pageItems.map((item, index) => {
                          if (sale?.type === 'collection') {
                            const row = item as any
                            return (
                              <tr key={`${pageIndex}-${index}`} className="border-b">
                                <td className="p-1 border">{row?.invoiceNumber || '-'}</td>
                                <td className="text-center p-1 border">{row?.date || '-'}</td>
                                <td className="text-right p-1 border">{row?.paymentStatus || 'pending'}</td>
                                <td className="text-right p-1 border font-medium">AED {Number(row?.totalAmount || 0).toFixed(2)}</td>
                                <td className="text-right p-1 border">AED {Number(row?.receivedAmount || 0).toFixed(2)}</td>
                                <td className="text-right p-1 border">AED {Number(row?.remainingAmount || 0).toFixed(2)}</td>
                              </tr>
                            )
                          }

                  const priceNum = Number(item?.price || 0)
                  const qtyNum = Number(item?.quantity || 0)
                
                // For collection receipts and cylinder transactions, use the item total directly without VAT calculation
                let itemTotal
                if (sale?.type === 'collection' || shouldDisableVAT) {
                  itemTotal = Number(item?.total || 0)
                } else if (sale?.type === 'rental') {
                  // For rentals: calculate quantity * days * amountPerDay + VAT
                  const daysNum = Number((item as any)?.days || 0)
                  const itemSubtotal = (isFinite(priceNum) ? priceNum : 0) * (isFinite(qtyNum) ? qtyNum : 0) * (isFinite(daysNum) ? daysNum : 0)
                  const itemVat = Math.trunc((itemSubtotal * 0.05) * 100) / 100
                  itemTotal = Math.trunc((itemSubtotal + itemVat) * 100) / 100
                } else {
                  const unitVat = Math.trunc((priceNum * 0.05) * 100) / 100
                  const unitWithVat = Math.trunc((priceNum + unitVat) * 100) / 100
                  itemTotal = Math.trunc(((isFinite(unitWithVat) ? unitWithVat : 0) * (isFinite(qtyNum) ? qtyNum : 0)) * 100) / 100
                }
                
                const unitVat = Math.trunc((priceNum * 0.05) * 100) / 100
                
                return (
                  <tr key={`${pageIndex}-${index}`} className="border-b">
                    <>
                      <td className="p-1 border">{item.product.name}</td>
                      <td className="text-center p-1 border">
                        {(() => {
                            // For cylinder transactions (deposit/return/refill), show the transaction type with "Empty"
                            if (sale?.type === 'deposit' || sale?.type === 'return' || sale?.type === 'refill') {
                              // Capitalize the transaction type and add "Empty" (e.g., "deposit" -> "Deposit Empty", "return" -> "Return Empty")
                              const typeCapitalized = sale.type.charAt(0).toUpperCase() + sale.type.slice(1)
                              return `${typeCapitalized} Empty`
                            }
                            
                            // For other transactions, show product category
                            const category = item.category || (item.product as any)?.category || '-'
                            const status = item.cylinderStatus
                            // For cylinders, show status with "Cylinder" (e.g., "Full Cylinder", "Empty Cylinder")
                            if (category === 'cylinder') {
                              if (status) {
                                // Capitalize first letter and add "Cylinder" (e.g., "empty" -> "Empty Cylinder", "full" -> "Full Cylinder")
                                return status.charAt(0).toUpperCase() + status.slice(1) + ' Cylinder'
                              }
                              // If no status, just show "Cylinder"
                              return 'Cylinder'
                            }
                            // For gas, show as-is
                            return category.charAt(0).toUpperCase() + category.slice(1)
                          })()}
                      </td>
                      <td className="text-center p-1 border">{qtyNum}</td>
                      <td className="text-right p-1 border">AED {priceNum.toFixed(2)}</td>
                      {!shouldDisableVAT && (
                        <td className="text-right p-1 border">AED {unitVat.toFixed(2)}</td>
                      )}
                      <td className="text-right p-1 border font-medium">AED {itemTotal.toFixed(2)}</td>
                    </>
                  </tr>
                )
              })}
                      </tbody>
                    </table>
                  </section>

                  {isLast && (
                    <>
                      <section className="flex justify-end mt-3">
                        <div className="receipt-total-section w-full max-w-sm text-[11px] leading-tight">
                          <table className="receipt-total-table w-full">
                            <tbody>
                              {sale?.type !== 'collection' && !shouldDisableVAT && (
                                <>
                                  <tr>
                                    <td className="text-right pr-3">Subtotal</td>
                                    <td className="text-right w-32">AED {subTotal.toFixed(2)}</td>
                                  </tr>
                                  {Number((sale as any)?.deliveryCharges || 0) > 0 && (
                                    <tr>
                                      <td className="text-right pr-3">Delivery Charges</td>
                                      <td className="text-right w-32">AED {Number((sale as any)?.deliveryCharges || 0).toFixed(2)}</td>
                                    </tr>
                                  )}
                                  <tr>
                                    <td className="text-right pr-3">Total</td>
                                    <td className="text-right w-32">AED {Math.trunc((subTotal + Number((sale as any)?.deliveryCharges || 0)) * 100) / 100}</td>
                                  </tr>
                                  <tr>
                                    <td className="text-right pr-3">VAT (5%)</td>
                                    <td className="text-right w-32">AED {vatAmount.toFixed(2)}</td>
                                  </tr>
                                </>
                              )}
                              <tr className="receipt-grand-total-row border-t-2 border-black">
                                <td className="receipt-grand-total-label text-right pr-3 pt-1 font-bold text-[14px]">Grand Total</td>
                                <td className="receipt-grand-total-value text-right font-bold text-[14px] w-32 pt-1">AED {grandTotal.toFixed(2)}</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </section>

                      {String(sale?.type || '').toLowerCase() === 'deposit' && (
                        <section className="mt-3 text-[9px] leading-snug text-gray-700">
                          <h3 className="font-semibold mb-1">TERMS & CONDITIONS FOR CYLINDER(S) (ON DEPOSIT) FOR GAS SUPPLY</h3>
                          <ol className="list-decimal pl-4 space-y-0.5">
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
                    </>
                  )}
                </div>

                {isLast && (
                  <footer className="receipt-footer text-center pt-3 mt-auto relative">
                    <img
                      src={footerSrc}
                      alt="Footer Graphic"
                      className="receipt-footer-img mx-auto max-w-full h-auto"
                    />
                    {sale.customerSignature && (
                      <div className="receipt-customer-signature absolute bottom-3 right-10">
                        <img
                          src={sale.customerSignature}
                          alt="Customer Signature"
                          className="receipt-signature object-contain opacity-90 mix-blend-multiply"
                          style={{
                            maxHeight: '6rem',
                            filter:
                              'contrast(1.35) brightness(0.85) drop-shadow(0 0 0.7px rgba(0,0,0,0.6)) drop-shadow(0 0 1px rgba(255,255,255,0.7))',
                          }}
                        />
                      </div>
                    )}
                    {adminSignature && (
                      <div className="receipt-admin-signature absolute bottom-4 left-10">
                        <img
                          src={adminSignature}
                          alt="Admin Signature"
                          className="receipt-signature object-contain opacity-90 mix-blend-multiply"
                          style={{
                            maxHeight: '6rem',
                            filter:
                              'contrast(1.35) brightness(0.85) drop-shadow(0 0 0.7px rgba(0,0,0,0.6)) drop-shadow(0 0 1px rgba(255,255,255,0.7))',
                          }}
                        />
                      </div>
                    )}
                  </footer>
                )}
              </section>
            )
          })}
        </div>
      </main>

      <style jsx global>{`
        @page {
          margin: 0;
          size: A4;
        }
        @media print {
          .no-print {
            display: none !important;
          }
          html, body {
            background-color: #fff !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            margin: 0 !important;
            padding: 0 !important;
            width: 100%;
            height: 100%;
          }
          .receipt-page {
            width: 210mm !important;
            height: 297mm !important;
            min-height: 0 !important;
            max-height: 297mm !important;
            padding: 8mm !important;
            box-sizing: border-box !important;
            overflow: hidden !important;
            page-break-after: always !important;
            break-after: page !important;
            margin: 0 !important;
          }
          .receipt-page:last-child {
            page-break-after: auto !important;
            break-after: auto !important;
          }
          .receipt-page-collection {
            padding: 4.5mm 5mm 4mm !important;
          }
          .receipt-header-img {
            max-height: 42mm !important;
            object-fit: contain !important;
          }
          .receipt-footer-img {
            max-height: 26mm !important;
            object-fit: contain !important;
          }
          .receipt-signature {
            max-height: 22mm !important;
            filter: contrast(1.35) brightness(0.85) drop-shadow(0 0 0.7px rgba(0,0,0,0.6)) !important;
          }
          /* Restore original look for Sales (Tax) invoice header/footer only */
          .receipt-page-tax .receipt-header-img {
            max-height: none !important;
          }
          .receipt-page-tax .receipt-footer-img {
            max-height: none !important;
          }
          .receipt-page-tax .receipt-signature {
            max-height: 24mm !important;
          }
          .receipt-page-tax .receipt-footer {
            padding-top: 2rem !important;
          }
          .receipt-page-tax .receipt-customer-signature {
            bottom: 28px !important;
            right: 64px !important;
          }
          .receipt-page-tax .receipt-admin-signature {
            bottom: 36px !important;
            left: 64px !important;
          }
          .receipt-page-collection .receipt-header-img,
          .receipt-page-collection .receipt-footer-img {
            max-height: none !important;
          }
          .receipt-page-collection .receipt-meta-grid {
            gap: 3mm !important;
            margin-top: 2.5mm !important;
            margin-bottom: 2.5mm !important;
          }
          .receipt-page-collection .receipt-meta-grid > div > div,
          .receipt-page-collection .receipt-meta-compact {
            font-size: 10px !important;
            line-height: 1.2 !important;
          }
          .receipt-page-collection .receipt-meta-compact {
            margin-top: 1.5mm !important;
            margin-bottom: 1.5mm !important;
          }
          .receipt-page-collection .receipt-table {
            font-size: 9px !important;
            line-height: 1.1 !important;
          }
          .receipt-page-collection .receipt-table th,
          .receipt-page-collection .receipt-table td {
            padding: 0.75mm 1mm !important;
          }
          .receipt-page-collection .receipt-total-section {
            margin-top: 2.5mm !important;
            max-width: 74mm !important;
            font-size: 10px !important;
          }
          .receipt-page-collection .receipt-total-table td {
            padding-top: 0.4mm !important;
            padding-bottom: 0.4mm !important;
          }
          .receipt-page-collection .receipt-grand-total-label,
          .receipt-page-collection .receipt-grand-total-value {
            font-size: 12px !important;
          }
          .receipt-page-collection .receipt-grand-total-value {
            width: 30mm !important;
          }
          .receipt-page-collection .receipt-footer {
            padding-top: 2mm !important;
          }
          .receipt-page-collection .receipt-signature {
            max-height: 20mm !important;
          }
          .receipt-page-collection .receipt-customer-signature {
            bottom: 22px !important;
            right: 56px !important;
          }
          .receipt-page-collection .receipt-admin-signature {
            bottom: 26px !important;
            left: 56px !important;
          }
          table, tr, td, th {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
        }
      `}</style>
    </div>
  );
};

export default ReceiptPrintPage;
