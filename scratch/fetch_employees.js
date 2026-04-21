require("dotenv").config();
const prisma = require("../src/db");

async function fetchEmployees() {
    try {
        console.log("--- Fetching Employee Master Data ---");
        
        const employees = await prisma.employee.findMany({
            include: {
                company: { select: { name: true } },
                departments: { select: { name: true } },
                project: { select: { name: true, code: true } }
            },
            orderBy: { name: "asc" }
        });

        if (employees.length === 0) {
            console.log("No active employees found.");
            return;
        }

        console.table(employees.map(emp => ({
            ID: emp.id,
            Name: emp.name,
            Code: emp.employee_code || "N/A",
            Designation: emp.designation || "N/A",
            Iqama: emp.iqama_no || "N/A",
            Active: emp.is_active,
            Company: emp.company?.name || "Unassigned",
            Department: emp.departments?.name || "Unassigned",
            Project: emp.project?.name || "Head Office"
        })));

        console.log(`\nTotal Employees: ${employees.length}`);

    } catch (error) {
        console.error("Error fetching employees:", error);
    } finally {
        await prisma.$disconnect();
    }
}

fetchEmployees();
