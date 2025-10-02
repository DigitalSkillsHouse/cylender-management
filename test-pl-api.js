// Test script to check P&L API
const fetch = require('node-fetch');

async function testPLAPI() {
  try {
    console.log('Testing P&L API...');
    
    const response = await fetch('http://localhost:3000/api/profit-loss');
    const data = await response.json();
    
    console.log('P&L API Response:');
    console.log('Success:', data.success);
    
    if (data.success) {
      console.log('\n=== REVENUE ===');
      console.log('Admin Gas Sales:', data.data.revenue.adminGasSales);
      console.log('Employee Gas Sales:', data.data.revenue.employeeGasSales);
      console.log('Admin Cylinder Sales:', data.data.revenue.adminCylinderSales);
      console.log('Employee Cylinder Sales:', data.data.revenue.employeeCylinderSales);
      console.log('Total Revenue:', data.data.revenue.total);
      
      console.log('\n=== COSTS ===');
      console.log('Admin Gas Costs:', data.data.costs.adminGasCosts);
      console.log('Employee Gas Costs:', data.data.costs.employeeGasCosts);
      console.log('Business Expenses:', data.data.costs.expenses);
      console.log('Total Costs:', data.data.costs.total);
      
      console.log('\n=== PROFIT ===');
      console.log('Gross Profit:', data.data.profit.gross);
      console.log('Net Profit:', data.data.profit.net);
      console.log('Profit Margin:', data.data.profit.margin + '%');
      
      console.log('\n=== TRANSACTION COUNTS ===');
      console.log('Admin Sales:', data.data.transactions.adminSalesCount);
      console.log('Employee Sales:', data.data.transactions.employeeSalesCount);
      console.log('Admin Cylinders:', data.data.transactions.adminCylinderCount);
      console.log('Employee Cylinders:', data.data.transactions.employeeCylinderCount);
      console.log('Expenses:', data.data.transactions.expenseCount);
    } else {
      console.log('Error:', data.error);
    }
  } catch (error) {
    console.error('Failed to test P&L API:', error.message);
  }
}

testPLAPI();
