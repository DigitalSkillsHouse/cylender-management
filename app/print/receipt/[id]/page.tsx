"use client"

import { useEffect, useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Printer } from 'lucide-react';
import { processSignatureForPrint } from '@/lib/client-signature-processing';

const paginateRows = <T,>(arr: T[], firstPageSize: number, continuationPageSize: number) => {
  const safe = Array.isArray(arr) ? arr : [];
  const firstChunkSize = Math.max(1, Math.floor(firstPageSize || 1));
  const nextChunkSize = Math.max(1, Math.floor(continuationPageSize || firstChunkSize));
  const out: T[][] = [];

  if (safe.length <= firstChunkSize) {
    out.push(safe);
    return out.length ? out : [[]];
  }

  out.push(safe.slice(0, firstChunkSize));
  for (let i = firstChunkSize; i < safe.length; i += nextChunkSize) {
    out.push(safe.slice(i, i + nextChunkSize));
  }

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
  cashAmount?: number;
  bankName?: string;
  checkNumber?: string;
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
  const [customerFooterSignature, setCustomerFooterSignature] = useState<string | null>(null);
  const [adminFooterSignature, setAdminFooterSignature] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pageRefs = useRef<Array<HTMLElement | null>>([]);
  const normalizedPaymentMethod = String(sale?.paymentMethod || '').toLowerCase();
  const isSecurityReceipt = ['deposit', 'return', 'refill'].includes(String(sale?.type || '').toLowerCase());
  const securityCashAmount = Number(sale?.cashAmount || 0);
  const securityCheckNumber = sale?.checkNumber || sale?.chequeNumber || '';

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const src = sale?.customerSignature || '';
      if (!src) {
        setCustomerFooterSignature(null);
        return;
      }
      const processed = await processSignatureForPrint(src);
      if (!cancelled) setCustomerFooterSignature(processed || src);
    };

    run().catch(() => {
      if (!cancelled) setCustomerFooterSignature(sale?.customerSignature || null);
    });

    return () => {
      cancelled = true;
    };
  }, [sale?.customerSignature]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!adminSignature) {
        setAdminFooterSignature(null);
        return;
      }
      const processed = await processSignatureForPrint(adminSignature);
      if (!cancelled) setAdminFooterSignature(processed || adminSignature);
    };

    run().catch(() => {
      if (!cancelled) setAdminFooterSignature(adminSignature || null);
    });

    return () => {
      cancelled = true;
    };
  }, [adminSignature]);

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

  const transactionType = (sale?.type || '').toString().toLowerCase()
  const isCollectionReceipt = transactionType === 'collection'
  const isCylinderReceipt = transactionType === 'deposit' || transactionType === 'return' || transactionType === 'refill'
  const isStatementReceipt =
    String(sale?.paymentMethod || '').toLowerCase() === 'account statement' ||
    String(sale?.invoiceNumber || '').startsWith('STATEMENT-')
  const safeItems = Array.isArray(sale?.items) ? sale.items : []
  const hasGasItems =
    safeItems.some((it: any) => (it?.category || (it?.product as any)?.category || '').toString().toLowerCase() === 'gas')
  const collectionPageMaxItems = 36
  const defaultFirstPageItems = Math.max(15, isCollectionReceipt ? 15 : isStatementReceipt ? 18 : 15)
  const continuationPageItems = Math.max(15, isCollectionReceipt ? collectionPageMaxItems : isStatementReceipt ? 24 : hasGasItems ? 22 : 24)

  const collectionRows = (() => {
    if (transactionType !== 'collection') return null

    const groups: Record<string, any[]> = {}

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

  const rowsToRender: any[] = transactionType === 'collection' ? (collectionRows || []) : safeItems
  const [collectionFirstPageItems, setCollectionFirstPageItems] = useState(defaultFirstPageItems)

  useEffect(() => {
    setCollectionFirstPageItems(defaultFirstPageItems)
  }, [defaultFirstPageItems, sale?._id, rowsToRender.length])

  useEffect(() => {
    if (!isCollectionReceipt) return

    const rafId = window.requestAnimationFrame(() => {
      const firstPage = pageRefs.current[0]
      if (!firstPage) return

      const content = firstPage.querySelector('.receipt-page-content') as HTMLElement | null
      const footer = firstPage.querySelector('.receipt-footer') as HTMLElement | null
      const firstRow = firstPage.querySelector('tbody tr') as HTMLElement | null

      if (!content || !firstRow) return

      const rowHeight = firstRow.getBoundingClientRect().height
      if (!rowHeight) return

      const pageRect = firstPage.getBoundingClientRect()
      const contentRect = content.getBoundingClientRect()
      const footerRect = footer?.getBoundingClientRect()
      const computedStyle = window.getComputedStyle(firstPage)
      const paddingBottom = Number.parseFloat(computedStyle.paddingBottom || '0') || 0
      const boundaryTop = footerRect?.top ?? (pageRect.bottom - paddingBottom)
      const freeSpace = boundaryTop - contentRect.bottom
      const remainingRows = Math.max(0, rowsToRender.length - collectionFirstPageItems)
      const roomUntilCap = Math.max(0, collectionPageMaxItems - collectionFirstPageItems)

      if (remainingRows > 0 && freeSpace > rowHeight * 0.85 && roomUntilCap > 0) {
        const extraRows = Math.min(
          remainingRows,
          roomUntilCap,
          Math.floor((freeSpace + rowHeight * 0.15) / rowHeight)
        )
        if (extraRows > 0) {
          setCollectionFirstPageItems((current) => current + extraRows)
        }
        return
      }

      if (freeSpace < -2 && collectionFirstPageItems > 15) {
        const rowsToRemove = Math.min(
          collectionFirstPageItems - 15,
          Math.ceil(Math.abs(freeSpace) / rowHeight)
        )

        if (rowsToRemove > 0) {
          setCollectionFirstPageItems((current) => Math.max(15, current - rowsToRemove))
        }
      }
    })

    return () => window.cancelAnimationFrame(rafId)
  }, [collectionFirstPageItems, isCollectionReceipt, rowsToRender.length])

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
  const isStandardSaleInvoice =
    !['collection', 'deposit', 'return', 'refill', 'rental'].includes(transactionType) &&
    !String(sale?.invoiceNumber || '').startsWith('STATEMENT-') &&
    String(sale?.paymentMethod || '').toLowerCase() !== 'account statement'
  const footerSrc = '/images/footer.png'
  const pageVariantClass = isTaxInvoice
    ? 'receipt-page-tax'
    : isCollectionReceipt
      ? 'receipt-page-collection'
      : isCylinderReceipt
        ? 'receipt-page-cylinder'
        : ''

  const firstPageItems = isCollectionReceipt ? collectionFirstPageItems : defaultFirstPageItems
  const itemPages = paginateRows(rowsToRender, firstPageItems, continuationPageItems)

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
            const isFirstPage = pageIndex === 0
            const isLast = pageIndex === itemPages.length - 1

            return (
              <section
                key={pageIndex}
                ref={(el) => {
                  pageRefs.current[pageIndex] = el
                }}
                className={`receipt-page bg-white shadow-sm border border-gray-200 my-4 print:my-0 print:shadow-none print:border-0 flex flex-col ${pageVariantClass}`}
              >
                <div className="receipt-page-content flex flex-col">
                  {isFirstPage && (
                    <div className="text-center">
                      <img
                        src={headerSrc}
                        alt="Company Header"
                        className="receipt-header-img mx-auto max-w-full h-auto"
                      />
                    </div>
                  )}

                  {isFirstPage ? (
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
                          {isSecurityReceipt && normalizedPaymentMethod === 'cash' && securityCashAmount > 0 && (
                            <div>
                              <strong>Security Cash:</strong> AED {securityCashAmount.toFixed(2)}
                            </div>
                          )}
                          {normalizedPaymentMethod === 'cheque' && (
                            <>
                              {sale?.bankName && (
                                <div>
                                  <strong>Bank Name:</strong> {sale.bankName}
                                </div>
                              )}
                              {securityCheckNumber && (
                                <div>
                                  <strong>{isSecurityReceipt ? 'Security Check No:' : 'Cheque Number:'}</strong> {securityCheckNumber}
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
                  ) : null}

                  <section>
                    <table className={`w-full border-collapse text-[10px] leading-tight receipt-table ${isCollectionReceipt ? 'receipt-table-collection' : ''}`}>
                      {isFirstPage && (
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
                      )}
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
                      <div className="receipt-customer-signature absolute bottom-2 right-10">
                        <img
                          src={customerFooterSignature || sale.customerSignature}
                          alt="Customer Signature"
                          className="receipt-signature object-contain mix-blend-multiply"
                          style={{
                            maxHeight: '8rem',
                            filter:
                              'contrast(1.15) brightness(0.9) drop-shadow(0 0 0.9px rgba(0,0,0,0.55))',
                          }}
                        />
                      </div>
                    )}
                    {adminSignature && (
                      <div className="receipt-admin-signature absolute bottom-2 left-10">
                        <img
                          src={adminFooterSignature || adminSignature}
                          alt="Admin Signature"
                          className="receipt-signature object-contain mix-blend-multiply"
                          style={{
                            maxHeight: '8rem',
                            filter:
                              'contrast(1.15) brightness(0.9) drop-shadow(0 0 0.9px rgba(0,0,0,0.55))',
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
        .receipt-page {
          width: 210mm;
          height: 297mm;
          min-height: 297mm;
          max-height: 297mm;
          padding: 8mm;
          box-sizing: border-box;
          overflow: hidden;
          margin: 0 auto;
          background: #fff;
        }
        .receipt-header-img {
          max-height: 42mm;
          object-fit: contain;
        }
        .receipt-footer-img {
          max-height: 26mm;
          object-fit: contain;
        }
        .receipt-signature {
          max-height: 22mm;
          filter: contrast(1.35) brightness(0.85) drop-shadow(0 0 0.7px rgba(0,0,0,0.6));
        }
        .receipt-page-tax .receipt-header-img,
        .receipt-page-cylinder .receipt-header-img {
          max-height: none;
        }
        .receipt-page-tax .receipt-footer-img,
        .receipt-page-cylinder .receipt-footer-img {
          max-height: none;
        }
        .receipt-page-tax .receipt-signature,
        .receipt-page-cylinder .receipt-signature {
          max-height: 24mm;
        }
        .receipt-page-tax .receipt-footer,
        .receipt-page-cylinder .receipt-footer {
          padding-top: 2rem;
        }
        .receipt-page-tax .receipt-customer-signature,
        .receipt-page-cylinder .receipt-customer-signature {
          bottom: 28px;
          right: 64px;
        }
        .receipt-page-tax .receipt-admin-signature,
        .receipt-page-cylinder .receipt-admin-signature {
          bottom: 36px;
          left: 64px;
        }
        .receipt-page-cylinder {
          padding: 5.5mm 6mm 5mm;
        }
        .receipt-page-cylinder .receipt-meta-grid {
          margin-top: 2mm;
          margin-bottom: 2mm;
        }
        .receipt-page-cylinder .receipt-total-section {
          margin-top: 2mm;
        }
        .receipt-page-cylinder .receipt-footer {
          padding-top: 2mm;
        }
        .receipt-page-collection {
          padding: 3.75mm 4.25mm 3.25mm;
        }
        .receipt-page-collection .receipt-header-img,
        .receipt-page-collection .receipt-footer-img {
          max-height: none;
        }
        .receipt-page-collection .receipt-meta-grid {
          gap: 2.25mm;
          margin-top: 1.5mm;
          margin-bottom: 1.5mm;
        }
        .receipt-page-collection .receipt-meta-grid > div > div,
        .receipt-page-collection .receipt-meta-compact {
          font-size: 9px;
          line-height: 1.1;
        }
        .receipt-page-collection .receipt-meta-compact {
          margin-top: 1mm;
          margin-bottom: 1mm;
        }
        .receipt-page-collection .receipt-table {
          font-size: 8.35px;
          line-height: 1.02;
        }
        .receipt-page-collection .receipt-table th,
        .receipt-page-collection .receipt-table td {
          padding: 0.45mm 0.8mm;
        }
        .receipt-page-collection .receipt-total-section {
          margin-top: 1.5mm;
          max-width: 72mm;
          font-size: 9px;
        }
        .receipt-page-collection .receipt-total-table td {
          padding-top: 0.2mm;
          padding-bottom: 0.2mm;
        }
        .receipt-page-collection .receipt-grand-total-label,
        .receipt-page-collection .receipt-grand-total-value {
          font-size: 11px;
        }
        .receipt-page-collection .receipt-grand-total-value {
          width: 28mm;
        }
        .receipt-page-collection .receipt-footer {
          padding-top: 0.75mm;
        }
        .receipt-page-collection .receipt-signature {
          max-height: 18mm;
        }
        .receipt-page-collection .receipt-customer-signature {
          bottom: 20px;
          right: 54px;
        }
        .receipt-page-collection .receipt-admin-signature {
          bottom: 24px;
          left: 54px;
        }
        table, tr, td, th {
          break-inside: avoid;
          page-break-inside: avoid;
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
            min-height: 297mm !important;
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
