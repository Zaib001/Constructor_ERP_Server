const inStr = "2026-05-20T21:55:00.000Z";
const outStr = "2026-05-21T06:05:00.000Z";

const tIn = new Date(inStr);
const tOut = new Date(outStr);

console.log("In Local:", tIn.toString(), "In UTC:", tIn.toUTCString());
console.log("Out Local:", tOut.toString(), "Out UTC:", tOut.toUTCString());

console.log("In getFullYear:", tIn.getFullYear(), "getMonth+1:", tIn.getMonth()+1, "getDate:", tIn.getDate());
console.log("Out getFullYear:", tOut.getFullYear(), "getMonth+1:", tOut.getMonth()+1, "getDate:", tOut.getDate());
