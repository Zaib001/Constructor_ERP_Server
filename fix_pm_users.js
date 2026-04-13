/**
 * fix_pm_users.js  –  Diagnose + repair PM users using pg directly
 * Usage:  node fix_pm_users.js
 */

require("dotenv").config();
const { Client } = require("pg");
const bcrypt = require("bcrypt");

const PM_EMAILS   = ["hoopoe@hoopoe.com", "skyline@hoopoe.com"];
const NEW_PASSWORD = "Admin@123";

async function main() {
    const db = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
    await db.connect();
    console.log("✅  Connected to database\n");
    console.log("=".repeat(60));
    console.log("PM USER FIX SCRIPT");
    console.log("=".repeat(60));

    try {
        // 1. Find project_manager role
        const roleRes = await db.query(
            `SELECT id, name, code FROM auth.roles WHERE code = 'project_manager' AND is_active = true LIMIT 1`
        );
        if (roleRes.rows.length === 0) {
            console.error("❌  No active role with code='project_manager'!");
            const allRoles = await db.query(`SELECT id, code, name, is_active FROM auth.roles ORDER BY created_at`);
            console.log("All roles in database:");
            console.table(allRoles.rows);
            return;
        }
        const pmRole = roleRes.rows[0];
        console.log(`✅  Role found: ${pmRole.name}  (id=${pmRole.id})`);

        // 2. Find a valid active company
        const compRes = await db.query(
            `SELECT id, name, code FROM auth.companies WHERE is_active = true LIMIT 5`
        );
        console.log("\nActive companies:");
        console.table(compRes.rows);

        if (compRes.rows.length === 0) {
            console.error("❌  No active companies!");
            return;
        }
        const company = compRes.rows[0];
        console.log(`\n✅  Using company: ${company.name}  (id=${company.id})`);

        // 3. Find a department in that company
        const deptRes = await db.query(
            `SELECT id, name FROM auth.departments WHERE company_id = $1 AND is_active = true LIMIT 1`,
            [company.id]
        );
        let department;
        if (deptRes.rows.length === 0) {
            console.log("⚠️   No department found – creating 'Project Management'...");
            const code = "PM-DEPT-" + Date.now();
            const newDept = await db.query(
                `INSERT INTO auth.departments (name, code, company_id, is_active)
                 VALUES ('Project Management', $1, $2, true) RETURNING id, name`,
                [code, company.id]
            );
            department = newDept.rows[0];
            console.log(`✅  Department created: ${department.name}  (id=${department.id})`);
        } else {
            department = deptRes.rows[0];
            console.log(`✅  Department: ${department.name}  (id=${department.id})`);
        }

        // 4. Hash the reset password once
        const passwordHash = await bcrypt.hash(NEW_PASSWORD, 12);

        // 5. Process each PM email
        console.log("\n" + "─".repeat(60));
        for (const email of PM_EMAILS) {
            console.log(`\n▶  ${email}`);

            const userRes = await db.query(
                `SELECT id, name, role_id, company_id, department_id, is_active, is_locked, deleted_at
                 FROM auth.users WHERE email = $1`,
                [email]
            );

            if (userRes.rows.length === 0) {
                // Create brand-new user
                const name = email.split("@")[0];
                const code = "PM-" + name.toUpperCase();
                const ins  = await db.query(
                    `INSERT INTO auth.users
                       (name, email, employee_code, password_hash, designation, role_id, company_id, department_id, is_active, is_locked, login_attempts)
                     VALUES ($1,$2,$3,$4,'Project Manager',$5,$6,$7,true,false,0)
                     RETURNING id`,
                    [name, email, code, passwordHash, pmRole.id, company.id, department.id]
                );
                console.log(`  ✅  Created: id=${ins.rows[0].id}`);
            } else {
                const u = userRes.rows[0];
                console.log(`  Before → role=${u.role_id||"NULL"}, co=${u.company_id||"NULL"}, dept=${u.department_id||"NULL"}, active=${u.is_active}, locked=${u.is_locked}, deleted=${u.deleted_at||"null"}`);
                await db.query(
                    `UPDATE auth.users SET
                       role_id       = $1,
                       company_id    = $2,
                       department_id = $3,
                       is_active     = true,
                       is_locked     = false,
                       login_attempts = 0,
                       deleted_at    = NULL,
                       password_hash = $4,
                       updated_at    = NOW()
                     WHERE id = $5`,
                    [pmRole.id, company.id, department.id, passwordHash, u.id]
                );
                console.log(`  ✅  Fixed: role, company, dept linked; password reset to ${NEW_PASSWORD}`);
            }
        }

        // 6. Ensure baseline permissions exist on the role
        console.log("\n" + "─".repeat(60));
        console.log("PERMISSIONS CHECK");

        const permCheck = await db.query(
            `SELECT p.code, p.name FROM auth.role_permissions rp
             JOIN auth.permissions p ON p.id = rp.permission_id
             WHERE rp.role_id = $1`,
            [pmRole.id]
        );

        if (permCheck.rows.length === 0) {
            console.log("⚠️  project_manager has 0 permissions – adding baseline...");
            const needed = [
                { code: "project.read",     module: "projects",   description: "View projects"        },
                { code: "project.write",    module: "projects",   description: "Edit projects"        },
                { code: "masterdata.read",  module: "masterdata", description: "View master data"     },
                { code: "approval.read",    module: "approvals",  description: "View approvals"       },
                { code: "approval.approve", module: "approvals",  description: "Approve/reject items" },
            ];
            for (const pc of needed) {
                // Upsert permission
                let permRes = await db.query(
                    `SELECT id FROM auth.permissions WHERE code = $1`, [pc.code]
                );
                let permId;
                if (permRes.rows.length === 0) {
                    const ins = await db.query(
                        `INSERT INTO auth.permissions (code, module, description) VALUES ($1,$2,$3) RETURNING id`,
                        [pc.code, pc.module, pc.description]
                    );
                    permId = ins.rows[0].id;
                    console.log(`  ➕  Created permission: ${pc.code}`);
                } else {
                    permId = permRes.rows[0].id;
                }
                // Link to role
                const link = await db.query(
                    `SELECT id FROM auth.role_permissions WHERE role_id=$1 AND permission_id=$2`,
                    [pmRole.id, permId]
                );
                if (link.rows.length === 0) {
                    await db.query(
                        `INSERT INTO auth.role_permissions (role_id, permission_id) VALUES ($1,$2)`,
                        [pmRole.id, permId]
                    );
                    console.log(`  🔗  Linked: ${pc.code} → project_manager`);
                } else {
                    console.log(`  ✓   Already linked: ${pc.code}`);
                }
            }
        } else {
            console.log(`✅  ${permCheck.rows.length} permission(s) already on project_manager:`);
            permCheck.rows.forEach(p => console.log(`     - ${p.code}`));
        }

        // 7. Final summary
        console.log("\n" + "=".repeat(60));
        console.log("FINAL RESULT");
        console.log("=".repeat(60));
        for (const email of PM_EMAILS) {
            const r = await db.query(
                `SELECT u.email, u.is_active, u.is_locked, u.deleted_at,
                        r.name AS role_name, c.name AS company_name, d.name AS dept_name
                 FROM auth.users u
                 LEFT JOIN auth.roles r       ON r.id = u.role_id
                 LEFT JOIN auth.companies c   ON c.id = u.company_id
                 LEFT JOIN auth.departments d ON d.id = u.department_id
                 WHERE u.email = $1`,
                [email]
            );
            if (r.rows.length === 0) {
                console.log(`\n  ❌  ${email} – not found!`);
            } else {
                const u = r.rows[0];
                const ok = u.role_name && u.company_name && u.is_active && !u.is_locked && !u.deleted_at;
                console.log(`\n  ${email}`);
                console.log(`    role:    ${u.role_name    || "❌ MISSING"}`);
                console.log(`    company: ${u.company_name || "❌ MISSING"}`);
                console.log(`    dept:    ${u.dept_name    || "(none – ok)"}`);
                console.log(`    active:  ${u.is_active}  locked: ${u.is_locked}`);
                console.log(`    status:  ${ok ? "✅ READY TO LOGIN" : "❌ STILL BROKEN"}`);
            }
        }
        console.log(`\n  Credentials: email above  |  password: ${NEW_PASSWORD}`);
        console.log("=".repeat(60));

    } finally {
        await db.end();
    }
}

main().catch(err => {
    console.error("❌  Script failed:", err.message);
    process.exit(1);
});
