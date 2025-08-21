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
  };
  items: Array<{
    product: {
      name: string;
      price: number;
    };
    quantity: number;
    price: number;
    total: number;
  }>;
  totalAmount: number;
  paymentMethod: string;
  paymentStatus: string;
  createdAt: string;
  customerSignature?: string;
  // Optional: used for cylinder returns to pick the correct header
  type?: 'deposit' | 'refill' | 'return' | string;
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

  // Totals breakdown: Subtotal (price*qty), VAT (5% of subtotal), Grand Total (subtotal + VAT)
  const subTotal = sale.items.reduce((sum, item) => {
    const priceNum = Number(item?.price || 0)
    const qtyNum = Number(item?.quantity || 0)
    const line = (isFinite(priceNum) ? priceNum : 0) * (isFinite(qtyNum) ? qtyNum : 0)
    return sum + line
  }, 0)
  const vatAmount = subTotal * 0.05
  const grandTotal = subTotal + vatAmount

  // Choose header based on preference passed from dialog (default to Tax header)
  const useReceivingHeader = (typeof window !== 'undefined' && sessionStorage.getItem('useReceivingHeader') === 'true')
  const headerSrc = useReceivingHeader ? '/images/Header-Receiving-invoice.jpg' : '/images/Header-Tax-invoice.jpg';

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
            <h2 className="font-bold text-lg text-[#2B3068] mb-2">Customer Information</h2>
            <div className="space-y-1 text-sm text-gray-700">
              <div><strong>Name:</strong> {sale.customer.name}</div>
              <div><strong>Phone:</strong> {sale.customer.phone}</div>
              <div><strong>Address:</strong> {sale.customer.address}</div>
            </div>
          </div>
          <div>
            <h2 className="font-bold text-lg text-[#2B3068] mb-2">Invoice Information</h2>
            <div className="space-y-1 text-sm text-gray-700">
              <div><strong>Invoice #:</strong> {sale.invoiceNumber}</div>
              <div><strong>Date:</strong> {new Date(sale.createdAt).toLocaleDateString()}</div>
              <div><strong>Time:</strong> {new Date(sale.createdAt).toLocaleTimeString()}</div>
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
            </div>
          </div>
        </section>

        <section>
          <h2 className="font-bold text-lg text-[#2B3068] mb-3">Purchased Items</h2>
          <table className="w-full border-collapse text-[11px] leading-tight">
            <thead>
              <tr className="bg-[#2B3068] text-white">
                <th className="text-left p-2 font-semibold border">Item</th>
                <th className="text-center p-2 font-semibold border">Qty</th>
                <th className="text-right p-2 font-semibold border">Price</th>
                <th className="text-right p-2 font-semibold border">VAT (5%)</th>
                <th className="text-right p-2 font-semibold border">Total</th>
              </tr>
            </thead>
            <tbody>
              {sale.items.map((item, index) => {
                const priceNum = Number(item?.price || 0)
                const qtyNum = Number(item?.quantity || 0)
                const unitVat = priceNum * 0.05
                const unitWithVat = priceNum + unitVat
                const itemTotal = (isFinite(unitWithVat) ? unitWithVat : 0) * (isFinite(qtyNum) ? qtyNum : 0)
                return (
                  <tr key={index} className="border-b h-5">
                    <td className="p-2 border">{item.product.name}</td>
                    <td className="text-center p-2 border">{qtyNum}</td>
                    <td className="text-right p-2 border">AED {priceNum.toFixed(2)}</td>
                    <td className="text-right p-2 border">AED {unitVat.toFixed(2)}</td>
                    <td className="text-right p-2 border font-medium">AED {itemTotal.toFixed(2)}</td>
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
                <tr>
                  <td className="text-right pr-4 text-base">Subtotal</td>
                  <td className="text-right w-36 text-base">AED {subTotal.toFixed(2)}</td>
                </tr>
                <tr>
                  <td className="text-right pr-4 text-base">VAT (5%)</td>
                  <td className="text-right w-36 text-base">AED {vatAmount.toFixed(2)}</td>
                </tr>
                <tr className="border-t-2 border-black mt-2">
                  <td className="text-right pr-4 pt-2 font-bold text-xl">Total</td>
                  <td className="text-right font-bold text-xl w-36 pt-2">AED {grandTotal.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Removed Payment Method and Status section as requested */}

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
