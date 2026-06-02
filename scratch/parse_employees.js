const fs = require('fs');
const path = require('path');

function parseTSVFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  // Split lines by newline. Since files can have \r\n, we use regex.
  const lines = content.split(/\r?\n/);
  if (lines.length === 0) return [];
  
  const headers = lines[0].split('\t').map(h => h.trim());
  const result = [];
  
  // A helper function to parse TSV line handling possible quotes
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    
    const row = [];
    let insideQuote = false;
    let currentField = '';
    
    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      if (char === '"') {
        // Toggle quote flag, but do not push quote to field
        insideQuote = !insideQuote;
      } else if (char === '\t' && !insideQuote) {
        row.push(currentField);
        currentField = '';
      } else {
        currentField += char;
      }
    }
    row.push(currentField);
    
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = row[idx] ? row[idx].trim() : '';
    });
    result.push(obj);
  }
  return result;
}

const tsvPath = path.join(__dirname, 'employees.tsv');
const parsed = parseTSVFile(tsvPath);
console.log('Parsed', parsed.length, 'employees');

// Let's do some light transformations to check if dates/salaries look good
const transformed = parsed.map(emp => {
  const firstName = emp['First_Name'] || '';
  const middleName = emp['Middle_Name'] || '';
  const lastName = emp['Last_Name'] || '';
  const fullName = [firstName, middleName, lastName].filter(Boolean).join(' ');

  // Date parsers
  const parseDate = (dStr) => {
    if (!dStr || dStr.trim() === '0' || dStr.trim() === '') return null;
    const parts = dStr.split('-');
    if (parts.length === 3) {
      // e.g. 17-Apr-92
      const day = parseInt(parts[0], 10);
      const monthStr = parts[1];
      let year = parseInt(parts[2], 10);
      
      const months = {
        'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'jun': 5,
        'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11
      };
      const month = months[monthStr.toLowerCase()];
      if (month !== undefined) {
        if (year < 50) year += 2000;
        else if (year < 100) year += 1900;
        return new Date(Date.UTC(year, month, day));
      }
    }
    const d = new Date(dStr);
    return isNaN(d.getTime()) ? null : d;
  };

  const basicSalary = parseFloat(emp['Basic Salary']) || 0;
  const allowance = parseFloat(emp['Allowance']) || 0;
  
  // Saudization status
  const nationality = emp['Nationality'] || '';
  const isSaudi = nationality.toLowerCase().includes('saudi');
  const saudizationStatus = isSaudi ? 'citizen' : 'expat';

  return {
    employee_code: emp['Employee_ID'],
    name: fullName,
    blood_group: emp['Blood Group'] || null,
    department: emp['Department'] || null,
    designation: emp['Position'] || null,
    nationality: nationality || null,
    iqama_no: emp['Iqama_No'] || null,
    iqama_expiry: parseDate(emp['Iqama_Expiry_Date']),
    passport_no: emp['Passport no'] || null,
    passport_expiry: parseDate(emp['Passport Expiry Date']),
    insurance_no: emp['Medical Insurance No'] || null,
    insurance_expiry: parseDate(emp['Insurance_Expiry_Date']),
    joining_date: parseDate(emp['Date Of Joining']),
    basic_salary: basicSalary,
    other_allowance: allowance,
    saudization_status: saudizationStatus,
    bank_name: emp['Bank Name'] || null,
    bank_account_name: fullName, // account name is usually full name
    bank_iban: emp['IBAN'] || null,
    is_active: emp['Current Em'] === 'TRUE',
    // Preserve any remaining custom columns in attachments JSON
    attachments: {
      date_of_birth: emp['Date_of_Birth'] || null,
      gender: emp['Gender'] || null,
      phone_number: emp['Phone_Number'] || null,
      sub_company: emp['Sub_Company'] || null,
      vacation: emp['vacation'] || null,
      iqama_sponsor: emp['Iqama'] || null,
      fixed_ot: emp['Fixed OT'] || null,
      total_salary: emp['Total Salary'] || null,
      bank_account_no: emp['Bank Account No'] || null,
      bank_copy: emp['Bank Copy'] || null,
      insurance_copy: emp['Insurance Copy'] || null,
      leaving_date: parseDate(emp['Leaving Date'])
    }
  };
});

fs.writeFileSync(path.join(__dirname, 'parsed_employees.json'), JSON.stringify(transformed, null, 2));
console.log('Transformed and saved to parsed_employees.json successfully!');
