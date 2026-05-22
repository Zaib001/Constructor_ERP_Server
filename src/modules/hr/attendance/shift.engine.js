"use strict";

/**
 * Parses time string "HH:MM" into minutes from midnight.
 */
function parseTimeStr(timeStr) {
    const [hours, minutes] = timeStr.split(":").map(Number);
    return (hours * 60) + minutes;
}

/**
 * Analyzes clock-in and clock-out against an assigned Shift, supporting overnight shifts.
 */
function analyzeAttendanceAgainstShift(checkInDate, checkOutDate, shift) {
    if (!checkInDate) return { workedMinutes: 0, lateMinutes: 0, earlyMinutes: 0, overtimeMinutes: 0 };
    
    // Parse shift start and end times
    const [startHrs, startMins] = shift.start_time.split(":").map(Number);
    const [endHrs, endMins] = shift.end_time.split(":").map(Number);

    // Reconstruct absolute shift start bounds on the checkInDate
    const shiftStart = new Date(checkInDate);
    shiftStart.setHours(startHrs, startMins, 0, 0);

    // If checkIn occurs after midnight (e.g. 00:10) for an overnight shift starting at 22:00
    if (checkInDate.getHours() < 12 && startHrs >= 18) {
        shiftStart.setDate(shiftStart.getDate() - 1);
    } else if (checkInDate.getHours() >= 18 && startHrs < 12) {
        shiftStart.setDate(shiftStart.getDate() + 1);
    }

    const shiftEnd = new Date(shiftStart);
    shiftEnd.setHours(endHrs, endMins, 0, 0);

    // Handle cross-midnight shift bounds: end time is chronologically before start time
    const startMinsTotal = startHrs * 60 + startMins;
    const endMinsTotal = endHrs * 60 + endMins;
    if (endMinsTotal < startMinsTotal) {
        shiftEnd.setDate(shiftEnd.getDate() + 1);
    }

    // Calculate Late Minutes
    let lateMinutes = 0;
    const checkInTime = checkInDate.getTime();
    const shiftStartTime = shiftStart.getTime();
    const graceTime = shiftStartTime + (shift.grace_period * 60 * 1000);

    if (checkInTime > graceTime) {
        lateMinutes = Math.round((checkInTime - shiftStartTime) / (1000 * 60));
    }

    let earlyMinutes = 0;
    let workedMinutes = 0;
    let overtimeMinutes = 0;

    if (checkOutDate) {
        const checkOutTime = checkOutDate.getTime();
        const shiftEndTime = shiftEnd.getTime();

        // Worked minutes bounded by shift
        const actualStart = Math.max(checkInTime, shiftStartTime);
        const actualEnd = Math.min(checkOutTime, shiftEndTime);
        
        if (actualEnd > actualStart) {
            workedMinutes = Math.round((actualEnd - actualStart) / (1000 * 60));
        }

        // Calculate Early Exit Minutes
        if (checkOutTime < shiftEndTime) {
            earlyMinutes = Math.round((shiftEndTime - checkOutTime) / (1000 * 60));
        }

        // Calculate Overtime (checkout exceeds shiftEnd by > 30 minutes)
        if (checkOutTime > shiftEndTime + (30 * 60 * 1000)) {
            overtimeMinutes = Math.round((checkOutTime - shiftEndTime) / (1000 * 60));
        }
    }

    return {
        workedMinutes,
        lateMinutes,
        earlyMinutes,
        overtimeMinutes
    };
}

module.exports = {
    analyzeAttendanceAgainstShift,
    parseTimeStr
};

