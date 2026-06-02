const fs = require('fs');
const path = require('path');

function parseCustomDate(str) {
  if (!str || !str.trim()) return null;
  str = str.trim();
  
  // Try DD/MM/YYYY or DD/MM/YY
  if (str.includes('/')) {
    const parts = str.split('/');
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1; // 0-based
      let year = parseInt(parts[2], 10);
      if (year < 100) {
        year += 2000; // handle YY
      }
      return new Date(Date.UTC(year, month, day)).toISOString();
    }
  }
  
  // Try DD-MMM-YY e.g. 27-Feb-27 or 30-Apr-26 or 12-May-25
  const dashParts = str.split('-');
  if (dashParts.length === 3) {
    const day = parseInt(dashParts[0], 10);
    const months = {
      jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
      jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
    };
    const monthStr = dashParts[1].toLowerCase().slice(0, 3);
    const month = months[monthStr];
    let year = parseInt(dashParts[2], 10);
    if (year < 100) {
      year += 2000;
    }
    if (month !== undefined) {
      return new Date(Date.UTC(year, month, day)).toISOString();
    }
  }
  
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function parseVehicles() {
  const filePath = path.join(__dirname, 'vehicles.tsv');
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  
  const headers = lines[0].trim().split('\t');
  const result = [];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const columns = line.split('\t');
    
    // Map columns:
    // ID	Vehicle Name	Vehicle No	Field1	Insurance renewal date	Service date	Last Service Kilometer	Next Service Kilometer	Istemara expiry
    const id = columns[0] ? columns[0].trim() : '';
    const vehicleName = columns[1] ? columns[1].trim() : '';
    const vehicleNo = columns[2] ? columns[2].trim() : ''; // Plate Number
    const year = columns[3] ? columns[3].trim() : '';
    const insuranceRenewalDateStr = columns[4] ? columns[4].trim() : '';
    const serviceDateStr = columns[5] ? columns[5].trim() : '';
    const lastServiceKmStr = columns[6] ? columns[6].trim() : '';
    const nextServiceKmStr = columns[7] ? columns[7].trim() : '';
    const istemaraExpiryStr = columns[8] ? columns[8].trim() : '';
    
    const lastServiceKm = lastServiceKmStr ? parseInt(lastServiceKmStr, 10) : null;
    const nextServiceKm = nextServiceKmStr ? parseInt(nextServiceKmStr, 10) : null;
    let serviceInterval = null;
    if (lastServiceKm !== null && nextServiceKm !== null && nextServiceKm > lastServiceKm) {
      serviceInterval = nextServiceKm - lastServiceKm;
    }
    
    const details = [];
    if (year) details.push(`Year: ${year}`);
    if (serviceDateStr) details.push(`Last Service Date: ${serviceDateStr}`);
    if (lastServiceKm !== null) details.push(`Last Service KM: ${lastServiceKm}`);
    if (nextServiceKm !== null) details.push(`Next Service KM: ${nextServiceKm}`);
    
    result.push({
      id: id,
      vehicle_no: `VEH-${id.padStart(3, '0')}`,
      plate_no: vehicleNo || null,
      brand: vehicleName || null,
      insurance_expiry: parseCustomDate(insuranceRenewalDateStr),
      registration_expiry: parseCustomDate(istemaraExpiryStr),
      service_interval: serviceInterval,
      odometer_reading: lastServiceKm,
      insurance_details: details.length > 0 ? details.join(' | ') : null
    });
  }
  
  const destPath = path.join(__dirname, 'parsed_vehicles.json');
  fs.writeFileSync(destPath, JSON.stringify(result, null, 2), 'utf8');
  console.log(`Successfully parsed ${result.length} vehicles to ${destPath}`);
}

parseVehicles();
